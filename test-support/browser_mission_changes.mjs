import {DatabaseSync} from 'node:sqlite';
import {createWorker,APP_ORIGIN} from '../ai/cloudflare/worker.mjs';
import * as Library from '../library.v2.js';
// Functional browser checks. Every Firebase/OAuth/CDN request is intercepted;
// this runner cannot authenticate or read/write production data.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {boot,plain} from './app_boot.mjs';
import {AI_OWNER_UID as owner} from '../ai/contract.v1.js';
import {v2BuildSnapshot,v2Project} from '../ai/v2/contract.js';
import {v2ProposalRequest} from '../ai/v2/proposals.js';
const require=createRequire(new URL('../security-tests/package.json',import.meta.url));
const {chromium}=require('playwright');
const root=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,''),sara='fictional-sara';
const fixture=plain(boot().state);fixture.ownerUid=owner;fixture.userProfile={displayName:'Pessoa fictícia',gender:'neutro',configured:true};fixture.currentPlanningWeekStart='2026-10-26';fixture.planning.legacyWeek='2026-10-26';fixture.activeTab='monday';fixture.currentFilter='all';
fixture.operationalControl.demands=[{id:'radar',title:'Frente de teste',workflowStatus:'active',nextAction:'Revisar entrega'}];
const task=(id,text,extra={})=>({id,text,day:'monday',planningWeekStart:'2026-10-26',order:id,category:'work',time:'30 min',priority:'media',completed:false,missionNature:'neutral',xp:0,energyCost:0,subtasks:[],...extra});
fixture.tasks=[task(1,'Primeira missão',{missionNature:'normal',xp:10,energyCost:5}),task(2,'Já concluída',{completed:true}),task(3,'Próxima missão',{subtasks:[{id:31,text:'Etapa preservada',completed:true}]}),task(4,'Outra categoria',{category:'life'}),task(5,'Reunião não realizada',{activityType:'meeting',meetingOutcome:'not_held'}),task(6,'Missão do RADAR',{day:'tuesday',radarDemandId:'radar'}),task(7,'Rotina de segunda',{isRecurring:true,recurrenceGroupId:'routine',recurrenceDays:['monday','friday']}),task(8,'Rotina de sexta',{day:'friday',isRecurring:true,recurrenceGroupId:'routine',recurrenceDays:['monday','friday']}),task(9,'Dependente',{day:'tuesday',dependsOnTaskIds:['6']})];
fixture.combo=7;fixture.xp=320;fixture.coins=52;fixture.tasks[0].radarDemandId='radar';fixture.tasks.find(t=>t.id===9).day='monday';fixture.tasks.find(t=>t.id===9).dependsOnTaskIds=['1'];fixture.taskDeletionLog=[{id:'historical-log',reason:'cancelada',preserveCombo:false,comboBefore:4}];
fixture.libraryData=Library.emptyLibrary();Library.saveLibraryBook(fixture,{title:'Já na estante',authors:'Autoria fictícia',editions:[{format:'physical',pageCount:100}],notes:'Preservar observação'});
const cssPath=process.env.MISSAO_QA_CSS_PATH;
const css=cssPath?await readFile(cssPath,'utf8'):'.hidden{display:none}';
const server=createServer(async(req,res)=>{
 try{const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!path.startsWith(root+'/'))throw Error('bad path');let data=await readFile(path);if(path.endsWith('/app.html'))data=Buffer.from(data.toString().replace(/<base href="[^"]+">/,'<base href="/">'));
 res.setHeader('Content-Type',extname(path)==='.html'?'text/html':extname(path)==='.js'?'text/javascript':'application/octet-stream');res.end(data);}catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1280,height:900},hasTouch:true,locale:'pt-BR'}),page=await context.newPage(),errors=[],external=[],aiRequests=[];
