import test from 'node:test';
import assert from 'node:assert/strict';
import {boot,plain} from './test-support/app_boot.mjs';
import {AI_OWNER_UID as owner} from './ai/contract.v1.js';
import {createAccountStorage,accountStateKey,LEGACY_STATE_KEY,AUTH_TRANSITION_KEY,validateAccountState} from './account_storage.v1.js';
const sara='fictional-sara',user=uid=>({uid,email:uid+'@example.test',displayName:'Pessoa fictícia'});
const snap=row=>({exists:()=>Boolean(row),data:()=>plain(row)});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(initial={}){
 const b=boot(null,true,false),rows=new Map(Object.entries(initial)),reads=[],cloudWrites=[];
 b.c.getDoc=async path=>{reads.push(path);if(path.startsWith('appAccess/'))return snap(path==='appAccess/'+sara?{enabled:true,role:'member'}:null);return snap(rows.get(path));};
 b.c.setDoc=async(path,value)=>{cloudWrites.push({path,value:plain(value)});rows.set(path,{...rows.get(path),...plain(value)});};
 b.c.runTransaction=async(_,work)=>work({get:async path=>snap(rows.get(path)),set:(path,value)=>{cloudWrites.push({path,value:plain(value)});rows.set(path,{...rows.get(path),...plain(value)});}});
 b.c.FileReader=class{readAsText(file){this.onload({target:{result:file.text}});}};
 return {...b,rows,reads,cloudWrites,getState:()=>b.window.startupForTest.getState(),getUI:()=>b.window.startupForTest.getUI()};
}
const path=uid=>'users/'+uid+'/state/main';
const row=(uid,extra={})=>({data:JSON.stringify({ownerUid:uid,tasks:[],...extra}),updatedAt:'2026-10-06T22:30:00Z',revision:1});

