'use strict';
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ready, stop } = require('./tools/test-server');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-sprint0-'));
const base = 'http://127.0.0.1:3118';
const day = new Date().toISOString().slice(0, 10);
const yesterday = require('./public/shared').addDays(day, -1);
const db = new DatabaseSync(path.join(dir, 'gamedoro.db'));
// Schema legado real, antes da coluna goal_minutes. IDs serão preservados.
db.exec(`PRAGMA foreign_keys=OFF; CREATE TABLE missions(id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL, description TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
  reward_gems INTEGER NOT NULL DEFAULT 5, reward_xp INTEGER NOT NULL DEFAULT 10);`);
const seed = db.prepare('INSERT INTO missions(user_id,day,description,completed,reward_gems,reward_xp) VALUES(1,?,?,?,?,?)');
seed.run(day, 'Concluir 25 minutos de foco', 0, 7, 13);
seed.run(day, 'Missão personalizada desconhecida', 0, 5, 10);
seed.run(day, 'Concluir 0 minutos de foco', 0, 5, 10);
seed.run(day, 'Concluir 25 minutos de foco', 1, 5, 10);
seed.run(yesterday, 'Concluir 25 minutos de foco', 0, 5, 10);
db.exec('PRAGMA foreign_keys=ON');
const env = { ...process.env, PORT: '3118', DATA_DIR: dir, SECRET: crypto.randomBytes(32).toString('hex'), GAMEDORO_FAST: '1' };
let srv;
const launch = () => spawn(process.execPath, ['server.js'], { env, stdio: ['ignore', 'ignore', 'inherit'] });
async function call(route, token, body, method) {
  const response = await fetch(base + '/api' + route, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, ...await response.json() };
}
(async () => {
  try {
    srv = launch(); await ready(srv, base + '/api/health');
    assert.equal(db.prepare('SELECT goal_minutes FROM missions WHERE id=1').get().goal_minutes, 25);
    assert.equal(db.prepare('SELECT goal_minutes FROM missions WHERE id=2').get().goal_minutes, null);
    assert.equal(db.prepare('SELECT goal_minutes FROM missions WHERE id=3').get().goal_minutes, null);
    const register = name => call('/auth/register', null, { name, email: name + '@example.com', password: 'test-password-123' });
    const a = await register('Alice'), b = await register('Breno');
    assert.equal(a.status, 201); assert.equal(b.status, 201);
    const ta = a.token, tb = b.token;
    const claim = (id, token = ta) => call('/missions/complete', token, { missionId: id });
    assert.equal((await claim(0)).status, 400);
    assert.equal((await claim(999)).status, 404);
    assert.equal((await claim(1, tb)).status, 404);
    for (const id of [1, 2, 3, 4, 5]) assert.equal((await claim(id)).status, 409);
    assert.equal((await call('/me', ta)).state.gems, 50);
    await call('/sessions/start', ta, { planned: 25 });
    await call('/sessions/sync', ta, { minutes: 24, final: 'pause' });
    assert.equal((await claim(1)).status, 409);
    await call('/sessions/sync', ta, { minutes: 25, final: 'complete' });
    const before = (await call('/me', ta)).state;
    // Forçar uma falha de saldo comprova que completed também sofre rollback.
    db.exec("CREATE TRIGGER reject_reward BEFORE UPDATE OF gems ON users WHEN NEW.id=1 BEGIN SELECT RAISE(ABORT,'falha simulada de saldo'); END;");
    assert.equal((await claim(1)).status, 500);
    assert.equal(db.prepare('SELECT completed FROM missions WHERE id=1').get().completed, 0);
    assert.equal((await call('/me', ta)).state.gems, before.gems);
    db.exec('DROP TRIGGER reject_reward');
    const attempts = await Promise.all([claim(1), claim(1)]);
    assert.deepEqual(attempts.map(r => r.status).sort(), [200, 409]);
    const after = (await call('/me', ta)).state;
    assert.equal(after.gems, before.gems + 7); assert.equal(after.xp, before.xp + 13);
    for (const id of [1, 2, 3, 4, 5]) assert.equal((await claim(id)).status, 409);
    // Novo modo livre recebe objetivo positivo e não resgata ao iniciar.
    await call('/sessions/start', tb, { planned: 0, free: true });
    const mission = (await call('/missions', tb)).missions[0];
    assert.equal(mission.goal_minutes, 30);
    assert.equal((await claim(mission.id, tb)).status, 409);
    await call('/sessions/sync', tb, { minutes: 30, final: 'stop' });
    assert.equal((await claim(mission.id, tb)).status, 200);
    // Limites de amigos não consomem o bucket de autenticação.
    for (let i = 0; i < 30; i++) assert.equal((await call('/friends', ta, { code: 'ZZZZZZ' })).status, 404);
    assert.equal((await call('/friends', ta, { code: 'ZZZZZZ' })).status, 429);
    assert.equal((await call('/auth/login', null, { email: 'Alice@example.com', password: 'test-password-123' })).status, 200);
    assert.equal((await call('/chat', ta, { message: '   ' })).status, 400);
    assert.equal((await call('/chat', ta, { message: 'x'.repeat(501) })).status, 400);
    assert.equal((await call('/chat', ta, { message: '  Olá  ' })).status, 200);
    assert.equal((await call('/chat', ta)).messages[0].message, 'Olá');
    for (let i = 0; i < 17; i++) assert.equal((await call('/chat', ta, { message: 'Foco' })).status, 200);
    assert.equal((await call('/chat', ta, { message: 'Foco' })).status, 429);
    assert.equal((await call('/chat', tb, { message: 'x'.repeat(500) })).status, 200);
    // Reaplicar migração não altera objetivo, resgate, recompensa ou tokens.
    await stop(srv); srv = launch(); await ready(srv, base + '/api/health');
    assert.equal((await claim(1)).status, 409);
    assert.equal((await call('/me', ta)).state.gems, after.gems);
    assert.equal(db.prepare('SELECT reward_gems,goal_minutes FROM missions WHERE id=1').get().reward_gems, 7);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
    console.log('SPRINT 0 OK: migração legada, objetivos, crédito único, rollback, isolamento e limites.');
  } finally {
    if (srv) await stop(srv);
    db.close(); fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
