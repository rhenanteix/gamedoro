'use strict';
const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const G = require('./public/shared.js');
const P = require('./public/progression.js');

const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const PORT = +process.env.PORT || 3005;
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA, { recursive: true });
let SECRET = process.env.SECRET;
if (!SECRET) {
  const f = path.join(DATA, '.secret');
  if (fs.existsSync(f)) SECRET = fs.readFileSync(f, 'utf8');
  else { SECRET = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(f, SECRET, { mode: 0o600 }); }
}

/* ---------- Banco ---------- */
const db = new DatabaseSync(path.join(DATA, 'gamedoro.db'));
db.exec(`
PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, pass TEXT NOT NULL, code TEXT NOT NULL UNIQUE,
  gems INTEGER NOT NULL DEFAULT 0, xp INTEGER NOT NULL DEFAULT 0, skin TEXT NOT NULL DEFAULT 'aventureiro',
  world TEXT NOT NULL DEFAULT 'floresta', cycle INTEGER NOT NULL DEFAULT 0, cfg TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS owned(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, item TEXT NOT NULL, PRIMARY KEY(user_id,item));
CREATE TABLE IF NOT EXISTS sessions(
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  minutes INTEGER NOT NULL DEFAULT 0, day TEXT NOT NULL, world TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_sessions ON sessions(user_id, day);
CREATE TABLE IF NOT EXISTS active(
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, session_id INTEGER NOT NULL,
  planned INTEGER NOT NULL, started_at INTEGER NOT NULL, credited INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS friends(
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(user_id,friend_id));
/*** New tables for missions, chat and achievements ***/
CREATE TABLE IF NOT EXISTS missions(
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  description TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  reward_gems INTEGER NOT NULL DEFAULT 5,
  reward_xp INTEGER NOT NULL DEFAULT 10
);
CREATE TABLE IF NOT EXISTS chat_messages(
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS achievements(
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  earned_at INTEGER NOT NULL,
  description TEXT
);
CREATE TABLE IF NOT EXISTS payments(
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_id TEXT NOT NULL,
  reference TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`);

