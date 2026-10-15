import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {v2Project,v2BuildSnapshot,v2ValidateSnapshot,V2ValidationError,V2_GRANT_MS} from './v2/contract.js';
import {createV2Foundation} from './cloudflare/foundation.v2.mjs';
import {AuthError} from './cloudflare/firebase_auth.mjs';
import {createConfirmedStateWriter} from './v2/saved_state.js';
import {createV2BrowserStore} from './v2/browser.js';
import {installAiAccess} from '../ui/ai_access.v2.js';
import {AI_OWNER_UID} from './contract.v1.js';
const clock=Date.now(),origin='https://victorduarteferreira1997.github.io';
const choices=()=>({modules:{missions:true,radar:true,studies:true},includeFuture:true});
const grant=()=>({grantId:'fictional-grant-12345',version:1,status:'active',expiresAt:new Date(clock+V2_GRANT_MS).toISOString(),choices:choices(),frozenRefs:[],projectionVersion:0});
const state=()=>({lastSavedAt:new Date(clock).toISOString(),tasks:[{id:1,text:'Missão fictícia',category:'life',day:'monday',time:'30 min',subtasks:[{text:'Passo',completed:false}],notes:'PRIVATE_NOTES',xp:123}],operationalControl:{demands:[{id:2,title:'Demanda fictícia',workflowStatus:'waiting',nextAction:'Pedir retorno',waitingFor:'Pessoa fictícia'}]},studyData:{studyPlan:{tracks:[{id:'track',name:'Trilha fictícia',weeklyGoalMinutes:60}],weeklyBlocks:[{id:'block',title:'Bloco',trackId:'track',subjectId:'subject',day:'tuesday',status:'planned',plannedMinutes:30}]},subjects:[{id:'subject',name:'Disciplina',trackId:'track'}],sessions:[{id:'session',subjectId:'subject',duration:20,qTotal:10,qCorrect:8,barriers:'PRIVATE_BARRIERS',topic:'PRIVATE_TOPIC'}],reviews:[{id:'review',subjectId:'subject',dueDate:new Date(clock).toISOString(),status:'pending',topic:'PRIVATE_REVIEW'}],cycles:[{id:'cycle',name:'Ciclo',weeklyHoursGoal:2,subjectIds:['subject'],active:true}],errorLog:[{notes:'PRIVATE_ERRORS'}]},financeData:{secret:'PRIVATE_FINANCE'},healthData:{secret:'PRIVATE_HEALTH'}});
function dbFor(t){const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());let calls=0;
 const db={prepare(query){return {bind(...p){return stmt(p);},...stmt([])};function stmt(params){return {async first(){calls++;return sql.prepare(query).get(...params)||null;},async run(){calls++;const r=sql.prepare(query).run(...params);return {success:true,meta:{changes:Number(r.changes)}};}};}}};return {sql,db,getCalls:()=>calls};}
const schema=await readFile(new URL('./cloudflare/v2-schema.sql',import.meta.url),'utf8');
async function api(t,options={}){const d=dbFor(t);d.sql.exec(schema);let current=clock;const w=createV2Foundation({verifyOwner:async r=>{if(r.headers.get('Authorization')!=='Bearer test-owner')throw new AuthError();},now:()=>current,...options});
 return {...d,setClock:n=>current=n,call:(path='/v2/app/grant',method='GET',body,env={},headers={})=>w.fetch(new Request('https://bridge.example'+path,{method,headers:{Origin:origin,Authorization:'Bearer test-owner','Content-Type':'application/json',...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})}),{DB:d.db,AI_V2_ENABLED:'true',...env})};}
