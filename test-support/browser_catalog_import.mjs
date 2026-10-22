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
import {v2ProposalRequest} from '../ai/v2/proposals.js';
const require=createRequire(new URL('../security-tests/package.json',import.meta.url));
const {chromium}=require('playwright');
const root=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,''),sara='fictional-sara';
const fixture=plain(boot().state);fixture.ownerUid=owner;fixture.userProfile={displayName:'Pessoa fictícia',gender:'neutro',configured:true};fixture.currentPlanningWeekStart='2026-10-19';fixture.planning.legacyWeek='2026-10-19';fixture.activeTab='monday';fixture.currentFilter='all';
fixture.operationalControl.demands=[{id:'radar',title:'Frente de teste',workflowStatus:'active',nextAction:'Revisar entrega'}];
const task=(id,text,extra={})=>({id,text,day:'monday',planningWeekStart:'2026-10-19',order:id,category:'work',time:'30 min',priority:'media',completed:false,missionNature:'neutral',xp:0,energyCost:0,subtasks:[],...extra});
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
const catalogSql=new DatabaseSync(':memory:');
for(const file of ['schema.sql','oauth-schema.sql','v2-schema.sql','proposals-v2-schema.sql','apply-v2-schema.sql','entities-v2-schema.sql','library-import-schema.sql'])catalogSql.exec(await readFile(root+'/ai/cloudflare/'+file,'utf8'));
const catalogDb={prepare(q){return {bind(...a){return {first:async()=>catalogSql.prepare(q).get(...a)||null,all:async()=>({success:true,results:catalogSql.prepare(q).all(...a)}),run:async()=>({success:true,meta:{changes:Number(catalogSql.prepare(q).run(...a).changes)}})}}}}};
const catalogEnv={DB:catalogDb,ACTION_SECRET:'synthetic-catalog-browser-secret-12345678',AI_V2_ENABLED:'true',AI_V2_READ_ENABLED:'true',AI_V2_PROPOSALS_ENABLED:'true',AI_V2_APPLY_ENABLED:'true',AI_LIBRARY_IMPORT_ENABLED:'true'};
const catalogWorker=createWorker({now:()=>Date.parse('2026-10-22T15:00:00Z'),verifyOwner:async request=>{assert.equal(request.headers.get('Authorization'),'Bearer synthetic-id-token');}});
const workerCall=(path,body,token='synthetic-id-token',method='POST')=>catalogWorker.fetch(new Request('https://bridge.example'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Origin:path.startsWith('/v2/app/')?APP_ORIGIN:'https://missao-tatica-conexao.victorduarteferreira.chatgpt.site'},...(body?{body:JSON.stringify(body)}:{})}),catalogEnv);
await workerCall('/v2/app/grant',{grantId:'catalog-browser-grant',expectedVersion:0,choices:{modules:{missions:false,radar:false,studies:false},includeFuture:false,allowLibraryProposals:true},frozenRefs:[]},undefined,'PUT');
const tokenReply=await (await catalogWorker.fetch(new Request('https://bridge.example/v2/connection',{method:'POST',headers:{Authorization:'Bearer '+catalogEnv.ACTION_SECRET,'Content-Type':'application/json'},body:JSON.stringify({subject:'a'.repeat(64),expectedGrantId:'catalog-browser-grant',expectedGrantVersion:1,requestedScope:'proposals:create'})}),catalogEnv)).json();
const catalogBook=(sourceKey,title,format='physical')=>({sourceKey,title,authors:'Autoria fictícia',category:'História',editions:[{format,pageCount:200,owned:true}]});
for(const [partIndex,books] of [[1,[catalogBook('row-1','Já na estante'),catalogBook('row-2','Novo livro'),catalogBook('row-3','Formato para revisar','')]],[2,[catalogBook('row-4','Último livro'),catalogBook('row-5','Título final <teste>')]]]){
 const result=await workerCall('/v2/planning',{name:'submitLibraryCatalog',arguments:{idempotencyKey:'catalog-browser-part-'+partIndex,fields:{title:'Catálogo fictício',batchKey:'browser-catalog-batch',partIndex,partCount:2,books}}},tokenReply.accessToken);assert.equal(result.status,200);
}
let loseAck=true;
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
 if(url.includes('/v2/app/library-imports')||url.includes('/v2/app/grant')){
  const req=route.request();if(url.endsWith('/acknowledge')&&loseAck){loseAck=false;return route.fulfill({status:503,contentType:'application/json',body:'{"error":"synthetic-lost-ack"}'});}
  const response=await catalogWorker.fetch(new Request(url,{method:req.method(),headers:Object.fromEntries([...Object.entries(req.headers()).filter(([key])=>key.toLowerCase()!=='origin'),['Origin',APP_ORIGIN]]),...(req.postData()?{body:req.postData()}:{})}),catalogEnv);return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
 }
 if(url.includes('/v2/')){aiRequests.push(activeAccount);return route.fulfill({status:403,contentType:'application/json',body:'{"error":"isolated test"}'});}
 external.push(url);return route.abort();
});
const login=async uid=>{activeAccount=uid;await page.evaluate(async uid=>window.__auth({uid,email:uid+'@example.test',displayName:'Fictício',getIdToken:async()=>'synthetic-id-token'}),uid);};