db.exec(`CREATE TABLE IF NOT EXISTS progression(user_id INTEGER PRIMARY KEY REFERENCES users(id), data TEXT NOT NULL);`);
for (const [name, type] of [['task', "TEXT NOT NULL DEFAULT ''"], ['project', "TEXT NOT NULL DEFAULT ''"], ['room', "TEXT"], ['free', 'INTEGER NOT NULL DEFAULT 0'], ['planned', 'INTEGER NOT NULL DEFAULT 0']]) {
  if (!db.prepare('PRAGMA table_info(sessions)').all().some(c => c.name === name)) db.exec(`ALTER TABLE sessions ADD COLUMN ${name} ${type}`);
}
const tx = fn => { db.exec('BEGIN IMMEDIATE'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
const one = (sql, ...a) => db.prepare(sql).get(...a), all = (sql, ...a) => db.prepare(sql).all(...a), run = (sql, ...a) => db.prepare(sql).run(...a);

const progressOf = uid => P.normalize(JSON.parse(one('SELECT data FROM progression WHERE user_id=?', uid)?.data || 'null'));
const saveProgress = (uid, p) => run('INSERT INTO progression VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data', uid, JSON.stringify(p));

/* ---------- Senhas, tokens, códigos ---------- */const { hashPass, checkPass, mac, sign, verify, newCode } = require('./src/utils/auth');;

/* ---------- Estado ---------- */
const utcToday = () => new Date().toISOString().slice(0, 10);
const todayOf = v => (G.isDay(v) && Math.abs(Date.parse(v) - Date.now()) < 2 * 864e5) ? v : utcToday();
const state = (uid, today) => {
  const u = one('SELECT * FROM users WHERE id=?', uid), hist = {};
  for (const r of all('SELECT day, SUM(minutes) AS m FROM sessions WHERE user_id=? AND day>=? GROUP BY day', uid, G.addDays(today, -400))) hist[r.day] = r.m;
  const tot = one('SELECT COALESCE(SUM(minutes),0) AS m, SUM(minutes>0) AS n FROM sessions WHERE user_id=?', uid);
  const recent = {}; for (let i = 0; i < 60; i++) { const d = G.addDays(today, -i); if (hist[d]) recent[d] = hist[d]; }
  return {
    user: { name: u.name, email: u.email, code: u.code },
    state: {
      gems: u.gems, xp: u.xp, skin: u.skin, world: u.world, cycle: u.cycle, cfg: JSON.parse(u.cfg), hist: recent,
      progress: progressOf(uid), streak: P.streak(hist, today, progressOf(uid)), km: G.kmFor(tot.m), totalMin: tot.m, sessions: tot.n || 0, todayMin: hist[today] || 0,
      owned: all('SELECT item FROM owned WHERE user_id=?', uid).map(r => r.item)
    }
  };
};

/* ---------- App ---------- */
const app = express();
app.disable('x-powered-by'); app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"
  });
  next();
});
app.use(express.json({ limit: '100kb', verify: (req, res, buffer) => { if (req.path === '/api/payments/webhook') req.rawBody = buffer; } }));
const hits = new Map();
const limiter = (max, ms) => (req, res, next) => {
  const now = Date.now(); let h = hits.get(req.ip); if (!h || h.reset < now) h = { n: 0, reset: now + ms };
  h.n++; hits.set(req.ip, h); if (h.n > max) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.' }); next();
};
setInterval(() => { const n = Date.now(); for (const [k, v] of hits) if (v.reset < n) hits.delete(k); }, 60000).unref();
const auth = (req, res, next) => {
  const uid = verify((req.get('Authorization') || '').replace(/^Bearer /, ''));
  if (!uid || !one('SELECT 1 FROM users WHERE id=?', uid)) return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
  req.uid = uid; req.today = todayOf(req.query.today || req.body.day || req.body.today); next();
};
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const GRANT = id => [`skin:aventureiro`, `world:floresta`];

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.post('/api/auth/register', limiter(20, 15 * 60000), (req, res) => {
  const name = String(req.body.name || '').trim(), email = String(req.body.email || '').trim().toLowerCase(), pw = String(req.body.password || '');
  if (name.length < 2 || name.length > 24) return bad(res, 'Informe um nome entre 2 e 24 caracteres.');
  if (!EMAIL.test(email)) return bad(res, 'E-mail inválido.');
  if (pw.length < 8 || pw.length > 128) return bad(res, 'A senha precisa ter de 8 a 128 caracteres.');
  if (one('SELECT 1 FROM users WHERE email=?', email)) return bad(res, 'Este e-mail já está cadastrado.', 409);
  const uid = tx(() => {
    const r = run('INSERT INTO users(name,email,pass,code,gems,cfg,created_at) VALUES(?,?,?,?,?,?,?)', name, email, hashPass(pw), newCode(one), G.WELCOME_GEMS, JSON.stringify(G.DEFAULT_CFG), Date.now());
    GRANT().forEach(i => run('INSERT INTO owned(user_id,item) VALUES(?,?)', r.lastInsertRowid, i));
    return Number(r.lastInsertRowid);
  });
  res.status(201).json({ token: sign(uid), ...state(uid, todayOf(req.body.today)) });
});
app.post('/api/auth/login', limiter(20, 15 * 60000), (req, res) => {
  const u = one('SELECT id, pass FROM users WHERE email=?', String(req.body.email || '').trim().toLowerCase());
  if (!u || !checkPass(String(req.body.password || ''), u.pass)) return bad(res, 'E-mail ou senha incorretos.', 401);
  res.json({ token: sign(u.id), ...state(u.id, todayOf(req.body.today)) });
});
app.get('/api/me', auth, (req, res) => res.json(state(req.uid, req.today)));

