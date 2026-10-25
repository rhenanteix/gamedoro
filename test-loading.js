'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

(async () => {
  const dom = new JSDOM(fs.readFileSync('public/index.html', 'utf8'), {
    url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w = dom.window;
  try {
    let draws = 0, requested = false, release;
    const profile = new Promise(resolve => { release = resolve; });
    w.HTMLCanvasElement.prototype.getContext = function () {
      const canvas = this;
      return { fillRect() { if (canvas.id === 'stage') draws++; } };
    };
    w.scrollTo = () => {};
    w.localStorage.setItem('gamedoro:token', 'test-only');
    w.fetch = async url => {
      if (url.startsWith('/api/me')) { requested = true; return profile; }
      return { ok: true, json: async () => ({ room: null, challenges: [], gems: 73 }) };
    };
    w.Pay = await import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync('public/payments.js')).toString('base64'));
    for (const file of ['shared.js', 'progression.js', 'scene.js']) w.eval(fs.readFileSync('public/' + file, 'utf8'));
    assert.equal(w.document.querySelector('#app-fonts').media, 'print');
    w.eval(fs.readFileSync('public/app.js', 'utf8').replace("import * as Pay from './payments.js';", ''));
    assert.ok(requested, 'Perfil solicitado');
    assert.ok(draws > 0, 'Personagem desenhado antes da resposta do perfil');
    assert.equal(w.document.querySelector('#gems').textContent, '', 'Saldo não pode ser inventado durante o carregamento');
    const fonts = w.document.querySelector('#app-fonts');
    fonts.dispatchEvent(new w.Event('load'));
    assert.equal(fonts.media, 'all', 'Fonte aplicada quando disponível');
    release({ ok: true, json: async () => ({ user: { name: 'Teste' }, state: {
      gems: 73, xp: 0, skin: 'ninja', world: 'dunas', cycle: 0, cfg: w.Shared.DEFAULT_CFG,
      hist: {}, owned: ['skin:ninja', 'world:dunas'], progress: w.Progression.fresh(),
      streak: 0, km: 0, totalMin: 0, sessions: 0, todayMin: 0
    } }) });
    // Store e route retomam após a resposta, sem substituir o saldo por estado visitante.
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.match(w.document.querySelector('#gems').textContent, /73/);
    assert.match(w.document.querySelector('#loc').textContent, /Dunas/);
    console.log('CARREGAMENTO OK: cena antes do perfil, fontes não bloqueantes e estado confirmado preservado.');
  } finally { w.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
