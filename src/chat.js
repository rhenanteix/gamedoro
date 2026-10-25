// src/chat.js
// Simple chat API backed by SQLite
module.exports = ({ app, db, auth, bad, limiter }) => {
  // Get last 50 messages
  app.get('/api/chat', auth, (req, res) => {
    const msgs = db.prepare('SELECT user_id, message, ts FROM chat_messages ORDER BY ts DESC LIMIT 50').all();
    res.json({ messages: msgs });
  });

  // Post a new message
  app.post('/api/chat', auth, limiter(20, 60000, 'chat', true), (req, res) => {
    const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
    if (!message || message.length > 500) return bad(res, 'Mensagem deve conter de 1 a 500 caracteres.', 400);
    db.prepare('INSERT INTO chat_messages(user_id, message, ts) VALUES(?, ?, ?)')
      .run(req.uid, message, Date.now());
    res.json({ ok: true });
  });
};