app.put('/api/settings', auth, (req, res) => {
  const cfg = G.clampCfg(req.body);
  if (!cfg) return bad(res, 'Configuração inválida.');
  run('UPDATE users SET cfg=? WHERE id=?', JSON.stringify(cfg), req.uid);
  res.json(state(req.uid, req.today));
});

// --- Register new feature routers ------------------------------------------------
const creditCoop = require('./cooperative')({ app, db, auth, bad, one, all, run, tx });
const missions = require('./src/missions')({ app, db, auth, bad, tx });
const chat = require('./src/chat')({ app, db, auth, bad });
const achievements = require('./src/achievements')({ app, db, auth, bad });
const payments = require('./src/payments')({ app, db, auth, bad, tx });


/* Sessões: o servidor só credita o que o relógio dele confirma */
app.post('/api/sessions/start', auth, (req, res) => {
  const planned = Number(req.body.planned);
  if (!Number.isInteger(planned) || (req.body.free === true ? planned !== 0 : planned < 1 || planned > 120)) return bad(res, 'Duração inválida.');
  const u = one('SELECT world FROM users WHERE id=?', req.uid);
  tx(() => {
    const old = one('SELECT session_id FROM active WHERE user_id=?', req.uid);
    if (old) { run('DELETE FROM sessions WHERE id=? AND minutes=0', old.session_id); run('DELETE FROM active WHERE user_id=?', req.uid); }
    const room = one('SELECT room FROM room_members WHERE user_id=?', req.uid)?.room || null;
    const s = run('INSERT INTO sessions(user_id,day,world,at,task,project,room,free,planned) VALUES(?,?,?,?,?,?,?,?,?)', req.uid, req.today, u.world, Date.now(), String(req.body.task || '').trim().slice(0, 120), String(req.body.project || '').trim().slice(0, 60), room, req.body.free === true ? 1 : 0, planned);
    run('INSERT INTO active(user_id,session_id,planned,started_at) VALUES(?,?,?,?)', req.uid, s.lastInsertRowid, planned, Date.now());
    // Ensure a mission exists for today for this user
    const hasMission = one('SELECT 1 FROM missions WHERE user_id=? AND day=?', req.uid, req.today);
    if (!hasMission) {
      const desc = `Concluir ${planned} minutos de foco`; // simple mission description
      run('INSERT INTO missions(user_id,day,description,reward_gems,reward_xp) VALUES(?,?,?,?,?)', req.uid, req.today, desc, 5, 10);
    }
  });
  res.json({ ok: true });
});
app.post('/api/sessions/sync', auth, (req, res) => {
  const a = one('SELECT * FROM active WHERE user_id=?', req.uid), final = req.body.final, min = Number(req.body.minutes);
  if (!a) return bad(res, 'Nenhuma fase em andamento.');
  if (!['pause', 'stop', 'complete'].includes(final)) return bad(res, 'Operação inválida.');
  if (!Number.isSafeInteger(min) || min < 0 || (a.planned > 0 && min > a.planned)) return bad(res, 'Minutos inválidos.');
  const elapsed = Math.floor((Date.now() - a.started_at) / 60000) + 1;
  if (!process.env.GAMEDORO_FAST && min > elapsed) return bad(res, 'Tempo insuficiente para creditar esses minutos.', 422);
  if (final === 'complete' && (a.planned === 0 || min < a.planned)) return bad(res, 'A fase ainda não terminou.', 422);
  const done = final === 'complete', m = Math.max(min, a.credited);
  tx(() => {
    const session = one('SELECT * FROM sessions WHERE id=?', a.session_id);
    creditCoop(req.uid, m - a.credited, session);
    const p = progressOf(req.uid);
    const xpBonus = Math.floor(m * 4 * p.skills.xp * .1) - Math.floor(a.credited * 4 * p.skills.xp * .1);
    const gemBonus = Math.floor(m * p.skills.gems * .1) - Math.floor(a.credited * p.skills.gems * .1);
    saveProgress(req.uid, P.credit(p, req.today, m - a.credited, done));
    const gems = G.gemsFor(m, false) - G.gemsFor(a.credited, false) + (done ? 5 : 0);
    run('UPDATE users SET gems=gems+?, xp=xp+?, cycle=cycle+? WHERE id=?', gems + gemBonus, G.xpFor(m - a.credited) + xpBonus, done ? 1 : 0, req.uid);
    run('UPDATE sessions SET minutes=?, completed=?, day=? WHERE id=?', m, done ? 1 : 0, req.today, a.session_id);
    if (final === 'pause') run('UPDATE active SET credited=? WHERE user_id=?', m, req.uid);
    else { run('DELETE FROM active WHERE user_id=?', req.uid); if (m === 0) run('DELETE FROM sessions WHERE id=?', a.session_id); }
  });
  res.json(state(req.uid, req.today));
});