test('authorization and first session never read the global cache or a foreign document',async()=>{
 const b=fixture();b.stored.set(LEGACY_STATE_KEY,JSON.stringify({tasks:[{id:'private-owner'}],xp:90000}));
 assert.equal(b.getState().tasks.length,0);assert.equal(b.reads.length,0);
 await b.c.authCallback(user('stranger'));
 assert.deepEqual(b.reads,['appAccess/stranger']);assert.equal(b.cloudWrites.length,0);
 assert.equal(b.elements['app-wrapper'].style.display,'none');assert.match(b.elements['auth-access-message'].textContent,/UID.*stranger/);
 assert.ok(b.stored.get(LEGACY_STATE_KEY).includes('private-owner'));
});
test('new member starts independent in every module, gets profile setup and never calls private AI',async()=>{
 const b=fixture();let ai=0;b.window.refreshAiAccess=()=>ai++;b.window.onAiV2Saved=()=>ai++;
 b.stored.set(LEGACY_STATE_KEY,JSON.stringify({tasks:[{id:'private'}],financeData:{secret:'owner'},xp:90000}));
 await b.c.authCallback(user(sara));const s=b.getState();
 assert.equal(s.ownerUid,sara);assert.equal(s.tasks.length,0);assert.equal(s.xp,0);assert.equal(s.coins,0);assert.equal(s.userProfile.configured,false);
 for(const collection of [s.operationalControl.demands,s.studyData.sessions,s.financeData.incomes,s.healthData.workouts,s.focusData.cycles,s.rewardPurchases,s.planning.history])assert.equal(collection.length,0);
 assert.equal(ai,0);assert.equal(b.window.renderAiAccessButton(),'');assert.equal(b.window.renderAiInboxButton(),'');
 assert.ok(b.elements.app.innerHTML.includes('profile'));
 assert.equal(b.cloudWrites.every(w=>w.path===path(sara)||w.path==='users/'+sara),true);
 assert.equal(JSON.parse(b.stored.get(accountStateKey(sara))).ownerUid,sara);
 await assert.rejects(b.c.v2ProposalsOptions.applyMission({id:'a'.repeat(64)},{title:'forged'}),/restrita/);
});
test('legacy owner cache migrates once without changing any original bytes or losing module fields',async()=>{
 const b=fixture();const legacy=JSON.stringify({tasks:[{id:1,text:'Legado',day:'monday'}],xp:500,financeData:{incomes:[{id:'old-income',amount:400}]},healthData:{workouts:[]},settings:{custom:'preserve'},userProfile:{displayName:'Teste',gender:'neutro'}});
 b.stored.set(LEGACY_STATE_KEY,legacy);await b.c.authCallback(user(owner));
 assert.equal(b.stored.get(LEGACY_STATE_KEY),legacy);assert.equal(b.getState().tasks[0].id,1);assert.equal(b.getState().financeData.incomes[0].id,'old-income');assert.equal(b.getState().settings.custom,'preserve');
 assert.equal(JSON.parse(b.rows.get(path(owner)).data).ownerUid,owner);
 await b.c.authCallback(user(sara));assert.equal(b.getState().tasks.length,0);assert.equal(b.getState().settings,undefined);
 await b.c.authCallback(user(owner));assert.equal(b.getState().tasks[0].id,1);assert.equal(b.stored.get(LEGACY_STATE_KEY),legacy);
});
test('owner cloud wins over stale local data and legacy copy remains recoverable',async()=>{
 const b=fixture({[path(owner)]:row(owner,{tasks:[{id:8,text:'Nuvem',day:'monday'}]})});
 const legacy=JSON.stringify({tasks:[{id:4,text:'Local',day:'monday'}],lastSavedAt:'2026-10-19T12:00:00Z'});b.stored.set(LEGACY_STATE_KEY,legacy);
 await b.c.authCallback(user(owner));assert.equal(b.getState().tasks[0].id,8);assert.equal(b.cloudWrites.length,0);
 assert.equal(JSON.parse(b.stored.get('missao_tatica_conflict_backup_'+owner)).tasks[0].id,4);assert.equal(b.stored.get(LEGACY_STATE_KEY),legacy);
});
test('late reads from the previous account cannot replace the new state or reveal its UI early',async()=>{
 const b=fixture({[path(sara)]:row(sara,{tasks:[{id:'sara',text:'Só Sara',day:'monday'}]})}),old=deferred();const read=b.c.getDoc;
 b.c.getDoc=async p=>p===path(owner)?old.promise:read(p);
 const opening=b.c.authCallback(user(owner));await tick();assert.equal(b.elements['app-wrapper'].style.display,'none');
 await b.c.authCallback(user(sara));old.resolve(snap(row(owner,{tasks:[{id:'private-owner'}]})));await opening;
 assert.equal(b.getState().ownerUid,sara);assert.equal(b.getState().tasks[0].id,'sara');assert.equal(b.elements.app.innerHTML.includes('private-owner'),false);assert.equal(b.stored.has(accountStateKey(owner)),false);
});
test('same Firebase user object on a later session still invalidates prior reads',async()=>{
 const b=fixture(),old=deferred(),firebaseUser=user(owner);let attempts=0;
 b.c.getDoc=async()=>++attempts===1?old.promise:snap(row(owner,{tasks:[{id:2,text:'Atual',day:'monday'}]}));
 const pending=b.c.authCallback(firebaseUser);await tick();await b.c.authCallback(firebaseUser);old.resolve(snap(row(owner,{tasks:[{id:1,text:'Antiga',day:'monday'}]})));await pending;
 assert.equal(b.getState().tasks[0].id,2);
});
test('network failure never starts a blank cloud account or exposes previous data',async()=>{
 const b=fixture({[path(owner)]:row(owner,{tasks:[{id:1,text:'Privado',day:'monday'}]})});await b.c.authCallback(user(owner));
 b.c.getDoc=async()=>{throw Error('offline');};await b.c.authCallback(user(sara));
 assert.equal(b.elements['app-wrapper'].style.display,'none');assert.equal(b.getState().tasks.length,0);assert.equal(b.cloudWrites.length,0);assert.equal(await b.window.saveStateNow(true),false);
});
test('delayed saves and UI callbacks are discarded on account change',async()=>{
 const b=fixture({[path(owner)]:row(owner),[path(sara)]:row(sara)});await b.c.authCallback(user(owner));
 const oldState=b.getState();oldState.tasks.push({id:'owner-only',text:'Pendente',day:'monday'});b.window.saveState(true);const callbacks=[...b.timers.values()];let uiRuns=0;const callback=b.window.guardAccountCallback(()=>uiRuns++);
 await b.c.authCallback(user(sara));callback();for(const timer of callbacks)await timer();
 assert.equal(uiRuns,0);assert.equal(b.cloudWrites.length,0);assert.equal(b.getState().ownerUid,sara);assert.equal(b.getState().tasks.length,0);
});
test('an already waiting profile write cannot publish an old state into a new account',async()=>{
 const b=fixture({[path(owner)]:row(owner),[path(sara)]:row(sara)});await b.c.authCallback(user(owner));
 const pending=deferred(),write=b.c.setDoc;b.c.setDoc=async(p,v)=>{if(p==='users/'+owner)await pending.promise;return write(p,v);};
 b.getState().tasks.push({id:'old',text:'Pendente',day:'monday'});const saving=b.window.saveStateNow(true);await tick();await b.c.authCallback(user(sara));pending.resolve();assert.equal(await saving,false);
 assert.equal(b.cloudWrites.some(w=>w.path===path(owner)||w.path===path(sara)),false);assert.equal(b.getState().ownerUid,sara);
});
test('new account initialization completing after a switch cannot disable the current session',async()=>{
 const b=fixture({[path(sara)]:row(sara)}),wait=deferred(),write=b.c.setDoc;
 b.c.setDoc=async(p,v)=>{if(p==='users/'+owner)await wait.promise;return write(p,v);};
 const opening=b.c.authCallback(user(owner));await tick();await b.c.authCallback(user(sara));wait.resolve();await opening;
 assert.equal(await b.window.saveStateNow(true),true);assert.equal(b.getState().ownerUid,sara);
});
test('cross-tab account change blanks dialogs, drafts, timer context and personal DOM synchronously',async()=>{
 const b=fixture({[path(owner)]:row(owner,{tasks:[{id:1,text:'Segredo sintético',day:'monday'}]})});await b.c.authCallback(user(owner));
 b.getUI().showStudyModal=true;b.getUI().confirm={show:true,onConfirm:()=>assert.fail('obsolete callback')};b.getUI().createTaskDraft={private:'draft'};
 b.events.get('storage')({key:AUTH_TRANSITION_KEY,newValue:JSON.stringify({uid:sara})});
 assert.equal(b.elements['app-wrapper'].style.display,'none');assert.equal(b.elements.app.innerHTML,'');assert.equal(b.getUI().showStudyModal,false);assert.equal(b.getUI().confirm.onConfirm,null);assert.equal(b.getUI().createTaskDraft,null);assert.equal(b.getState().tasks.length,0);
 assert.equal(await b.window.saveStateNow(true),false);
});
test('same-account local conflict blocks overwrite while server CAS protects different devices',async()=>{
 const b=fixture({[path(owner)]:row(owner)});await b.c.authCallback(user(owner));
 const newer=JSON.stringify({...b.getState(),tasks:[{id:'another-tab'}]});b.stored.set(accountStateKey(owner),newer);
 b.getState().tasks.push({id:'mine'});assert.equal(await b.window.saveStateNow(true),false);assert.equal(b.stored.get(accountStateKey(owner)),newer);assert.equal(b.cloudWrites.length,0);
});
test('backups from other accounts or unlabelled member imports are rejected without mutation',async()=>{
 const b=fixture({[path(sara)]:row(sara)});await b.c.authCallback(user(sara));const before=plain(b.getState());
 for(const data of [{ownerUid:owner,tasks:[{id:'private'}]},{tasks:[{id:'unlabelled'}]}]){
  b.window.importData({target:{files:[{text:JSON.stringify(data)}],value:''}});assert.deepEqual(plain(b.getState()),before);assert.equal(b.getUI().confirm.show,false);
 }
 assert.equal(b.cloudWrites.length,0);
});
test('backup confirmation and FileReader result cannot survive account switches',async()=>{
 const b=fixture({[path(owner)]:row(owner),[path(sara)]:row(sara)});await b.c.authCallback(user(owner));
 b.window.importData({target:{files:[{text:JSON.stringify({ownerUid:owner,tasks:[{id:'restore'}]})}],value:''}});assert.equal(b.getUI().confirm.show,true);const confirm=b.getUI().confirm.onConfirm;
 await b.c.authCallback(user(sara));confirm();assert.equal(b.getState().tasks.length,0);
 await b.c.authCallback(user(owner));let reader;b.c.FileReader=class{readAsText(){reader=this;}};b.window.importData({target:{files:[{text:'ignored'}],value:''}});
 await b.c.authCallback(user(sara));reader.onload({target:{result:JSON.stringify({ownerUid:owner,tasks:[{id:'late'}]})}});assert.equal(b.getState().tasks.length,0);assert.equal(b.getUI().confirm.show,false);
});
test('own backup requires confirmation, preserves recovery snapshot and saves only its owner',async()=>{
 const b=fixture({[path(sara)]:row(sara)});await b.c.authCallback(user(sara));
 b.window.importData({target:{files:[{text:JSON.stringify({ownerUid:sara,tasks:[{id:3,text:'Restaurada',day:'monday'}],xp:0})}],value:''}});
 assert.equal(b.getState().tasks.length,0);b.window.handleConfirmResult(true);await tick();
 assert.equal(b.getState().tasks[0].id,3);assert.equal(JSON.parse(b.rows.get(path(sara)).data).tasks[0].id,3);assert.ok(b.stored.has('missao_tatica_conflict_backup_'+sara));
});
test('storage rejects corrupted/foreign labels, never reuses or overwrites the owner legacy key for members',()=>{
 const data=new Map([[LEGACY_STATE_KEY,JSON.stringify({tasks:[],private:'owner'})]]),store={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)},a=createAccountStorage(store,owner);
 assert.equal(a.load(sara),null);a.save(sara,{ownerUid:sara,tasks:[]});assert.equal(data.get(LEGACY_STATE_KEY),JSON.stringify({tasks:[],private:'owner'}));
 assert.throws(()=>a.save(sara,{ownerUid:owner,tasks:[]}));assert.throws(()=>validateAccountState({tasks:[]},sara,{legacyOwner:true,ownerUid:owner}));
 data.set(accountStateKey(sara),JSON.stringify({ownerUid:owner,tasks:[]}));assert.throws(()=>a.load(sara));
});


