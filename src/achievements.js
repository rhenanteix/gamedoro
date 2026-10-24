// src/achievements.js
// Simple endpoint to fetch user achievements
module.exports = ({ app, db, auth, bad }) => {
  app.get('/api/achievements', auth, (req, res) => {
    const rows = db.prepare('SELECT id, name, earned_at, description FROM achievements WHERE user_id = ?')
      .all(req.uid);
    res.json({ achievements: rows });
  });
};
