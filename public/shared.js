/* Regras e catálogos compartilhados entre servidor e navegador */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Shared = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const SKINS = [
    { id: 'aventureiro', name: 'Aventureiro', price: 0, desc: 'Boné vermelho e jaqueta azul.' },
    { id: 'ninja', name: 'Sombra', price: 60, desc: 'Discreto, rápido e com cachecol rosa.' },
    { id: 'robo', name: 'Autômato', price: 120, desc: 'Armadura de aço com brilho ciano.' },
    { id: 'dourado', name: 'Soberano', price: 200, desc: 'Para quem nunca perde uma fase.' }
  ];
  const WORLDS = [
    { id: 'floresta', name: 'Floresta', price: 0, desc: 'Carvalhos, pinheiros e flores.' },
    { id: 'dunas', name: 'Dunas', price: 80, desc: 'Cactos e areia sob o sol forte.' },
    { id: 'montanha', name: 'Montanha', price: 150, desc: 'Picos nevados e ar fresco.' },
    { id: 'costa', name: 'Costa', price: 150, desc: 'Palmeiras, ondas e brisa do mar.' }
  ];
  const CHECKPOINTS = [[10, 'Ponte do Musgo'], [25, 'Vila das Lanternas'], [50, 'Torre do Vento'], [100, 'Portão do Alvorecer'], [200, 'Cidade Flutuante'], [400, 'Cume Estrelado'], [800, 'Fim do Mapa']];
  const LIMITS = { fase: [1, 120], respiro: [1, 60], descanso: [1, 90], ciclos: [2, 8] };
  const DEFAULT_CFG = { fase: 25, respiro: 5, descanso: 15, ciclos: 4, auto: true, ambient: false, alert: true, notify: false };
  const WELCOME_GEMS = 50, KM_PER_MIN = 0.2, STREAK_MIN = 10;

  /* 1 gema a cada 2 min focados + 5 de bônus ao completar a fase */
  const gemsFor = (min, done) => Math.floor(min / 2) + (done ? 5 : 0);
  const xpFor = min => min * 4;
  const kmFor = min => Math.round(min * KM_PER_MIN * 10) / 10;
  const level = xp => Math.floor(xp / 400) + 1;
  const nextCheckpoint = km => CHECKPOINTS.find(c => c[0] > km) || CHECKPOINTS[CHECKPOINTS.length - 1];
  const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const isDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
  function streak(hist, today) {
    let d = (hist[today] || 0) >= STREAK_MIN ? today : addDays(today, -1), n = 0;
    while ((hist[d] || 0) >= STREAK_MIN) { n++; d = addDays(d, -1); }
    return n;
  }
  const clampCfg = c => {
    const out = {};
    for (const [k, [lo, hi]] of Object.entries(LIMITS)) { const v = Number(c[k]); if (!Number.isInteger(v) || v < lo || v > hi) return null; out[k] = v; }
    for (const k of ['auto', 'ambient', 'alert', 'notify']) out[k] = !!c[k];
    return out;
  };
  return { SKINS, WORLDS, CHECKPOINTS, LIMITS, DEFAULT_CFG, WELCOME_GEMS, KM_PER_MIN, STREAK_MIN, gemsFor, xpFor, kmFor, level, nextCheckpoint, addDays, isDay, streak, clampCfg };
});
