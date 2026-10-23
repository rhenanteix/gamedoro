'use strict';
const {spawn}=require('node:child_process'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite'),P=require('./public/progression');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gd-features-')),port=3116,base=`http://127.0.0.1:${port}`;
const srv=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:port,DATA_DIR:dir,GAMEDORO_FAST:'1'},stdio:['ignore','ignore','inherit']});
const day=new Date().toISOString().slice(0,10);
async function call(p,t,body,method){const r=await fetch(base+'/api'+p,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',...(t?{Authorization:'Bearer '+t}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,...await r.json()};}
(async()=>{let db;try{
for(let i=0;i<50;i++){try{await fetch(base+'/api/health');break;}catch{await new Promise(r=>setTimeout(r,100));}}
const register=name=>call('/auth/register',null,{name,email:name+'@example.com',password:'testing-123',today:day});
const a=await register('Alice'),b=await register('Breno'),c=await register('Carol'),ta=a.token,tb=b.token,tc=c.token;
assert.equal(a.status,201);db=new DatabaseSync(path.join(dir,'gamedoro.db'));
assert.equal((await call('/coop')).status,401);
const room=await call('/rooms',ta,{name:'Estudantes'});assert.equal(room.status,201);
assert.equal((await call('/rooms/join',tb,{code:room.code})).status,200);
assert.equal((await call('/rooms/join',tb,{code:room.code})).status,409);
await call('/rooms/presence',tb,{focusing:true});let coop=await call('/coop',ta);assert.equal(coop.room.members.length,2);assert.equal(coop.room.members.find(m=>!m.me).focusing,1);
await call('/sessions/start',ta,{planned:60,task:'Capítulo <3>',project:'Matemática'});
await call('/sessions/sync',ta,{minutes:30,final:'pause'});await call('/sessions/sync',ta,{minutes:30,final:'pause'});
assert.equal((await call('/coop',ta)).room.boss.minutes,30);
await call('/sessions/sync',ta,{minutes:60,final:'complete'});
assert.equal((await call('/coop',tb)).room.boss.minutes,60);
let st=(await call('/me',ta)).state;assert.equal(st.progress.days[day].minutes,60);assert.equal(st.progress.days[day].completed,1);
const before=st.gems;st=(await call('/progression',ta,{action:'claim',id:'daily-focus:'+day})).state;assert.equal(st.gems,before+10);
assert.equal((await call('/progression',ta,{action:'claim',id:'daily-focus:'+day})).status,409);
assert.equal((await call('/progression',ta,{action:'chest'})).status,409);
st=(await call('/progression',ta,{action:'skill',id:'xp'})).state;assert.equal(st.progress.skills.xp,1);const xp=st.xp;
await call('/sessions/start',ta,{planned:60});await call('/sessions/sync',ta,{minutes:60,final:'complete'});
st=(await call('/me',ta)).state;assert.equal(st.xp-xp,264);
const chest=await call('/progression',ta,{action:'chest'});assert.ok(chest.state.gems-st.gems>=20&&chest.state.gems-st.gems<=60);
assert.equal((await call('/progression',ta,{action:'chest'})).status,409);
const history=await call('/history',ta);assert.ok(history.projects.some(p=>p.name==='Matemática'&&p.minutes===60));assert.equal(history.sessions.find(s=>s.project==='Matemática').task,'Capítulo <3>');
assert.equal((await call('/sessions/start',tb,{planned:0,free:true})).status,200);await call('/sessions/sync',tb,{minutes:5,final:'stop'});
assert.equal((await call('/sessions/start',tb,{planned:1440})).status,400);
assert.equal((await call('/challenges',ta,{friend:2,stake:10})).status,403);
await call('/friends',ta,{code:b.user.code});
const gemsA=(await call('/me',ta)).state.gems;
assert.equal((await call('/challenges',ta,{friend:2,stake:10})).status,201);
let challenge=(await call('/coop',tb)).challenges[0];assert.equal((await call('/me',ta)).state.gems,gemsA-10);
assert.equal((await call('/challenges/'+challenge.id+'/respond',tc,{accept:true})).status,409);
assert.equal((await call('/challenges/'+challenge.id+'/respond',tb,{accept:true})).status,200);
assert.equal((await call('/challenges/'+challenge.id+'/respond',tb,{accept:true})).status,409);
await call('/sessions/start',ta,{planned:25});await call('/sessions/sync',ta,{minutes:25,final:'complete'});
challenge=(await call('/coop',tb)).challenges[0];assert.equal(challenge.senderMin,25);
const rewardBefore=(await call('/me',ta)).state.gems;
db.prepare('UPDATE challenges SET ends=? WHERE id=?').run(Date.now()-1,challenge.id);
challenge=(await call('/coop',tb)).challenges[0];assert.equal(challenge.status,'finished');assert.equal(challenge.winner,1);
assert.equal((await call('/me',ta)).state.gems,rewardBefore+20);await call('/coop',ta);assert.equal((await call('/me',ta)).state.gems,rewardBefore+20);
// Refused and expired invitations return the reserved stake only once.
await call('/challenges',ta,{friend:2,stake:5});challenge=(await call('/coop',tb)).challenges[0];await call('/challenges/'+challenge.id+'/respond',tb,{accept:false});assert.equal((await call('/me',ta)).state.gems,rewardBefore+20);
await call('/challenges',ta,{friend:2,stake:5});db.prepare("UPDATE challenges SET ends=? WHERE status='pending'").run(Date.now()-1);await call('/coop',tb);assert.equal((await call('/me',ta)).state.gems,rewardBefore+20);
// New membership cannot redirect credit from an already-started session.
await call('/sessions/start',tb,{planned:25});await call('/rooms/membership',tb,null,'DELETE');await call('/rooms',tb,{name:'Outra sala'});await call('/sessions/sync',tb,{minutes:25,final:'complete'});assert.equal((await call('/coop',tb)).room.boss.minutes,0);
let p=P.fresh();const hist={'2026-10-20':10,'2026-10-22':10};p=P.action(p,{action:'freeze'},{day:'2026-10-22',hist,gems:50}).progress;assert.equal(P.streak(hist,'2026-10-22',p),2);assert.throws(()=>P.action(p,{action:'freeze'},{day:'2026-10-22',hist,gems:50}));
assert.equal(P.pet(300).level,2);assert.equal(P.pet(1200).level,3);
console.log('FEATURES OK: salas, créditos incrementais, missões, baú, habilidades, tarefas, modo livre, desafios e sequência.');
}catch(e){console.error(e);process.exitCode=1;}finally{db?.close();srv.kill();await new Promise(r=>srv.once('exit',r));fs.rmSync(dir,{recursive:true,force:true});}})();
