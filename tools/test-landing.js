'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '../public');
const dom = new JSDOM(fs.readFileSync(path.join(root, 'landing.html'), 'utf8'), {
  url: 'http://localhost/landing.html', runScripts: 'outside-only', pretendToBeVisual: true
});
const { window: w } = dom;
const d = w.document;
const $ = selector => d.querySelector(selector);
let now = 100000, tick, renders = 0;
w.Date.now = () => now;
w.setInterval = callback => { tick = callback; return 1; };
w.clearInterval = () => { tick = null; };
w.matchMedia = () => ({ matches: true, addEventListener() {} });
w.HTMLCanvasElement.prototype.getContext = () => ({ fillRect() { renders++; } });
w.eval(fs.readFileSync(path.join(root, 'scene.js'), 'utf8'));
w.eval(fs.readFileSync(path.join(root, 'landing.js'), 'utf8'));
try {
  for (const el of d.querySelectorAll('[src], link[rel="stylesheet"], a[href]')) {
    const target = el.getAttribute('src') || el.getAttribute('href');
    if (target.startsWith('#')) assert.ok(d.getElementById(target.slice(1)), `Missing anchor: ${target}`);
    else if (target.startsWith('/')) assert.ok(fs.existsSync(path.join(root, target)), `Missing file: ${target}`);
  }
  assert.equal(d.querySelectorAll('h1').length, 1);
  assert.equal(d.querySelectorAll('a.button[href="/index.html"]').length, 3);
  assert.ok(renders > 0, 'Pixel-art scene rendered');
  assert.equal($('#demo-scene').hidden, false);
  $('#nav-toggle').click(); assert.equal($('#nav-toggle').getAttribute('aria-expanded'), 'true');
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal($('#nav-toggle').getAttribute('aria-expanded'), 'false');
  $('#nav-toggle').click(); $('#nav-menu a').click();
  assert.equal($('#nav-toggle').getAttribute('aria-expanded'), 'false');
  assert.equal($('#demo-time').textContent, '25:00');
  $('#demo-start').click(); now += 61000; tick();
  assert.equal($('#demo-time').textContent, '23:59');
  $('#demo-start').click(); assert.equal(tick, null);
  now += 10000; $('#demo-start').click(); now += 1000; tick();
  assert.equal($('#demo-time').textContent, '23:58', 'Pause time is excluded');
  $('#demo-reset').click(); assert.equal(tick, null); assert.equal($('#demo-time').textContent, '25:00');
  $('[data-mode="short"]').click(); assert.equal($('#demo-time').textContent, '05:00');
  $('#demo-start').click(); now += 301000; tick();
  assert.equal($('#demo-time').textContent, '00:00'); assert.equal(tick, null);
  assert.match($('#demo-status').textContent, /Pausa concluída/);
  $('#demo-start').click(); assert.equal($('#demo-time').textContent, '05:00');
  $('[data-mode="long"]').click(); assert.equal($('#demo-time').textContent, '15:00'); assert.equal(tick, null);
  assert.equal(d.querySelectorAll('[data-mode][aria-pressed="true"]').length, 1);
  $('[data-mode="focus"]').click(); $('#demo-start').click(); now += 1500000; tick();
  assert.match($('#demo-status').textContent, /Foco concluído/);
  console.log('LANDING OK: assets, links, navigation, scene, timer, pause/resume, reset and completion.');
} finally { w.close(); }