const requestGrant=(expectedVersion=0,grantId='fictional-grant-12345')=>({grantId,expectedVersion,choices:choices(),frozenRefs:[]});
test('projeção inclui todas as missões/RADAR e estudos sem finanças, saúde ou notas',async()=>{
 const s=state(),before=JSON.stringify(s),g=grant(),body=await v2BuildSnapshot(s,g),json=JSON.stringify(body);
 assert.equal(body.entities.length,7);assert.doesNotMatch(json,/PRIVATE_|"xp"|session"/);assert.equal(JSON.stringify(s),before);
 const subject=body.entities.find(e=>e.kind==='study.subject');assert.deepEqual(subject.fields.progress,{minutes:20,sessions:1,questions:10,correct:8});
 const task=body.entities.find(e=>e.kind==='mission');assert.equal(task.fields.weekStart,'');assert.equal(task.fields.status,'planned');
 s.tasks.push({id:3,text:'Nova missão',day:'tuesday',time:'15 min'});assert.equal((await v2Project(s,g)).filter(e=>e.kind==='mission').length,2);
});
test('consentimento restrito a módulos/IDs filtra futuras entidades e mantém referências válidas',async()=>{
 const s=state(),g=grant();g.choices.modules.radar=false;const first=await v2Project(s,g);g.choices.includeFuture=false;g.frozenRefs=first.map(e=>e.ref);
 s.tasks.push({id:3,text:'Oculta',day:'tuesday'});s.studyData.subjects.push({id:'new',name:'Disciplina futura'});
 const next=await v2BuildSnapshot(s,g);assert.doesNotMatch(JSON.stringify(next),/Oculta|Disciplina futura|Demanda fictícia/);
 g.frozenRefs=g.frozenRefs.filter(r=>r!==first.find(e=>e.kind==='study.track').ref);const filtered=await v2BuildSnapshot(s,g);assert.equal(filtered.entities.find(e=>e.kind==='study.subject').fields.trackRef,null);
});
test('servidor rejeita propriedades extras, módulos não autorizados, duplicidade, bytes e progresso inválido',async()=>{
 const g=grant(),body=await v2BuildSnapshot(state(),g);
 for(const mutate of [b=>b.entities[0].fields.secret='x',b=>b.entities.push(b.entities[0]),b=>b.coverage.radar=false,b=>b.entities[0].fields.title='x'.repeat(201),b=>b.sourceSavedAt='unknown',b=>b.entities.find(e=>e.kind==='study.subject').fields.progress.correct=11]){const b=structuredClone(body);mutate(b);assert.throws(()=>v2ValidateSnapshot(b,g),V2ValidationError);}
 const denied=structuredClone(g);denied.choices.modules.studies=false;const b=structuredClone(body);b.coverage.studies=false;assert.throws(()=>v2ValidateSnapshot(b,denied),V2ValidationError);
 const huge=state();huge.tasks=Array.from({length:201},(_,i)=>({...huge.tasks[0],id:i}));await assert.rejects(()=>v2BuildSnapshot(huge,g),V2ValidationError);
});
test('v2 fica desligada e autenticação/origem recusadas não consultam D1',async t=>{
 const a=await api(t);assert.equal((await a.call(undefined,'GET',undefined,{AI_V2_ENABLED:'false'})).status,404);
 assert.equal((await a.call(undefined,'GET',undefined,{}, {Origin:'https://attacker.example'})).status,403);
 assert.equal((await a.call(undefined,'GET',undefined,{}, {Authorization:''})).status,401);assert.equal(a.getCalls(),0);
});
test('SQL real autoriza 30 dias, publica por versão, recusa corrida e revoga apagando payload',async t=>{
 const a=await api(t);let response=await a.call(undefined,'PUT',requestGrant());assert.equal(response.status,200);let g=(await response.json()).grant;
 assert.equal(Date.parse(g.expiresAt)-clock,V2_GRANT_MS);
 const body=await v2BuildSnapshot(state(),g);response=await a.call('/v2/app/snapshot','PUT',body);assert.equal(response.status,200);g=(await response.json()).grant;assert.equal(g.projectionVersion,1);
 assert.equal((await a.call('/v2/app/snapshot','PUT',body)).status,409);
 const metadata=await (await a.call()).json();assert.doesNotMatch(JSON.stringify(metadata),/Missão fictícia|PRIVATE_/);
 const stale={grantId:g.grantId,expectedVersion:g.version};assert.equal((await a.call(undefined,'DELETE',stale)).status,200);
 assert.equal(a.sql.prepare('SELECT snapshot FROM ai_v2_access').get().snapshot,null);
 assert.equal((await a.call('/v2/app/snapshot','PUT',{...body,expectedProjectionVersion:1})).status,409);
 assert.equal((await a.call(undefined,'PUT',requestGrant(1,'another-fictional-grant'))).status,409);
 response=await a.call(undefined,'PUT',requestGrant(2,'another-fictional-grant'));assert.equal(response.status,200);g=(await response.json()).grant;assert.equal(g.version,3);assert.equal(g.projectionVersion,0);
 a.setClock(clock+V2_GRANT_MS+1);assert.equal((await (await a.call()).json()).grant.status,'expired');
 assert.equal((await a.call('/v2/app/snapshot','PUT',await v2BuildSnapshot(state(),g))).status,409);
});
test('trocar módulos exige versão e invalida a projeção anterior sem alterar tabelas v1',async t=>{
 const a=await api(t);a.sql.exec("CREATE TABLE ai_proposals (id TEXT); INSERT INTO ai_proposals VALUES ('preserved');");
 let g=(await (await a.call(undefined,'PUT',requestGrant())).json()).grant;
 await a.call('/v2/app/snapshot','PUT',await v2BuildSnapshot(state(),g));
 const edit=requestGrant(1,'new-fictional-grant-xyz');edit.choices.modules.studies=false;
 const results=await Promise.all([a.call(undefined,'PUT',edit),a.call(undefined,'PUT',requestGrant(1,'racing-fictional-grant'))]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal(a.sql.prepare('SELECT snapshot FROM ai_v2_access').get().snapshot,null);assert.equal(a.sql.prepare('SELECT id FROM ai_proposals').get().id,'preserved');
});
test('salvamento captura estado exato, serializa gravações e só informa sucesso após ack',async()=>{
 const user={uid:'owner'},events=[],snapshots=[];let release;
 const writer=createConfirmedStateWriter({getUser:()=>user,writeAccount:async()=>{},writeSnapshot:async(u,p)=>{snapshots.push(JSON.parse(p));if(snapshots.length===1)await new Promise(r=>release=r);},onSaved:s=>events.push(s.title)});
 const state={title:'primeiro'};const first=writer(user,state);state.title='segundo';const second=writer(user,state);
 await new Promise(r=>setImmediate(r));assert.deepEqual(snapshots,[{title:'primeiro'}]);assert.deepEqual(events,[]);release();assert.equal(await first,true);assert.equal(await second,true);assert.deepEqual(events,['primeiro','segundo']);
});
test('falha Firebase não publica; falha da ponte não desfaz sucesso; outra sessão descarta callback',async()=>{
 let user={uid:'owner'},saved=0,status=[];const original=user;
 const failed=createConfirmedStateWriter({getUser:()=>user,writeAccount:async()=>{},writeSnapshot:async()=>{throw Error('offline');},onSaved:()=>saved++,onStatus:s=>status.push(s)});
 assert.equal(await failed(user,{title:'a'}),false);assert.equal(saved,0);assert.equal(status.at(-1),'Erro ao salvar');
 const bridgeFail=createConfirmedStateWriter({getUser:()=>user,writeAccount:async()=>{},writeSnapshot:async()=>{},onSaved:()=>{throw Error('bridge offline');}});assert.equal(await bridgeFail(user,{title:'a'}),true);
 const changed=createConfirmedStateWriter({getUser:()=>user,writeAccount:async()=>{user=null;},writeSnapshot:async()=>{throw Error('must not write');},onSaved:()=>saved++});assert.equal(await changed(original,{title:'a'}),false);assert.equal(saved,0);
});
function access({enabled=true,failSave=false,config={}}={}){
 const s=state(),events=[];let user={uid:AI_OWNER_UID},current=null;
 const w={escapeHtml:v=>String(v).replace(/</g,'&lt;'),bindFormDialog(){}};
 const store={get:async()=>current,authorize:async b=>{events.push('authorize');current={...grant(),...b,version:b.expectedVersion+1};return current;},revoke:async()=>{events.push('revoke');current={...current,version:current.version+1,status:'revoked'};return current;},publish:async b=>{events.push(['publish',b]);current={...current,projectionVersion:b.expectedProjectionVersion+1,syncedAt:new Date(clock).toISOString()};return current;}};
 installAiAccess(w,{document:{},config:{enabled,...config},getState:()=>s,getUser:()=>user,store,saveConfirmed:async()=>{events.push('save');if(failSave)return false;await w.onAiV2Saved(structuredClone(s),user.uid);return true;},render(){},newId:()=>grant().grantId,now:()=>clock});return {w,s,events,getGrant:()=>current,setUser:u=>user=u};
}
test('UI não compartilha sem prévia/confirmação e flag desligada não faz rede',async()=>{
 const off=access({enabled:false});await off.w.openAiAccess();await off.w.refreshAiAccess();assert.equal(off.w.renderAiAccessButton(),'');assert.equal(off.events.length,0);
 const a=access();await a.w.openAiAccess();assert.doesNotMatch(a.w.renderAiAccess(),/type="checkbox"[^>]* checked/);assert.equal(a.events.length,0);
 await a.w.authorizeAiAccess();assert.equal(a.events.length,0);
 for(const k of ['missions','radar','studies','includeFuture'])a.w.setAiAccessChoice(k,true);
 await a.w.previewAiAccess();assert.equal(a.events.length,0);await a.w.authorizeAiAccess();assert.deepEqual(a.events.map(e=>Array.isArray(e)?e[0]:e),['authorize','save','publish']);
 assert.equal(a.events[2][1].entities.length,7);await a.w.revokeAiAccess();await a.w.onAiV2Saved(a.s,AI_OWNER_UID);assert.equal(a.events.filter(e=>Array.isArray(e)).length,1);
});
test('UI confirma autorização mas não envia estado quando gravação Firebase falha',async()=>{
 const a=access({failSave:true});await a.w.openAiAccess();a.w.setAiAccessChoice('missions',true);a.w.setAiAccessChoice('includeFuture',true);await a.w.previewAiAccess();await a.w.authorizeAiAccess();assert.deepEqual(a.events,['authorize','save']);assert.match(a.w.renderAiAccess(),/Os dados ainda não foram compartilhados/);
});
test('cliente usa Auth e App Check, barra sessão trocada e não expõe corpo de erro',async()=>{
 let user={uid:AI_OWNER_UID,getIdToken:async()=>'test-id'};const events=[];
 const store=createV2BrowserStore({getUser:()=>user,getAppCheckToken:async()=>'test-check',fetchImpl:async(url,o)=>{events.push([url,o]);return Response.json({grant:grant()});}});
 await store.get();assert.equal(events[0][1].headers.Authorization,'Bearer test-id');assert.equal(events[0][1].headers['X-Firebase-AppCheck'],'test-check');assert.equal(events[0][1].credentials,'omit');
 const switched=createV2BrowserStore({getUser:()=>user,getAppCheckToken:async()=>{user=null;return '';},fetchImpl:()=>{throw Error('must not call');}});await assert.rejects(()=>switched.get(),/sessão mudou/);
});

test('limites são medidos em bytes UTF-8, sem truncar parcialmente registros',async()=>{
 const g=grant(),s=state();s.tasks=Array.from({length:100},(_,i)=>({...s.tasks[0],id:i,text:'á'.repeat(200)}));
 const entities=await v2Project(s,g);assert.equal(entities.filter(e=>e.kind==='mission').length,100);
 await assert.rejects(()=>v2BuildSnapshot(s,g),V2ValidationError);
});
test('resposta de publicação de sessão anterior não restaura janela após logout',async()=>{
 let finish,startedResolve;const started=new Promise(r=>startedResolve=r);const s=state(),w={escapeHtml:String,bindFormDialog(){}};let current=grant(),user={uid:AI_OWNER_UID};
 const store={get:async()=>current,publish:()=>{startedResolve();return new Promise(r=>finish=r);}};
 installAiAccess(w,{document:{},config:{enabled:true},getState:()=>s,getUser:()=>user,store,saveConfirmed:async()=>true,render(){}});
 await w.openAiAccess();const saving=w.onAiV2Saved(s,AI_OWNER_UID);await started;
 user=null;w.resetAiAccess();finish({...current,projectionVersion:1});await saving;assert.equal(w.renderAiAccess(),'');assert.equal(w.renderAiAccessButton(),'');
});

test('permissões RADAR e estudos alternam independentemente e seguem na autorização',async()=>{
 const a=access({config:{proposalsEnabled:true,entitiesEnabled:true}});await a.w.openAiAccess();
 for(const module of ['missions','radar','studies'])a.w.setAiAccessChoice(module,true);
 a.w.setAiAccessChoice('allowProposals',true);
 for(const [key,label] of [['allowRadarProposals','Permitir propostas de criação e alteração no RADAR'],['allowStudyProposals','Permitir propostas de planos semanais de estudo']]){
  a.w.setAiAccessChoice(key,true);
  assert.ok(a.w.renderAiAccess().split("<input").find(input=>input.includes("setAiAccessChoice('"+key+"',this.checked)")).split(">")[0].includes("checked onchange"));
  a.w.setAiAccessChoice(key,false);
  assert.ok(!a.w.renderAiAccess().split("<input").find(input=>input.includes("setAiAccessChoice('"+key+"',this.checked)")).split(">")[0].includes("checked onchange"));
  a.w.setAiAccessChoice(key,true);
 }
 await a.w.previewAiAccess();await a.w.authorizeAiAccess();
 const body=a.getGrant();
 assert.deepEqual(body.choices,{modules:{missions:true,radar:true,studies:true},includeFuture:false,allowProposals:true,allowRadarProposals:true,allowStudyProposals:true});
 a.w.setAiAccessChoice('radar',false);await a.w.previewAiAccess();await a.w.authorizeAiAccess();
 assert.equal(a.getGrant().choices.allowRadarProposals,false);
 assert.equal(a.getGrant().choices.allowStudyProposals,true);
});

test('projeção IA acompanha a semana remarcada do Google quando a missão possui semana local antiga',async()=>{
 const s=state();s.tasks[0].planningWeekStart='2026-10-05';s.tasks[0].googleCalendarSource='primary';s.tasks[0].googleCalendarWeekStart='2026-10-12';
 const rows=await v2Project(s,grant());assert.equal(rows.find(row=>row.kind==='mission').fields.weekStart,'2026-10-12');
});
