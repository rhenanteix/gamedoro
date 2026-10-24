'use strict';
import * as Pay from './payments.js';
(() => {
  const G = Shared, P = Progression;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const km1 = n => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => ymd(new Date());
  const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b);
  const hm = ms => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const mmss = ms => { const s = Math.ceil(ms / 1000); return pad(Math.floor(s / 60)) + ':' + pad(s % 60); };
  function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.remove('on'), 2800); }

  /* ---------- Armazenamento: visitante (navegador) ou conta (servidor) ---------- */
  let TOKEN = null, USER = null, S = null;
  try { TOKEN = localStorage.getItem('gamedoro:token'); } catch (e) { }
  const LKEY = 'gamedoro:guest:v2';
  const localLoad = () => {
    let d = null; try { d = JSON.parse(localStorage.getItem(LKEY)); } catch (e) { }
    d = Object.assign({ gems: G.WELCOME_GEMS, xp: 0, skin: 'aventureiro', world: 'floresta', cycle: 0, hist: {}, owned: ['skin:aventureiro', 'world:floresta'], sessions: [], active: null }, d || {});
    d.progress = P.normalize(d.progress);
    d.cfg = Object.assign({}, G.DEFAULT_CFG, d.cfg); return d;
  };
  let L = localLoad();
  const localSave = () => { try { localStorage.setItem(LKEY, JSON.stringify(L)); } catch (e) { } };
  const localView = () => {
    const t = today(), tot = Object.values(L.hist).reduce((a, b) => a + b, 0);
    return { gems: L.gems, xp: L.xp, skin: L.skin, world: L.world, cycle: L.cycle, cfg: L.cfg, hist: L.hist, owned: L.owned, progress: L.progress, streak: P.streak(L.hist, t, L.progress), km: G.kmFor(tot), totalMin: tot, sessions: L.sessions.length, todayMin: L.hist[t] || 0 };
  };
  const cat = id => { const [k, n] = id.split(':'); const x = (k === 'skin' ? G.SKINS : G.WORLDS).find(i => i.id === n); return x && Object.assign({ kind: k }, x); };
  async function api(p, o = {}) {
    const r = await fetch('/api' + p, { method: o.method || 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}), body: o.body ? JSON.stringify(o.body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || 'Erro de conexão com o servidor'); e.status = r.status; throw e; }
    return j;
  }
  const take = d => { if (d.user) USER = d.user; S = d.state; };
  const Store = {
    async load() { if (TOKEN) take(await api('/me?today=' + today())); else S = localView(); },
    async start(planned) { const meta = { task: $('#focus-task').value, project: $('#focus-project').value, free: freeMode }; if (TOKEN) await api('/sessions/start', { method: 'POST', body: { planned, day: today(), ...meta } }); else { L.active = { planned, credited: 0, ...meta }; } },
    async sync(min, final) {
      if (TOKEN) { take(await api('/sessions/sync', { method: 'POST', body: { minutes: min, final, day: today() } })); return; }
      const a = L.active; if (!a) return;
      const m = Math.max(min, a.credited), done = final === 'complete', t = today();
      L.gems += Math.floor(m * L.progress.skills.gems * .1) - Math.floor(a.credited * L.progress.skills.gems * .1); L.xp += Math.floor(m * 4 * L.progress.skills.xp * .1) - Math.floor(a.credited * 4 * L.progress.skills.xp * .1);
      L.progress = P.credit(L.progress, t, m - a.credited, done);
      L.gems += G.gemsFor(m) - G.gemsFor(a.credited) + (done ? 5 : 0); L.xp += G.xpFor(m - a.credited); if (done) L.cycle++;
      L.hist[t] = (L.hist[t] || 0) + (m - a.credited);
      a.rec = a.rec || { day: t, minutes: 0, world: L.world, task: a.task, project: a.project, free: a.free, planned: a.planned, completed: 0, at: Date.now() }; a.rec.minutes = m; a.rec.completed = done ? 1 : 0;
      if (final === 'pause') a.credited = m; else { if (m > 0) L.sessions.unshift(a.rec); L.sessions = L.sessions.slice(0, 50); L.active = null; }
      localSave(); S = localView();
    },
    async progress(body) { if (TOKEN) take(await api('/progression', { method: 'POST', body: { ...body, today: today() } })); else { const out = P.action(L.progress, body, { gems: L.gems, hist: L.hist, day: today(), randomReward: 20 + Math.floor(Math.random() * 41) }); L.progress = out.progress; L.gems = out.gems; localSave(); S = localView(); } },
    async buy(item) {
      if (TOKEN) { take(await api('/shop/buy', { method: 'POST', body: { item, today: today() } })); return; }
      const it = cat(item); if (!it) throw new Error('Item inexistente.');
      if (L.owned.includes(item)) throw new Error('Você já tem este item.'); if (L.gems < it.price) throw new Error('Gemas insuficientes.');
      L.gems -= it.price; L.owned.push(item); localSave(); S = localView();
    },
    async equip(kind, id) {
      if (TOKEN) { take(await api('/equip', { method: 'PUT', body: { kind, id, today: today() } })); return; }
      if (!L.owned.includes(kind + ':' + id)) throw new Error('Você ainda não tem este item.'); L[kind] = id; localSave(); S = localView();
    },
    async saveCfg(c) { if (TOKEN) take(await api('/settings', { method: 'PUT', body: Object.assign({ today: today() }, c) })); else { L.cfg = c; localSave(); S = localView(); } },
    async history() {
      if (TOKEN) return api('/history?today=' + today());
      const t = today(), days = Array.from({ length: 30 }, (_, i) => { const d = G.addDays(t, -29 + i); return { day: d, min: L.hist[d] || 0 }; });
      const sum = n => days.slice(-n).reduce((a, d) => a + d.min, 0);
      const durations = Object.values(L.sessions.filter(s => !s.free && s.planned).reduce((a, s) => { const d = a[s.planned] || (a[s.planned] = { planned: s.planned, attempts: 0, completed: 0 }); d.attempts++; d.completed += s.completed; return a; }, {}));
      const projects = Object.values(L.sessions.reduce((a, s) => { const name = s.project || 'Sem projeto'; const p = a[name] || (a[name] = { name, minutes: 0, attempts: 0, completed: 0 }); p.minutes += s.minutes; p.attempts++; p.completed += s.completed; return a; }, Object.create(null)));
      return { days, projects, durations, hours: L.sessions, sessions: L.sessions.slice(0, 15), totals: { week: sum(7), month: sum(30), weekKm: G.kmFor(sum(7)), monthKm: G.kmFor(sum(30)) } };
    }
  };

  /* ---------- Cena ---------- */
  class Stage {
    constructor(cv, o) { this.cv = cv; this.o = o; this.ctx = cv.getContext('2d'); this.fit(); }
    fit() {
      const cw = this.cv.parentElement.clientWidth || 600, ch = this.o.cssH(cw), sc = Math.max(3, Math.round(cw / this.o.target));
      this.W = Math.ceil(cw / sc); this.H = Math.ceil(ch / sc); this.cv.width = this.W; this.cv.height = this.H;
      this.cv.style.width = this.W * sc + 'px'; this.cv.style.height = this.H * sc + 'px';
    }
    draw(o) { Scene.render(this.ctx, this.W, this.H, o); }
  }
  let main = null, heroStage = null;
  function thumb(cv, world, skin) { cv.width = 64; cv.height = 40; Scene.render(cv.getContext('2d'), 64, 40, { world, skin, t: .2, scroll: 60, pose: 'idle', flag: false, companion: false }); }
  function drawLogo() {
    const cv = $('#logo'), c = cv.getContext('2d'), pal = { K: '#232a6b', h: '#c8f6ef', c: '#56d3c2', d: '#2a9d92' };
    ['..KKKKKKKKKK..', '.KhhhhccccddK.', 'KhhhccccccdddK', 'KKKKKKKKKKKKKK', '.KcccccccccdK.', '..KcccccccdK..', '...KcccccdK...', '....KcccdK....', '.....KcdK.....', '......KK......']
      .forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { c.fillStyle = pal[ch]; c.fillRect(x + 1, y + 3, 1, 1); } }));
  }

  /* ---------- Áudio e alertas ---------- */
  let actx = null;
  const ac = () => actx || (actx = new (window.AudioContext || window.webkitAudioContext)());
  function beep() { try { const a = ac();[660, 880, 1100].forEach((f, i) => { const o = a.createOscillator(), g = a.createGain(); o.type = 'square'; o.frequency.value = f; g.gain.value = .05; o.connect(g); g.connect(a.destination); o.start(a.currentTime + i * .16); o.stop(a.currentTime + i * .16 + .12); }); } catch (e) { } }
  const AMB = { floresta: ['bandpass', 1400, .8, .05, .15, .02], dunas: ['lowpass', 500, .6, .06, .08, .03], montanha: ['bandpass', 800, .4, .05, .1, .025], costa: ['lowpass', 700, .5, .07, .12, .05] };
  let amb = null;
  function ambStop() { if (amb) { try { amb.src.stop(); amb.lfo.stop(); } catch (e) { } amb = null; } }
  function ambStart() {
    if (amb && amb.world === S.world) return; ambStop();
    try {
      const c = ac(); c.resume(); const [type, f, q, gain, rate, depth] = AMB[S.world] || AMB.floresta;
      const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = c.createGain(); g.gain.value = gain; const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = rate; lg.gain.value = depth;
      lfo.connect(lg); lg.connect(g.gain); src.connect(fl); fl.connect(g); g.connect(c.destination); src.start(); lfo.start(); amb = { src, lfo, world: S.world };
    } catch (e) { }
  }
  const syncAmb = () => (S.cfg.ambient && T.running ? ambStart() : ambStop());
  function notify(msg) { if (S.cfg.alert) beep(); if (S.cfg.notify && 'Notification' in window && Notification.permission === 'granted') { try { new Notification('gameDoro', { body: msg }); } catch (e) { } } }

  /* ---------- Timer ---------- */
  let freeMode = false, hearts = 3, roomData = null;
  const T = { mode: 'fase', total: 0, left: 0, running: false, endAt: 0, session: false, credited: 0 };
  const durMin = m => m === 'fase' && freeMode ? 0 : S.cfg[m];
  const focused = () => T.mode === 'fase' ? Math.min(freeMode ? Infinity : durMin('fase'), Math.floor((T.total - T.left) / 60000)) : 0;
  const nextBreak = () => ((S.cycle + 1) % S.cfg.ciclos === 0 ? 'descanso' : 'respiro');
  function setMode(m) { T.mode = m; T.total = durMin(m) * 60000; T.left = T.total; T.running = false; T.session = false; T.credited = 0; refresh(); }
  async function creditT(final) {
    const min = final === 'complete' ? S.cfg.fase : focused();
    try { await Store.sync(min, final); T.credited = min; return true; } catch (e) { toast(e.message); return false; }
  }
  async function startT() {
    if (T.running) return;
    if (T.session && $('#strict-mode').checked && hearts === 0) return toast('Encerre esta fase para recuperar os corações.');
    if (T.mode === 'fase' && !T.session) {
      try { await Store.start(durMin('fase')); hearts = 3; $('#hearts').textContent = '♥♥♥'; } catch (e) { toast(e.message); return; }
      T.session = true; T.credited = 0;
    }
    T.running = true; presence(); T.endAt = Date.now() + T.left; syncAmb(); refresh();
    if (S.cfg.notify && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  }
  async function pauseT() {
    if (!T.running) return; T.left = (freeMode && T.mode === 'fase' ? T.endAt - Date.now() : Math.max(0, T.endAt - Date.now())); T.running = false; presence(); syncAmb(); refresh();
    if (T.mode === 'fase') { await creditT('pause'); refresh(); }
  }
  async function stopT() {
    if (T.running) T.left = freeMode ? T.endAt - Date.now() : Math.max(0, T.endAt - Date.now());
    T.running = false; presence(); syncAmb();
    if (T.mode === 'fase' && T.session) { if (!await creditT('stop')) return; if (T.credited > 0) toast('Fase encerrada. ' + plural(T.credited, 'minuto', 'minutos') + ' de foco registrados.'); }
    setMode('fase');
  }
  async function completeT() {
    T.running = false; presence(); let next = 'fase', msg = 'Pausa encerrada. Vamos para a próxima fase!';
    if (T.mode === 'fase') {
      const before = S.gems; if (!await creditT('complete')) { syncAmb(); refresh(); return; } T.session = false;
      next = S.cycle % S.cfg.ciclos === 0 && S.cycle > 0 ? 'descanso' : 'respiro';
      msg = 'Fase concluída! +' + (S.gems - before) + ' gemas'; toast(msg);
    } else toast(msg);
    notify(msg); setMode(next); if (S.cfg.auto) startT();
  }
  function tick() {
    if (!S) return;
    if (T.running) { T.left = (freeMode && T.mode === 'fase' ? T.endAt - Date.now() : Math.max(0, T.endAt - Date.now())); if (T.left <= 0 && !(freeMode && T.mode === 'fase')) { completeT(); return; } }
    paintTime();
  }
  function paintTime() {
    const t = mmss(freeMode && T.mode === 'fase' ? T.total - T.left : T.left); $('#time').textContent = t; $('#prog').style.width = (T.total ? (1 - T.left / T.total) * 100 : 0) + '%';
    document.title = (T.running ? t + ' · ' : '') + 'gameDoro';
    $('#sub').textContent = subText(); paintPip(); paintEarn(); paintLoc();
  }
  function subText() {
    if (freeMode && T.mode === 'fase') return 'Modo livre · sem contagem regressiva. Encerre para registrar o foco.';
    const m = durMin(T.mode), end = hm((T.running ? T.endAt : Date.now() + T.left)), nxt = T.mode === 'fase'
      ? (nextBreak() === 'descanso' ? 'pausa longa de ' + S.cfg.descanso : 'pausa de ' + S.cfg.respiro) + ' min' : 'nova fase de ' + S.cfg.fase + ' min';
    return `de ${mmss(m * 60000)} · termina às ${end} · depois, ${nxt}`;
  }
  function paintEarn() {
    const p = T.mode === 'fase' ? G.gemsFor(focused()) - G.gemsFor(T.credited) : 0;
    $('#earn').textContent = T.mode === 'fase' ? `+${p} gemas até agora · entram quando você pausa ou termina o foco ${freeMode ? '' : '(+5 de bônus ao completar)'}` : 'Respire fundo. Pausas não rendem gemas, mas recarregam o foco.';
  }
  function paintLoc() {
    const live = T.session ? G.kmFor(Math.max(0, focused() - T.credited)) : 0, w = G.WORLDS.find(x => x.id === (roomData?.world || S.world));
    $('#loc').textContent = `${w ? w.name : ''} · ${km1((G.kmFor(S.todayMin || 0)) + live)} km hoje`;
  }
  function refresh() {
    if (!S) return;
    const n = S.cfg.ciclos, idx = S.cycle % n, brk = T.mode !== 'fase', full = T.mode === 'descanso';
    $('#mode-tag').textContent = T.mode === 'fase' ? 'FOCO' : T.mode === 'respiro' ? 'PAUSA' : 'PAUSA LONGA';
    $('#dots').innerHTML = Array.from({ length: n }, (_, i) => `<i class="${full || i < idx || (!brk && i === idx) ? 'on' : ''}"></i>`).join('');
    $('#cycle').textContent = full ? 'Ciclo completo' : `Ciclo ${brk ? idx : idx + 1} de ${n}`;
    $('#go').textContent = T.running ? 'Pausar' : (T.left < T.total ? 'Continuar' : T.mode === 'fase' ? 'Iniciar foco' : 'Iniciar pausa');
    $('#stop').textContent = brk ? 'Pular pausa' : 'Encerrar';
    $$('#presets .opt[data-m]').forEach(b => b.classList.toggle('on', +b.dataset.m === S.cfg.fase));
    $('#auto-note').textContent = `Pomodoro ${S.cfg.auto ? 'automático' : 'manual'}: ${n} ciclos · pausa ${S.cfg.respiro} / ${S.cfg.descanso} min.`;
    $$('.wd').forEach(b => b.classList.toggle('on', b.dataset.w === S.world));
    ['ambient', 'alert', 'notify'].forEach(k => $('#t-' + k).setAttribute('aria-checked', S.cfg[k]));
    const w = G.WORLDS.find(x => x.id === S.world); $('#amb-name').textContent = w ? w.name : '';
    $('#gems').textContent = '💎 ' + S.gems.toLocaleString('pt-BR');
    $('#streak').textContent = '🔥 ' + plural(S.streak, 'dia seguido', 'dias seguidos');
    $('#btn-auth').textContent = USER ? 'Sair' : 'Entrar';
    const c = G.nextCheckpoint(S.km);
    $('#cp').innerHTML = `Próximo checkpoint: <b>${esc(c[1])}</b> · faltam ${km1(Math.max(0, c[0] - S.km))} km`;
    $('#focus-task').disabled = T.session; $('#focus-project').disabled = T.session; $('#strict-mode').disabled = T.session;
    $('#free-mode').classList.toggle('on', freeMode);
    $('#focus-guide').hidden = !brk; $('#focus-guide').textContent = full ? 'Pausa longa: levante, caminhe um pouco e alongue ombros e mãos sem forçar.' : 'Respire devagar. Solte os ombros e observe algo distante por 20 segundos.';
    paintTime();
  }
  function buildWorlds() {
    $('#worlds').innerHTML = G.WORLDS.map(w => { const own = S.owned.includes('world:' + w.id); return `<button class="wd" data-w="${w.id}" title="${esc(w.desc)}"><canvas></canvas><span>${w.name}</span>${own ? '' : `<i>💎 ${w.price}</i>`}</button>`; }).join('');
    $$('#worlds .wd').forEach(b => { thumb($('canvas', b), b.dataset.w, S.skin); b.onclick = () => pickWorld(b.dataset.w); });
  }
  async function pickWorld(id) {
    try {
      if (!S.owned.includes('world:' + id)) { const w = G.WORLDS.find(x => x.id === id); if (!confirm(`Desbloquear ${w.name} por ${w.price} gemas?`)) return; await Store.buy('world:' + id); toast(w.name + ' desbloqueado!'); }
      await Store.equip('world', id); if (T.running && !S.cfg.ambient) { /* nada */ } syncAmb(); if (amb && amb.world !== S.world) ambStart(); buildWorlds(); refresh();
    } catch (e) { toast(e.message); }
  }

  /* ---------- Mini janela ---------- */
  let pip = null;
  async function pipOpen() {
    if (pip && !pip.closed) return;
    try {
      if (window.documentPictureInPicture) pip = await documentPictureInPicture.requestWindow({ width: 300, height: 160 });
      else { pip = window.open('', 'gd-pip', 'popup,width=300,height=160'); if (!pip) throw 0; pip.document.title = 'gameDoro'; }
      pip.document.body.style.cssText = 'margin:0;display:grid;place-items:center;height:100vh;background:#1a1c3a;color:#ecebff;font-family:Silkscreen,monospace;text-align:center';
      pip.document.body.innerHTML = '<div><div id="pt" style="font-size:46px"></div><div id="pm" style="font-size:12px;opacity:.7;margin-top:8px"></div></div>';
      pip.addEventListener('pagehide', () => { pip = null; $('#pip-ck').checked = false; });
      $('#pip-ck').checked = true; paintPip();
    } catch (e) { toast('Seu navegador bloqueou a mini janela.'); $('#pip-ck').checked = false; }
  }
  function paintPip() { if (pip && !pip.closed) { const t = pip.document.getElementById('pt'); if (t) { t.textContent = mmss(freeMode && T.mode === 'fase' ? T.total - T.left : T.left); pip.document.getElementById('pm').textContent = (T.mode === 'fase' ? 'FOCO' : 'PAUSA') + (T.running ? '' : ' · PAUSADO'); } } }

  /* ---------- Páginas ---------- */
  const needLogin = t => `<div class="card empty"><h2>${t}</h2><p class="muted">Crie uma conta gratuita para salvar o progresso e competir com amigos.</p><button class="btn primary" data-login style="flex:none">Entrar ou criar conta</button></div>`;
  const head = (t, s) => `<div class="page-h"><h1>${t}</h1><p class="muted">${s}</p></div>`;
  const dayLabel = d => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  function itemCard(kind, it) {
    const id = kind + ':' + it.id, own = S.owned.includes(id), cur = S[kind] === it.id;
    const act = cur ? '<button class="btn sm" disabled>Em uso</button>' : own ? `<button class="btn sm primary" data-eq="${kind}:${it.id}">Usar</button>` : `<button class="btn sm" data-buy="${id}">Comprar · 💎 ${it.price}</button>`;
    return `<div class="card item"><canvas data-k="${kind}" data-i="${it.id}"></canvas><h3>${esc(it.name)}</h3><p class="muted small">${esc(it.desc)}</p>${act}</div>`;
  }
  function paintItems(root) {
    $$('canvas[data-k]', root).forEach(cv => {
      cv.width = cv.dataset.k === 'skin' ? 48 : 64; cv.height = cv.dataset.k === 'skin' ? 40 : 40;
      Scene.render(cv.getContext('2d'), cv.width, cv.height, { world: cv.dataset.k === 'world' ? cv.dataset.i : S.world, skin: cv.dataset.k === 'skin' ? cv.dataset.i : S.skin, t: .2, scroll: 60, pose: 'idle', flag: false, companion: cv.dataset.k === 'skin' });
    });
  }
  const RENDER = {
    async diario() {
      const root = $('#v-diario'); root.innerHTML = head('Diário', 'Seu foco dos últimos 30 dias.') + '<div class="card empty muted">Carregando…</div>';
      let h; try { h = await Store.history(); } catch (e) { root.innerHTML = head('Diário', '') + `<div class="card empty">${esc(e.message)}</div>`; return; }
      const max = Math.max(30, ...h.days.map(d => d.min));
      const sess = h.sessions.length ? h.sessions.map(s => { const w = G.WORLDS.find(x => x.id === s.world); return `<li><div class="grow"><div class="name">${s.completed ? '✅ Fase completa' : '⏹ Fase encerrada'} · ${esc(w ? w.name : '')}</div><small class="muted">${dayLabel(s.day)} · ${esc(s.project || 'Sem projeto')} · ${esc(s.task || 'Foco livre')}</small></div><b>${s.minutes} min</b></li>`; }).join('') : '<li class="muted">Nenhuma fase registrada ainda. Comece a primeira!</li>';
      root.innerHTML = head('Diário', 'Seu foco dos últimos 30 dias.') +
        `<div class="stats"><div class="card stat"><b>${h.totals.week}</b><span>min nesta semana</span></div><div class="card stat"><b>${km1(h.totals.weekKm)}</b><span>km na semana</span></div><div class="card stat"><b>${h.totals.month}</b><span>min em 30 dias</span></div><div class="card stat"><b>${S.streak}</b><span>${S.streak === 1 ? 'dia' : 'dias'} seguidos</span></div></div>` +
        `<div class="card"><h2>Minutos por dia</h2><div class="bars">${h.days.map(d => `<i class="${d.min >= G.STREAK_MIN ? 'hot' : ''}" style="height:${Math.max(2, d.min / max * 100)}%" title="${dayLabel(d.day)}: ${d.min} min"></i>`).join('')}</div><div class="bar-l"><span>${dayLabel(h.days[0].day)}</span><span>hoje</span></div><p class="muted small">Dias com 10 minutos ou mais mantêm sua sequência (barras destacadas).</p></div>` +
        insightsHTML(h) + `<div class="card" style="margin-top:18px"><h2>Últimas fases</h2><ul class="list">${sess}</ul></div>`;
    },
    async mundos() { const r = $('#v-mundos'); r.innerHTML = head('Mundos', 'Escolha onde o seu herói vai caminhar.') + `<div class="grid">${G.WORLDS.map(w => itemCard('world', w)).join('')}</div>`; paintItems(r); },
    async heroi() {
      const r = $('#v-heroi'), lv = G.level(S.xp), into = S.xp % 400;
      r.innerHTML = head('Herói', 'Evolua, personalize e veja seu progresso.') +
        `<div class="hero-box"><div><canvas id="hero-cv"></canvas></div><div class="card"><h2>Nível ${lv}</h2><div class="xp"><b style="width:${into / 4}%"></b></div><p class="muted small">${into} / 400 XP para o próximo nível</p><div class="stats" style="margin:16px 0 0"><div class="stat"><b>${km1(S.km)}</b><span>km percorridos</span></div><div class="stat"><b>${S.sessions}</b><span>fases</span></div><div class="stat"><b>${Math.round(S.totalMin / 6) / 10}</b><span>horas de foco</span></div></div></div></div>` +
        `<h2>Roupas</h2><div class="grid">${G.SKINS.map(s => itemCard('skin', s)).join('')}</div>`;
      paintItems(r); heroStage = new Stage($('#hero-cv'), { cssH: cw => cw * .56, target: 105 });
    },
    async loja() {
      const r = $('#v-loja');
      r.innerHTML = head('Loja', `Você tem 💎 ${S.gems.toLocaleString('pt-BR')} gemas. Ganhe mais focando.`) + `
        <h2>Mundos</h2>
        <div class="grid">${G.WORLDS.map(w => itemCard('world', w)).join('')}</div>
        <h2 style="margin-top:28px">Roupas</h2>
        <div class="grid">${G.SKINS.map(s => itemCard('skin', s)).join('')}</div>
        <h2 style="margin-top:28px">Pacotes de Gemas</h2>
        <div id="gem-packages" class="grid"></div>
      `;
      // Load gem packages from backend
      Pay.getPackages()
        .then(pkgs => {
          const container = $('#gem-packages');
          if (!container) return;
          container.innerHTML = pkgs.map(p => `
            <div class="card item">
              <h3>${p.gems} gemas</h3>
              <p class="muted small">R$${(p.priceCents/100).toFixed(2)}</p>
              <button class="btn sm primary" data-pkg="${p.id}">Comprar</button>
            </div>
          `).join('');
          $$('#gem-packages button[data-pkg]').forEach(btn => {
            btn.onclick = async () => {
              try {
                const resp = await Pay.createCheckout(btn.dataset.pkg);
                if (resp.checkoutUrl) location.href = resp.checkoutUrl;
              } catch (e) {
                toast(e.message);
              }
            };
          });
        })
        .catch(e => console.error('Payments load error', e));
      paintItems(r);
    },
    async amigos() {
      const r = $('#v-amigos'); if (!TOKEN) { r.innerHTML = head('Amigos', 'Compare o foco da semana com quem você quiser.') + needLogin('Entre para ter amigos'); return; }
      r.innerHTML = head('Amigos', 'Compare o foco da semana com quem você quiser.') + '<div class="card empty muted">Carregando…</div>';
      try {
        const d = await api('/friends?today=' + today()), max = Math.max(60, ...d.friends.map(f => f.weekMin));
        r.innerHTML = head('Amigos', 'Compare o foco da semana com quem você quiser.') +
          `<div class="grid3" style="grid-template-columns:1fr 2fr"><div class="card"><h2>Seu código</h2><div class="code">${esc(d.code)}</div><p class="muted small">Passe este código para um amigo adicionar você.</p><h2 style="margin-top:20px">Adicionar amigo</h2><form id="addf" class="inline"><label style="flex:1;margin:0"><input id="fc" maxlength="6" placeholder="CÓDIGO" aria-label="Código do amigo" style="text-transform:uppercase"></label><button class="btn sm primary" style="flex:none">Adicionar</button></form></div>` +
          `<div class="card"><h2>Foco nos últimos 7 dias</h2><ul class="list">${d.friends.length ? d.friends.map(f => `<li><div class="grow"><div class="name">${esc(f.name)}</div><small class="muted">Nível ${f.level}</small><div class="xp"><b style="width:${f.weekMin / max * 100}%"></b></div></div><b>${f.weekMin} min</b><button class="btn sm" data-rm="${f.id}" aria-label="Remover ${esc(f.name)}">✕</button></li>`).join('') : '<li class="muted">Você ainda não adicionou ninguém.</li>'}</ul></div></div>`;
        $('#addf').onsubmit = async e => { e.preventDefault(); try { const j = await api('/friends', { method: 'POST', body: { code: $('#fc').value } }); toast(j.name + ' agora é seu amigo!'); RENDER.amigos(); } catch (x) { toast(x.message); } };
      } catch (e) { r.innerHTML = head('Amigos', '') + `<div class="card empty">${esc(e.message)}</div>`; }
    },
    async ranking() {
      const r = $('#v-ranking'), sub = 'Os jogadores que mais focaram nos últimos 7 dias.'; if (!TOKEN) { r.innerHTML = head('Ranking', sub) + needLogin('Entre para entrar no ranking'); return; }
      r.innerHTML = head('Ranking', sub) + '<div class="card empty muted">Carregando…</div>';
      try {
        const d = await api('/ranking?today=' + today());
        r.innerHTML = head('Ranking', sub) + `<div class="card"><ul class="list">${d.top.length ? d.top.map(t => `<li class="${t.me ? 'me' : ''}"><span class="rank">${t.rank <= 3 ? ['🥇', '🥈', '🥉'][t.rank - 1] : '#' + t.rank}</span><div class="grow name">${esc(t.name)}${t.me ? ' (você)' : ''}</div><b>${t.min} min</b></li>`).join('') : '<li class="muted">Ninguém focou nesta semana ainda. Seja o primeiro!</li>'}</ul>${d.me.rank && d.me.rank > 20 ? `<p class="muted">Sua posição: #${d.me.rank} · ${d.me.min} min</p>` : ''}</div>`;
      } catch (e) { r.innerHTML = head('Ranking', '') + `<div class="card empty">${esc(e.message)}</div>`; }
    }
  };
  const VIEWS = ['aventura', 'cooperativo', 'timer', 'diario', 'mundos', 'heroi', 'loja', 'amigos', 'ranking'];
  async function route() {
    const h = location.hash.replace(/^#\/?/, '') || 'timer', name = VIEWS.includes(h) ? h : 'timer';
    VIEWS.forEach(v => { $('#v-' + v).hidden = v !== name; }); $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.v === name));
    if (name === 'timer') { main.fit(); buildWorlds(); refresh(); } else await RENDER[name]();
    window.scrollTo(0, 0);
  }

  /* ---------- Aventura e cooperação ---------- */
  function insightsHTML(h) {
    const rows = h.hours || [], hours = {}; rows.forEach(r => { const hour = new Date(r.at).getHours(); hours[hour] = (hours[hour] || 0) + r.minutes; });
    const best = Object.entries(hours).sort((a, b) => b[1] - a[1])[0];
    const summary = rows.length >= 5 && best ? `Você acumulou mais foco às ${best[0]}h (${best[1]} min). Isso descreve seu histórico, não mede produtividade.` : 'Complete pelo menos 5 fases para começar a ver padrões de horário.';
    return `<div class="card feature-card"><h2>Projetos e insights</h2><p class="muted">${summary}</p><p class="muted">${(h.durations || []).filter(d => d.attempts >= 3).map(d => `${d.planned} min: ${Math.round(d.completed / d.attempts * 100)}% de conclusão em ${d.attempts} fases`).join(' · ') || 'Após 3 fases na mesma duração, você verá sua taxa de conclusão.'}</p><ul class="list">${(h.projects || []).map(p => `<li><span class="grow">${esc(p.name)}</span><b>${p.minutes} min</b><small>${p.completed}/${p.attempts} fases concluídas</small></li>`).join('') || '<li>Nenhum projeto registrado.</li>'}</ul></div>`;
  }
  RENDER.aventura = async function () {
    const p = P.normalize(S.progress), pet = P.pet(S.totalMin), w = P.week(today());
    const weekly = Object.entries(p.days).filter(([d]) => d >= w && d <= today()).reduce((n, [, v]) => n + v.minutes, 0);
    $('#v-aventura').innerHTML = head('Aventura', 'Cada sessão constrói sua jornada.') + `<div class="grid3"><div class="card"><h2>Missões e conquistas</h2>${P.missions(p, today(), S.hist).map(m => `<div class="mission"><b>${esc(m.name)}</b><p>${Math.min(m.value, m.goal)} / ${m.goal} · 💎 ${m.reward}</p><button class="btn sm" data-progress="claim" data-id="${m.id}" ${m.claimed || m.value < m.goal ? 'disabled' : ''}>${m.claimed ? 'Resgatada' : 'Resgatar'}</button></div>`).join('')}</div><div class="card"><h2>Baú semanal</h2><p>${weekly} / 120 min nesta semana</p><p class="muted">Recompensa surpresa: 20 a 60 gemas.</p><button class="btn" data-progress="chest" ${weekly < 120 || p.chests.includes(w) ? 'disabled' : ''}>${p.chests.includes(w) ? 'Baú aberto' : 'Abrir baú'}</button><h2 class="feature-card">Proteger sequência</h2><p class="muted">Recupere ontem por 25 gemas, se você focou pelo menos 10 minutos no dia anterior. O dia congelado preserva a sequência, sem somar um dia de foco.</p><button class="btn" data-progress="freeze">Congelar ontem · 💎 25</button><h2 class="feature-card">Seu pet: ${pet.name}</h2><p>Evolução ${pet.level}/3 · ${S.totalMin} min juntos</p><p class="muted">Evolui com 5 e 20 horas de foco.</p></div><div class="card"><h2>Árvore de habilidades</h2><p class="muted">Invista em até três níveis de cada caminho. Os bônus valem para os próximos minutos registrados.</p>${[['xp', 'Sabedoria', '+10% XP por nível'], ['gems', 'Fortuna', '+1 gema a cada 10 min por nível']].map(([id, name, desc]) => `<div class="mission"><h3>${name} · ${p.skills[id]}/3</h3><p>${desc}</p><button class="btn" data-progress="skill" data-id="${id}" ${p.skills[id] >= 3 ? 'disabled' : ''}>${p.skills[id] >= 3 ? 'Máximo' : `Evoluir · 💎 ${50 * (p.skills[id] + 1)}`}</button></div>`).join('')}</div></div><div class="card feature-card"><h2>Mapa da jornada</h2>${G.CHECKPOINTS.map(([km, name], i) => `<details ${S.km >= km ? '' : 'class="locked"'}><summary>${S.km >= km ? '✦' : '🔒'} ${esc(name)} · ${km} km</summary><p>${S.km >= km ? P.stories[i] : `Faltam ${km1(km - S.km)} km para revelar este capítulo.`}</p></details>`).join('')}</div>`;
  };
  async function presence() { if (!TOKEN) return; try { await api('/rooms/presence', { method: 'POST', body: { focusing: T.running && T.mode === 'fase' } }); } catch { } }
  let polling = false;
  async function pollCoop() {
    if (polling) return; if (!TOKEN) { roomData = null; $('#room-summary').hidden = true; return; } polling = true;
    try {
      await presence(); const d = await api('/coop'); roomData = d.room; if (Number.isInteger(d.gems)) { S.gems = d.gems; $('#gems').textContent = '💎 ' + S.gems.toLocaleString('pt-BR'); } $('#room-summary').hidden = !roomData;
      if (roomData) $('#room-summary').textContent = `${roomData.name} · ${roomData.members.filter(m => m.online).length} heróis presentes · Chefão: ${Math.min(roomData.boss.minutes, 600)}/600 min`;
      if (location.hash === '#/cooperativo' && !$('#v-cooperativo :focus')) await renderCoop(d);
    } catch (e) { if (location.hash === '#/cooperativo') toast(e.message); } finally { polling = false; }
  }
  async function renderCoop(d) {
    const r = $('#v-cooperativo'); if (!TOKEN) { r.innerHTML = head('Foco cooperativo', 'A jornada fica melhor em grupo.') + needLogin('Entre para focar com amigos'); return; }
    d = d || await api('/coop'); roomData = d.room; if (Number.isInteger(d.gems)) { S.gems = d.gems; refresh(); }
    const draft = [...r.querySelectorAll('form input,form select')].map(el => ({ form: el.form.id, name: el.name, value: el.value }));
    const friends = (await api('/friends')).friends, room = d.room;
    r.innerHTML = head('Foco cooperativo', 'Salas para até 6 heróis · presença atualizada a cada 15 segundos.') + `<div class="grid3"><div class="card"><h2>${room ? esc(room.name) : 'Sua sala de foco'}</h2>${room ? `<p>Convide pelo código <b class="code">${room.code}</b></p><ul class="list">${room.members.map(m => `<li>${m.online ? '🟢' : '○'} ${esc(m.name)}${m.me ? ' (você)' : ''} · ${m.online ? (m.focusing ? 'focando' : 'em pausa') : 'ausente'}</li>`).join('')}</ul><p class="muted">Os heróis presentes aparecem juntos na aba Fase, no mundo da sala. Cada pessoa controla seu timer.</p><a href="#/" class="btn">Ir focar</a><button class="btn" data-coop="leave">Sair da sala</button>` : `<form id="create-room"><label>Nome da sala<input name="name" minlength="2" maxlength="40" required placeholder="Guilda dos estudos"></label><button class="btn primary">Criar sala</button></form><form id="join-room"><label>Código da sala<input name="code" maxlength="12" required></label><button class="btn">Entrar na sala</button></form>`}</div><div class="card"><h2>Chefão semanal</h2>${room ? `<div class="boss-art" aria-hidden="true">♜</div><h3>${room.boss.name}</h3><progress max="600" value="${Math.min(600, room.boss.minutes)}"></progress><p>${room.boss.minutes} / 600 minutos coletivos</p><b>${room.boss.minutes >= 600 ? 'Vitória da guilda!' : 'Cada minuto ajuda a derrotar o guardião.'}</b><p class="muted">Semana de ${dayLabel(room.boss.week)}. Reinicia segunda-feira às 00h UTC. Conta o foco iniciado nesta sala, registrado ao pausar ou encerrar.</p>` : '<p class="muted">Entre em uma sala para somar minutos com o grupo.</p>'}</div><div class="card"><h2>Desafiar um amigo</h2><p class="muted">As gemas ficam reservadas. Após aceitar, vocês têm 7 dias para focar. Maior foco leva o total; empate devolve as apostas. Convites expiram em 7 dias com devolução. Só contam sessões iniciadas após aceitar.</p>${friends.length ? `<form id="challenge-form"><label>Amigo<select name="friend">${friends.map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join('')}</select></label><label>Aposta em gemas<input name="stake" type="number" min="1" max="500" value="10" required></label><button class="btn primary">Enviar desafio</button></form>` : '<a href="#/amigos">Adicione amigos para desafiar.</a>'}</div></div><div class="card feature-card"><h2>Seus desafios</h2>${d.challenges.map(c => `<div class="mission"><b>${esc(c.senderName)} × ${esc(c.recipientName)}</b><p>${c.senderMin} × ${c.recipientMin} min · 💎 ${c.stake} por pessoa · ${({ pending: 'Aguardando aceite', active: 'Em andamento', declined: 'Recusado', finished: 'Encerrado' })[c.status]}</p><small>Prazo: ${new Date(c.ends).toLocaleString('pt-BR')}</small>${c.status === 'pending' && c.incoming ? `<div class="row"><button class="btn" data-challenge="${c.id}" data-accept="yes">Aceitar</button><button class="btn" data-challenge="${c.id}" data-accept="no">Recusar</button></div>` : ''}${c.status === 'finished' ? `<p>${c.winner ? `Vencedor: ${esc(c.winner === c.sender ? c.senderName : c.recipientName)}` : 'Gemas devolvidas (empate ou convite expirado).'}</p>` : ''}</div>`).join('') || '<p class="muted">Nenhum desafio ainda.</p>'}</div>`;
    for (const field of draft) { const el = document.getElementById(field.form)?.elements.namedItem(field.name); if (el) el.value = field.value; }
    for (const [id, path] of [['create-room', '/rooms'], ['join-room', '/rooms/join'], ['challenge-form', '/challenges']]) { const f = $('#' + id); if (f) f.onsubmit = async e => { e.preventDefault(); const b = $('button', f); b.disabled = true; try { await api(path, { method: 'POST', body: Object.fromEntries(new FormData(f)) }); await Store.load(); refresh(); await renderCoop(); await pollCoop(); } catch (x) { toast(x.message); } finally { b.disabled = false; } }; }
  }
  RENDER.cooperativo = async () => { try { await renderCoop(); } catch (e) { $('#v-cooperativo').innerHTML = head('Foco cooperativo', esc(e.message)); } };
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-progress],[data-coop],[data-challenge]'); if (!b) return; b.disabled = true;
    try {
      if (b.dataset.progress) { await Store.progress({ action: b.dataset.progress, id: b.dataset.id }); refresh(); await RENDER.aventura(); }
      else { if (b.dataset.coop === 'leave') { if (T.session) throw Error('Encerre a fase antes de sair da sala.'); await api('/rooms/membership', { method: 'DELETE' }); roomData = null; } else await api('/challenges/' + b.dataset.challenge + '/respond', { method: 'POST', body: { accept: b.dataset.accept === 'yes' } }); await Store.load(); refresh(); await renderCoop(); await pollCoop(); }
    } catch (x) { toast(x.message); } finally { b.disabled = false; }
  });
  $('#free-mode').onclick = () => { if (T.session) return toast('Encerre a fase antes de mudar de modo.'); freeMode = !freeMode; setMode('fase'); };
  $('#preset-52').onclick = async () => { if (T.session) return toast('Encerre a fase antes de mudar o preset.'); try { await Store.saveCfg({ ...S.cfg, fase: 52, respiro: 17 }); freeMode = false; setMode('fase'); } catch (e) { toast(e.message); } };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && T.running && T.mode === 'fase' && $('#strict-mode').checked) { hearts = Math.max(0, hearts - 1); $('#hearts').textContent = '♥'.repeat(hearts) + '♡'.repeat(3 - hearts); if (!hearts) { pauseT(); toast('Sem corações. Foco pausado; seus minutos foram preservados.'); } }
  });
  let eyeReminder = 0;
  setInterval(() => { if (T.running && T.mode === 'fase') { const n = Math.floor(focused() / 20); if (n > eyeReminder) { eyeReminder = n; toast('20-20-20: olhe a cerca de 6 metros por 20 segundos.'); } } else if (!T.session) eyeReminder = 0; }, 10000);
  const mixer = {};
  $$('#mixer input').forEach(input => input.oninput = () => {
    try {
      const c = ac(); c.resume(); const key = input.dataset.sound;
      if (!mixer[key]) {
        const src = c.createBufferSource(), buf = c.createBuffer(1, c.sampleRate * 3, c.sampleRate), data = buf.getChannelData(0); let brown = 0;
        for (let i = 0; i < data.length; i++) { const white = Math.random() * 2 - 1; brown = (brown + .02 * white) / 1.02; data[i] = key === 'fire' ? brown * 3 + (Math.random() < .001 ? white * .6 : 0) : white; }
        src.buffer = buf; src.loop = true; const filter = c.createBiquadFilter(); filter.type = key === 'rain' ? 'highpass' : 'lowpass'; filter.frequency.value = key === 'rain' ? 1200 : key === 'fire' ? 600 : 350;
        const gain = c.createGain(); gain.gain.value = 0; src.connect(filter); filter.connect(gain); gain.connect(c.destination); src.start(); mixer[key] = { src, gain };
      }
      mixer[key].gain.gain.setTargetAtTime(Number(input.value) / 100 * .18, c.currentTime, .1);
    } catch { toast('Áudio indisponível neste navegador.'); }
  });
  $('#share-card').onclick = () => {
    try {
      const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 800; const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
      const art = document.createElement('canvas'); art.width = 300; art.height = 140; Scene.render(art.getContext('2d'), 300, 140, { world: roomData?.world || S.world, skin: S.skin, t: tt, scroll, pose: 'idle', hour: new Date().getHours(), weather: $('#weather').value, petLevel: P.pet(S.totalMin).level, peers: roomData?.members.filter(m => !m.me && m.online) || [] });
      c.fillStyle = '#1a1c3a'; c.fillRect(0, 0, 1200, 800); c.drawImage(art, 0, 0, 1200, 560); c.fillStyle = '#ecebff'; c.font = 'bold 38px monospace'; c.fillText('gameDoro · minha jornada', 48, 622); c.font = '28px monospace'; c.fillText(`${S.totalMin} min de foco · nível ${G.level(S.xp)} · ${S.streak} dias`, 48, 684); c.fillText(`${P.pet(S.totalMin).name} · ${km1(S.km)} km percorridos`, 48, 740);
      const a = document.createElement('a'); a.download = 'gamedoro-conquista.png'; a.href = cv.toDataURL('image/png'); a.click(); toast('Cartão pronto para compartilhar.');
    } catch { toast('Não foi possível gerar o cartão neste navegador.'); }
  };

  /* ---------- Eventos ---------- */
  document.addEventListener('click', async e => {
    const t = e.target.closest('[data-buy],[data-eq],[data-rm],[data-login]'); if (!t) return;
    try {
      if (t.dataset.login !== undefined) return openAuth(false);
      if (t.dataset.buy) { const it = cat(t.dataset.buy); await Store.buy(t.dataset.buy); await Store.equip(it.kind, it.id); toast(it.name + ' desbloqueado e equipado!'); }
      if (t.dataset.eq) { const [k, i] = t.dataset.eq.split(':'); await Store.equip(k, i); }
      if (t.dataset.rm) { await api('/friends/' + t.dataset.rm, { method: 'DELETE' }); toast('Amigo removido.'); return RENDER.amigos(); }
      refresh(); const h = location.hash.replace(/^#\/?/, ''); if (RENDER[h]) RENDER[h]();
    } catch (x) { toast(x.message); }
  });
  let timerBusy = false;
  async function timerAction(fn) { if (timerBusy) return; timerBusy = true; $('#go').disabled = $('#stop').disabled = true; try { await fn(); } finally { timerBusy = false; $('#go').disabled = $('#stop').disabled = false; } }
  $('#go').onclick = () => timerAction(() => T.running ? pauseT() : startT());
  $('#stop').onclick = () => timerAction(() => T.mode === 'fase' ? stopT() : completeSkip());
  function completeSkip() { T.running = false; syncAmb(); setMode('fase'); if (S.cfg.auto) startT(); }
  async function setFocusLen(n) {
    if (!Number.isInteger(n) || n < 1 || n > 120) return toast('Use uma duração entre 1 e 120 minutos.');
    if (T.session) return toast('Encerre a fase atual para mudar a duração.');
    freeMode = false;
    try { await Store.saveCfg(Object.assign({}, S.cfg, { fase: n })); if (T.mode === 'fase') setMode('fase'); else refresh(); } catch (e) { toast(e.message); }
  }
  $$('#presets .opt[data-m]').forEach(b => b.onclick = () => setFocusLen(+b.dataset.m));
  $('#custom-ok').onclick = () => { setFocusLen(parseInt($('#custom').value, 10)); $('#custom').value = ''; };
  $('#custom').onkeydown = e => { if (e.key === 'Enter') $('#custom-ok').click(); };
  ['ambient', 'alert', 'notify'].forEach(k => $('#t-' + k).onclick = async () => {
    const on = !S.cfg[k]; try { await Store.saveCfg(Object.assign({}, S.cfg, { [k]: on })); } catch (e) { return toast(e.message); }
    if (k === 'notify' && on && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    if (k === 'alert' && on) beep(); syncAmb(); refresh();
  });
  $('#pip-btn').onclick = () => pipOpen();
  $('#pip-ck').onchange = e => { if (e.target.checked) pipOpen(); else if (pip) { pip.close(); pip = null; } };
  window.addEventListener('hashchange', route);
  window.addEventListener('resize', () => { if (main && !$('#v-timer').hidden) main.fit(); if (heroStage && !$('#v-heroi').hidden) heroStage.fit(); });
  window.addEventListener('beforeunload', e => { if (T.session && T.running) { e.preventDefault(); e.returnValue = ''; } });

  /* Conta */
  let reg = false;
  function setReg(v) {
    reg = v; $('#nm').hidden = !v; $('#nm-i').required = v; $('#auth-t').textContent = v ? 'Criar conta' : 'Entrar no gameDoro'; $('#af-ok').textContent = v ? 'Criar conta' : 'Entrar';
    $('#af-sw').textContent = v ? 'Já tenho conta' : 'Criar uma conta'; $('#pw').autocomplete = v ? 'new-password' : 'current-password'; $('#err').textContent = '';
  }
  function openAuth(r) { setReg(r); $('#dlg-auth').showModal(); }
  $('#btn-auth').onclick = () => {
    if (!USER) return openAuth(false);
    try { localStorage.removeItem('gamedoro:token'); } catch (e) { }
    roomData = null; TOKEN = null; USER = null; L = localLoad(); S = localView(); setMode('fase'); route(); toast('Você saiu da conta.');
  };
  $('#af-cancel').onclick = () => $('#dlg-auth').close();
  $('#af-sw').onclick = () => setReg(!reg);
  $('#af').onsubmit = async e => {
    e.preventDefault(); $('#err').textContent = '';
    try {
      const d = await api('/auth/' + (reg ? 'register' : 'login'), { method: 'POST', body: { name: $('#nm-i').value, email: $('#em').value, password: $('#pw').value, today: today() } });
      TOKEN = d.token; try { localStorage.setItem('gamedoro:token', TOKEN); } catch (x) { }
      take(d); $('#dlg-auth').close(); $('#pw').value = ''; setMode('fase'); route(); toast('Bem-vindo, ' + USER.name + '!');
    } catch (x) { $('#err').textContent = x.message; }
  };
  $('#btn-cfg').onclick = () => {
    ['respiro', 'descanso', 'ciclos'].forEach(k => { $('#c-' + k).value = S.cfg[k]; }); $('#t-auto').setAttribute('aria-checked', S.cfg.auto); $('#cfg-err').textContent = '';
    $('#acct').textContent = USER ? `Conectado como ${USER.name} (${USER.email}).` : 'Modo visitante: o progresso fica salvo só neste navegador. Entre para sincronizar.';
    $('#dlg-cfg').showModal();
  };
  $('#t-auto').onclick = e => e.currentTarget.setAttribute('aria-checked', e.currentTarget.getAttribute('aria-checked') !== 'true');
  $('#cf-cancel').onclick = () => $('#dlg-cfg').close();
  $('#cf').onsubmit = async e => {
    e.preventDefault();
    const c = G.clampCfg(Object.assign({}, S.cfg, { respiro: +$('#c-respiro').value, descanso: +$('#c-descanso').value, ciclos: +$('#c-ciclos').value, auto: $('#t-auto').getAttribute('aria-checked') === 'true' }));
    if (!c) { $('#cfg-err').textContent = 'Confira os valores: pausa curta 1–60, longa 1–90, ciclos 2–8.'; return; }
    try { await Store.saveCfg(c); $('#dlg-cfg').close(); if (!T.running && !T.session) setMode(T.mode); else refresh(); toast('Ajustes salvos.'); } catch (x) { $('#cfg-err').textContent = x.message; }
  };

  /* ---------- Início ---------- */
  let last = performance.now(), tt = 0, scroll = 0;
  function loop(now) {
    const dt = Math.min(.1, (now - last) / 1000); last = now; tt += dt;
    const walk = T.running && T.mode === 'fase'; if (walk) scroll += dt * 34;
    if (!$('#v-timer').hidden && main) main.draw({ world: roomData?.world || S.world, skin: S.skin, t: tt, scroll, pose: walk ? 'walk' : 'idle', hour: new Date().getHours(), weather: $('#weather').value, petLevel: P.pet(S.totalMin).level, peers: roomData?.members.filter(m => !m.me && m.online) || [] });
    if (!$('#v-heroi').hidden && heroStage) heroStage.draw({ world: S.world, skin: S.skin, t: tt, scroll: tt * 34, pose: 'walk', flag: false, petLevel: P.pet(S.totalMin).level });
    requestAnimationFrame(loop);
  }
  (async function boot() {
    drawLogo();
    try { await Store.load(); } catch (e) {
      if (e.status === 401) { TOKEN = null; try { localStorage.removeItem('gamedoro:token'); } catch (x) { } } else toast(e.message);
      S = localView();
    }
    main = new Stage($('#stage'), { cssH: cw => (cw > 700 ? 320 : 250), target: 230 });
    setMode('fase'); await route(); pollCoop(); setInterval(pollCoop, 15000); setInterval(tick, 250); requestAnimationFrame(loop);
  })();
})();
