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
import {v2ProposalRequest} from '../ai/v2/proposals.js';
const require=createRequire(new URL('../security-tests/package.json',import.meta.url));
const {chromium}=require('playwright');
const root=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,''),sara='fictional-sara';
const fixture=plain(boot().state);fixture.ownerUid=owner;fixture.userProfile={displayName:'Pessoa fictícia',gender:'neutro',configured:true};fixture.currentPlanningWeekStart='2026-11-02';fixture.planning.legacyWeek='2026-11-02';fixture.activeTab='sunday';fixture.currentFilter='all';
fixture.operationalControl.demands=[{id:'radar',title:'Frente de teste',workflowStatus:'active',nextAction:'Revisar entrega'}];
const task=(id,text,extra={})=>({id,text,day:'monday',planningWeekStart:'2026-10-19',order:id,category:'work',time:'30 min',priority:'media',completed:false,missionNature:'neutral',xp:0,energyCost:0,subtasks:[],...extra});
fixture.tasks=[task(1,'Primeira missão',{missionNature:'normal',xp:10,energyCost:5}),task(2,'Já concluída',{completed:true}),task(3,'Próxima missão',{subtasks:[{id:31,text:'Etapa preservada',completed:true}]}),task(4,'Outra categoria',{category:'life'}),task(5,'Reunião não realizada',{activityType:'meeting',meetingOutcome:'not_held'}),task(6,'Missão do RADAR',{day:'tuesday',radarDemandId:'radar'}),task(7,'Rotina de segunda',{isRecurring:true,recurrenceGroupId:'routine',recurrenceDays:['monday','friday']}),task(8,'Rotina de sexta',{day:'friday',isRecurring:true,recurrenceGroupId:'routine',recurrenceDays:['monday','friday']}),task(9,'Dependente',{day:'tuesday',dependsOnTaskIds:['6']})];
fixture.combo=7;fixture.xp=320;fixture.coins=52;fixture.tasks[0].radarDemandId='radar';fixture.tasks.find(t=>t.id===9).day='monday';fixture.tasks.find(t=>t.id===9).dependsOnTaskIds=['1'];fixture.taskDeletionLog=[{id:'historical-log',reason:'cancelada',preserveCombo:false,comboBefore:4}];
Object.assign(fixture.tasks.find(t=>t.id===4),{day:'friday',text:'Subprocessadores fictício',workflowStatus:'in_progress',subtasks:[{id:401,text:'Etapa concluída',completed:true},{id:402,text:'Etapa pendente',completed:false}]});
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
let proposal={id:proposalId,grantId:'browser-review-grant-001',grantVersion:1,version:1,kind:'mission.create',status:'pending',createdAt:'2026-10-19T12:00:00.000Z',expiresAt:'2026-12-01T12:00:00.000Z',reviewedAt:null,basis:null,conflictCheck:'unverified',applyEligible:true,fields:{title:'Proposta para editar',weekStart:'2026-10-19',day:'monday',category:'life',durationMinutes:30,startTime:'09:00',endTime:'09:30',subtasks:['Conferir']}};
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
await context.route('**/*',async route=>{
 const url=route.request().url();if(url.startsWith(origin+'/'))return route.continue();
 const module=Object.keys(modules).find(name=>url.includes('gstatic.com/firebasejs/')&&url.endsWith('/'+name));
 if(module)return route.fulfill({contentType:'text/javascript',body:modules[module]});
 if(url.includes('unpkg.com/lucide'))return route.fulfill({contentType:'text/javascript',body:'window.lucide={createIcons(){}};'});
 if(url.includes('cdn.tailwindcss.com'))return route.fulfill({contentType:'text/javascript',body:'const style=document.createElement("style");style.textContent='+JSON.stringify(css)+';document.head.append(style);'});
 if(url.includes('accounts.google.com/gsi/client'))return route.fulfill({contentType:'text/javascript',body:''});
 if(url.includes('/v2/app/proposals')){
  aiRequests.push(activeAccount);const request=route.request(),path=new URL(url).pathname;let result;
  if(request.method()==='GET')result={schemaVersion:2,items:proposal.status===(new URL(url).searchParams.get('status')||'pending')?[proposal]:[],nextCursor:null};
  else if(path.endsWith('/reserve')){const body=request.postDataJSON();const fields=v2ProposalRequest({idempotencyKey:'browser-edited-fields',kind:proposal.kind,fields:body.fields},proposal).fields;proposalEdits.push(fields);proposal={...proposal,status:'applying',fields,applicationId:body.applicationId,version:proposal.version+1};result={schemaVersion:2,proposal};}
  else if(path.endsWith('/acknowledge')){proposal={...proposal,status:'accepted',reviewedAt:'2026-10-19T12:30:00.000Z'};result={schemaVersion:2,proposal};}
  if(result)return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
 }
 if(url.includes('/v2/')){aiRequests.push(activeAccount);return route.fulfill({status:403,contentType:'application/json',body:'{"error":"isolated test"}'});}
 external.push(url);return route.abort();
});
const login=async uid=>{activeAccount=uid;await page.evaluate(async uid=>window.__auth({uid,email:uid+'@example.test',displayName:'Fictício',getIdToken:async()=>'synthetic-id-token'}),uid);};

const cloud=async()=>page.evaluate(uid=>JSON.parse(window.__rows[`users/${uid}/state/main`].data),owner);

