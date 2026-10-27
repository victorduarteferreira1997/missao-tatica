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
const fixture=plain(boot().state);fixture.ownerUid=owner;fixture.userProfile={displayName:'Pessoa fictícia',gender:'neutro',configured:true};fixture.currentPlanningWeekStart='2026-10-19';fixture.planning.legacyWeek='2026-10-19';fixture.activeTab='monday';fixture.currentFilter='all';
fixture.operationalControl.demands=[{id:'radar',title:'Frente de teste',workflowStatus:'active',nextAction:'Revisar entrega'}];
const task=(id,text,extra={})=>({id,text,day:'monday',planningWeekStart:'2026-10-19',order:id,category:'work',time:'30 min',priority:'media',completed:false,missionNature:'neutral',xp:0,energyCost:0,subtasks:[],...extra});
fixture.tasks=[task(1,'Primeira missão',{missionNature:'normal',xp:10,energyCost:5}),task(2,'Já concluída',{completed:true}),task(3,'Próxima missão',{subtasks:[{id:31,text:'Etapa preservada',completed:true}]}),task(4,'Outra categoria',{category:'life'}),task(5,'Reunião não realizada',{activityType:'meeting',meetingOutcome:'not_held'}),task(6,'Missão do RADAR',{day:'tuesday',radarDemandId:'radar'}),task(7,'Rotina de segunda',{isRecurring:true,recurrenceGroupId:'routine',recurrenceDays:['monday','friday']}),task(8,'Rotina de sexta',{day:'friday',isRecurring:true,recurrenceGroupId:'routine',recurrenceDays:['monday','friday']}),task(9,'Dependente',{day:'tuesday',dependsOnTaskIds:['6']})];
fixture.combo=7;fixture.xp=320;fixture.coins=52;fixture.tasks[0].radarDemandId='radar';fixture.tasks.find(t=>t.id===9).day='monday';fixture.tasks.find(t=>t.id===9).dependsOnTaskIds=['1'];fixture.taskDeletionLog=[{id:'historical-log',reason:'cancelada',preserveCombo:false,comboBefore:4}];
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
try{
 await page.goto(origin+'/app.html');await page.waitForFunction(()=>!!window.__auth);await login(owner);
 assert.equal(await page.evaluate(()=>window.saveStateNow(true)),true);const initial=await cloud();
 const open=async id=>page.evaluate(id=>window.deleteMainTask(id),id);
 await open(1);const dialog=page.locator('#delete-mission-dialog');
 assert.equal(await page.evaluate(()=>document.activeElement.id),'delete-mission-cancel');
 assert.match(await dialog.innerText(),/Frenesi será preservado/);assert.match(await dialog.innerText(),/Dependente/);assert.match(await dialog.innerText(),/status do RADAR/);
 assert.equal(await dialog.getByRole('button').count(),2);await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);assert.deepEqual((await cloud()).tasks,initial.tasks);
 await open(1);await page.locator('#delete-mission-cancel').click();assert.equal(await dialog.count(),0);
 await open(1);if(cssPath){await page.waitForTimeout(450);await page.screenshot({path:root+'/../planning-deletion-desktop.png',fullPage:false});}
 await page.locator('#delete-mission-confirm').click();await page.waitForFunction(()=>!document.getElementById('delete-mission-dialog'));
 let saved=await cloud();assert.equal(saved.combo,initial.combo);assert.equal(saved.xp,initial.xp);assert.equal(saved.coins,initial.coins);assert.equal(saved.energy,initial.energy);assert.equal(saved.tasks.some(t=>t.id===1),false);assert.equal(saved.tasks.length,initial.tasks.length-1);assert.deepEqual(saved.operationalControl,initial.operationalControl);assert.deepEqual(saved.tasks.find(t=>t.id===9).dependsOnTaskIds,['1']);assert.deepEqual(saved.taskDeletionLog[0],initial.taskDeletionLog[0]);assert.equal(saved.taskDeletionLog.at(-1).preserveCombo,true);assert.equal(saved.taskDeletionLog.length,initial.taskDeletionLog.length+1);
 await page.evaluate(()=>window.setMissionStatus(9,'in_progress'));assert.equal(await page.locator('#alert-dialog').isVisible(),true);await page.locator('#alert-close').click();
 // Use the actual mission menu to move a day, then the actual next-week option.
 await page.locator('[data-daily-mission-row="4"] details[data-mission-menu] > summary').click();await page.locator('[data-daily-mission-row="4"]').getByRole('button',{name:'Reagendar…',exact:true}).click();await page.locator('#reschedule-date').fill('2026-10-20');await page.locator('#mission-reschedule-dialog').getByRole('button',{name:'Salvar',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('mission-reschedule-dialog'));
 assert.equal(await page.evaluate(()=>window.saveStateNow(true)),true);saved=await cloud();assert.equal(saved.combo,initial.combo);assert.equal(saved.tasks.find(t=>t.id===4).day,'tuesday');assert.ok(saved.xp>=initial.xp);
 await page.evaluate(()=>window.setTab('tuesday'));await page.locator('[data-daily-mission-row="4"] details[data-mission-menu] > summary').click();await page.locator('[data-daily-mission-row="4"]').getByRole('button',{name:'Reagendar…',exact:true}).click();await page.locator('#reschedule-date').fill('2026-10-27');await page.locator('#mission-reschedule-dialog').getByRole('button',{name:'Salvar',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('mission-reschedule-dialog'));
 assert.equal(await page.evaluate(()=>window.saveStateNow(true)),true);saved=await cloud();assert.equal(saved.tasks.find(t=>t.id===4).day,'tuesday');assert.equal(saved.tasks.find(t=>t.id===4).planningWeekStart,'2026-10-26');assert.equal(saved.combo,initial.combo);
 const afterReplan=structuredClone(saved);
 // Completed missions can be removed without reducing or awarding completion rewards.
 await page.evaluate(()=>window.setTab('monday'));await page.locator('#daily-completed-toggle').click();await open(2);assert.match(await dialog.innerText(),/recompensas já registradas/);await page.locator('#delete-mission-confirm').click();await page.waitForFunction(()=>!document.getElementById('delete-mission-dialog'));
 saved=await cloud();assert.equal(saved.xp,afterReplan.xp);assert.equal(saved.coins,afterReplan.coins);assert.equal(saved.combo,initial.combo);
 // On a phone the same simple confirmation warns about the recurring weekday.
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.setTab('friday'));await open(8);assert.match(await dialog.innerText(),/próximas repetições/);assert.match(await dialog.innerText(),/Sexta/);
 if(cssPath){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.waitForTimeout(450);await page.screenshot({path:root+'/../planning-deletion-mobile.png',fullPage:false});}
 await page.locator('#delete-mission-confirm').tap();await page.waitForFunction(()=>!document.getElementById('delete-mission-dialog'));saved=await cloud();assert.equal(saved.tasks.some(t=>t.id===8),false);assert.equal(saved.tasks.some(t=>t.id===7),true);assert.equal(saved.combo,initial.combo);assert.deepEqual(saved.tasks.find(t=>t.id===7).recurrenceDays,['monday']);
 await page.evaluate(()=>sessionStorage.setItem('test-cloud-rows',JSON.stringify(window.__rows)));await page.reload();await page.waitForFunction(()=>!!window.__auth);await login(owner);saved=await cloud();assert.equal(saved.combo,initial.combo);assert.equal(saved.tasks.some(t=>[1,2,8].includes(t.id)),false);assert.equal(saved.tasks.find(t=>t.id===4).planningWeekStart,'2026-10-26');
 await page.evaluate(()=>window.setPlanningCalendarWeek('forward'));await page.evaluate(()=>window.setTab('tuesday'));assert.equal(await page.getByText('Outra categoria',{exact:true}).isVisible(),true);
 assert.equal(saved.tasks.length,initial.tasks.length-3);assert.equal(new Set(saved.tasks.map(t=>t.id)).size,saved.tasks.length);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log('Mission maintenance browser passed: simple accessible confirmation, Escape/cancel, no combo/XP/coin deletion penalty, RADAR and dangling dependencies preserved, completed deletion, actual move/day and next-week menus, recurring weekday warning, touch at 390px and reload persistence. All services mocked.');
}catch(error){console.error({browserErrors:errors,unexpectedExternal:external});throw error;}finally{await browser.close();await new Promise(r=>server.close(r));}
