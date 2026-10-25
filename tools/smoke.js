const { spawn } = require('child_process'); const { JSDOM } = require('jsdom'); const assert = require('assert');
const fs=require('fs'),os=require('os'),path=require('path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gs-'));
const srv=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:3133,DATA_DIR:dir,GAMEDORO_FAST:'1',SECRET:require('node:crypto').randomBytes(32).toString('hex')},stdio:['ignore','ignore','inherit']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let dom;
(async()=>{try{
 await require('./test-server').ready(srv,'http://localhost:3133/api/health');
 const errs=[];
 const html = await (await fetch('http://localhost:3133/')).text();
 dom = new JSDOM(html, {url:'http://localhost:3133/',runScripts:'outside-only',pretendToBeVisual:true});
 {
  const w = dom.window;
  w.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){}});
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
  w.scrollTo=()=>{};w.fetch=(u,o)=>fetch(new URL(u,'http://localhost:3133'),o);w.addEventListener('error',e=>errs.push(e.message));w.console.error=m=>errs.push(String(m));
  const publicDir=path.join(__dirname,'..','public');
  w.Pay=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path.join(publicDir,'payments.js'))).toString('base64'));
  for(const file of ['shared.js','progression.js','scene.js']) w.eval(fs.readFileSync(path.join(publicDir,file),'utf8'));
  const source=fs.readFileSync(path.join(publicDir,'app.js'),'utf8');
  assert.ok(source.includes("import * as Pay from './payments.js';"), 'Atualize o harness se os imports mudarem');
  w.eval(source.replace("import * as Pay from './payments.js';",''));
 }
 const w=dom.window,d=w.document,$=s=>d.querySelector(s);
 for(let i=0;i<80&&!$('#gems').textContent;i++)await sleep(100);
 if(errs.length)console.error(errs);
 assert.equal($('#time').textContent,'25:00'); assert.match($('#gems').textContent,/50/); assert.match($('#cp').textContent,/Ponte do Musgo/);
 assert.equal(d.querySelectorAll('#worlds .wd').length,4);
 // visitante: iniciar, pausar após 0 min, encerrar
 $('#go').click(); await sleep(400); assert.equal($('#go').textContent,'Pausar');
 $('#go').click(); await sleep(300); assert.equal($('#go').textContent,'Continuar');
 $('#stop').click(); await sleep(300); assert.equal($('#time').textContent,'25:00');
 // preset 50
 $('[data-m="50"]').click(); await sleep(300); assert.equal($('#time').textContent,'50:00');
 // modo livre, preset e penalidade estrita
 $('#free-mode').click();assert.equal($('#time').textContent,'00:00');
 $('#focus-task').value='Revisar capítulos';$('#focus-project').value='História';$('#strict-mode').checked=true;
 $('#go').click();await sleep(200);const oldNow=w.Date.now;w.Date.now=()=>oldNow()+120000;await sleep(300);
 assert.match($('#time').textContent,/02:/);
 Object.defineProperty(d,'hidden',{configurable:true,value:true});
 for(let i=0;i<3;i++)d.dispatchEvent(new w.Event('visibilitychange'));
 await sleep(200);assert.equal($('#go').textContent,'Continuar');assert.equal($('#hearts').textContent,'♡♡♡');
 $('#go').click();await sleep(100);assert.match($('#toast').textContent,/corações/);
 $('#stop').click();await sleep(200);w.Date.now=oldNow;Object.defineProperty(d,'hidden',{configurable:true,value:false});
 $('#strict-mode').checked=false;$('#preset-52').click();await sleep(200);assert.equal($('#time').textContent,'52:00');assert.match($('#auto-note').textContent,/17/);
 w.location.hash='#/diario';await sleep(250);assert.match($('#v-diario').textContent,/História/);
 // navegação
 for(const v of ['diario','mundos','heroi','loja','amigos','ranking','aventura','cooperativo']){w.location.hash='#/'+v;await sleep(350);assert.ok(!$('#v-'+v).hidden,v);assert.ok($('#v-'+v).innerHTML.length>50,v+' vazio')}
 // comprar mundo no modo visitante sem gemas suficientes -> toast de erro
 w.location.hash='#/loja';await sleep(300);$('[data-buy="world:costa"]').click();await sleep(300);assert.match($('#toast').textContent,/insuficientes/);
 // criar conta
 w.location.hash='#/';await sleep(200);$('#btn-auth').click();$('#af-sw').click();
 $('#nm-i').value='Carla';$('#em').value='carla@x.com';$('#pw').value='senha-12345';
 $('#af').dispatchEvent(new w.Event('submit',{cancelable:true}));await sleep(700);
 assert.match($('#toast').textContent,/Bem-vind/);assert.equal($('#btn-auth').textContent,'Sair');
 // fase logada: 1 min não dá para completar; checar start/pause/stop no servidor
 $('#go').click();await sleep(500);$('#go').click();await sleep(500);$('#stop').click();await sleep(500);
 w.location.hash='#/cooperativo';await sleep(400);$('#create-room input').value='Equipe de teste';$('#create-room').dispatchEvent(new w.Event('submit',{cancelable:true}));await sleep(500);assert.match($('#v-cooperativo').textContent,/Equipe de teste/);assert.match($('#v-cooperativo').textContent,/600 minutos/);
 w.location.hash='#/aventura';await sleep(300);assert.match($('#v-aventura').textContent,/Árvore de habilidades/);
 w.location.hash='#/amigos';await sleep(600);assert.match($('#v-amigos').textContent,/Seu código/);
 w.location.hash='#/ranking';await sleep(600);assert.match($('#v-ranking').textContent,/Ranking/);
 w.location.hash='#/diario';await sleep(600);assert.match($('#v-diario').textContent,/Minutos por dia/);
 assert.deepEqual(errs.filter(e=>!/Not implemented|AudioContext/i.test(e)),[]);
 console.log('SMOKE OK');
}catch(e){console.error('SMOKE FALHOU:',e.stack);process.exitCode=1;}finally{dom?.window.close();await require('./test-server').stop(srv);fs.rmSync(dir,{recursive:true,force:true});process.exit(process.exitCode||0)}})();
