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
const require=createRequire(new URL('../security-tests/package.json',import.meta.url));
const {chromium}=require('playwright');
const root=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,''),sara='fictional-sara';
const fixture=plain(boot().state);fixture.ownerUid=owner;fixture.userProfile={displayName:'Proprietário fictício',gender:'neutro',configured:true};fixture.aiAppliedProposals={fixtureProof:1};fixture.tasks=[{id:1,text:'Missão exclusiva do proprietário',day:'monday',category:'life',completed:false,time:'30 min',subtasks:[]}];
const server=createServer(async(req,res)=>{
 try{const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!path.startsWith(root+'/'))throw Error('bad path');let data=await readFile(path);if(path.endsWith('/app.html'))data=Buffer.from(data.toString().replace(/<base href="[^"]+">/,'<base href="/">'));
 res.setHeader('Content-Type',extname(path)==='.html'?'text/html':extname(path)==='.js'?'text/javascript':'application/octet-stream');res.end(data);}catch{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[],external=[],aiRequests=[];
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
 if(url.includes('cdn.tailwindcss.com'))return route.fulfill({contentType:'text/javascript',body:"const style=document.createElement('style');style.textContent='.hidden{display:none}';document.head.append(style);"});
 if(url.includes('accounts.google.com/gsi/client'))return route.fulfill({contentType:'text/javascript',body:''});
 if(url.includes('/v2/')){aiRequests.push(activeAccount);return route.fulfill({status:403,contentType:'application/json',body:'{"error":"isolated test"}'});}
 external.push(url);return route.abort();
});
const login=async uid=>{activeAccount=uid;await page.evaluate(async uid=>window.__auth({uid,email:uid+'@example.test',displayName:'Fictício',getIdToken:async()=>'synthetic-id-token'}),uid);};
try{
 await page.goto(origin+'/app.html');await page.waitForFunction(()=>!!window.__auth);
 assert.equal(await page.locator('#app-wrapper').isVisible(),false);
 await login('stranger');assert.match(await page.locator('#auth-access-message').textContent(),/stranger/);assert.equal(await page.locator('#app-wrapper').isVisible(),false);
 await login(sara);await page.locator('#profile-display-name').fill('Sara fictícia');await page.locator('input[name="profile-gender"][value="feminino"]').check();await page.locator('#profile-campaign-theme').selectOption('navy');assert.match(await page.locator('#profile-preview-title').textContent(),/Marinheira/);await page.getByRole('button',{name:'Salvar perfil',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.saveStateNow(true)),true);
 assert.equal(await page.getByText('Missão exclusiva do proprietário',{exact:true}).count(),0);assert.equal(await page.locator('[onclick="window.openAiInbox()"], [onclick="window.openAiAccess()" ]').count(),0);
 await page.locator('[onclick="window.toggleCreateTaskModal()"]').first().click();await page.locator('#ct-text').fill('Missão exclusiva da Sara');await page.locator('#create-task-dialog button[type="submit"]').click();assert.equal(await page.evaluate(()=>window.saveStateNow(true)),true);
 for(const module of ['Study','Finance','Health','Ritual']){await page.evaluate(module=>window['toggle'+module+'Modal'](),module);assert.ok(await page.getByRole('dialog').count());await page.evaluate(module=>window['toggle'+module+'Modal'](),module);}
 const saraState=await page.evaluate(uid=>JSON.parse(localStorage.getItem('missao_tatica:v2:state:'+uid)),sara);assert.equal(saraState.tasks[0].text,'Missão exclusiva da Sara');assert.equal(saraState.userProfile.displayName,'Sara fictícia');assert.equal(saraState.prestige.themeId,'navy');
 await login(owner);assert.equal(await page.getByText('Missão exclusiva da Sara',{exact:true}).count(),0);assert.equal(await page.evaluate(uid=>JSON.parse(localStorage.getItem('missao_tatica:v2:state:'+uid)).tasks[0].text,owner),'Missão exclusiva do proprietário');
 // Reset an account containing AI receipts; reopen and verify the cloud remains empty.
 await page.evaluate(()=>window.openDataManager());await page.getByRole('button',{name:'Selecionar tudo',exact:true}).click();await page.getByRole('button',{name:'Revisar limpeza',exact:true}).click();
 await page.getByRole('button',{name:'Confirmar',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('cleanup-saving-title'));
 await page.locator('#profile-display-name').fill('Novo proprietário');await page.locator('input[name="profile-gender"][value="masculino"]').check();await page.locator('#profile-campaign-theme').selectOption('greek');
 await page.getByRole('button',{name:'Salvar perfil',exact:true}).click();assert.equal(await page.evaluate(()=>window.saveStateNow(true)),true);
 const resetRows=await page.evaluate(()=>window.__rows);const resetState=JSON.parse(resetRows[`users/${owner}/state/main`].data);
 assert.deepEqual(resetState.tasks,[]);assert.equal(resetState.prestige.themeId,'greek');assert.equal(resetState.userProfile.displayName,'Novo proprietário');assert.deepEqual(resetState.aiAppliedProposals,{fixtureProof:1});
 // The mock server snapshots persist across a genuine document reload.
 await page.evaluate(rows=>sessionStorage.setItem('test-cloud-rows',JSON.stringify(rows)),resetRows);
 await page.reload();await page.waitForFunction(()=>!!window.__auth);await login(owner);
 assert.equal(await page.getByText('Missão exclusiva do proprietário',{exact:true}).count(),0);
 assert.equal(await page.locator('#profile-display-name').count(),0);assert.equal(await page.evaluate(()=>window.saveStateNow(true)),true);
 // A second tab changes account on the same origin: storage events hide the first.
 const second=await context.newPage();await second.goto(origin+'/app.html');await second.waitForFunction(()=>!!window.__auth);activeAccount=sara;await second.evaluate(async uid=>window.__auth({uid,email:uid+'@example.test',getIdToken:async()=>'synthetic'}),sara);
 await page.waitForFunction(()=>document.getElementById('app-wrapper').style.display==='none');assert.equal(await page.locator('#app').textContent(),'');
 // A full recovery buffer must expose safe download and confirmation on the
 // login overlay, before the personal wrapper can be shown.
 await page.evaluate(uid=>{
  const copies=Array.from({length:5},(_,id)=>JSON.stringify({ownerUid:uid,tasks:[{id}]}));
  localStorage.setItem('missao_tatica_conflict_backup_'+uid,copies[0]);
  localStorage.setItem('missao_tatica_conflict_backup_'+uid+':history',JSON.stringify(copies.slice(1)));
  localStorage.setItem('missao_tatica:v2:state:'+uid,JSON.stringify({ownerUid:uid,tasks:[{id:99,text:'Cópia pendente',day:'monday'}]}));
 },sara);
 await login(sara);assert.equal(await page.locator('#app-wrapper').isVisible(),false);
 await page.locator('#auth-recovery-copies summary').click();
 const downloadEvent=page.waitForEvent('download');await page.locator('#auth-recovery-copies [onclick="window.exportLocalConflictBackup(0)"]').click();
 const download=await downloadEvent;assert.equal(JSON.parse(await readFile(await download.path(),'utf8')).tasks[0].id,0);
 await page.locator('#auth-recovery-copies [onclick="window.clearLocalConflictBackups()"]').click();
 await page.getByRole('button',{name:'Cancelar',exact:true}).click();
 await page.locator('#auth-recovery-copies summary').click();
 await page.locator('#auth-recovery-copies [onclick="window.clearLocalConflictBackups()"]').click();
 await page.getByRole('button',{name:'Já baixei as cópias. Limpar histórico',exact:true}).click();
 await page.locator('#auth-retry-button').click();await page.waitForFunction(()=>document.getElementById('app-wrapper').style.display==='block');
 assert.equal(await page.evaluate(uid=>JSON.parse(localStorage.getItem('missao_tatica_conflict_backup_'+uid)).tasks[0].id,sara),99);
 assert.equal(aiRequests.includes(sara),false);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 console.log('Browser: confirmed full reset with AI receipts, persisted campaign selection after reload, authorized signup/profile, mission creation, module dialogs, account switching real two-tab storage events and bounded recovery download/confirmation passed. Firebase/Google were mocked; no production request was allowed.');
}catch(error){console.error({browserErrors:errors,unexpectedExternal:external});throw error;}finally{await browser.close();await new Promise(r=>server.close(r));}
