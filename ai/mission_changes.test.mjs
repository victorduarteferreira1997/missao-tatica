import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createWorker,APP_ORIGIN} from './cloudflare/worker.mjs';
import {AuthError} from './cloudflare/firebase_auth.mjs';
import {v2BuildSnapshot,v2Project,v2Hash} from './v2/contract.js';
import {missionChangeFields} from './v2/mission_changes.js';
import {previewMissionChange,applyMissionChange} from './v2/mission_change_apply.js';
import {createCloudStateStore} from './v2/cloud_state.js';
import {createMissionChangeStore} from './v2/mission_changes_browser.js';
import {AI_OWNER_UID} from './contract.v1.js';
const time=Date.parse('2026-10-30T12:00:00Z'),secret='synthetic-mission-change-secret-1234567';
const task=()=>({id:41,text:'Análise fictícia',day:'friday',planningWeekStart:'2026-10-26',time:'30 min',startTime:'09:00',endTime:'09:30',priority:'alta',complexity:2,impactType:'progress',missionNature:'normal',xp:12,energyCost:8,category:'work',completed:false,order:1,radarDemandId:'radar-1',dependsOnTaskIds:['40'],dependencyReceipts:{'40':'complete'},subtasks:[{id:'sub-1',text:'Ajuste final',completed:true,extra:'preserve'},{id:'sub-2',text:'Enviar',completed:false}],custom:'preservar'});
const initial=()=>({tasks:[task(),{...task(),id:42,text:'Outra'}],currentPlanningWeekStart:'2026-11-02',planning:{legacyWeek:'2026-10-26',history:[]},xp:900,coins:120,combo:6,energy:70,taskDeletionLog:[{id:'old-log'}],operationalControl:{demands:[{id:'radar-1',workflowStatus:'active'}]}});
async function fixture(t,{consent=true,flag=true,snapshot=true}={}){
 const sql=new DatabaseSync(':memory:');for(const path of ['schema.sql','oauth-schema.sql','v2-schema.sql','proposals-v2-schema.sql','apply-v2-schema.sql','entities-v2-schema.sql'])sql.exec(await readFile(new URL('./cloudflare/'+path,import.meta.url),'utf8'));t.after(()=>sql.close());let clock=time,beforeRun=null;
 const db={prepare(q){return {bind(...a){return {first:async()=>sql.prepare(q).get(...a)||null,all:async()=>({success:true,results:sql.prepare(q).all(...a)}),run:async()=>{beforeRun?.(q);return {success:true,meta:{changes:Number(sql.prepare(q).run(...a).changes)}};}};}};}};
 const env={DB:db,ACTION_SECRET:secret,AI_V2_ENABLED:'true',AI_V2_READ_ENABLED:'true',AI_V2_PROPOSALS_ENABLED:'true',AI_V2_APPLY_ENABLED:'true',AI_MISSION_CHANGES_ENABLED:flag?'true':'false'};
 const worker=createWorker({now:()=>clock,verifyOwner:async r=>{if(r.headers.get('Authorization')!=='Bearer owner-synthetic')throw new AuthError();}});
 const call=(path,body,token=secret,method='POST',origin)=>worker.fetch(new Request('https://bridge.example'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(origin?{Origin:origin}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
 const owner=(path,body,method=body?'POST':'GET')=>call(path,body,'owner-synthetic',method,APP_ORIGIN),choices={modules:{missions:true,radar:false,studies:false},includeFuture:true,allowProposals:true,allowMissionChanges:consent};
 const grant=(await (await owner('/v2/app/grant',{grantId:'mission-change-grant-01',expectedVersion:0,choices,frozenRefs:[]},'PUT')).json()).grant;
 const state=initial();state.lastSavedAt=new Date(time).toISOString();if(snapshot){const s=await v2BuildSnapshot(state,grant);assert.equal((await owner('/v2/app/snapshot',s,'PUT')).status,200);}
 const [entity]=await v2Project({tasks:[state.tasks[0]]},grant),fields={targetRef:entity.ref,targetVersion:entity.entityVersion,reason:'Reorganizar a semana',patch:{date:'2026-11-02',title:'Revisar a análise',durationMinutes:45,priority:'baixa',subtaskEdits:[{index:1,title:'Enviar versão revisada'}],addSubtasks:['Conferir comprovante']}};
 const token=async(scope='proposals:create')=>{const response=await call('/v2/connection',{subject:'a'.repeat(64),expectedGrantId:grant.grantId,expectedGrantVersion:grant.version,...(scope==='planning:read'?{}:{requestedScope:scope})});assert.equal(response.status,200);return (await response.json()).accessToken;};
 const rpc=(token,name,args)=>call('/v2/planning',{name,arguments:args},token),submit=async(key='change-request-001',f=fields)=>rpc(await token(),'submitMissionChange',{idempotencyKey:key,fields:f});
 return {sql,env,call,owner,token,rpc,grant,state,fields,submit,setTime:n=>clock=n,before:fn=>beforeRun=fn};
}
test('mission changes require separate consent, feature flag, write scope and authenticated owner origin',async t=>{
 const a=await fixture(t,{consent:false});assert.equal((await a.submit()).status,403);assert.equal((await a.owner('/v2/app/mission-changes')).status,200);
 const b=await fixture(t);assert.equal((await b.rpc(await b.token('planning:read'),'submitMissionChange',{idempotencyKey:'change-request-001',fields:b.fields})).status,403);
 assert.equal((await b.call('/v2/app/mission-changes',undefined,'wrong','GET',APP_ORIGIN)).status,401);assert.equal((await b.call('/v2/app/mission-changes',undefined,'owner-synthetic','GET','https://evil.example')).status,403);
 b.env.AI_MISSION_CHANGES_ENABLED='false';assert.equal((await b.owner('/v2/app/mission-changes')).status,404);
});
test('fresh real mission references are required, and no caller can submit completion, deletion or hidden fields',async t=>{
 const a=await fixture(t);for(const patch of [{completed:true},{delete:true},{xp:999},{radarDemandId:'other'},{date:'2026-02-30'},{subtaskEdits:[{index:0,title:'a'},{index:0,title:'b'}]}])assert.throws(()=>missionChangeFields({...a.fields,patch}));
 assert.equal((await a.submit('unknown-reference',{...a.fields,targetRef:'a'.repeat(64)})).status,409);assert.equal((await a.submit('unknown-version-01',{...a.fields,targetVersion:'b'.repeat(64)})).status,409);
 assert.equal((await a.submit('bad-subtask-index',{...a.fields,patch:{subtaskEdits:[{index:99,title:'No'}]}})).status,422);
 a.setTime(time+86400001);assert.equal((await a.submit()).status,409);const b=await fixture(t,{snapshot:false});assert.equal((await b.submit()).status,409);
});
test('submission is pending and idempotent, with no changes to snapshots or existing queues',async t=>{
 const a=await fixture(t),before=a.sql.prepare('SELECT snapshot FROM ai_v2_access').get().snapshot,first=await (await a.submit()).json(),again=await (await a.submit()).json();assert.equal(first.part.status,'pending');assert.equal(again.replayed,true);assert.equal(first.part.id,again.part.id);
 assert.equal((await a.submit('change-request-001',{...a.fields,patch:{title:'Outro'}})).status,409);assert.equal(a.sql.prepare('SELECT snapshot FROM ai_v2_access').get().snapshot,before);assert.equal(a.sql.prepare('SELECT COUNT(*) n FROM ai_v2_proposals').get().n,0);
});
test('reservation locks final revised values and the full task version; identity and resumed values cannot drift',async t=>{
 const a=await fixture(t),row=(await (await a.submit()).json()).part,fields=structuredClone(row.fields);fields.patch.title='Título final';const taskVersion=await v2Hash(JSON.stringify(a.state.tasks[0])),body={id:row.id,expectedVersion:1,fields,expectedTaskVersion:taskVersion};
 const reserved=(await (await a.owner('/v2/app/mission-changes/reserve',body)).json()).part;assert.equal(reserved.status,'applying');assert.equal(reserved.fields.patch.title,'Título final');assert.equal((await a.owner('/v2/app/mission-changes/reserve',body)).status,200);
 assert.equal((await a.owner('/v2/app/mission-changes/reserve',{...body,expectedTaskVersion:'e'.repeat(64)})).status,409);assert.equal((await a.owner('/v2/app/mission-changes/reject',{id:row.id,expectedVersion:1})).status,409);
 const second=(await (await a.submit('second-change-001')).json()).part;assert.equal((await a.owner('/v2/app/mission-changes/reserve',{...body,id:second.id,fields:{...fields,targetRef:'f'.repeat(64)}})).status,409);
});
test('transaction edits the existing ID across weeks, preserves links/completion/rewards and recovers a lost acknowledgment once',async t=>{
 const a=await fixture(t),row=(await (await a.submit()).json()).part,preview=await previewMissionChange(a.state,row),reserved=(await (await a.owner('/v2/app/mission-changes/reserve',{id:row.id,expectedVersion:1,fields:row.fields,expectedTaskVersion:preview.taskVersion})).json()).part;
 const user={uid:'synthetic-owner'};let cloud={data:JSON.stringify(a.state),revision:1},writes=0;const store=createCloudStateStore({getUser:()=>user,transact:async(_,work)=>work({get:async()=>structuredClone(cloud),set:value=>{cloud=structuredClone(value);writes++;}})});store.observe(user,cloud);
 const apply=()=>store.applyMutation(user,row.id,s=>applyMissionChange(s,reserved,{calculateCost:()=>({xp:9,hp:5})}),new Date(time).toISOString()),first=await apply();assert.equal((await apply()).replayed,true);assert.equal(writes,1);
 const saved=JSON.parse(cloud.data),updated=saved.tasks[0];assert.equal(saved.tasks.length,2);assert.equal(updated.id,41);assert.equal(updated.planningWeekStart,'2026-11-02');assert.equal(updated.day,'monday');assert.equal(updated.endTime,'09:45');assert.equal(updated.priority,'baixa');assert.deepEqual(updated.subtasks[0],a.state.tasks[0].subtasks[0]);assert.equal(updated.subtasks[1].id,'sub-2');assert.equal(updated.subtasks[1].text,'Enviar versão revisada');assert.equal(updated.subtasks[2].completed,false);
 for(const k of ['radarDemandId','dependsOnTaskIds','dependencyReceipts','custom'])assert.deepEqual(updated[k],a.state.tasks[0][k]);for(const k of ['xp','energy','coins','combo','taskDeletionLog','operationalControl'])assert.deepEqual(saved[k],a.state[k]);assert.deepEqual(saved.tasks[1],a.state.tasks[1]);
 const receiptRef=await v2Hash(String(first.receipt.taskId));assert.equal((await a.owner('/v2/app/mission-changes/acknowledge',{id:row.id,receiptRef})).status,200);assert.equal((await a.owner('/v2/app/mission-changes/acknowledge',{id:row.id,receiptRef})).status,200);
});
test('stale public fields, hidden changes, closed weeks and protected mission types cannot be overwritten',async t=>{
 const a=await fixture(t),row=(await (await a.submit()).json()).part,preview=await previewMissionChange(a.state,row),reserved={...row,status:'applying',expectedTaskVersion:preview.taskVersion};
 for(const mutation of [s=>s.tasks[0].text='Changed',s=>s.tasks[0].priority='media',s=>s.tasks[0].subtasks[0].id='changed-hidden-id',s=>s.tasks[0].completed=true,s=>s.tasks[0].isRecurring=true,s=>s.tasks[0].googleCalendarSource='primary',s=>s.tasks[0].workflowStatus='in_progress',s=>s.planning.lastClosedWeek='2026-10-26']){const state=structuredClone(a.state);mutation(state);const before=JSON.stringify(state);await assert.rejects(()=>applyMissionChange(state,reserved));assert.equal(JSON.stringify(state),before);}
 const state=structuredClone(a.state);await assert.rejects(()=>previewMissionChange(state,row,{...row.fields,patch:{startTime:'23:50',durationMinutes:30}}));assert.deepEqual(state,a.state);
});
test('same week, previous open week, future week and managed calendar moves preserve identity and subtask order',async t=>{
 const a=await fixture(t),row=(await (await a.submit()).json()).part;
 for(const [date,week,day] of [['2026-10-28','2026-10-26','wednesday'],['2026-10-19','2026-10-19','monday'],['2026-11-09','2026-11-09','monday']]){const state=structuredClone(a.state);state.calendarSync={calendarId:'owned-test'};const fields={...row.fields,patch:{date}},preview=await previewMissionChange(state,row,fields);await applyMissionChange(state,{...row,fields,status:'applying',expectedTaskVersion:preview.taskVersion});assert.equal(state.tasks[0].day,day);assert.equal(state.tasks[0].planningWeekStart,week);assert.deepEqual(state.tasks[0].subtasks,a.state.tasks[0].subtasks);if(week!=='2026-10-26')assert.deepEqual(state.planning.calendarMoves,[{taskId:'41',week:'2026-10-26'}]);}
});
test('revocation blocks late writes, pagination is signed and expired payloads retain receipts',async t=>{
 const a=await fixture(t),write=await a.token(),read=await a.token('planning:read');for(let i=0;i<6;i++)assert.equal((await a.submit('paging-change-'+i)).status,200);const first=await (await a.rpc(read,'listMissionChanges',{})).json();assert.equal(first.items.length,5);assert.ok(first.nextCursor);assert.equal((await (await a.rpc(read,'listMissionChanges',{cursor:first.nextCursor})).json()).items.length,1);assert.equal((await a.rpc(read,'listMissionChanges',{cursor:first.nextCursor+'x'})).status,400);
 await a.owner('/v2/app/grant',{grantId:a.grant.grantId,expectedVersion:1},'DELETE');assert.equal((await a.rpc(write,'submitMissionChange',{idempotencyKey:'late-change-001',fields:a.fields})).status,401);assert.equal((await a.owner('/v2/app/mission-changes')).status,200);
 a.setTime(time+91*86400000);const expired=await (await a.owner('/v2/app/mission-changes?status=expired')).json();assert.equal(expired.items.length,5);assert.equal(expired.items[0].fields,null);
});
test('browser adapter validates scoped rows, final fields and owner identity before adoption',async t=>{
 const a=await fixture(t),user={uid:AI_OWNER_UID,getIdToken:async()=>'owner-synthetic'},store=createMissionChangeStore({getUser:()=>user,getAppCheckToken:async()=>'test-app-check',fetchImpl:async(url,options)=>a.call(new URL(url).pathname+new URL(url).search,options.body?JSON.parse(options.body):undefined,'owner-synthetic',options.method,APP_ORIGIN)});const row=(await (await a.submit()).json()).part;
 assert.equal((await store.list()).items[0].id,row.id);const preview=await previewMissionChange(a.state,row),reserved=await store.reserve(row,row.fields,preview.taskVersion);assert.equal(reserved.expectedTaskVersion,preview.taskVersion);assert.equal((await store.acknowledge(reserved,'a'.repeat(64))).status,'accepted');
});

test('switching accounts while an asynchronous mutation is prepared cancels the transaction before its write',async()=>{
 const old={data:JSON.stringify(initial()),revision:1},owner={uid:'synthetic-owner'};let user=owner,writes=0;
 const store=createCloudStateStore({getUser:()=>user,transact:async(_,work)=>work({get:async()=>structuredClone(old),set:()=>writes++})});store.observe(owner,old);
 await assert.rejects(()=>store.applyMutation(owner,'c'.repeat(64),async state=>{state.tasks[0].text='Tentativa';await Promise.resolve();user={uid:'other-account'};return {taskId:41,kind:'mission.update'};},new Date(time).toISOString()),/Sessão alterada/);assert.equal(writes,0);assert.equal(JSON.parse(old.data).tasks[0].text,'Análise fictícia');
});
