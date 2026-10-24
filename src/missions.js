// src/missions.js
// Handles mission creation, retrieval and progress updates
module.exports = ({ app, db, auth, bad, tx }) => {
  // Get missions for today
  app.get('/api/missions', auth, (req, res) => {
    const uid = req.uid;
    const today = req.today;
    const missions = db.prepare('SELECT * FROM missions WHERE user_id=? AND day=?').all(uid, today);
    res.json({ missions });
  });

  // Mark a mission as completed and grant rewards
  app.post('/api/missions/complete', auth, (req, res) => {
    const { missionId } = req.body;
    const uid = req.uid;
    if (!missionId) return bad(res, 'ID da missão não informado.', 400);
    tx(() => {
      // Update mission status
      db.prepare('UPDATE missions SET completed=1 WHERE id=? AND user_id=?').run(missionId, uid);
      // Find reward values
      const mission = db.prepare('SELECT reward_gems, reward_xp FROM missions WHERE id=? AND user_id=?').get(missionId, uid);
      if (mission) {
        // Use existing credit functions (gems and xp) – add directly to user
        db.prepare('UPDATE users SET gems = gems + ?, xp = xp + ? WHERE id = ?')
          .run(mission.reward_gems, mission.reward_xp, uid);
      }
    });
    res.json({ ok: true });
  });
};