/* Loja e equipamentos */
const catalog = id => { const [k, n] = String(id).split(':'); const l = k === 'skin' ? G.SKINS : k === 'world' ? G.WORLDS : null; return l && l.find(x => x.id === n) ? { kind: k, id: n, price: l.find(x => x.id === n).price } : null; };
app.post('/api/shop/buy', auth, (req, res) => {
  const it = catalog(req.body.item);
  if (!it) return bad(res, 'Item inexistente.', 404);
  const out = tx(() => {
    if (one('SELECT 1 FROM owned WHERE user_id=? AND item=?', req.uid, req.body.item)) return 'Você já tem este item.';
    if (one('SELECT gems FROM users WHERE id=?', req.uid).gems < it.price) return 'Gemas insuficientes.';
    run('UPDATE users SET gems=gems-? WHERE id=?', it.price, req.uid);
    run('INSERT INTO owned(user_id,item) VALUES(?,?)', req.uid, req.body.item);
  });
  if (out) return bad(res, out, 409);
  res.json(state(req.uid, req.today));
});
app.put('/api/equip', auth, (req, res) => {
  const it = catalog(`${req.body.kind}:${req.body.id}`);
  if (!it) return bad(res, 'Item inexistente.', 404);
  if (!one('SELECT 1 FROM owned WHERE user_id=? AND item=?', req.uid, `${it.kind}:${it.id}`)) return bad(res, 'Você ainda não tem este item.', 403);
  run(`UPDATE users SET ${it.kind === 'skin' ? 'skin' : 'world'}=? WHERE id=?`, it.id, req.uid);
  res.json(state(req.uid, req.today));
});