const proposalId='f'.repeat(64),proposalEdits=[];
let proposal={id:proposalId,grantId:'browser-review-grant-001',grantVersion:1,version:1,kind:'mission.create',status:'pending',createdAt:'2026-10-26T12:00:00.000Z',expiresAt:'2026-12-01T12:00:00.000Z',reviewedAt:null,basis:null,conflictCheck:'unverified',applyEligible:true,fields:{title:'Proposta para editar',weekStart:'2026-10-26',day:'monday',category:'life',durationMinutes:30,startTime:'09:00',endTime:'09:30',subtasks:['Conferir']}};
let activeAccount='';page.on('pageerror',error=>errors.push(error.message));
await context.addInitScript(({owner,fixture})=>{
 window.__rows=JSON.parse(sessionStorage.getItem('test-cloud-rows')||'null')||{[`users/${owner}/state/main`]:{data:JSON.stringify(fixture),updatedAt:'2026-10-06T22:30:00Z',revision:1,aiApplications:{fixtureProof:{taskId:1}}}};window.__writes=[];
 localStorage.setItem('planeamento_semanal_v11',JSON.stringify(fixture));
},{owner,fixture});
const modules={
 'firebase-app.js':'export const initializeApp=()=>({});',
 'firebase-app-check.js':"export const initializeAppCheck=()=>({});export class ReCaptchaEnterpriseProvider{};export const getToken=async()=>({token:'synthetic-app-check'});",
 'firebase-auth.js':`export const getAuth=()=>({currentUser:null});export class GoogleAuthProvider{setCustomParameters(){}};export const onAuthStateChanged=(auth,callback)=>{window.__auth=user=>{auth.currentUser=user;return callback(user);};};export const signOut=async()=>window.__auth(null);export const signInWithPopup=async()=>{};export const signInWithRedirect=async()=>{};`,
 'firebase-firestore.js':`export const getFirestore=()=>({});export const doc=(_, ...parts)=>parts.join('/');const snapshot=path=>({exists:()=>!!window.__rows[path],data:()=>structuredClone(window.__rows[path])});export const getDocFromServer=async path=>{if(path.startsWith('appAccess/'))return {exists:()=>path==='appAccess/fictional-sara',data:()=>({enabled:true,role:'member'})};return snapshot(path);};export const getDoc=getDocFromServer;export const setDoc=async(path,value)=>{window.__writes.push({path,value});window.__rows[path]={...window.__rows[path],...structuredClone(value)};};export const runTransaction=async(_,work)=>work({get:async path=>snapshot(path),set:(path,value)=>{window.__writes.push({path,value});window.__rows[path]={...window.__rows[path],...structuredClone(value)};}});`
};
const changeSql=new DatabaseSync(':memory:');
for(const file of ['schema.sql','oauth-schema.sql','v2-schema.sql','proposals-v2-schema.sql','apply-v2-schema.sql','entities-v2-schema.sql'])changeSql.exec(await readFile(root+'/ai/cloudflare/'+file,'utf8'));
const changeDb={prepare(q){return {bind(...a){return {first:async()=>changeSql.prepare(q).get(...a)||null,all:async()=>({success:true,results:changeSql.prepare(q).all(...a)}),run:async()=>({success:true,meta:{changes:Number(changeSql.prepare(q).run(...a).changes)}})}}}}};
const changeEnv={DB:changeDb,ACTION_SECRET:'synthetic-change-browser-secret-12345678',AI_V2_ENABLED:'true',AI_V2_READ_ENABLED:'true',AI_V2_PROPOSALS_ENABLED:'true',AI_V2_APPLY_ENABLED:'true',AI_MISSION_CHANGES_ENABLED:'true'};
const changeWorker=createWorker({now:()=>Date.parse('2026-10-30T15:00:00Z'),verifyOwner:async request=>{assert.equal(request.headers.get('Authorization'),'Bearer synthetic-id-token');}});
const workerCall=(path,body,token='synthetic-id-token',method='POST')=>changeWorker.fetch(new Request('https://bridge.example'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Origin:path.startsWith('/v2/app/')?APP_ORIGIN:'https://missao-tatica-conexao.victorduarteferreira.chatgpt.site'},...(body?{body:JSON.stringify(body)}:{})}),changeEnv);
const grant=(await (await workerCall('/v2/app/grant',{grantId:'change-browser-grant',expectedVersion:0,choices:{modules:{missions:true,radar:false,studies:false},includeFuture:true,allowMissionChanges:true},frozenRefs:[]},undefined,'PUT')).json()).grant;
fixture.lastSavedAt='2026-10-30T15:00:00Z';assert.equal((await workerCall('/v2/app/snapshot',await v2BuildSnapshot(fixture,grant),undefined,'PUT')).status,200);
const tokenReply=await (await changeWorker.fetch(new Request('https://bridge.example/v2/connection',{method:'POST',headers:{Authorization:'Bearer '+changeEnv.ACTION_SECRET,'Content-Type':'application/json'},body:JSON.stringify({subject:'a'.repeat(64),expectedGrantId:grant.grantId,expectedGrantVersion:1,requestedScope:'proposals:create'})}),changeEnv)).json();
for(const id of [1,3]){
 const [entity]=await v2Project({tasks:[fixture.tasks.find(t=>t.id===id)]},grant),fields={targetRef:entity.ref,targetVersion:entity.entityVersion,reason:'Organizar entrega '+id,patch:{title:'Missão revisada '+id,date:id===1?'2026-11-03':'2026-11-04',durationMinutes:45,priority:'baixa',addSubtasks:['Nova etapa '+id]}};
 const response=await workerCall('/v2/planning',{name:'submitMissionChange',arguments:{idempotencyKey:'browser-change-'+id,fields}},tokenReply.accessToken);assert.equal(response.status,200);
}
let loseAck=true;
await context.route('**/*',async route=>{
 const url=route.request().url();if(url.startsWith(origin+'/'))return route.continue();
 const module=Object.keys(modules).find(name=>url.includes('gstatic.com/firebasejs/')&&url.endsWith('/'+name));
 if(module)return route.fulfill({contentType:'text/javascript',body:modules[module]});
 if(url.includes('unpkg.com/lucide'))return route.fulfill({contentType:'text/javascript',body:'window.lucide={createIcons(){}};'});
 if(url.includes('cdn.tailwindcss.com'))return route.fulfill({contentType:'text/javascript',body:'const style=document.createElement("style");style.textContent='+JSON.stringify(css)+';document.head.append(style);'});
 if(url.includes('accounts.google.com/gsi/client'))return route.fulfill({contentType:'text/javascript',body:''});
 if(url.includes('/v2/app/mission-changes')||url.includes('/v2/app/grant')||url.includes('/v2/app/snapshot')){
  const req=route.request();if(url.endsWith('/acknowledge')&&loseAck){loseAck=false;return route.fulfill({status:503,contentType:'application/json',body:'{"error":"synthetic-lost-ack"}'});}
  const response=await changeWorker.fetch(new Request(url,{method:req.method(),headers:Object.fromEntries([...Object.entries(req.headers()).filter(([key])=>key.toLowerCase()!=='origin'),['Origin',APP_ORIGIN]]),...(req.postData()?{body:req.postData()}:{})}),changeEnv);return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
 }
 if(url.includes('/v2/app/proposals'))return route.fulfill({contentType:'application/json',body:JSON.stringify({schemaVersion:2,items:[],nextCursor:null})});
 if(url.includes('/v2/')){aiRequests.push(activeAccount);return route.fulfill({status:403,contentType:'application/json',body:'{"error":"isolated test"}'});}
 external.push(url);return route.abort();
});
const login=async uid=>{activeAccount=uid;await page.evaluate(async uid=>window.__auth({uid,email:uid+'@example.test',displayName:'Fictício',getIdToken:async()=>'synthetic-id-token'}),uid);};
const cloud=async()=>page.evaluate(uid=>JSON.parse(window.__rows[`users/${uid}/state/main`].data),owner);
await page.clock.setFixedTime(new Date('2026-10-30T15:00:00Z'));
try{
 await page.goto(origin+'/app.html');await page.waitForFunction(()=>!!window.__auth);await login(owner);await page.evaluate(()=>window.saveStateNow(true));const initial=await cloud();await page.getByRole('button',{name:'Propostas da IA',exact:true}).click();await page.locator('#ai-mission-changes-tab').click();const dialog=page.locator('#mission-changes-dialog');await dialog.getByRole('button',{name:'Revisar alteração',exact:true}).first().waitFor();assert.equal(await page.locator('#ai-v2-proposals-dialog').count(),0);
 const firstCard=dialog.locator('article').filter({hasText:'Missão revisada 1'});await firstCard.getByRole('button',{name:'Revisar alteração',exact:true}).click();await dialog.getByText('Ajustar esta proposta',{exact:true}).click();await page.locator('#mission-change-title-value').fill('Título final <teste>');await page.locator('#mission-change-durationMinutes-value').fill('60');assert.equal(await page.locator('#mission-change-submit').isDisabled(),true);
 await page.evaluate(()=>window.saveState());assert.equal(await page.locator('#mission-change-title-value').inputValue(),'Título final <teste>');await dialog.getByRole('button',{name:'Conferir ajustes',exact:true}).click();await page.locator('#mission-change-submit').waitFor();await page.waitForFunction(()=>!document.getElementById('mission-change-submit').disabled);
 if(cssPath)await page.screenshot({path:root+'/../mission-change-desktop.png'});
 await page.locator('#mission-change-submit').click();await page.waitForFunction(()=>document.getElementById('mission-change-submit')?.textContent==='Retomar alteração');let saved=await cloud(),updated=saved.tasks.find(t=>t.id===1);assert.equal(updated.text,'Título final <teste>');assert.equal(updated.day,'tuesday');assert.equal(updated.planningWeekStart,'2026-11-02');assert.equal(parseInt(updated.time),60);assert.equal(updated.radarDemandId,'radar');assert.equal(updated.subtasks.length,1);assert.equal(saved.tasks.length,initial.tasks.length);for(const key of ['xp','energy','combo','coins'])assert.equal(saved[key],initial[key]);
 await page.evaluate(()=>sessionStorage.setItem('test-cloud-rows',JSON.stringify(window.__rows)));await page.reload();await page.waitForFunction(()=>!!window.__auth);await login(owner);await page.evaluate(()=>window.openAiV2Proposals());await page.locator('#ai-mission-changes-tab').click();await page.locator('#mission-change-status').selectOption('applying');await dialog.getByRole('button',{name:'Retomar alteração',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#mission-change-submit')?.textContent==='Retomar alteração');assert.match(await dialog.innerText(),/Alteração já salva/);await page.locator('#mission-change-submit').click();await page.waitForFunction(()=>!document.getElementById('mission-change-submit'));assert.equal((await cloud()).tasks.find(t=>t.id===1).subtasks.length,1);assert.equal(await dialog.isVisible(),true);
 await page.setViewportSize({width:390,height:844});await page.locator('#mission-change-status').selectOption('pending');await dialog.getByRole('button',{name:'Revisar alteração',exact:true}).click();await dialog.getByText('Ajustar esta proposta',{exact:true}).click();await page.locator('#mission-change-title-value').fill('Revisão no celular');await dialog.getByRole('button',{name:'Voltar à fila',exact:true}).click();await page.locator('#confirmation-cancel').tap();assert.equal(await page.locator('#mission-change-title-value').inputValue(),'Revisão no celular');await dialog.getByRole('button',{name:'Conferir ajustes',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('mission-change-submit').disabled);
 if(cssPath){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);const box=await page.locator('#mission-change-submit').boundingBox();assert.ok(box.y+box.height<=844);await page.screenshot({path:root+'/../mission-change-mobile.png'});}
 await page.locator('#mission-change-submit').tap();await page.waitForFunction(()=>!document.getElementById('mission-change-submit'));saved=await cloud();assert.equal(saved.tasks.find(t=>t.id===3).text,'Revisão no celular');assert.deepEqual(saved.tasks.find(t=>t.id===3).subtasks[0],initial.tasks.find(t=>t.id===3).subtasks[0]);assert.equal(saved.tasks.find(t=>t.id===3).subtasks.length,2);assert.equal(await dialog.isVisible(),true);assert.equal(saved.tasks.length,initial.tasks.length);assert.deepEqual(saved.studyData,initial.studyData);assert.deepEqual(saved.operationalControl,initial.operationalControl);for(const key of ['xp','energy','combo','coins'])assert.equal(saved[key],initial[key]);
 await page.locator('#mission-changes-close').tap();await page.evaluate(({sara,initial})=>{initial.ownerUid=sara;window.__rows[`users/${sara}/state/main`]={data:JSON.stringify(initial),revision:1};},{sara,initial});await login(sara);await page.evaluate(()=>window.openMissionChanges());assert.equal(await dialog.count(),0);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('Mission change browser passed: real Worker/SQLite and app, desktop and 390px, final edits, guarded review, lost acknowledgment/reload, no duplicate, completed subtasks and all totals/links preserved, isolated member. No production services accessed.');
}catch(error){console.error({browserErrors:errors,unexpectedExternal:external});await page.screenshot({path:root+'/../mission-change-failure.png'});throw error;}finally{changeSql.close();await browser.close();await new Promise(r=>server.close(r));}
