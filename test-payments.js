'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-payments-'));
process.env.DATA_DIR = dir;
process.env.APP_URL = 'http://localhost:3005';
process.env.ABACATEPAY_API_KEY = 'test-only';
process.env.ABACATEPAY_WEBHOOK_SECRET = 'test-secret';
process.env.ABACATEPAY_DEV_MODE = 'true';
const nativeFetch = globalThis.fetch;
let payload, providerFailure = false, count = 0;
globalThis.fetch = async (url, options) => {
  assert.equal(url, 'https://api.abacatepay.com/v1/billing/create');
  assert.equal(options.headers.Authorization, 'Bearer test-only');
  payload = JSON.parse(options.body);
  if (providerFailure) return { ok: false, json: async () => ({ error: 'Unavailable' }) };
  return { ok: true, json: async () => ({ data: { id: 'bill_' + ++count, url: 'https://pay.abacatepay.com/test', amount: payload.products[0].price, devMode: true }, error: null }) };
};
const app = require('./server');
const server = app.listen(0, '127.0.0.1');
const publicKey = fs.readFileSync('src/payments.js', 'utf8').match(/const PUBLIC_KEY = '([^']+)'/)[1];
(async () => {
  try {
    await new Promise(resolve => server.on('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = async (route, { body, token, headers = {} } = {}) => {
      const res = await nativeFetch(base + '/api' + route, { method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
        body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
      return { status: res.status, data: await res.json() };
    };
    const user = await request('/auth/register', { body: { name: 'Pagamento', email: 'payment@example.com', password: 'safe-test-password' } });
    const token = user.data.token;
    assert.equal(user.status, 201);
    assert.equal((await request('/payments/packages')).status, 401);
    const client = await import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync('public/payments.js')).toString('base64'));
    const api = async (route, options = {}) => {
      const response = await request(route, { token, body: options.body });
      if (response.status >= 400) throw new Error(response.data.error);
      return response.data;
    };
    assert.equal((await client.getPackages(api)).available, true);
    assert.equal((await request('/payments/create', { token, body: { packageId: 'fake' } })).status, 404);
    const purchase = await client.createCheckout(api, 'pack_15');
    assert.equal(purchase.checkoutUrl, 'https://pay.abacatepay.com/test');
    assert.equal(payload.products[0].price, 499);
    assert.deepEqual(payload.methods, ['PIX']);
    assert.equal(payload.frequency, 'ONE_TIME');
    assert.ok(payload.completionUrl.includes(purchase.reference));
    assert.equal((await client.getPayment(api, purchase.reference)).status, 'pending');
    assert.equal((await api('/me')).state.gems, 50);
    const second = await request('/auth/register', { body: { name: 'Outra', email: 'other@example.com', password: 'safe-test-password' } });
    assert.equal((await request('/payments/' + purchase.reference, { token: second.data.token })).status, 404);
    const event = { event: 'billing.paid', devMode: true, data: { id: 'bill_1', status: 'PAID', amount: 499 } };
    const webhook = async (event, secret = 'test-secret', signature) => {
      const body = JSON.stringify(event, null, 2); // signature must cover original whitespace
      return request('/payments/webhook?webhookSecret=' + secret, { body, headers: {
        'X-Webhook-Signature': signature || crypto.createHmac('sha256', publicKey).update(body).digest('base64') } });
    };
    assert.equal((await webhook(event, 'wrong')).status, 401);
    assert.equal((await webhook(event, 'test-secret', 'invalid')).status, 401);
    assert.equal((await webhook({ ...event, devMode: false })).status, 400);
    assert.equal((await webhook({ ...event, data: { ...event.data, amount: 1 } })).status, 400);
    assert.equal((await api('/me')).state.gems, 50);
    assert.equal((await webhook(event)).status, 200);
    assert.equal((await webhook(event)).status, 200);
    assert.equal((await webhook({ ...event, data: { billing: event.data } })).status, 200);
    assert.equal((await api('/me')).state.gems, 65);
    assert.equal((await client.getPayment(api, purchase.reference)).status, 'paid');
    providerFailure = true;
    assert.equal((await request('/payments/create', { token, body: { packageId: 'pack_5' } })).status, 502);
    // JSDOM does not execute ES modules; inject the imported helper and evaluate app.js.
    const { JSDOM } = require('jsdom');
    const waitFor = async check => {
      for (let i = 0; i < 100; i++) { if (check()) return; await new Promise(r => setTimeout(r, 20)); }
      assert.fail('Interface não chegou ao estado esperado');
    };
    for (const loggedIn of [false, true]) {
      const dom = new JSDOM(fs.readFileSync('public/index.html', 'utf8'), { url: base + '/#/loja', runScripts: 'outside-only', pretendToBeVisual: true });
      const w = dom.window;
      try {
        w.HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {} });
        w.scrollTo = () => {};
        w.fetch = (url, options) => nativeFetch(new URL(url, base), options);
        w.Pay = client;
        if (loggedIn) w.localStorage.setItem('gamedoro:token', token);
        for (const file of ['shared.js', 'progression.js', 'scene.js']) w.eval(fs.readFileSync('public/' + file, 'utf8'));
        w.eval(fs.readFileSync('public/app.js', 'utf8').replace("import * as Pay from './payments.js';", ''));
        const container = () => w.document.querySelector('#gem-packages');
        if (!loggedIn) {
          await waitFor(() => /Entre para comprar/.test(container().textContent));
          assert.equal(container().querySelectorAll('[data-pkg]').length, 0);
        } else {
          await waitFor(() => container().querySelectorAll('[data-pkg]').length === 4);
          const button = container().querySelector('[data-pkg]');
          button.click();
          await waitFor(() => /Não foi possível/.test(w.document.querySelector('#toast').textContent));
          assert.equal(button.disabled, false);
          assert.equal(button.textContent, 'Comprar com PIX');
        }
      } finally { w.close(); }
    }
    console.log('Pagamentos OK: cliente autenticado, checkout, proprietário, assinatura original, valor, ambiente, crédito único e erro do provedor.');
  } finally {
    server.closeAllConnections(); server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