/* Histórico, amigos e ranking */
app.get('/api/history', auth, (req, res) => {
  const t = req.today, byDay = {};
  for (const r of all('SELECT day, SUM(minutes) AS m FROM sessions WHERE user_id=? AND day>=? GROUP BY day', req.uid, G.addDays(t, -29))) byDay[r.day] = r.m;
  const days = Array.from({ length: 30 }, (_, i) => { const d = G.addDays(t, -29 + i); return { day: d, min: byDay[d] || 0 }; });
  const sum = n => days.slice(-n).reduce((a, d) => a + d.min, 0);
  const sessions = all('SELECT day, minutes, world, completed, at, task, project, free, planned FROM sessions WHERE user_id=? AND minutes>0 ORDER BY at DESC LIMIT 15', req.uid);
  const projects = all("SELECT CASE WHEN project='' THEN 'Sem projeto' ELSE project END AS name, SUM(minutes) AS minutes, COUNT(*) AS attempts, SUM(completed) AS completed FROM sessions WHERE user_id=? GROUP BY project ORDER BY minutes DESC", req.uid);
  const durations = all('SELECT planned, COUNT(*) AS attempts, SUM(completed) AS completed FROM sessions WHERE user_id=? AND free=0 AND planned>0 AND (minutes>0 OR id NOT IN (SELECT session_id FROM active)) GROUP BY planned', req.uid);
  const hours = all('SELECT at,minutes,completed FROM sessions WHERE user_id=? AND minutes>0', req.uid);
  res.json({ days, sessions, projects, hours, durations, totals: { week: sum(7), month: sum(30), weekKm: G.kmFor(sum(7)), monthKm: G.kmFor(sum(30)) } });
});
const weekMin = (uid, t) => one('SELECT COALESCE(SUM(minutes),0) AS m FROM sessions WHERE user_id=? AND day>=?', uid, G.addDays(t, -6)).m;
app.get('/api/friends', auth, (req, res) => {
  const list = all('SELECT u.id, u.name, u.xp FROM friends f JOIN users u ON u.id=f.friend_id WHERE f.user_id=?', req.uid)
    .map(f => ({ id: f.id, name: f.name, level: G.level(f.xp), weekMin: weekMin(f.id, req.today) })).sort((a, b) => b.weekMin - a.weekMin);
  res.json({ code: one('SELECT code FROM users WHERE id=?', req.uid).code, friends: list });
});
app.post('/api/friends', auth, limiter(30, 15 * 60000), (req, res) => {
  const f = one('SELECT id, name FROM users WHERE code=?', String(req.body.code || '').trim().toUpperCase());
  if (!f) return bad(res, 'Código de amigo não encontrado.', 404);
  if (f.id === req.uid) return bad(res, 'Esse é o seu próprio código.');
  if (one('SELECT 1 FROM friends WHERE user_id=? AND friend_id=?', req.uid, f.id)) return bad(res, 'Vocês já são amigos.', 409);
  tx(() => { run('INSERT INTO friends VALUES(?,?)', req.uid, f.id); run('INSERT INTO friends VALUES(?,?)', f.id, req.uid); });
  res.status(201).json({ ok: true, name: f.name });
});
app.delete('/api/friends/:id', auth, (req, res) => {
  const id = Number(req.params.id);
  tx(() => { run('DELETE FROM friends WHERE user_id=? AND friend_id=?', req.uid, id); run('DELETE FROM friends WHERE user_id=? AND friend_id=?', id, req.uid); });
  res.json({ ok: true });
});
app.get('/api/ranking', auth, (req, res) => {
  const from = G.addDays(req.today, -6);
  const top = all('SELECT u.id, u.name, SUM(s.minutes) AS m FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.day>=? GROUP BY u.id HAVING m>0 ORDER BY m DESC, u.id LIMIT 20', from)
    .map((r, i) => ({ rank: i + 1, name: r.name, min: r.m, me: r.id === req.uid }));
  const mine = weekMin(req.uid, req.today);
  const rank = mine > 0 ? one('SELECT COUNT(*) AS n FROM (SELECT user_id, SUM(minutes) AS m FROM sessions WHERE day>=? GROUP BY user_id HAVING m>?)', from, mine).n + 1 : null;
  res.json({ top, me: { rank, min: mine } });
});

app.post('/api/progression', auth, (req, res) => {
  try { tx(() => { const st = state(req.uid, req.today).state; const out = P.action(progressOf(req.uid), req.body, { gems: st.gems, hist: st.hist, day: req.today, randomReward: crypto.randomInt(20, 61) }); saveProgress(req.uid, out.progress); run('UPDATE users SET gems=? WHERE id=?', out.gems, req.uid); }); res.json(state(req.uid, req.today)); } catch (e) { bad(res, e.message, 409); }
});

app.use('/api', (req, res) => bad(res, 'Rota não encontrada.', 404));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
app.use((err, req, res, next) => { if (err.type === 'entity.parse.failed') return bad(res, 'JSON inválido.'); console.error(err); res.status(500).json({ error: 'Erro interno do servidor.' }); });

if (require.main === module) app.listen(PORT, () => console.log(`gameDoro rodando em http://localhost:${PORT}`));
module.exports = app;
