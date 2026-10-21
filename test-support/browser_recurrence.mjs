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
const fixture=plain(boot().state);fixture.ownerUid=owner;fixture.userProfile={displayName:'Proprietário fictício',gender:'neutro',configured:true};fixture.aiAppliedProposals={fixtureProof:1};fixture.tasks=[{id:1,text:'Missão exclusiva do proprietário',day:'monday',category:'life',completed:false,time:'30 min',subtasks:[]}];

fixture.currentPlanningWeekStart='2026-10-19';fixture.planning.legacyWeek='2026-10-19';
fixture.operationalControl.demands=[
{id:'clienteAguardando',title:'Cliente Exemplo · teste',workflowStatus:'waiting',waitingFor:'Cliente responsável',followUpAt:'2026-10-21',nextReviewAt:'2026-10-22',dueDate:'2026-10-23',nextAction:'Aguardar versão revisada do RIPD'},
{id:'fornecedores',title:'Homologação Empresa Exemplo · teste',workflowStatus:'active',dueDate:'2026-10-22',nextAction:'Analisar fornecedores'},
{id:'backlog',title:'Futuro · teste',workflowStatus:'backlog',nextReviewAt:'2026-10-24'},
{id:'sem-acao',title:'Frente sem ação · teste',workflowStatus:'active'}];
fixture.tasks[0].planningWeekStart='2026-10-19';fixture.tasks[0].missionNature='neutral';fixture.tasks[0].xp=0;fixture.tasks[0].energyCost=0;
for(const [index,text]of ['Fornecedor A análise','Fornecedor B análise','Fornecedor C análise'].entries())fixture.tasks.push({id:index+2,text,planningWeekStart:'2026-10-19',day:['monday','tuesday','wednesday'][index],radarDemandId:index===0?'fornecedores':null,category:'work',completed:false,time:'30 min',activityType:'task',missionNature:'neutral',xp:0,energyCost:0,priority:'media',complexity:2,subtasks:[{id:100+index,text:'Passo preservado',completed:true,customFlag:'keep'}],dependsOnTaskIds:[]});
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
 assert.equal(await page.evaluate(()=>window.saveStateNow(true)),true);
 const original=await cloud();
 const create=async(title,days,end='')=>{
  await page.getByRole('button',{name:'Nova missão',exact:true}).click();await page.locator('#ct-text').fill(title);
  await page.locator('#create-task-dialog details[data-create-section="recurrence"] > summary').click();
  for(const day of days)await page.locator('#ct-repeat-'+day).check();
  if(end){await page.locator('#ct-repeat-end-mode').selectOption('date');await page.locator('#ct-repeat-end-date').fill(end);}
  await page.locator('#create-task-dialog button[type="submit"]').click();assert.equal(await page.evaluate(()=>window.saveStateNow(true)),true);
 };
 await create('Repetição com término',['monday','wednesday','friday'],'2026-10-20');
 let saved=await cloud();let finite=saved.tasks.filter(t=>t.text==='Repetição com término');assert.equal(finite.length,1);assert.equal(finite[0].day,'monday');assert.equal(saved.planning.recurrenceRules[finite[0].recurrenceGroupId].endDate,'2026-10-20');
 await create('Rotina sem data final',['monday','wednesday','friday']);
 saved=await cloud();let series=saved.tasks.filter(t=>t.text==='Rotina sem data final');assert.equal(series.length,3);const group=series[0].recurrenceGroupId,edited=series.find(t=>t.day==='wednesday'),past=series.find(t=>t.day==='monday');
 await page.evaluate(id=>window.openEditTaskModal(id),edited.id);await page.locator('#et-text').fill('Rotina revisada');
 await page.locator('#et-repeat-end-mode').selectOption('date');await page.locator('#et-repeat-end-date').fill('2026-10-01');await page.locator('#edit-task-dialog button[type="submit"]').click();
 assert.match(await page.locator('#alert-dialog').textContent(),/data final/);await page.locator('#alert-close').click();assert.equal((await cloud()).tasks.find(t=>t.id===edited.id).text,edited.text);
 await page.locator('#et-repeat-end-date').fill('2026-11-10');
 if(cssPath){await page.waitForTimeout(450);await page.screenshot({path:root+'/../recurrence-desktop-edit.png',fullPage:false});}
 await page.locator('#edit-task-dialog button[type="submit"]').click();assert.equal(await page.evaluate(()=>window.saveStateNow(true)),true);
 saved=await cloud();assert.deepEqual(saved.tasks.find(t=>t.id===past.id),past);assert.equal(saved.tasks.find(t=>t.id===edited.id).text,'Rotina revisada');assert.equal(saved.tasks.filter(t=>t.recurrenceGroupId===group).length,3);
 // Cancelling the confirmation makes no change, and confirming keeps the parent editor open.
 await page.evaluate(id=>window.openEditTaskModal(id),edited.id);await page.getByRole('button',{name:'Encerrar repetição…',exact:true}).click();await page.locator('#confirmation-cancel').click();assert.equal(await page.locator('#edit-task-dialog').count(),1);assert.equal((await cloud()).planning.recurrenceRules[group].stoppedAt,undefined);
 await page.getByRole('button',{name:'Encerrar repetição…',exact:true}).click();await page.locator('#confirmation-accept').click();assert.equal(await page.locator('#edit-task-dialog').count(),1);assert.equal(await page.evaluate(()=>window.saveStateNow(true)),true);
 saved=await cloud();assert.equal(saved.planning.recurrenceRules[group].stoppedAfter,'2026-10-21');assert.equal(saved.tasks.find(t=>t.recurrenceGroupId===group&&t.day==='friday').recurrenceCancelled,'stopped');assert.equal(saved.tasks.find(t=>t.id===edited.id).recurrenceCancelled,undefined);assert.deepEqual(saved.operationalControl,original.operationalControl);assert.equal(saved.xp,original.xp);assert.equal(saved.combo,original.combo);assert.deepEqual(saved.aiAppliedProposals,original.aiAppliedProposals);
 await page.evaluate(()=>window.closeEditTaskModal());
 // Reopening cannot resurrect the cancelled Friday or lose the rules/profile.
 await page.evaluate(()=>sessionStorage.setItem('test-cloud-rows',JSON.stringify(window.__rows)));await page.reload();await page.waitForFunction(()=>!!window.__auth);await login(owner);
 saved=await cloud();assert.equal(saved.tasks.filter(t=>t.recurrenceGroupId===group).length,3);assert.ok(saved.tasks.find(t=>t.recurrenceGroupId===group&&t.day==='friday').recurrenceCancelled);assert.deepEqual(saved.userProfile,original.userProfile);
 // Closing the week respects both the inclusive deadline and the stopped rule.
 await page.evaluate(()=>window.prepareNextWeekPlanning());await page.locator('#confirmation-accept').click();assert.equal(await page.evaluate(()=>window.saveStateNow(true)),true);saved=await cloud();assert.equal(saved.currentPlanningWeekStart,'2026-10-26');assert.equal(saved.tasks.filter(t=>[group,finite[0].recurrenceGroupId].includes(t.recurrenceGroupId)).length,0);assert.ok(saved.planning.history.some(w=>w.week==='2026-10-19'&&w.tasks.some(t=>t.recurrenceCancelled)));
 const ownerAfter=structuredClone(saved);
 // The member account can use the feature, using touch controls at phone width.
 await page.evaluate(({sara,template})=>{template.ownerUid=sara;template.tasks=[];template.planning.recurrenceRules={};template.planning.history=[];template.currentPlanningWeekStart='2026-10-19';template.planning.legacyWeek='2026-10-19';template.userProfile={configured:true,displayName:'Pessoa fictícia',gender:'feminino'};window.__rows[`users/${sara}/state/main`]={data:JSON.stringify(template),updatedAt:'2026-10-21T12:00:00Z',revision:1};},{sara,template:original});
 await login(sara);await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Nova missão',exact:true}).tap();await page.locator('#ct-text').fill('Rotina da conta independente');await page.locator('#create-task-dialog details[data-create-section="recurrence"] > summary').tap();await page.locator('#ct-repeat-friday').check();await page.locator('#ct-repeat-end-mode').selectOption('date');await page.locator('#ct-repeat-end-date').fill('2026-11-10');
 if(cssPath){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.screenshot({path:root+'/../recurrence-mobile-create.png',fullPage:false});}
 await page.locator('#create-task-dialog button[type="submit"]').tap();assert.equal(await page.evaluate(()=>window.saveStateNow(true)),true);
 const member=await page.evaluate(uid=>JSON.parse(window.__rows[`users/${uid}/state/main`].data),sara);assert.equal(member.tasks.length,1);assert.equal(Object.values(member.planning.recurrenceRules)[0].endDate,'2026-11-10');assert.deepEqual(await cloud(),ownerAfter);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('Recurrence browser passed: actual forms, deadline validation, weekly cutoff, future edit and past preservation, cancel/confirm with editor open, no reward/RADAR changes, reload, week rollover, independent member and 390px touch controls. All services mocked.');
}catch(error){console.error({browserErrors:errors,unexpectedExternal:external});throw error;}finally{await browser.close();await new Promise(r=>server.close(r));}
