// src/chat.js
// Simple chat API backed by SQLite
module.exports = ({ app, db, auth, bad }) => {
  // Get last 50 messages
  app.get('/api/chat', auth, (req, res) => {
    const msgs = db.prepare('SELECT user_id, message, ts FROM chat_messages ORDER BY ts DESC LIMIT 50').all();
    res.json({ messages: msgs });
  });

  // Post a new message
  app.post('/api/chat', auth, (req, res) => {
    const { message } = req.body;
    if (!message || typeof message !== 'string') return bad(res, 'Mensagem inválida', 400);
    db.prepare('INSERT INTO chat_messages(user_id, message, ts) VALUES(?, ?, ?)')
      .run(req.uid, message.trim(), Date.now());
    res.json({ ok: true });
  });
};
