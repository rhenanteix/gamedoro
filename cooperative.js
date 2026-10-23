'use strict';
// Os créditos coletivos são gravados na mesma transação das sessões.
module.exports = function ({ app, db, auth, bad, one, all, run, tx }) {
  const crypto = require('node:crypto');
  db.exec(`CREATE TABLE IF NOT EXISTS rooms(code TEXT PRIMARY KEY, name TEXT NOT NULL, world TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS room_members(user_id INTEGER PRIMARY KEY REFERENCES users(id), room TEXT NOT NULL REFERENCES rooms(code), seen INTEGER NOT NULL, focusing INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS room_focus(room TEXT NOT NULL, week TEXT NOT NULL, user_id INTEGER NOT NULL, minutes INTEGER NOT NULL, PRIMARY KEY(room,week,user_id));
    CREATE TABLE IF NOT EXISTS challenges(id INTEGER PRIMARY KEY, sender INTEGER NOT NULL, recipient INTEGER NOT NULL, stake INTEGER NOT NULL, starts INTEGER NOT NULL, ends INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', winner INTEGER);
    CREATE TABLE IF NOT EXISTS challenge_focus(challenge INTEGER NOT NULL, user_id INTEGER NOT NULL, minutes INTEGER NOT NULL, PRIMARY KEY(challenge,user_id));`);
  const week = () => { const d = new Date(); d.setUTCHours(0,0,0,0); d.setUTCDate(d.getUTCDate() - (d.getUTCDay()+6)%7); return d.toISOString().slice(0,10); };
  const score = (id, uid) => one('SELECT minutes FROM challenge_focus WHERE challenge=? AND user_id=?', id, uid)?.minutes || 0;
  function settle() {
    for (const c of all("SELECT * FROM challenges WHERE ends<=? AND status IN ('pending','active')", Date.now())) {
      if (c.status === 'pending') run('UPDATE users SET gems=gems+? WHERE id=?', c.stake, c.sender);
      else {
        const a = score(c.id,c.sender), b = score(c.id,c.recipient);
        const winner = a === b ? null : a > b ? c.sender : c.recipient;
        if (winner) run('UPDATE users SET gems=gems+? WHERE id=?', c.stake*2,winner);
        else { run('UPDATE users SET gems=gems+? WHERE id=?',c.stake,c.sender); run('UPDATE users SET gems=gems+? WHERE id=?',c.stake,c.recipient); }
        run('UPDATE challenges SET winner=? WHERE id=?',winner,c.id);
      }
      run("UPDATE challenges SET status='finished' WHERE id=?",c.id);
    }
  }
  app.get('/api/coop',auth,(req,res)=> {
    tx(settle);
    const membership = one('SELECT room FROM room_members WHERE user_id=?',req.uid);
    let room = null;
    if (membership) {
      room = one('SELECT * FROM rooms WHERE code=?',membership.room);
      room.members = all('SELECT u.id,u.name,u.skin,m.seen,m.focusing FROM room_members m JOIN users u ON u.id=m.user_id WHERE m.room=?',room.code).map(m=>({...m,me:m.id===req.uid,online:Date.now()-m.seen<45000}));
      room.boss = { name:'Guardião da Distração', goal:600, minutes:one('SELECT COALESCE(SUM(minutes),0) AS n FROM room_focus WHERE room=? AND week=?',room.code,week()).n, week:week() };
    }
    const challenges = all('SELECT c.*,a.name AS senderName,b.name AS recipientName FROM challenges c JOIN users a ON a.id=c.sender JOIN users b ON b.id=c.recipient WHERE sender=? OR recipient=? ORDER BY id DESC LIMIT 30',req.uid,req.uid).map(c=>({...c,incoming:c.recipient===req.uid,senderMin:score(c.id,c.sender),recipientMin:score(c.id,c.recipient)}));
    res.json({room,challenges,gems:one('SELECT gems FROM users WHERE id=?',req.uid).gems});
  });
  app.post('/api/rooms',auth,(req,res)=> {
    if (one('SELECT 1 FROM room_members WHERE user_id=?',req.uid)) return bad(res,'Saia da sala atual primeiro.',409);
    const name = String(req.body.name||'').trim(); if(name.length<2||name.length>40) return bad(res,'Nome da sala: 2 a 40 caracteres.');
    const code = crypto.randomBytes(6).toString('hex').toUpperCase();
    tx(()=>{run('INSERT INTO rooms VALUES(?,?,?)',code,name,one('SELECT world FROM users WHERE id=?',req.uid).world);run('INSERT INTO room_members VALUES(?,?,?,0)',req.uid,code,Date.now());});
    res.status(201).json({code});
  });
  app.post('/api/rooms/join',auth,(req,res)=> {
    const code = String(req.body.code||'').trim().toUpperCase();
    if(!one('SELECT 1 FROM rooms WHERE code=?',code)) return bad(res,'Sala não encontrada.',404);
    if(one('SELECT 1 FROM room_members WHERE user_id=?',req.uid)) return bad(res,'Saia da sala atual primeiro.',409);
    if(one('SELECT COUNT(*) AS n FROM room_members WHERE room=?',code).n>=6) return bad(res,'Sala cheia (6 heróis).',409);
    run('INSERT INTO room_members VALUES(?,?,?,0)',req.uid,code,Date.now());res.json({ok:true});
  });
  app.delete('/api/rooms/membership',auth,(req,res)=> {run('DELETE FROM room_members WHERE user_id=?',req.uid);res.json({ok:true});});
  app.post('/api/rooms/presence',auth,(req,res)=> {run('UPDATE room_members SET seen=?,focusing=? WHERE user_id=?',Date.now(),req.body.focusing===true?1:0,req.uid);res.json({ok:true});});
  app.post('/api/challenges',auth,(req,res)=> {
    const target=Number(req.body.friend), stake=Number(req.body.stake);
    if(!Number.isInteger(stake)||stake<1||stake>500) return bad(res,'Aposta entre 1 e 500 gemas.');
    if(!one('SELECT 1 FROM friends WHERE user_id=? AND friend_id=?',req.uid,target)) return bad(res,'Escolha um amigo.',403);
    const error=tx(()=>{settle();if(one('SELECT gems FROM users WHERE id=?',req.uid).gems<stake)return 'Gemas insuficientes.';
      if(one("SELECT 1 FROM challenges WHERE status IN ('pending','active') AND ((sender=? AND recipient=?) OR (sender=? AND recipient=?))",req.uid,target,target,req.uid))return 'Vocês já têm um desafio em aberto.';
      run('UPDATE users SET gems=gems-? WHERE id=?',stake,req.uid);
      run('INSERT INTO challenges(sender,recipient,stake,starts,ends) VALUES(?,?,?,?,?)',req.uid,target,stake,Date.now(),Date.now()+7*864e5);
    });if(error)return bad(res,error,409);res.status(201).json({ok:true});
  });
  app.post('/api/challenges/:id/respond',auth,(req,res)=> {
    const error=tx(()=>{settle();const c=one("SELECT * FROM challenges WHERE id=? AND status='pending'",Number(req.params.id));
      if(!c||c.recipient!==req.uid)return 'Convite indisponível.';
      if(req.body.accept===true){if(one('SELECT gems FROM users WHERE id=?',req.uid).gems<c.stake)return 'Gemas insuficientes.';
        run('UPDATE users SET gems=gems-? WHERE id=?',c.stake,req.uid);run("UPDATE challenges SET status='active',starts=?,ends=? WHERE id=?",Date.now(),Date.now()+7*864e5,c.id);
      }else{run('UPDATE users SET gems=gems+? WHERE id=?',c.stake,c.sender);run("UPDATE challenges SET status='declined' WHERE id=?",c.id);}
    });if(error)return bad(res,error,409);res.json({ok:true});
  });
  return (uid,minutes,session) => {
    if(minutes<=0)return;
    const m=session.room ? {room:session.room} : null;
    if(m)run('INSERT INTO room_focus VALUES(?,?,?,?) ON CONFLICT(room,week,user_id) DO UPDATE SET minutes=minutes+excluded.minutes',m.room,week(),uid,minutes);
    for(const c of all("SELECT id,starts FROM challenges WHERE status='active' AND ends>? AND (sender=? OR recipient=?)",Date.now(),uid,uid).filter(c=>session.at>=c.starts))run('INSERT INTO challenge_focus VALUES(?,?,?) ON CONFLICT(challenge,user_id) DO UPDATE SET minutes=minutes+excluded.minutes',c.id,uid,minutes);
  };
};
