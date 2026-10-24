'use strict';
const crypto = require('node:crypto');
// Public integrity key published at https://docs.abacatepay.com/pages/webhooks
const PUBLIC_KEY = 't9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9';
const PACKAGES = [
  { id: 'pack_5', gems: 5, priceCents: 199 },
  { id: 'pack_15', gems: 15, priceCents: 499 },
  { id: 'pack_40', gems: 40, priceCents: 1199 },
  { id: 'pack_100', gems: 100, priceCents: 2799 }
];
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' &&
  Buffer.byteLength(a) === Buffer.byteLength(b) && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

module.exports = ({ app, db, auth, bad, tx, fetchImpl = globalThis.fetch }) => {
  const key = process.env.ABACATEPAY_API_KEY;
  const secret = process.env.ABACATEPAY_WEBHOOK_SECRET;
  const devMode = process.env.ABACATEPAY_DEV_MODE === 'true';
  let origin;
  try {
    const url = new URL(process.env.APP_URL);
    if (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) origin = url.origin;
  } catch { }
  const ready = Boolean(key && secret && origin);
  // Preserve older databases, storing the purchase values rather than looking up future prices.
  for (const [name, type] of [['provider_id', 'TEXT'], ['checkout_url', 'TEXT'], ['amount', 'INTEGER'], ['gems', 'INTEGER'], ['dev_mode', 'INTEGER']]) {
    if (!db.prepare('PRAGMA table_info(payments)').all().some(c => c.name === name)) db.exec(`ALTER TABLE payments ADD COLUMN ${name} ${type}`);
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_id ON payments(provider_id)');

  app.get('/api/payments/packages', auth, (req, res) => res.json({ packages: PACKAGES, available: ready,
    message: ready ? null : 'A compra de gemas está temporariamente indisponível. O administrador precisa configurar o AbacatePay.' }));

  app.post('/api/payments/create', auth, async (req, res) => {
    const pkg = PACKAGES.find(p => p.id === req.body.packageId);
    if (!pkg) return bad(res, 'Pacote inexistente.', 404);
    if (!ready) return bad(res, 'Compra indisponível: AbacatePay ainda não configurado.', 503);
    const reference = crypto.randomUUID();
    db.prepare('INSERT INTO payments(user_id,package_id,reference,status,amount,gems,dev_mode) VALUES(?,?,?,?,?,?,?)')
      .run(req.uid, pkg.id, reference, 'creating', pkg.priceCents, pkg.gems, Number(devMode));
    try {
      const response = await fetchImpl('https://api.abacatepay.com/v1/billing/create', {
        method: 'POST', signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ frequency: 'ONE_TIME', methods: ['PIX'],
          products: [{ externalId: `gamedoro-${pkg.id}`, name: `${pkg.gems} gemas gameDoro`, quantity: 1, price: pkg.priceCents }],
          returnUrl: `${origin}/#/loja`, completionUrl: `${origin}/?payment=${reference}#/loja` })
      });
      const result = await response.json();
      const billing = result.data;
      if (!response.ok || result.error || !billing?.id || !billing.url || billing.amount !== pkg.priceCents || billing.devMode !== devMode) throw new Error('Invalid billing response');
      if (new URL(billing.url).protocol !== 'https:') throw new Error('Invalid checkout URL');
      db.prepare("UPDATE payments SET provider_id=?,checkout_url=?,status='pending' WHERE reference=?")
        .run(billing.id, billing.url, reference);
      res.json({ checkoutUrl: billing.url, reference });
    } catch {
      db.prepare("UPDATE payments SET status='failed' WHERE reference=?").run(reference);
      console.error('AbacatePay: falha ao criar cobrança; confira chave, ambiente e disponibilidade da API.');
      bad(res, 'Não foi possível abrir o pagamento. Tente novamente em instantes.', 502);
    }
  });

  app.get('/api/payments/:reference', auth, (req, res) => {
    const payment = db.prepare('SELECT status,gems FROM payments WHERE reference=? AND user_id=?').get(req.params.reference, req.uid);
    if (!payment) return bad(res, 'Pagamento não encontrado.', 404);
    res.json(payment);
  });

  app.post('/api/payments/webhook', (req, res) => {
    if (!secret) return bad(res, 'Pagamento não configurado.', 503);
    if (!equal(req.query.webhookSecret, secret)) return bad(res, 'Webhook não autorizado.', 401);
    const signature = req.get('X-Webhook-Signature');
    const expected = crypto.createHmac('sha256', PUBLIC_KEY).update(req.rawBody || Buffer.alloc(0)).digest('base64');
    if (!signature || !equal(signature, expected)) return bad(res, 'Assinatura inválida.', 401);
    if (req.body.event !== 'billing.paid') return res.json({ ok: true });
    // v1 deliveries exist both with data.billing and directly under data.
    const billing = req.body.data?.billing || req.body.data;
    if (!billing || typeof billing.id !== 'string') return bad(res, 'Cobrança inválida.');
    const payment = db.prepare('SELECT * FROM payments WHERE provider_id=?').get(billing.id);
    if (!payment) return bad(res, 'Cobrança ainda não encontrada.', 503); // retry if creation is still in flight
    if (billing.status !== 'PAID' || billing.amount !== payment.amount || req.body.devMode !== Boolean(payment.dev_mode)) return bad(res, 'Dados do pagamento divergentes.');
    tx(() => {
      const changed = db.prepare("UPDATE payments SET status='paid' WHERE id=? AND status='pending'").run(payment.id).changes;
      if (changed) db.prepare('UPDATE users SET gems=gems+? WHERE id=?').run(payment.gems, payment.user_id);
    });
    res.json({ ok: true });
  });
};
