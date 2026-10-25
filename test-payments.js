'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-payments-'));
process.env.DATA_DIR = dir;
process.env.SECRET = crypto.randomBytes(32).toString('hex');
process.env.APP_URL = 'http://localhost:3005';
process.env.ABACATEPAY_API_KEY = 'test-only';
process.env.ABACATEPAY_WEBHOOK_SECRET = 'test-secret';
process.env.ABACATEPAY_DEV_MODE = 'true';
const nativeFetch = globalThis.fetch;
let payload, providerFailure = false, count = 0, providerOverride = {};
globalThis.fetch = async (url, options) => {
  assert.equal(url, 'https://api.abacatepay.com/v1/billing/create');
  assert.equal(options.headers.Authorization, 'Bearer test-only');
  payload = JSON.parse(options.body);
  if (providerFailure) return { ok: false, json: async () => ({ error: 'Unavailable' }) };
  return { ok: true, json: async () => ({ data: { id: 'bill_' + ++count, url: 'https://pay.abacatepay.com/test', amount: payload.products[0].price, devMode: true, ...providerOverride }, error: null }) };
};
const app = require('./server');
// O módulo de pagamentos já capturou o mock; demais requisições usam rede local.
globalThis.fetch = nativeFetch;
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
    assert.equal((await request('/payments/create', { body: { packageId: 'pack_15' } })).status, 401);
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
    assert.equal((await request('/payments/webhook?webhookSecret=test-secret', { body: event })).status, 401);
    assert.equal((await webhook({ ...event, data: { ...event.data, id: 'unknown' } })).status, 503);
    assert.equal((await webhook({ ...event, data: { ...event.data, status: 'PENDING' } })).status, 400);
    assert.equal((await webhook({ ...event, event: 'billing.created' })).status, 200);
    // Uma assinatura de JSON equivalente não vale para bytes diferentes.
    const canonicalSignature = crypto.createHmac('sha256', publicKey).update(JSON.stringify(event)).digest('base64');
    assert.equal((await webhook(event, 'test-secret', canonicalSignature)).status, 401);
    assert.equal((await webhook(event, 'wrong')).status, 401);
    assert.equal((await webhook(event, 'test-secret', 'invalid')).status, 401);
    assert.equal((await webhook({ ...event, devMode: false })).status, 400);
    assert.equal((await webhook({ ...event, data: { ...event.data, amount: 1 } })).status, 400);
    assert.equal((await api('/me')).state.gems, 50);
    assert.deepEqual((await Promise.all([webhook(event), webhook(event)])).map(r => r.status), [200, 200]);
    assert.equal((await webhook({ ...event, data: { billing: event.data } })).status, 200);
    assert.equal((await api('/me')).state.gems, 65);
    assert.equal((await client.getPayment(api, purchase.reference)).status, 'paid');
    for (const invalid of [{ amount: 1 }, { devMode: false }, { url: 'http://pay.abacatepay.com/test' }]) {
      providerOverride = invalid;
      assert.equal((await request('/payments/create', { token, body: { packageId: 'pack_5' } })).status, 502);
    }
    providerOverride = {};
    assert.equal((await api('/me')).state.gems, 65);
    providerFailure = true;
    assert.equal((await request('/payments/create', { token, body: { packageId: 'pack_5' } })).status, 502);
    // JSDOM does not execute ES modules; inject the imported helper and evaluate app.js.
    const { JSDOM } = require('jsdom');
    const waitFor = async check => {
      for (let i = 0; i < 100; i++) { if (check()) return; await new Promise(r => setTimeout(r, 20)); }
      assert.fail('Interface não chegou ao estado esperado');
    };
    for (const loggedIn of [false, true, 'paid-return']) {
      const dom = new JSDOM(fs.readFileSync('public/index.html', 'utf8'), { url: base + (loggedIn === 'paid-return' ? '/?payment=' + purchase.reference : '/') + '#/loja', runScripts: 'outside-only', pretendToBeVisual: true });
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
          if (loggedIn === 'paid-return') {
            await waitFor(() => /Compra confirmada/.test(w.document.querySelector('#toast').textContent));
            assert.match(w.document.querySelector('#gems').textContent, /65/);
            assert.equal(w.location.search, '');
            assert.equal((await api('/me')).state.gems, 65);
            continue;
          }
          const button = container().querySelector('[data-pkg]');
          button.click();
          await waitFor(() => /Não foi possível/.test(w.document.querySelector('#toast').textContent));
          assert.equal(button.disabled, false);
          assert.equal(button.textContent, 'Comprar com PIX');
        }
      } finally { w.close(); }
    }
    // Sem configuração, a loja deve bloquear compra sem chamar o provedor.
    const disabledDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-payments-disabled-'));
    const child = require('node:child_process').spawn(process.execPath, ['server.js'], {
      env: { ...process.env, PORT: '3119', DATA_DIR: disabledDir,
        ABACATEPAY_API_KEY: '', ABACATEPAY_WEBHOOK_SECRET: '', APP_URL: '' },
      stdio: ['ignore', 'ignore', 'inherit']
    });
    try {
      await require('./tools/test-server').ready(child, 'http://127.0.0.1:3119/api/health');
      const registration = await nativeFetch('http://127.0.0.1:3119/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Sem PIX', email: 'disabled@example.com', password: 'test-disabled-123' })
      });
      const { token: disabledToken } = await registration.json();
      const headers = { Authorization: 'Bearer ' + disabledToken, 'Content-Type': 'application/json' };
      const packages = await nativeFetch('http://127.0.0.1:3119/api/payments/packages', { headers });
      assert.equal((await packages.json()).available, false);
      const purchase = await nativeFetch('http://127.0.0.1:3119/api/payments/create', {
        method: 'POST', headers, body: JSON.stringify({ packageId: 'pack_5' })
      });
      assert.equal(purchase.status, 503);
    } finally {
      await require('./tools/test-server').stop(child);
      fs.rmSync(disabledDir, { recursive: true, force: true });
    }
    console.log('Pagamentos OK: cliente autenticado, checkout, proprietário, assinatura original, valor, ambiente, crédito único e erro do provedor.');
  } finally {
    server.closeAllConnections(); server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
