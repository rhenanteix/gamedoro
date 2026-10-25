'use strict';
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-')), port = 3111, base = `http://localhost:${port}`;
const srv = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: port, DATA_DIR: dir, GAMEDORO_FAST: '1', SECRET: require('node:crypto').randomBytes(32).toString('hex') }, stdio: ['ignore', 'ignore', 'inherit'] });
const call = async (p, o = {}, t) => {
  const r = await fetch(base + p, { method: o.method || 'GET', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined });
  return { s: r.status, j: await r.json().catch(() => ({})) };
};
const today = new Date().toISOString().slice(0, 10), P = (p, body, t) => call(p, { method: 'POST', body }, t);
(async () => {
  try {
    await require('./tools/test-server').ready(srv, base + '/api/health');
    const u = { name: 'Ana', email: 'ana@exemplo.com', password: 'senha-forte-1', today };
    assert.equal((await P('/api/auth/register', { ...u, password: '123' })).s, 400);
    const reg = await P('/api/auth/register', u); assert.equal(reg.s, 201); assert.equal(reg.j.state.gems, 50);
    assert.equal((await P('/api/auth/register', u)).s, 409);
    assert.equal((await P('/api/auth/login', { ...u, password: 'errada-123' })).s, 401);
    const T = (await P('/api/auth/login', u)).j.token;
    assert.equal((await call('/api/me')).s, 401);
    assert.equal((await P('/api/sessions/sync', { minutes: 1, final: 'pause' }, T)).s, 400);

    // fase com pausa: créditos incrementais e idempotentes
    assert.equal((await P('/api/sessions/start', { planned: 25 }, T)).s, 200);
    let s = (await P('/api/sessions/sync', { minutes: 10, final: 'pause', day: today }, T)).j.state; assert.equal(s.gems, 55); assert.equal(s.xp, 40);
    s = (await P('/api/sessions/sync', { minutes: 10, final: 'pause', day: today }, T)).j.state; assert.equal(s.gems, 55);
    assert.equal((await P('/api/sessions/sync', { minutes: 24, final: 'complete', day: today }, T)).s, 422);
    s = (await P('/api/sessions/sync', { minutes: 25, final: 'complete', day: today }, T)).j.state;
    assert.equal(s.gems, 50 + 12 + 5); assert.equal(s.xp, 100); assert.equal(s.cycle, 1); assert.equal(s.km, 5); assert.equal(s.streak, 1); assert.equal(s.todayMin, 25);
    // encerrar antes do fim credita só o que foi focado
    await P('/api/sessions/start', { planned: 25 }, T);
    s = (await P('/api/sessions/sync', { minutes: 4, final: 'stop', day: today }, T)).j.state; assert.equal(s.gems, 69); assert.equal(s.cycle, 1); assert.equal(s.totalMin, 29);
    assert.equal((await P('/api/sessions/sync', { minutes: 4, final: 'stop' }, T)).s, 400);

    // mais fases para juntar gemas
    for (let i = 0; i < 3; i++) { await P('/api/sessions/start', { planned: 25 }, T); await P('/api/sessions/sync', { minutes: 25, final: 'complete', day: today }, T); }
    s = (await call('/api/me?today=' + today, {}, T)).j.state; assert.equal(s.gems, 120); assert.equal(s.cycle, 4);

    // loja e equipamentos
    assert.equal((await P('/api/shop/buy', { item: 'skin:inexistente' }, T)).s, 404);
    assert.equal((await P('/api/shop/buy', { item: 'world:costa' }, T)).s, 409);
    s = (await P('/api/shop/buy', { item: 'world:dunas' }, T)).j.state; assert.equal(s.gems, 40); assert.ok(s.owned.includes('world:dunas'));
    assert.equal((await P('/api/shop/buy', { item: 'world:dunas' }, T)).s, 409);
    assert.equal((await call('/api/equip', { method: 'PUT', body: { kind: 'skin', id: 'ninja' } }, T)).s, 403);
    s = (await call('/api/equip', { method: 'PUT', body: { kind: 'world', id: 'dunas' } }, T)).j.state; assert.equal(s.world, 'dunas');

    // ajustes
    assert.equal((await call('/api/settings', { method: 'PUT', body: { ...s.cfg, fase: 0 } }, T)).s, 400);
    s = (await call('/api/settings', { method: 'PUT', body: { ...s.cfg, fase: 50, ambient: true } }, T)).j.state; assert.equal(s.cfg.fase, 50); assert.equal(s.cfg.ambient, true);

    // histórico
    const h = (await call('/api/history?today=' + today, {}, T)).j;
    assert.equal(h.days.length, 30); assert.equal(h.totals.week, 104); assert.equal(h.sessions.length, 5);

    // amigos e ranking
    const reg2 = await P('/api/auth/register', { name: 'Bruno', email: 'bruno@exemplo.com', password: 'outra-senha-9', today });
    const T2 = reg2.j.token, code2 = reg2.j.user.code;
    assert.equal((await P('/api/friends', { code: 'ZZZZZZ' }, T)).s, 404);
    assert.equal((await P('/api/friends', { code: code2 }, T)).s, 201);
    assert.equal((await P('/api/friends', { code: code2 }, T)).s, 409);
    await P('/api/sessions/start', { planned: 25 }, T2); await P('/api/sessions/sync', { minutes: 25, final: 'complete', day: today }, T2);
    const fr = (await call('/api/friends?today=' + today, {}, T)).j; assert.equal(fr.friends.length, 1); assert.equal(fr.friends[0].weekMin, 25);
    assert.equal((await call('/api/friends?today=' + today, {}, T2)).j.friends[0].name, 'Ana');
    const rk = (await call('/api/ranking?today=' + today, {}, T2)).j; assert.equal(rk.top[0].name, 'Ana'); assert.equal(rk.me.rank, 2); assert.equal(rk.top[1].me, true);
    assert.equal((await call('/api/friends/' + (fr.friends[0].id), { method: 'DELETE' }, T)).s, 200);
    assert.equal((await call('/api/friends?today=' + today, {}, T)).j.friends.length, 0);
    assert.equal((await fetch(base + '/')).status, 200);
    console.log('OK: todos os testes passaram');
  } catch (e) { console.error('FALHOU:', e); process.exitCode = 1; }
  finally { await require('./tools/test-server').stop(srv); fs.rmSync(dir, { recursive: true, force: true }); }
})();
