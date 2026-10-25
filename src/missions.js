'use strict';

module.exports = ({ app, db, auth, bad, tx }) => {
  // Migração aditiva: só inferir objetivos de descrições legadas conhecidas.
  if (!db.prepare('PRAGMA table_info(missions)').all().some(c => c.name === 'goal_minutes')) {
    tx(() => {
      db.exec('ALTER TABLE missions ADD COLUMN goal_minutes INTEGER');
      const update = db.prepare('UPDATE missions SET goal_minutes=? WHERE id=?');
      for (const mission of db.prepare('SELECT id,description FROM missions').all()) {
        const match = /^Concluir ([1-9]\d*) minutos de foco$/.exec(mission.description);
        const goal = match ? Number(match[1]) : 0;
        if (Number.isSafeInteger(goal) && goal <= 120 && goal > 0) update.run(goal, mission.id);
      }
    });
  }

  app.get('/api/missions', auth, (req, res) => {
    const missions = db.prepare('SELECT * FROM missions WHERE user_id=? AND day=?').all(req.uid, req.today);
    res.json({ missions });
  });

  app.post('/api/missions/complete', auth, (req, res) => {
    const missionId = Number(req.body.missionId);
    if (!Number.isSafeInteger(missionId) || missionId <= 0) return bad(res, 'ID da missão inválido.');
    const error = tx(() => {
      const mission = db.prepare('SELECT * FROM missions WHERE id=? AND user_id=?').get(missionId, req.uid);
      if (!mission) return ['Missão não encontrada.', 404];
      if (mission.completed) return ['Missão já resgatada.', 409];
      if (mission.day !== req.today) return ['Esta missão não está disponível hoje.', 409];
      if (!Number.isSafeInteger(mission.goal_minutes) || mission.goal_minutes <= 0) return ['Objetivo desta missão indisponível.', 409];
      const { minutes } = db.prepare('SELECT COALESCE(SUM(minutes),0) AS minutes FROM sessions WHERE user_id=? AND day=?').get(req.uid, mission.day);
      if (minutes < mission.goal_minutes) return ['Complete o tempo de foco da missão antes de resgatar.', 409];
      const changed = db.prepare('UPDATE missions SET completed=1 WHERE id=? AND user_id=? AND completed=0').run(missionId, req.uid).changes;
      if (changed !== 1) return ['Missão já resgatada.', 409];
      db.prepare('UPDATE users SET gems=gems+?, xp=xp+? WHERE id=?').run(mission.reward_gems, mission.reward_xp, req.uid);
    });
    if (error) return bad(res, ...error);
    res.json({ ok: true });
  });
};
