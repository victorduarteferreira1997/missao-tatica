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
const context=await browser.newContext({viewport:{width:1280,height:900},hasTouch:true}),page=await context.newPage(),errors=[],external=[],aiRequests=[];
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
 await page.evaluate(()=>window.setMainView('week'));
 const clienteAguardando=page.locator('[data-radar-week-id="clienteAguardando"]');assert.equal(await clienteAguardando.count(),1);assert.match(await clienteAguardando.textContent(),/Aguardando/);assert.match(await clienteAguardando.textContent(),/21\/10\/2026/);
 assert.equal(await page.locator('[data-radar-week-id="sem-acao"]').count(),1);assert.equal(await page.locator('[data-radar-week-id="backlog"]').count(),1);
 await clienteAguardando.locator('summary').click();await clienteAguardando.getByRole('button',{name:'Criar missão',exact:true}).click();
 assert.equal(await page.locator('#ct-radar').inputValue(),'clienteAguardando');await page.locator('#ct-text').fill('Validar três ajustes e reassinar RIPD');await page.locator('#ct-day').selectOption('wednesday');
 await page.locator('#create-task-dialog details[data-create-section="subtasks"] summary').click();await page.getByRole('button',{name:'Organizar subtarefas',exact:true}).last().click();
 await page.getByRole('button',{name:'Inserir no início',exact:true}).click();await page.locator('#subtask-draft-0').fill('Validar ajustes');await page.locator('[data-subtask-index="0"]').getByRole('checkbox').check();
 await page.locator('[data-subtask-index="0"]').getByRole('button',{name:'Inserir abaixo',exact:true}).click();await page.locator('#subtask-draft-1').fill('Reassinar');await page.getByRole('button',{name:'Salvar subtarefas',exact:true}).click();
 await page.locator('#ct-subtasks').fill('Validar ajustes revisados\nReassinar');
 await page.locator('#create-task-dialog button[type="submit"]').click();assert.equal(await page.evaluate(()=>window.saveStateNow(true)),true);
 let saved=await cloud();const created=saved.tasks.find(t=>t.text==='Validar três ajustes e reassinar RIPD');assert.ok(created);assert.equal(created.radarDemandId,'clienteAguardando');assert.deepEqual(created.dependsOnTaskIds,[]);assert.equal(created.subtasks[0].completed,true);assert.equal(saved.operationalControl.demands.find(d=>d.id==='clienteAguardando').workflowStatus,'waiting');
 const suppliers=page.locator('[data-radar-week-id="fornecedores"]');await suppliers.locator('summary').click();await suppliers.getByRole('button',{name:'Vincular missão existente',exact:true}).click();
 for(const title of ['Fornecedor B análise','Fornecedor C análise']){await page.locator('#radar-link-dialog article').filter({hasText:title}).getByRole('button',{name:'Vincular missão',exact:true}).click();assert.equal(await page.locator('#radar-link-dialog').count(),1);}
 await page.locator('#radar-link-close').click();assert.equal(await page.evaluate(()=>window.saveStateNow(true)),true);saved=await cloud();assert.equal(saved.tasks.filter(t=>t.radarDemandId==='fornecedores').length,3);
 await suppliers.getByRole('button',{name:'Remover vínculo',exact:true}).nth(1).click();await page.locator('#confirmation-cancel').click();assert.equal((await cloud()).tasks.find(t=>t.id===3).radarDemandId,'fornecedores');
 await suppliers.getByRole('button',{name:'Remover vínculo',exact:true}).nth(1).click();await page.locator('#confirmation-accept').click();assert.equal(await page.evaluate(()=>window.saveStateNow(true)),true);assert.equal((await cloud()).tasks.find(t=>t.id===3).radarDemandId,null);
 // Existing task edit keeps unrelated fields while the nested subtask editor works.
 await page.evaluate(id=>window.openEditTaskModal(id),created.id);await page.locator('#et-text').fill('Rascunho não salvo do título');await page.locator('#edit-task-dialog details[data-edit-section="subtasks"] summary').click();await page.locator('#edit-task-dialog').getByRole('button',{name:'Editar e ordenar subtarefas',exact:true}).click();
 await page.locator('#subtask-draft-0').fill('Validar os três ajustes');await page.locator('[data-subtask-index="0"]').getByRole('button',{name:'Inserir abaixo',exact:true}).click();await page.locator('#subtask-draft-1').fill('Conferir versão');
 await page.locator('[data-subtask-index="2"] button[draggable]').dragTo(page.locator('[data-subtask-index="0"]'));
 assert.equal(await page.locator('#subtask-draft-0').inputValue(),'Reassinar');await page.getByRole('button',{name:'Mover subtarefa 1 para baixo',exact:true}).click();assert.equal(await page.locator('#subtask-draft-0').inputValue(),'Validar os três ajustes');
 if(cssPath)await page.screenshot({path:root+'/../radar-desktop-subtasks.png',fullPage:false});
 await page.getByRole('button',{name:'Salvar subtarefas',exact:true}).click();assert.equal(await page.locator('#et-text').inputValue(),'Rascunho não salvo do título');await page.evaluate(()=>window.closeEditTaskModal());assert.equal(await page.evaluate(()=>window.saveStateNow(true)),true);
 saved=await cloud();let updated=saved.tasks.find(t=>t.id===created.id);assert.deepEqual(updated.subtasks.map(s=>s.text),['Validar os três ajustes','Reassinar','Conferir versão']);assert.equal(updated.subtasks[0].id,created.subtasks[0].id);assert.equal(updated.subtasks[0].completed,true);assert.equal(updated.text,created.text);
 // Dependencies remain distinct from the RADAR relation and reject circular edits.
 await page.evaluate(()=>window.openEditTaskModal(2));await page.locator('#edit-task-dialog details[data-view-key="et-dependencies"] summary').click();await page.locator('#et-dependency-1').check();await page.locator('#edit-task-dialog button[type="submit"]').click();assert.equal(await page.evaluate(()=>window.saveStateNow(true)),true);
 await page.evaluate(()=>window.openEditTaskModal(1));await page.locator('#edit-task-dialog details[data-edit-section="relations"] > summary').click();await page.locator('#edit-task-dialog details[data-view-key="et-dependencies"] summary').click();await page.locator('#et-dependency-2').check();await page.locator('#edit-task-dialog button[type="submit"]').click();assert.match(await page.locator('#alert-dialog').textContent(),/ciclo/);await page.locator('#alert-close').click();await page.evaluate(()=>window.closeEditTaskModal());
 await page.evaluate(()=>window.toggleTask(2));assert.match(await page.locator('#alert-dialog').textContent(),/pré-requisitos/);await page.locator('#alert-close').click();await page.evaluate(()=>window.toggleTask(1));await page.evaluate(()=>window.toggleTask(2));assert.equal(await page.locator('#radar-next-dialog').count(),1);
 await page.getByRole('button',{name:'Colocar RADAR em Aguardando',exact:true}).click();assert.equal(await page.locator('#op-demand-status').inputValue(),'waiting');assert.equal((await cloud()).operationalControl.demands.find(d=>d.id==='fornecedores').workflowStatus,'active');await page.evaluate(()=>window.closeOperationalDemandModal());
 // Proposal date is explicit both before and during review, and changes with weekday.
 await page.evaluate(()=>window.openAiV2Proposals());await page.getByRole('button',{name:'Revisar e cadastrar',exact:true}).click();assert.match(await page.locator('#ai-v2-proposals-dialog').textContent(),/Destino: Missões/);await page.locator('#ai-v2-review-day').selectOption('wednesday');assert.match(await page.locator('#ai-v2-review-date').textContent(),/Quarta-feira, 21\/10\/2026/);await page.getByRole('button',{name:'Voltar à fila',exact:true}).click();await page.locator('#ai-v2-proposals-close').click();
 // True reload, keeping only the mock cloud state; no mission or campaign duplication.
 assert.equal(await page.evaluate(()=>window.saveStateNow(true)),true);const beforeReload=await cloud();await page.evaluate(()=>sessionStorage.setItem('test-cloud-rows',JSON.stringify(window.__rows)));await page.reload();await page.waitForFunction(()=>!!window.__auth);await login(owner);const after=await cloud();assert.equal(after.tasks.length,beforeReload.tasks.length);assert.deepEqual(after.tasks.find(t=>t.id===created.id).subtasks,beforeReload.tasks.find(t=>t.id===created.id).subtasks);assert.deepEqual(after.prestige,beforeReload.prestige);assert.deepEqual(after.userProfile,beforeReload.userProfile);
 // Mobile viewport: linked actions, editing and arrow controls remain usable without horizontal overflow.
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.setMainView('week'));assert.equal(await page.locator('[data-radar-week-id="clienteAguardando"]').count(),1);
 if(cssPath){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.screenshot({path:root+'/../radar-mobile-week.png',fullPage:true});}
 await page.evaluate(id=>window.openSubtaskEditor(id),created.id);await page.getByRole('button',{name:'Mover subtarefa 2 para cima',exact:true}).tap();assert.equal(await page.locator('#subtask-draft-0').inputValue(),'Reassinar');if(cssPath){assert.equal(await page.evaluate(()=>document.getElementById('subtask-editor-dialog').getBoundingClientRect().width<=innerWidth),true);await page.screenshot({path:root+'/../radar-mobile-subtasks.png',fullPage:false});}
 await page.getByRole('button',{name:'Salvar subtarefas',exact:true}).tap();assert.equal(await page.evaluate(()=>window.saveStateNow(true)),true);assert.equal((await cloud()).tasks.find(t=>t.id===created.id).subtasks[1].completed,true);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('RADAR browser: desktop and 390px mobile; weekly follow-ups without missions, deduplication, linked creation, multiple links, unlink/cancel, nested subtask edits, insert/drag/arrows/completion, cycle rejection, dependency unlock, opt-in next actions, proposal destination/date and real reload persistence passed. All external data/services mocked. CSS:',cssPath?'compiled Tailwind 3.4.17':'minimal fallback');
}catch(error){console.error({browserErrors:errors,unexpectedExternal:external});throw error;}finally{await browser.close();await new Promise(r=>server.close(r));}
