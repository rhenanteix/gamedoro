/* gameDoro: motor de pixel art. Usa apenas fillStyle/fillRect, então roda em <canvas> e em rasterizador de teste. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Scene = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const INK = '#1f1a2e', LOOP = 720;
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  const rng = s => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const mod = (a, n) => ((a % n) + n) % n;

  /* ---------- Buffer de pixels ---------- */
  function Buf(w, h, wrap) {
    const p = new Array(w * h).fill(null);
    const o = {
      w, h, p,
      set(x, y, c) { x = Math.floor(x); y = Math.floor(y); if (wrap) x = mod(x, w); if (x < 0 || y < 0 || x >= w || y >= h) return; p[y * w + x] = c; },
      get(x, y) { x = Math.floor(x); y = Math.floor(y); if (wrap) x = mod(x, w); return (x < 0 || y < 0 || x >= w || y >= h) ? null : p[y * w + x]; },
      rect(x, y, rw, rh, c) { for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) o.set(x + i, y + j, c); },
      disc(cx, cy, rx, ry, c, hi, lo) {
        for (let y = -ry; y <= ry; y++) {
          const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y * y) / ((ry + .5) * (ry + .5)))) + .5);
          for (let x = -half; x <= half; x++) { const d = x / (rx + .5) + y / (ry + .5); o.set(cx + x, cy + y, hi && d < -.6 ? hi : lo && d > .55 ? lo : c); }
        }
      },
      grid(rows, pal, ox, oy) { rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const c = pal[r[i]]; if (c) o.set(ox + i, oy + j, c); } }); },
      outline(c) {
        const q = p.slice();
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (p[y * w + x]) continue; if (o.get(x + 1, y) || o.get(x - 1, y) || o.get(x, y + 1) || o.get(x, y - 1)) q[y * w + x] = c; }
        for (let i = 0; i < q.length; i++) p[i] = q[i];
      },
      compile(tr) {
        const cache = {}, T = c => tr ? (cache[c] || (cache[c] = tr(c))) : c, runs = [];
        for (let y = 0; y < h; y++) { let x = 0; while (x < w) { const c = p[y * w + x]; if (!c) { x++; continue; } let e = x + 1; while (e < w && p[y * w + e] === c) e++; runs.push({ x, y, w: e - x, h: 1, c: T(c) }); x = e; } }
        const open = new Map(), out = [];
        for (const r of runs) { const k = r.x + ',' + r.w + ',' + r.c, prev = open.get(k); if (prev && prev.y + prev.h === r.y) prev.h++; else { open.set(k, r); out.push(r); } }
        return { runs: out, w, h };
      }
    };
    return o;
  }
  const blit = (R, spr, x, y, flip) => { for (const r of spr.runs) R(r.c, flip ? x + spr.w - r.x - r.w : x + r.x, y + r.y, r.w, r.h); };

  /* ---------- Herói (16x16 + pernas desenhadas por código) ---------- */
  const HERO = [
    '.....KKKKKKK....',
    '....KccccccccK..',
    '...KcccccccccdK.',
    '...KcchccccccdKK',
    '...KaaaaaaaaadKK',
    '...KddddddddddK.',
    '...KsssssssssSK.',
    '...KsssssssesSK.',
    '...KsssssssesSK.',
    '...KssssrrsssSK.',
    '....KSSSSSSSSK..',
    '...KwwwwwwwwwwK.',
    'KBbbbKxwwtttttuK',
    'KBbbbKtttvttttuK',
    '.KBbbKttttttttuK',
    '.KBBbKggygggggggK'.replace('ggggggggK', 'gggggggK')
  ];
  const SCARF = [['wwwx.', '.xwwx'], ['.wwwx', 'wwx..']];
  const OUTFITS = {
    aventureiro: { c: '#d9482b', d: '#a8321d', a: '#ffd166', t: '#3f7fbf', u: '#2e5f94', v: '#6aa5db', w: '#f2b134', x: '#c98a14', p: '#8b7352', P: '#665238' },
    ninja: { c: '#33407a', d: '#222b57', a: '#9aa6ff', t: '#3a4375', u: '#272f58', v: '#5a66a8', w: '#e0457b', x: '#a82f5a', p: '#2f3766', P: '#212848' },
    robo: { c: '#a3afbf', d: '#76828f', a: '#37e0d0', t: '#b8c2cf', u: '#8793a3', v: '#e0e7ee', w: '#37e0d0', x: '#1fa89b', p: '#6c7888', P: '#4f5967' },
    dourado: { c: '#f2b200', d: '#b98300', a: '#fff0a8', t: '#e8a900', u: '#b17f00', v: '#ffd54a', w: '#d9482b', x: '#a8321d', p: '#7d5a1c', P: '#5c4012' }
  };
  const BASE = { K: INK, s: '#f3c9a0', S: '#d49c74', e: INK, r: '#ee9a86', b: '#8a5a35', B: '#5f3b22', g: '#4b2f1f', y: '#ffd166' };
  const heroCache = {};
  function heroSprites(skin) {
    if (heroCache[skin]) return heroCache[skin];
    const pal = Object.assign({}, BASE, OUTFITS[skin] || OUTFITS.aventureiro);
    const body = Buf(16, 16); body.grid(HERO, pal, 0, 0);
    const scarf = SCARF.map(f => { const b = Buf(5, 2); b.grid(f, pal, 0, 0); return b.compile(); });
    return heroCache[skin] = { body: body.compile(), scarf, pal };
  }
  function drawHero(R, x, fy, o) {
    const S = heroSprites(o.skin), walk = o.pose === 'walk', f = walk ? Math.floor(o.t * 8) % 4 : 0;
    const bob = walk ? [0, -1, 0, -1][f] : (Math.floor(o.t * 1.5) % 2 ? 1 : 0);
    const by = fy - 5 - 16 + bob + (walk ? 0 : 0);
    // pernas
    const leg = (lx, h, lift) => { const top = fy - h - lift; R(INK, lx - 1, top - 1, 5, h + 2); R(S.pal.p, lx, top, 2, h - 2); R(S.pal.P, lx + 2, top, 1, h - 2); R('#5a3a24', lx, top + h - 2, 3, 2); R('#7a5236', lx, top + h - 2, 3, 1); };
    const sw = walk ? [[-2, 2], [0, 0], [2, -2], [0, 0]][f] : [0, 0], lf = walk ? [[0, 0], [1, 0], [0, 0], [0, 1]][f] : [0, 0];
    leg(x + 6 + sw[0], 5, lf[0]);
    leg(x + 10 + sw[1], 5, lf[1]);
    blit(R, S.scarf[Math.floor(o.t * (walk ? 6 : 2)) % 2], x - 3, by + 11, false);
    blit(R, S.body, x, by, false);
    // braço
    const ax = x + 8 + (walk ? [1, 0, -1, 0][f] : 0);
    R(S.pal.u, ax, by + 12, 3, 4); R(S.pal.v, ax, by + 12, 1, 3); R(INK, ax - 1, by + 12, 1, 4); R(INK, ax + 3, by + 12, 1, 4); R(S.pal.s, ax, by + 16, 3, 1); R(INK, ax, by + 17, 3, 1);
    // piscar
    if (Math.floor(o.t * 10) % 34 === 0) R(S.pal.s, x + 11, by + 7, 1, 2);
  }

  /* ---------- Slime ---------- */
  const SL = [[
    '...KKKKKK...', '..KmmmmmmK..', '.KmLLmmmmmK.', 'KmLmmmmmmmmK', 'KmmmeemmeemK', 'KmmmeemmeemK', 'KMmmmmmmmmMK', '.KMMMMMMMMK.', '..KKKKKKKK..'
  ], [
    '....KKKKKK....', '..KKmmmmmmKK..', '.KmLLmmmmmmmK.', 'KmLmmeemmeemmK', 'KmmmmeemmeemmK', 'KMmmmmmmmmmmMK', '.KMMMMMMMMMMK.', '..KKKKKKKKKK..'
  ]];
  const slimePal = { K: '#16403a', m: '#5fe0a8', M: '#2fa07a', L: '#d9fff0', e: '#12302a' };
  const slimeSpr = SL.map(r => { const b = Buf(14, 9); b.grid(r, slimePal, Math.floor((14 - r[0].length) / 2), 9 - r.length); return b.compile(); });

  /* ---------- Props procedurais ---------- */
  function oak() {
    const b = Buf(30, 30), L = '#86d874', M = '#52b058', D = '#357f43';
    b.rect(13, 20, 4, 9, '#7a4b27'); b.rect(15, 20, 2, 9, '#5a3419'); b.rect(11, 28, 8, 1, '#5a3419');
    b.disc(15, 12, 11, 9, M, L, D); b.disc(8, 15, 7, 6, M, L, D); b.disc(22, 15, 7, 6, M, L, D); b.disc(15, 7, 8, 6, M, L, D);
    [[10, 9], [18, 11], [14, 16], [22, 17], [7, 17]].forEach(([x, y]) => { b.set(x, y, L); b.set(x + 1, y, L); b.set(x, y + 1, D); });
    b.outline('#1d4a2d'); return b.compile();
  }
  function pine(h) {
    const b = Buf(21, h + 3), G = '#2f9158', L = '#54bc74', D = '#1f6b44', tiers = 3, th = Math.floor((h - 5) / tiers) + 3;
    b.rect(9, h - 5, 3, 6, '#6b4423'); b.rect(11, h - 5, 1, 6, '#4a2e17');
    for (let t = 0; t < tiers; t++) {
      const top = 1 + t * (th - 3), hw = 4 + t * 2;
      for (let r = 0; r < th; r++) { const half = Math.floor(1 + (r / (th - 1)) * hw); for (let x = -half; x <= half; x++) b.set(10 + x, top + r, x > half * .3 ? D : x < -half * .45 ? L : G); }
    }
    b.outline('#16422b'); return b.compile();
  }
  function cactus() {
    const b = Buf(26, 38), M = '#52a35e', L = '#86d68c', D = '#2f704a';
    const col = (x, y, w, h) => { b.rect(x, y, w, h, M); b.rect(x, y, 1, h, L); b.rect(x + w - 1, y, 1, h, D); };
    col(10, 3, 6, 33); b.set(10, 3, null); b.set(15, 3, null);
    col(3, 20, 8, 4); col(2, 10, 4, 14); b.set(2, 10, null); b.set(5, 10, null);
    col(15, 15, 8, 4); col(20, 6, 4, 13); b.set(20, 6, null); b.set(23, 6, null);
    [[12, 8], [13, 16], [12, 24], [3, 14], [21, 10], [13, 31]].forEach(([x, y]) => b.set(x, y, '#e8f7cf'));
    b.rect(13, 3, 1, 1, '#f08aa5'); b.outline('#1f4a33'); return b.compile();
  }
  function rock(w, h, c, hi, lo, ol) { const b = Buf(w + 2, h + 2); b.disc(Math.floor(w / 2) + 1, h, Math.floor(w / 2), h - 1, c, hi, lo); for (let x = 0; x < w + 2; x++) b.set(x, h + 1, null); b.outline(ol); return b.compile(); }
  function palm() {
    const b = Buf(46, 44), T = '#b07a42', TD = '#7e5128', G = '#3fa85d', GL = '#7ad592', GD = '#277a48';
    for (let i = 0; i < 25; i++) { const y = 41 - i, x = 18 + Math.round(Math.sin(i / 25 * 1.3) * 6); b.rect(x, y, 4, 1, i % 4 === 0 ? TD : T); b.set(x + 3, y, TD); }
    const tx = 18 + Math.round(Math.sin(1.3) * 6) + 2, ty = 15;
    [[-1, 7, 14], [-1, 12, 6], [-.5, 15, -2], [.5, 15, -2], [1, 12, 6], [1, 7, 14]].forEach(([sx, lift, droop]) => {
      for (let t = 0; t <= 1.001; t += .04) { const x = tx + sx * t * 20, y = ty - Math.sin(t * Math.PI) * lift * .75 + t * t * droop; b.rect(x - 1, y, 3, 2, G); b.set(x - 1, y, GL); b.set(x, y - 1, GL); b.set(x + 1, y + 2, GD); }
    });
    b.disc(tx - 1, ty + 4, 2, 2, '#6b4423', '#8a5a35'); b.disc(tx + 3, ty + 4, 2, 2, '#6b4423', '#8a5a35');
    b.outline('#1d4a33'); return b.compile();
  }
  function bush() { const b = Buf(18, 12); b.disc(5, 8, 5, 4, '#4faa56', '#86d874', '#357f43'); b.disc(12, 7, 6, 5, '#4faa56', '#86d874', '#357f43'); b.set(8, 5, '#ee6a7a'); b.set(13, 8, '#ffd166'); b.set(4, 6, '#ffd166'); b.outline('#1d4a2d'); return b.compile(); }
  function deadBush() { const b = Buf(14, 10);[[7, 9, 7, 3], [7, 7, 3, 2], [7, 7, 11, 3], [7, 5, 5, 1], [7, 5, 9, 1]].forEach(([x0, y0, x1, y1]) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let i = 0; i <= n; i++) b.set(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, '#8a6238'); }); b.outline('#4a3320'); return b.compile(); }
  const flower = (c, h) => { const b = Buf(5, 8); b.rect(2, 4, 1, 4, '#3f8f48'); b.set(1, 6, '#3f8f48'); b.set(3, 5, '#3f8f48'); b.rect(1, 1, 3, 3, c); b.set(2, 2, h || '#fff2b0'); b.set(2, 0, c); b.set(2, 4, c); return b.compile(); };
  const tuft = (a, b2) => { const b = Buf(7, 4);[[0, 3], [1, 2], [2, 1], [3, 0], [3, 2], [4, 1], [5, 2], [6, 3]].forEach(([x, y]) => { for (let j = y; j < 4; j++) b.set(x, j, j === y ? a : b2); }); return b.compile(); };
  const shell = () => { const b = Buf(7, 5); b.rect(1, 1, 5, 3, '#f7c9d0'); b.set(0, 2, '#f7c9d0'); b.rect(2, 0, 3, 1, '#f7c9d0'); b.set(3, 2, '#e79aa6'); b.set(2, 3, '#e79aa6'); b.set(4, 3, '#e79aa6'); b.outline('#b0707c'); return b.compile(); };
  const pebbles = c => { const b = Buf(9, 4); b.rect(0, 1, 3, 2, c[0]); b.rect(4, 0, 4, 3, c[1]); b.set(1, 1, c[2]); b.set(5, 0, c[2]); b.outline(c[3]); return b.compile(); };
  const shroom = () => { const b = Buf(7, 7); b.rect(3, 4, 2, 3, '#f1e5c8'); b.disc(3, 3, 3, 2, '#d9483b', '#f27a6a'); b.set(2, 2, '#fff'); b.set(4, 3, '#fff'); b.outline('#4a2230'); return b.compile(); };

  /* ---------- Camadas de fundo (periódicas em LOOP) ---------- */
  function hills(base, a1, a2, c, dk, ph, trees) {
    const H = 64, b = Buf(LOOP, H, true), f = x => base + a1 * Math.sin(2 * Math.PI * 3 * x / LOOP + ph) + a2 * Math.sin(2 * Math.PI * 8 * x / LOOP + ph * 2);
    for (let x = 0; x < LOOP; x++) { const h = Math.round(f(x)), desc = f(x + 2) < f(x); for (let y = H - h; y < H; y++) b.set(x, y, desc && y < H - h + 4 ? dk : c); }
    if (trees) { const r = rng(7); for (let i = 0; i < 60; i++) { const x = Math.floor(r() * LOOP), h = Math.round(f(x)); b.disc(x, H - h - 1, 3, 3, trees[0], trees[1]); } }
    return b;
  }
  function dunes(c1, d1, c2, d2) {
    const H = 56, b = Buf(LOOP, H, true), f = (x, k, ph) => 18 + 9 * Math.sin(2 * Math.PI * k * x / LOOP + ph);
    for (let x = 0; x < LOOP; x++) { const h = Math.round(f(x, 4, 1) + 6 * Math.sin(2 * Math.PI * 9 * x / LOOP)); for (let y = H - h; y < H; y++) b.set(x, y, f(x + 2, 4, 1) < f(x, 4, 1) ? d1 : c1); }
    for (let x = 0; x < LOOP; x++) { const h = Math.round(f(x, 6, 3) * .55); for (let y = H - h; y < H; y++) b.set(x, y, (f(x + 2, 6, 3) < f(x, 6, 3)) ? d2 : c2); }
    return b;
  }
  function peaks(list, base, light, dark, snow, snowDk) {
    const H = 72, b = Buf(LOOP, H, true);
    list.forEach(([cx, h, w]) => {
      for (let y = 0; y < h; y++) {
        const half = Math.floor((y / h) * w / 2 + (y > h * .45 ? Math.sin(y * 1.9 + cx) * 1.3 : 0)), cap = Math.floor(h * .34);
        for (let x = -half; x <= half; x++) {
          const edge = cap + ((x + cx) % 7 < 3 ? 0 : 2) + (Math.abs(x) % 5 === 0 ? 1 : 0);
          const dk = x > half * .1 + Math.sin(y * .7) * 1.2;
          b.set(cx + x, H - h + y, y < edge ? (dk ? snowDk : snow) : (dk ? dark : x < -half * .55 ? light : base));
        }
      }
    });
    return b;
  }
  function cloud() { const b = Buf(34, 14); b.disc(9, 9, 7, 4, '#fff'); b.disc(18, 7, 9, 6, '#fff'); b.disc(26, 9, 7, 4, '#fff'); for (let x = 0; x < 34; x++) for (let y = 10; y < 14; y++) if (b.get(x, y) === '#fff') b.set(x, y, '#dfeaf6'); return b; }

  /* ---------- Temas ---------- */
  const THEMES = {
    floresta: {
      name: 'Floresta', sky: ['#78c2ec', '#94d0f0', '#b0dcf3', '#cde9f6', '#e6f5f6'], sun: '#fff3a8', fog: '#d6edf0', cloud: ['#ffffff', '#dfeaf6'],
      ground: { line: '#2f6f3a', top: '#6dc05c', topDk: '#58a94e', topLt: '#8ad675', path: '#d8b87c', pathDk: '#c29e64', low: '#4f9b47', lowDk: '#3f8a3d', speck: ['#7ed06c', '#3f8a3d', '#e8d27a'] },
      far: () => [hills(26, 7, 3, '#8fd0a4', '#7bbf93', 1), hills(14, 6, 3, '#74bb8a', '#62a87a', 4, ['#5fa878', '#78bd8c'])],
      back: () => [oak(), pine(34), pine(28), oak()], front: () => [pine(40), oak(), bush(), pine(32)],
      deco: () => [flower('#f06a8a'), flower('#ffd166'), flower('#b58cf0'), flower('#ffffff'), tuft('#58a94e', '#3f8a3d'), shroom()]
    },
    dunas: {
      name: 'Dunas', sky: ['#eaa974', '#f0ba85', '#f5cc98', '#f8dcb0', '#fbebcb'], sun: '#fff1b8', fog: '#f3dcae', cloud: ['#fff3e0', '#f2d9b5'],
      ground: { line: '#9c6f33', top: '#e2ba68', topDk: '#d3a65a', topLt: '#efd08a', path: '#c99f62', pathDk: '#b58a4e', low: '#d9ae5e', lowDk: '#c99c50', speck: ['#efd08a', '#b58a4e', '#f0a0a0'] },
      far: () => [dunes('#e8be7e', '#d8a867', '#dcae68', '#cb9a58')],
      back: () => [cactus(), rock(16, 9, '#c9a578', '#e0c294', '#a8845a', '#6a4a2a'), cactus()], front: () => [cactus(), deadBush(), rock(22, 12, '#b79670', '#d4b88c', '#957352', '#5a3f26')],
      deco: () => [tuft('#c9a050', '#a88338'), flower('#ee6f8a', '#ffe08a'), pebbles(['#b79670', '#cfb088', '#e0c8a0', '#6a4a2a']), tuft('#d4a85a', '#b58a4e'), flower('#ffd166', '#fff')]
    },
    montanha: {
      name: 'Montanha', sky: ['#6e9fd8', '#88b3e2', '#a5c7ec', '#c3dcf3', '#e0edf9'], sun: '#fff7d6', fog: '#cddcee', cloud: ['#ffffff', '#d7e4f4'],
      ground: { line: '#3f5a3e', top: '#86aa68', topDk: '#6f9358', topLt: '#a3c680', path: '#bdb2a0', pathDk: '#a39886', low: '#6d8f57', lowDk: '#5a7d48', speck: ['#a3c680', '#5a7d48', '#9fc4f0'] },
      far: () => [peaks([[110, 52, 120], [300, 62, 140], [500, 46, 110], [640, 58, 130]], '#8fa4c4', '#a9bcd8', '#6f84a8', '#ffffff', '#cfdcf0'), peaks([[40, 30, 90], [200, 36, 100], [400, 32, 96], [580, 38, 104]], '#6f8bb0', '#869fc2', '#566f96', '#f4f8ff', '#b9cae4')],
      back: () => [pine(36), pine(30), pine(40)], front: () => [pine(42), rock(24, 13, '#9a9aa6', '#bcbcc8', '#74747f', '#3a3a46'), pine(34), bush()],
      deco: () => [flower('#7aa8ff', '#fff'), flower('#ffffff', '#ffd166'), tuft('#6f9358', '#5a7d48'), pebbles(['#9a9aa6', '#bcbcc8', '#d8d8e0', '#3a3a46']), flower('#f2a0c0')]
    },
    costa: {
      name: 'Costa', sky: ['#74c8e8', '#90d8ee', '#aee4f2', '#d0f0f4', '#f0fbf6'], sun: '#fff6b8', fog: '#e2f5f3', cloud: ['#ffffff', '#ddeef4'],
      ground: { line: '#bf9a62', top: '#f3e0ac', topDk: '#e7cd93', topLt: '#fbeec6', path: '#e3c88e', pathDk: '#d2b377', low: '#edd69c', lowDk: '#e0c585', speck: ['#fbeec6', '#d2b377', '#f7c9d0'] },
      far: () => [],
      back: () => [palm(), rock(14, 8, '#b9b0a6', '#d6cec4', '#8f877d', '#4e4840')], front: () => [palm(), rock(20, 11, '#aaa196', '#cfc7bc', '#82796e', '#453f38'), palm()],
      deco: () => [shell(), tuft('#6fb35c', '#4f9a47'), pebbles(['#c9bfae', '#e2d9c8', '#f5eddc', '#6a5f50']), shell(), flower('#ff8fa8', '#ffe08a')]
    }
  };
  const cacheKey = {};
  function prep(id) {
    if (cacheKey[id]) return cacheKey[id];
    const T = THEMES[id], r = rng([...id].reduce((a, c) => a + c.charCodeAt(0), 0) * 977 + 13), tint = k => c => mix(c, T.fog, k);
    const place = (n, sprites, tr, jit) => Array.from({ length: n }, (_, i) => { const spr = sprites[i % sprites.length]; return { spr, x: Math.floor((i + .2 + r() * jit) * LOOP / n), flip: r() > .5 }; });
    const bandsFar = T.far().map((b, i, a) => ({ spr: b.compile(i < a.length - 1 ? tint(.32) : tint(.14)), k: .1 + i * .08 }));
    const backRaw = T.back(), frontRaw = T.front(), decoRaw = T.deco();
    return cacheKey[id] = {
      far: bandsFar,
      back: place(9, backRaw, false, .6),
      front: place(5, frontRaw, false, .8), deco: place(26, decoRaw, false, 1.2),
      clouds: [0, 1, 2].map(i => { const b = cloud(); return b.compile(c => c === '#fff' ? T.cloud[0] : T.cloud[1]); }),
      specks: Array.from({ length: 60 }, () => ({ x: Math.floor(r() * LOOP), y: Math.floor(r() * 100), c: Math.floor(r() * 3) }))
    };
  }
  /* Props de fundo ganham névoa atmosférica */
  function fogged(id, p) { const k = id + ':' + p.spr.w + ':' + p.spr.h; return fogCache[k] || (fogCache[k] = { runs: p.spr.runs.map(r => Object.assign({}, r, { c: mix(r.c, THEMES[id].fog, .3) })), w: p.spr.w, h: p.spr.h }); }
  const fogCache = {};

  /* ---------- Render ---------- */
  function render(ctx, W, H, o) {
    const T = THEMES[o.world] || THEMES.floresta, P = prep(o.world in THEMES ? o.world : 'floresta'), G = T.ground, t = o.t || 0, sc = o.scroll || 0;
    const R = (c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(Math.floor(x), Math.floor(y), Math.round(w), Math.round(h)); };
    const gy = Math.round(H * .64), fy = gy + 9, walk = o.pose === 'walk';
    // céu em faixas com transição pontilhada
    const bands = T.sky.length, bh = Math.ceil(gy / bands);
    for (let i = 0; i < bands; i++) { R(T.sky[i], 0, i * bh, W, bh + 1); if (i > 0) for (let x = 0; x < W; x += 2) { R(T.sky[i], x, i * bh - 1, 1, 1); R(T.sky[i - 1], x + 1, i * bh, 1, 1); } }
    // sol
    const sx = Math.round(W * .8), sy = Math.round(gy * .34), sr = o.world === 'dunas' ? 9 : 7;
    for (let y = -sr - 5; y <= sr + 5; y++) { const hw = Math.floor(Math.sqrt(Math.max(0, (sr + 5) * (sr + 5) - y * y))); R('rgba(255,255,255,.16)', sx - hw, sy + y, hw * 2 + 1, 1); }
    for (let y = -sr; y <= sr; y++) { const hw = Math.floor(Math.sqrt(sr * sr - y * y) + .5); R(T.sun, sx - hw, sy + y, hw * 2 + 1, 1); }
    // nuvens
    [[40, .18, 1], [150, .3, .8], [270, .12, 1.2]].forEach(([cx, fyy, sp], i) => { const spr = P.clouds[i]; blit(R, spr, mod(cx - t * 2.2 * sp - sc * .05, W + 80) - 40, Math.round(gy * fyy) + 4, false); });
    // camadas distantes
    P.far.forEach(l => { const off = mod(sc * l.k, LOOP); for (const sx0 of [-off, LOOP - off]) if (sx0 < W && sx0 + LOOP > 0) blit(R, l.spr, sx0, gy - l.spr.h + 3, false); });
    if (o.world === 'costa') {
      R('#4aa9cc', 0, gy - 15, W, 16); R('#62bcd6', 0, gy - 15, W, 5); R('#e9f8f8', 0, gy - 15, W, 1);
      for (let i = 0; i < 18; i++) { const x = mod(i * 41 - t * 6 - sc * .15, W + 30) - 10, y = gy - 13 + (i * 7) % 12; R('#bfe9f2', x, y, 6, 1); R('#ffffff', x + 1, y, 2, 1); }
      R('#7a8fa0', mod(W * .55 - sc * .06, W + 80) - 20, gy - 21, 30, 6); R('#8aa0b2', mod(W * .55 - sc * .06, W + 80) - 14, gy - 25, 16, 4);
      R('rgba(255,246,184,.45)', sx - 3, gy - 14, 7, 1); R('rgba(255,246,184,.35)', sx - 6, gy - 11, 13, 1);
    }
    // props de fundo
    const drawLayer = (arr, k, base, fog) => arr.forEach(p => { const spr = fog ? fogged(o.world, p) : p.spr, x = mod(p.x - sc * k, LOOP) - 60; if (x < W + 10) blit(R, spr, x, base - spr.h, false); });
    drawLayer(P.back, .55, gy + 1, true);
    // chão
    R(G.line, 0, gy, W, 1); R(G.top, 0, gy + 1, W, 9); R(G.topDk, 0, gy + 8, W, 2);
    for (let x = -mod(sc, 9); x < W; x += 9) { R(G.topLt, x, gy + 1, 3, 1); R(G.topDk, x + 4, gy + 4, 2, 1); }
    R(G.path, 0, gy + 10, W, 6); R(G.pathDk, 0, gy + 15, W, 1);
    for (let x = -mod(sc, 16); x < W; x += 16) { R(G.pathDk, x, gy + 12, 5, 1); R(G.pathDk, x + 8, gy + 14, 3, 1); R(G.topLt, x + 2, gy + 10, 3, 1); }
    R(G.low, 0, gy + 16, W, H - gy - 16);
    P.specks.forEach(s => { const x = mod(s.x - sc, LOOP) - 20, y = gy + 17 + s.y % Math.max(1, H - gy - 19); if (x < W) R(G.speck[s.c], x, y, 2, 1); });
    for (let x = -mod(sc * .9, 23); x < W; x += 23) R(G.lowDk, x, gy + 20 + (x % 5), 4, 1);
    // props da frente
    P.front.forEach(p => { const x = mod(p.x - sc, LOOP) - 60; if (x < W + 10 && !(o.flag !== false && x + p.spr.w > W - 62 && x < W - 18)) blit(R, p.spr, x, gy + 4 - p.spr.h + 4, p.flip); });
    P.deco.forEach(p => { const x = mod(p.x - sc, LOOP) - 40; if (x < W + 10) blit(R, p.spr, x, fy + 3 - p.spr.h + (p.x % 3) * 3, false); });
    // bandeira
    if (o.flag !== false) {
      const fx = W - 40;
      R(INK, fx - 1, gy - 30, 4, 40); R('#7a5230', fx, gy - 29, 2, 38); R('#a47444', fx, gy - 29, 1, 38); R('#8d8d98', fx - 4, gy + 6, 10, 4); R(INK, fx - 5, gy + 5, 12, 1); R(INK, fx - 5, gy + 10, 12, 1);
      for (let i = 0; i < 15; i++) { const w = Math.round(Math.sin(t * 5 + i * .55) * 1.3), hh = 11 - Math.floor(i * .5); R(INK, fx + 2 + i, gy - 29 + w - 1, 1, hh + 2); R(i > 9 ? '#a8321d' : '#e0503d', fx + 2 + i, gy - 29 + w, 1, hh); R('#ff8a70', fx + 2 + i, gy - 29 + w, 1, 2); }
      R('#ffd166', fx - 1, gy - 32, 4, 3); R(INK, fx - 2, gy - 33, 6, 1);
    }
    // herói e mascote
    const hx = Math.floor(W * .34);
    R('rgba(0,0,0,.2)', hx + 1, fy, 14, 1); R('rgba(0,0,0,.14)', hx + 3, fy + 1, 10, 1);
    if (o.companion !== false) {
      const ph = walk ? Math.abs(Math.sin(t * 6)) : 0, jump = Math.round(ph * 5), squash = walk ? (ph < .3 ? 1 : 0) : (Math.floor(t * 1.3) % 2), spr = slimeSpr[squash];
      R('rgba(0,0,0,.18)', hx - 26, fy, 12, 1);
      blit(R, spr, hx - 27, fy - spr.h - jump + 1, false);
    }
    if (walk) for (let i = 0; i < 5; i++) { const ph = mod(t * 3 + i / 5, 1); R('rgba(255,255,255,' + (.55 * (1 - ph)).toFixed(2) + ')', hx + 3 - ph * 12, fy - 2 - ph * 5, ph < .5 ? 2 : 1, ph < .5 ? 2 : 1); }
    drawHero(R, hx, fy - 1, { skin: o.skin, pose: o.pose, t });
    // Companheiros da sala, sem substituir o herói local.
    (o.peers || []).slice(0, 5).forEach((peer, i) => {
      const px = Math.floor(W * .48 + i * Math.min(20, W * .075));
      drawHero(R, px, fy + 3 + (i % 2) * 5, { skin: peer.skin, pose: peer.focusing ? 'walk' : 'idle', t: t + i * .2 });
    });
    if (o.petLevel >= 2) { R('#ffd166', hx - 24, fy - 15, 7, 2); R('#ffd166', hx - 24, fy - 18, 2, 3); R('#ffd166', hx - 19, fy - 18, 2, 3); }
    if (o.petLevel >= 3) { for (let i = 0; i < 5; i++)R('#fff2ac', hx - 31 + i * 4, fy - 22 + Math.round(Math.sin(t * 2 + i) * 3), 1, 1); }
    if (typeof o.hour === 'number') {
      const night = o.hour < 6 || o.hour >= 19, dusk = o.hour >= 17 && o.hour < 19;
      if (night) { R('rgba(17,24,69,.48)', 0, 0, W, H); for (let i = 0; i < 24; i++)R('#dfebff', (i * 47 + 13) % W, (i * 17 + 7) % Math.max(1, gy - 12), 1, 1); R('#f6e8be', sx - 3, sy - 3, 7, 7); R('#303e69', sx, sy - 4, 5, 6); }
      else if (dusk) R('rgba(244,127,78,.18)', 0, 0, W, H);
    }
    if (o.weather === 'rain' || o.weather === 'snow') for (let i = 0; i < 70; i++) {
      const snow = o.weather === 'snow', x = mod(i * 43 + t * (snow ? 4 : 30), W), y = mod(i * 31 + t * (snow ? 12 : 90), H);
      R(snow ? 'rgba(255,255,255,.8)' : 'rgba(154,200,255,.65)', x, y, 1, snow ? 1 : 4);
    }
    return { heroX: hx, flagX: W - 40, gy };
  }

  return { render, THEMES, LOOP, INK, OUTFITS };
});
