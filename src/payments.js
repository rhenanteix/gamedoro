// src/payments.js
// Integration with AbacatePay (https://app.abacatepay.com/)
// Provides two endpoints:
//   POST /api/payments/create   -> creates a checkout and returns a URL for the user to complete payment.
//   POST /api/payments/webhook  -> receives payment confirmation webhook, validates signature, and credits gems to the user.

module.exports = ({ app, db, auth, bad, tx }) => {
  const ABACATEPAY_API_KEY = process.env.ABACATEPAY_API_KEY || '';
  const ABACATEPAY_WEBHOOK_SECRET = process.env.ABACATEPAY_WEBHOOK_SECRET || '';
  const fetch = require('node-fetch'); // node >=18 has fetch built‑in, fallback if needed

  // Simple gem packages that can be bought with real money
  const GEM_PACKAGES = [
    { id: 'pack_5', gems: 5, priceCents: 199 },   // R$1,99
    { id: 'pack_15', gems: 15, priceCents: 499 }, // R$4,99
    { id: 'pack_40', gems: 40, priceCents: 1199 }, // R$11,99
    { id: 'pack_100', gems: 100, priceCents: 2799 } // R$27,99
  ];

  // Helper to find a package by ID
  const findPackage = (id) => GEM_PACKAGES.find(p => p.id === id);

  // ---------------------------------------------------------------------
  // Create a checkout – returns a URL that the front‑end can redirect the user to
  // ---------------------------------------------------------------------
  app.post('/api/payments/create', auth, async (req, res) => {
    const { packageId } = req.body;
    const pkg = findPackage(packageId);
    if (!pkg) return bad(res, 'Pacote inexistente.', 404);

    // Build request to AbacatePay – the exact payload depends on their API.
    // We'll assume a simple JSON body with amount (cents) and description.
    const payload = {
      amount: pkg.priceCents,
      currency: 'BRL',
      description: `${pkg.gems} gemas para ${req.uid}`,
      reference: `gamedoro-${req.uid}-${Date.now()}`,
      callback_url: `${req.protocol}://${req.get('host')}/api/payments/webhook`
    };

    try {
      const response = await fetch('https://api.abacatepay.com/v1/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ABACATEPAY_API_KEY}`
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error('Failed to create checkout');
      const data = await response.json();
      // Expected to contain a `checkout_url` field
      const checkoutUrl = data.checkout_url || data.url;
      if (!checkoutUrl) throw new Error('AbacatePay response missing URL');
      // Store a pending transaction so we can match it later in the webhook
      tx(() => {
        db.prepare('INSERT INTO payments(user_id,package_id,reference,status) VALUES (?,?,?,?)')
          .run(req.uid, pkg.id, payload.reference, 'pending');
      });
      res.json({ checkoutUrl });
    } catch (e) {
      console.error('AbacatePay error', e);
      bad(res, 'Erro ao iniciar pagamento.', 500);
    }
  });

  // ---------------------------------------------------------------------
  // Webhook – called by AbacatePay when a payment changes status.
  // We validate the signature (X-Abacatepay-Signature header) using the secret.
  // ---------------------------------------------------------------------
  app.post('/api/payments/webhook', async (req, res) => {
    const signature = req.headers['x-abacatepay-signature'];
    const rawBody = JSON.stringify(req.body);
    const crypto = require('crypto');
    const expected = crypto.createHmac('sha256', ABACATEPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
    if (!signature || signature !== expected) {
      console.warn('Invalid webhook signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const { reference, status, amount, currency } = req.body;
    // We're only interested in successful payments
    if (status !== 'paid') return res.json({ ok: true });

    // Find the pending payment record
    const payment = db.prepare('SELECT * FROM payments WHERE reference = ? AND status = ?')
      .get(reference, 'pending');
    if (!payment) return res.json({ ok: true }); // unknown reference – ignore

    const pkg = findPackage(payment.package_id);
    if (!pkg) return res.json({ ok: true });

    // Credit gems to the user
    tx(() => {
      db.prepare('UPDATE users SET gems = gems + ? WHERE id = ?').run(pkg.gems, payment.user_id);
      db.prepare('UPDATE payments SET status = ? WHERE id = ?').run('paid', payment.id);
    });

    res.json({ ok: true });
  });

  // ---------------------------------------------------------------------
  // Optional endpoint to list available gem packages (front‑end can fetch)
  // ---------------------------------------------------------------------
  app.get('/api/payments/packages', auth, (req, res) => {
    const publicPackages = GEM_PACKAGES.map(p => ({ id: p.id, gems: p.gems, priceCents: p.priceCents }));
    res.json(publicPackages);
  });
};