const cloud=async()=>page.evaluate(uid=>JSON.parse(window.__rows[`users/${uid}/state/main`].data),owner);
await page.clock.setFixedTime(new Date('2026-10-22T15:00:00Z'));
try{
 await page.goto(origin+'/app.html');await page.waitForFunction(()=>!!window.__auth);await login(owner);await page.evaluate(()=>window.saveStateNow(true));const initial=await cloud();await page.evaluate(()=>window.openLibrary());await page.getByRole('button',{name:'Importar com IA',exact:true}).click();const dialog=page.locator('#library-import-dialog');await page.waitForFunction(()=>document.querySelectorAll('[data-catalog-part]').length===2);assert.equal(await page.locator('#library-module-dialog').isVisible(),true);
 await dialog.locator('[data-catalog-part]').filter({hasText:'Parte 1 de 2'}).getByRole('button',{name:'Revisar livros',exact:true}).click();assert.match(await dialog.innerText(),/Destino: Biblioteca/);assert.equal(await page.locator('#catalog-select-0').isDisabled(),true);assert.equal(await page.locator('#catalog-select-1').isChecked(),true);assert.equal(await page.locator('#catalog-select-2').isDisabled(),true);
 await page.locator('[data-catalog-book="row-2"] details > summary').first().click();await page.locator('#catalog-1-book-title').fill('Título final <teste>');await page.locator('#catalog-1-0-pageCount').fill('321');await page.locator('#catalog-1-book-historyCount').fill('1');await page.locator('[data-catalog-book="row-3"] details > summary').first().click();await page.locator('#catalog-format-2-0').selectOption('kindle');await page.evaluate(()=>window.saveState());assert.equal(await page.locator('#catalog-1-book-title').inputValue(),'Título final <teste>');assert.equal(await page.locator('#catalog-format-2-0').inputValue(),'kindle');
 await dialog.getByRole('button',{name:'Conferir ajustes',exact:true}).click();assert.equal(await page.locator('#catalog-select-2').isDisabled(),false);await page.locator('#catalog-select-2').check();
 if(cssPath){await page.waitForTimeout(350);await page.screenshot({path:root+'/../catalog-import-desktop.png'});}
 await page.locator('#catalog-submit').click();await page.waitForFunction(()=>document.getElementById('catalog-submit')?.textContent==='Retomar cadastro');let saved=await cloud();assert.equal(saved.libraryData.books.length,3);assert.equal(saved.libraryData.books.find(b=>b.title==='Título final <teste>').category,'História');assert.equal(saved.libraryData.editions.find(e=>e.pageCount===321)?.format,'physical');assert.equal(saved.libraryData.readings.length,1);assert.equal(saved.libraryData.readings[0].completedOn,null);assert.equal(saved.libraryData.books[0].notes,'Preservar observação');assert.equal(saved.libraryData.imports.length,1);assert.match(await dialog.innerText(),/campos revisados foram preservados/);
 // Reload after a lost acknowledgment. The applying part must recover via the cloud receipt.
 await page.evaluate(()=>sessionStorage.setItem('test-cloud-rows',JSON.stringify(window.__rows)));await page.reload();await page.waitForFunction(()=>!!window.__auth);await login(owner);await page.evaluate(()=>window.openLibrary());await page.getByRole('button',{name:'Importar com IA',exact:true}).click();await page.waitForFunction(()=>!!document.getElementById('catalog-status'));await page.locator('#catalog-status').selectOption('applying');await dialog.getByRole('button',{name:'Retomar cadastro',exact:true}).click();await page.locator('#catalog-submit').click();await page.waitForFunction(()=>!document.getElementById('library-import-review'));saved=await cloud();assert.equal(saved.libraryData.books.length,3);assert.equal(saved.libraryData.readings.length,1);assert.equal(saved.libraryData.imports.length,1);assert.equal(await dialog.isVisible(),true);assert.equal(await page.locator('#library-module-dialog').isVisible(),true);
 await page.setViewportSize({width:390,height:844});await page.locator('#catalog-status').selectOption('pending');await dialog.getByRole('button',{name:'Revisar livros',exact:true}).click();assert.equal(await page.locator('#catalog-select-1').isDisabled(),true);await page.locator('[data-catalog-book="row-4"] details > summary').first().click();await page.locator('#catalog-0-book-title').fill('Último livro revisado');await dialog.getByRole('button',{name:'Voltar à fila',exact:true}).click();await page.locator('#confirmation-cancel').tap();assert.equal(await page.locator('#catalog-0-book-title').inputValue(),'Último livro revisado');await dialog.getByRole('button',{name:'Conferir ajustes',exact:true}).click();
 if(cssPath){await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);const box=await page.locator('#catalog-submit').boundingBox();assert.ok(box.y+box.height<=844);await page.screenshot({path:root+'/../catalog-import-mobile.png'});}
 await page.locator('#catalog-submit').tap();await page.waitForFunction(()=>!document.getElementById('library-import-review'));saved=await cloud();assert.equal(saved.libraryData.books.length,4);assert.equal(saved.libraryData.imports.length,2);assert.deepEqual(saved.tasks,initial.tasks);assert.deepEqual(saved.studyData,initial.studyData);for(const key of ['xp','energy','combo','coins'])assert.equal(saved[key],initial[key]);assert.equal(saved.libraryData.readings.length,1);
 await page.locator('#catalog-status').selectOption('accepted');await page.waitForFunction(()=>document.querySelectorAll('[data-catalog-part]').length===2);assert.equal(await page.locator('[data-catalog-part]').count(),2);await page.locator('#catalog-close').click();assert.equal(await page.locator('#library-module-dialog').isVisible(),true);
 const ownerLibrary=structuredClone(saved.libraryData);await page.evaluate(({sara,initial})=>{initial.ownerUid=sara;initial.libraryData={version:1,books:[],editions:[],readings:[],plans:[],sessions:[],imports:[]};window.__rows[`users/${sara}/state/main`]={data:JSON.stringify(initial),revision:1};},{sara,initial});await login(sara);await page.evaluate(()=>window.openLibrary());assert.equal(await page.getByRole('button',{name:'Importar com IA',exact:true}).count(),0);await page.evaluate(()=>window.openLibraryImports());assert.equal(await dialog.count(),0);assert.deepEqual((await cloud()).libraryData,ownerLibrary);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('Catalog browser passed: actual Worker/SQLite queue + real app forms and mocked Firebase, duplicate/unknown-format preview, final edits and explicit past count, lost acknowledgment/reload/replay, second-part deduplication, parent stays open, desktop/390px and account isolation. No production services accessed.');
}catch(error){console.error({browserErrors:errors,unexpectedExternal:external});await page.screenshot({path:root+'/../catalog-import-failure.png'});throw error;}finally{catalogSql.close();await browser.close();await new Promise(r=>server.close(r));}
