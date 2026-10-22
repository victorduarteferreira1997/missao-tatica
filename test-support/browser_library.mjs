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
 await page.goto(origin+'/app.html');await page.waitForFunction(()=>!!window.__auth);await login(owner);assert.equal(await page.evaluate(()=>window.saveStateNow(true)),true);const initial=await cloud();
 await page.getByText('Mais recursos',{exact:true}).click();await page.getByRole('button',{name:'Biblioteca',exact:true}).click();const dialog=page.locator('#library-module-dialog');assert.equal(await dialog.isVisible(),true);assert.match(await dialog.innerText(),/Sua estante começa aqui/);
 await page.locator('#library-new-book').click();await page.getByRole('button',{name:'Voltar à estante',exact:true}).click();assert.equal(await page.locator('#confirmation-dialog').count(),0);
 const create=async(title)=>{await page.locator('#library-new-book').click();await page.locator('#lib-title').fill(title);await page.locator('#lib-authors').fill('Autor fictício');};
 await create('Livro de teste');await page.locator('#lib-category').fill('Filosofia');await page.locator('#lib-edition-0-pageCount').fill('400');
 await page.locator('#library-book-form details[data-view-key="library-intention"] > summary').click();await page.locator('#lib-intent').selectOption('reread');await page.locator('#lib-targetMonth').fill('2026-11');
 await page.getByRole('button',{name:'Adicionar formato/edição',exact:true}).click();assert.equal(await page.locator('#lib-title').inputValue(),'Livro de teste');await page.locator('#lib-edition-1-format').selectOption('kindle');
 await page.locator('#library-book-form details[data-view-key="library-past-readings"] > summary').click();await page.locator('#lib-historyToAdd').fill('1');
 if(cssPath){await page.waitForTimeout(450);await page.screenshot({path:root+'/../library-desktop-form.png',fullPage:false});}
 await page.locator('#library-save-book').click();await page.waitForFunction(()=>!document.getElementById('library-book-form'));assert.equal(await dialog.isVisible(),true);
 let saved=await cloud();assert.equal(saved.libraryData.books.length,1);assert.equal(saved.libraryData.editions.length,2);assert.equal(saved.libraryData.readings.length,1);assert.equal(saved.libraryData.readings[0].completedOn,null);assert.equal(saved.libraryData.plans.length,0);assert.equal(saved.libraryData.sessions.length,0);const bookId=saved.libraryData.books[0].id;
 assert.deepEqual(saved.tasks,initial.tasks);assert.deepEqual(saved.studyData,initial.studyData);assert.equal(saved.xp,initial.xp);assert.equal(saved.coins,initial.coins);assert.equal(saved.combo,initial.combo);assert.equal(saved.energy,initial.energy);
 // Real typed search must preserve caret/focus after each redraw.
 await page.locator('#library-search').pressSequentially('fictício');assert.equal(await page.locator('#library-search').inputValue(),'fictício');assert.equal(await page.evaluate(()=>document.activeElement.id),'library-search');assert.equal(await dialog.locator('[data-library-book]').count(),1);
 await page.locator('#library-search').fill('inexistente');assert.equal(await dialog.locator('[data-library-book]').count(),0);await page.locator('#library-search').fill('');
 await page.getByRole('button',{name:'Editar livro',exact:true}).click();await page.locator('#lib-title').fill('Título revisado');
 // A redraw while editing (also used by synchronization) must retain entered fields.
 await page.evaluate(()=>window.saveState());assert.equal(await page.locator('#lib-title').inputValue(),'Título revisado');
 await page.getByRole('button',{name:'Voltar à estante',exact:true}).click();assert.equal(await page.locator('#confirmation-dialog').isVisible(),true);await page.locator('#confirmation-cancel').click();assert.equal(await page.locator('#lib-title').inputValue(),'Título revisado');
 await page.locator('#library-save-book').click();await page.waitForFunction(()=>!document.getElementById('library-book-form'));saved=await cloud();assert.equal(saved.libraryData.books[0].id,bookId);assert.equal(saved.libraryData.books[0].title,'Título revisado');assert.equal(saved.libraryData.readings.length,1);
 await page.getByRole('button',{name:'Arquivar',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-library-book]'));assert.equal(await dialog.isVisible(),true);assert.equal((await cloud()).libraryData.readings.length,1);
 await page.locator('#library-status-filter').selectOption('archived');await page.getByRole('button',{name:'Restaurar',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-library-book]'));await page.locator('#library-status-filter').selectOption('active');
 await page.locator('details[data-view-key^="library-book-"] > summary').click();await page.getByRole('button',{name:'Excluir definitivamente',exact:true}).click();await page.locator('#confirmation-accept').click();assert.match(await page.locator('#alert-dialog').innerText(),/histórico/);await page.locator('#alert-close').click();assert.equal((await cloud()).libraryData.books.length,1);
 await page.getByRole('button',{name:'Remover registro',exact:true}).click();await page.locator('#confirmation-cancel').click();assert.equal((await cloud()).libraryData.readings.length,1);
 await page.getByRole('button',{name:'Remover registro',exact:true}).click();await page.locator('#confirmation-accept').click();await page.waitForFunction(()=>!document.querySelector('[onclick^="window.removeLibraryHistory"]'));assert.equal((await cloud()).libraryData.readings.length,0);assert.equal(await dialog.isVisible(),true);
 // Duplicate title/author and unsafe links fail without committing partial metadata.
 await create('Título revisado');await page.locator('#library-save-book').click();assert.match(await page.locator('#alert-dialog').innerText(),/já estão/);await page.locator('#alert-close').click();assert.equal((await cloud()).libraryData.books.length,1);
 await page.locator('#lib-title').fill('Outro livro');await page.locator('details[data-view-key="library-edition-extra-0"] > summary').click();await page.locator('#lib-edition-0-url').fill('javascript:alert(1)');await page.locator('#library-save-book').click();assert.match(await page.locator('#alert-dialog').innerText(),/http/);await page.locator('#alert-close').click();assert.equal((await cloud()).libraryData.books.length,1);
 await page.locator('#lib-edition-0-url').fill('https://example.test/arquivo');await page.locator('#library-save-book').click();await page.waitForFunction(()=>!document.getElementById('library-book-form'));
 // State backup contains the complete catalog, and an actual reload restores it.
 saved=await cloud();const ownerLibrary=structuredClone(saved.libraryData);await page.evaluate(()=>sessionStorage.setItem('test-cloud-rows',JSON.stringify(window.__rows)));await page.reload();await page.waitForFunction(()=>!!window.__auth);await login(owner);await page.evaluate(()=>window.openLibrary());assert.equal(await dialog.locator('[data-library-book]').count(),2);assert.deepEqual((await cloud()).libraryData,ownerLibrary);
 if(cssPath){await page.waitForTimeout(450);await page.screenshot({path:root+'/../library-desktop-shelf.png',fullPage:false});}
 // An independent member uses the exact catalog UI at mobile width, with no owner records.
 await page.evaluate(({sara,initial})=>{initial.ownerUid=sara;initial.tasks=[];initial.libraryData={version:1,books:[],editions:[],readings:[],plans:[],sessions:[],imports:[]};initial.userProfile={configured:true,displayName:'Leitora fictícia',gender:'feminino'};window.__rows[`users/${sara}/state/main`]={data:JSON.stringify(initial),updatedAt:'2026-10-22T12:00:00Z',revision:1};},{sara,initial});
 await login(sara);await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.openLibrary());assert.match(await dialog.innerText(),/Sua estante começa aqui/);await page.locator('#library-new-book').tap();await page.locator('#lib-title').fill('Livro da conta independente');
 if(cssPath){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.equal(await page.locator('#library-save-book').isVisible(),true);const saveBox=await page.locator('#library-save-book').boundingBox();assert.ok(saveBox.y+saveBox.height<=844);await page.waitForTimeout(450);await page.screenshot({path:root+'/../library-mobile-form.png',fullPage:false});}
 await page.locator('#library-save-book').tap();await page.waitForFunction(()=>!document.getElementById('library-book-form'));const member=await page.evaluate(uid=>JSON.parse(window.__rows[`users/${uid}/state/main`].data),sara);assert.equal(member.libraryData.books.length,1);assert.deepEqual((await cloud()).libraryData,ownerLibrary);
 await login(owner);await page.evaluate(()=>window.openLibrary());assert.equal(await dialog.locator('[data-library-book]').count(),2);assert.equal(await dialog.getByText('Livro da conta independente',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('Library browser passed: real forms, editions, explicit historical readings, draft/caret preservation, duplicate and URL validation, archive/restore, guarded deletion/history correction, no mission/study/reward changes, cloud reload and independent member at 390px. All services mocked.');
}catch(error){console.error({browserErrors:errors,unexpectedExternal:external});throw error;}finally{await browser.close();await new Promise(r=>server.close(r));}