test('a stalled write from a logged-out account does not block first-time member initialization',async()=>{
 const b=fixture({[path(owner)]:row(owner)});await b.c.authCallback(user(owner));
 const wait=deferred(),write=b.c.setDoc;b.c.setDoc=async(p,v)=>{if(p==='users/'+owner)await wait.promise;return write(p,v);};
 const saving=b.window.saveStateNow(true);await tick();let opened=false;
 const opening=b.c.authCallback(user(sara)).then(()=>opened=true);await tick();
 assert.equal(opened,true);assert.equal(b.getState().ownerUid,sara);assert.equal(b.elements['app-wrapper'].style.display,'block');
 wait.resolve();assert.equal(await saving,false);await opening;
});
test('foreign or unlabelled member cloud snapshots fail closed with no cache or automatic rewrite',async()=>{
 for(const contents of [{ownerUid:owner,tasks:[{id:'foreign'}]},{tasks:[]}]){
  const b=fixture({[path(sara)]:{data:JSON.stringify(contents),revision:1,updatedAt:'2026-10-06T00:00:00Z'}});
  await b.c.authCallback(user(sara));assert.equal(b.elements['app-wrapper'].style.display,'none');assert.equal(b.cloudWrites.length,0);assert.equal(b.stored.has(accountStateKey(sara)),false);
 }
});

test('failed initial read can be retried without relying on a new Google auth event',async()=>{
 const b=fixture({[path(owner)]:row(owner)}),read=b.c.getDoc;b.c.getDoc=async()=>{throw Error('offline');};
 await b.c.authCallback(user(owner));assert.equal(b.elements['auth-retry-button'].style.display,'block');
 b.c.getDoc=read;await b.window.retryAccountLoad();assert.equal(b.elements['app-wrapper'].style.display,'block');assert.equal(b.getState().ownerUid,owner);assert.equal(b.cloudWrites.length,0);
});

test('logout remains possible during a stalled network write and preserves the local snapshot',async()=>{
 const b=fixture({[path(owner)]:row(owner)});await b.c.authCallback(user(owner));
 const wait=deferred();b.c.setDoc=async()=>wait.promise;b.getState().tasks.push({id:42,text:'Não sincronizada',day:'monday'});
 const leaving=b.window.logout();await tick();for(const callback of [...b.timers.values()])await callback();await leaving;
 assert.equal(b.elements['app-wrapper'].style.display,'none');assert.equal(b.getState().tasks.length,0);assert.equal(JSON.parse(b.stored.get(accountStateKey(owner))).tasks[0].id,42);
 wait.resolve();await tick();
});