await page.clock.setFixedTime(new Date('2026-11-08T23:00:00Z'));
try{
 await page.goto(origin+'/app.html');await page.waitForFunction(()=>!!window.__auth);await login(owner);await page.evaluate(()=>window.saveStateNow(true));const initial=await cloud();
 const dialog=page.locator('#create-task-dialog'),date=page.locator('#ct-date'),hint=page.locator('#ct-date-hint');
 const open=async()=>{await page.getByRole('button',{name:'Nova missão',exact:true}).click();await dialog.waitFor();};
 const create=async(text,choice)=>{await open();await page.locator('#ct-text').fill(text);await date.fill(choice);await dialog.getByRole('button',{name:'Criar missão',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('create-task-dialog'));await page.evaluate(()=>window.saveStateNow(true));return (await cloud()).tasks.find(t=>t.text===text);};
 await open();assert.equal(await date.inputValue(),'2026-11-08');await date.fill('2026-11-10');assert.match(await hint.innerText(),/10\/11\/2026/);
 if(cssPath){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.screenshot({path:root+'/../create-dates-desktop.png'});}
 await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();assert.deepEqual((await cloud()).tasks,initial.tasks);
 const current=await create('Segunda da semana aberta','2026-11-02');assert.equal(current.day,'monday');assert.equal(current.planningWeekStart,'2026-11-02');
 await page.setViewportSize({width:390,height:844});await open();await page.locator('#ct-text').fill('Segunda da semana seguinte');await date.fill('2026-11-09');assert.match(await hint.innerText(),/09\/11\/2026/);
 if(cssPath){const fieldBox=await date.boundingBox(),modalBox=await dialog.boundingBox(),submitBox=await dialog.getByRole('button',{name:'Criar missão',exact:true}).boundingBox();assert.ok(fieldBox.width>300);assert.ok(modalBox.x>=0&&modalBox.x+modalBox.width<=390);assert.ok(submitBox.y+submitBox.height<=844);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.screenshot({path:root+'/../create-dates-mobile.png'});}
 await dialog.getByRole('button',{name:'Criar missão',exact:true}).tap();await page.waitForFunction(()=>!document.getElementById('create-task-dialog'));await page.evaluate(()=>window.saveStateNow(true));let saved=await cloud(),next=saved.tasks.find(t=>t.text==='Segunda da semana seguinte');assert.equal(next.day,'monday');assert.equal(next.planningWeekStart,'2026-11-09');
 // Recurrence still uses the selected week and its marked days.
 await open();await page.locator('#ct-text').fill('Repetição na próxima semana');await date.fill('2026-11-09');await dialog.locator('[data-create-section="recurrence"] > summary').click();await page.locator('#ct-repeat-monday').check();await page.locator('#ct-repeat-wednesday').check();await dialog.getByRole('button',{name:'Criar missão',exact:true}).tap();await page.waitForFunction(()=>!document.getElementById('create-task-dialog'));await page.evaluate(()=>window.saveStateNow(true));saved=await cloud();const recurring=saved.tasks.filter(t=>t.text==='Repetição na próxima semana');assert.deepEqual(recurring.map(t=>t.day).sort(),['monday','wednesday']);assert.ok(recurring.every(t=>t.planningWeekStart==='2026-11-09'));
 // An inbox event from another week keeps the exact event date and remains locked.
 await page.evaluate(()=>{window.__dateInbox=[{id:'synthetic-calendar-event',summary:'Reunião futura fictícia',weekStart:'2026-11-16',day:'wednesday',eventDate:'2026-11-18',activityType:'meeting',duration:30,startTime:'10:00',endTime:'10:30',status:'pending',originType:'primary'}];});
 // Test the public renderer directly without authenticating to Google or converting a real event.
 const calendarMarkup=await page.evaluate(()=>window.renderCreateTaskModal(window.__dateInbox[0]));assert.match(calendarMarkup,/value="2026-11-18"[^>]*disabled/);
 await page.evaluate(()=>sessionStorage.setItem('test-cloud-rows',JSON.stringify(window.__rows)));await page.reload();await page.waitForFunction(()=>!!window.__auth);await login(owner);saved=await cloud();assert.equal(saved.tasks.filter(t=>t.text==='Segunda da semana seguinte').length,1);assert.equal(saved.tasks.find(t=>t.text==='Segunda da semana seguinte').planningWeekStart,'2026-11-09');for(const old of initial.tasks)assert.deepEqual(saved.tasks.find(t=>String(t.id)===String(old.id)),old);for(const key of ['combo','xp','coins','studyData','operationalControl','taskDeletionLog'])assert.deepEqual(saved[key],initial[key]);
 await page.clock.setFixedTime(new Date('2026-11-09T12:00:00Z'));await page.evaluate(()=>{window.setPlanningCalendarWeek('forward');window.setTab('monday');});await open();assert.equal(await date.inputValue(),'2026-11-09');await dialog.getByRole('button',{name:'Cancelar',exact:true}).tap();
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('Create date browser passed: Sunday 08/11, explicit 02/11 vs 09/11, final draft after redraw, exact persisted weeks, desktop and 390px, recurrence, future Calendar label/lock, reload and next-week view, existing records and rewards preserved. Every external service mocked.');
}catch(error){console.error({browserErrors:errors,unexpectedExternal:external});await page.screenshot({path:root+'/../create-dates-failure.png'});throw error;}finally{await browser.close();await new Promise(r=>server.close(r));}
