/* Regras determinísticas compartilhadas por contas e visitantes. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Progression = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  const dayAdd = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const week = day => { const d = new Date(day + 'T12:00:00Z'); return dayAdd(day, -(d.getUTCDay() + 6) % 7); };
  const fresh = () => ({ days: {}, claimed: {}, frozen: [], skills: { xp: 0, gems: 0 }, chests: [], total: 0 });
  function normalize(p) { return Object.assign(fresh(), p || {}, { skills: Object.assign({ xp: 0, gems: 0 }, p?.skills) }); }
  function credit(p, day, min, done) { p = normalize(p); const d = p.days[day] || (p.days[day] = { minutes: 0, completed: 0 }); d.minutes += min; d.completed += done ? 1 : 0; p.total += min; return p; }
  function streak(hist, day, p) { let d = (hist[day] || 0) >= 10 ? day : dayAdd(day, -1), n = 0; while ((hist[d] || 0) >= 10 || p.frozen.includes(d)) { if ((hist[d] || 0) >= 10) n++; d = dayAdd(d, -1); } return n; }
  function missions(p, day, hist) {
    p = normalize(p); const d = p.days[day] || {}; return [
      { id: 'daily-focus:' + day, name: 'Concentrar por 30 minutos hoje', value: d.minutes || 0, goal: 30, reward: 5 },
      { id: 'daily-stages:' + day, name: 'Completar 3 fases hoje', value: d.completed || 0, goal: 3, reward: 8 },
      { id: 'achievement-week', name: 'Manter 7 dias de sequência', value: streak(hist, day, p), goal: 7, reward: 25 },
      { id: 'achievement-hours', name: 'Acumular 10 horas de foco', value: p.total, goal: 600, reward: 30 }
    ].map(m => ({ ...m, claimed: !!p.claimed[m.id] }));
  }
  function action(p, body, ctx) {
    p = normalize(p); let gems = ctx.gems;
    if (body.action === 'claim') { const m = missions(p, ctx.day, ctx.hist).find(m => m.id === body.id); if (!m || m.claimed || m.value < m.goal) throw Error('Missão indisponível.'); p.claimed[m.id] = true; gems += m.reward; }
    else if (body.action === 'skill') { const k = body.id; if (!['xp', 'gems'].includes(k) || p.skills[k] >= 3) throw Error('Habilidade indisponível.'); const cost = 50 * (p.skills[k] + 1); if (gems < cost) throw Error('Gemas insuficientes.'); gems -= cost; p.skills[k]++; }
    else if (body.action === 'freeze') { const d = dayAdd(ctx.day, -1); if (p.frozen.includes(d) || (ctx.hist[d] || 0) >= 10 || (ctx.hist[dayAdd(d, -1)] || 0) < 10) throw Error('O congelamento protege ontem, após um dia de foco.'); if (gems < 25) throw Error('Gemas insuficientes.'); gems -= 25; p.frozen.push(d); }
    else if (body.action === 'chest') { const w = week(ctx.day), minutes = Object.entries(p.days).filter(([d]) => d >= w && d <= ctx.day).reduce((n, [, v]) => n + v.minutes, 0); if (p.chests.includes(w) || minutes < 120) throw Error('O baú exige 120 minutos nesta semana e só abre uma vez.'); const reward = ctx.randomReward; p.chests.push(w); gems += reward; }
    else throw Error('Ação inválida.'); return { progress: p, gems };
  }
  const pet = minutes => minutes >= 1200 ? { name: 'Guardião', level: 3 } : minutes >= 300 ? { name: 'Companheiro', level: 2 } : { name: 'Filhote', level: 1 };
  const stories = ['Uma ponte coberta de musgo leva à primeira clareira. Seu companheiro encontra pegadas luminosas.', 'As lanternas da vila acendem com cada jornada. Uma viajante entrega um mapa do vento.', 'No alto da torre, o vento revela a trilha para um portão esquecido.', 'O portão se abre. O amanhecer ilumina uma cidade acima das nuvens.', 'A cidade flutuante precisa de novos exploradores. Seu foco mantém as ilhas unidas.', 'As estrelas guiam a subida. Seu companheiro reconhece o caminho de casa.', 'Você chegou ao fim do mapa. Agora pode desenhar os próximos caminhos.'];
  return { fresh, normalize, credit, streak, missions, action, pet, stories, week };
});
