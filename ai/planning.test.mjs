import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createWorker,APP_ORIGIN} from './cloudflare/worker.mjs';
import {BRIDGE_BASE,MCP_RESOURCE} from './cloudflare/plugin.mjs';
import {AuthError} from './cloudflare/firebase_auth.mjs';
import {v2BuildSnapshot} from './v2/contract.js';
const initial=Date.parse('2026-10-13T12:00:00Z'),secret='synthetic-planning-secret-'.padEnd(48,'x');
const schemas=await Promise.all(['schema.sql','oauth-schema.sql','v2-schema.sql'].map(p=>readFile(new URL('./cloudflare/'+p,import.meta.url),'utf8')));
const client='https://chatgpt.com/oauth/client.json',callback='https://chatgpt.com/connector_platform_oauth_redirect',verifier='a'.repeat(43);
const challenge=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))).toString('base64url');
async function fixture(t,{modules={missions:true,radar:true,studies:true},missing=false}={}){
 const sql=new DatabaseSync(':memory:');schemas.forEach(s=>sql.exec(s));t.after(()=>sql.close());let clock=initial,beforeFirst=null;const queries=[];
 const db={prepare(q){return {bind(...a){return {first:async()=>{queries.push(q);beforeFirst?.(q);return sql.prepare(q).get(...a)||null;},run:async()=>{queries.push(q);return {success:true,meta:{changes:Number(sql.prepare(q).run(...a).changes)}};}}}}}};
 const env={DB:db,ACTION_SECRET:secret,AI_V2_ENABLED:'true',AI_V2_READ_ENABLED:'true'};
 const worker=createWorker({now:()=>clock,verifyOwner:async r=>{if(r.headers.get('Authorization')!=='Bearer owner')throw new AuthError();},pluginFetch:async()=>Response.json({client_id:client,redirect_uris:[callback],token_endpoint_auth_methods_supported:['none']})});
 const call=(path,method='POST',body,token=secret,headers={})=>worker.fetch(new Request(BRIDGE_BASE+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})}),env);
 const owner=(path,method,body)=>call(path,method,body,'owner',{Origin:APP_ORIGIN});
 let g=(await (await owner('/v2/app/grant','PUT',{grantId:'planning-grant-0001',expectedVersion:0,choices:{modules,includeFuture:true},frozenRefs:[]})).json()).grant;
 const state={lastSavedAt:new Date(clock).toISOString(),tasks:Array.from({length:55},(_,i)=>({id:'private-local-'+i,text:'Missão '+i,category:i%2?'pessoal':'trabalho',day:i%2?'monday':'tuesday',time:'30 min',completed:i%3===0,planningWeekStart:i%2?'2026-10-12':''})),operationalControl:{demands:[{id:'private-radar',title:'Demanda',workflowStatus:'waiting',attentionLevel:'attention',nextAction:'Acompanhar',waitingFor:'Equipe',area:'pessoal',project:'Projeto'}]},studyData:{studyPlan:{tracks:[{id:'track',name:'Trilha',weeklyGoalMinutes:120,active:true}],weeklyBlocks:[]},subjects:[{id:'subject',name:'Disciplina',trackId:'track'}],sessions:[{subjectId:'subject',duration:40,qTotal:10,qCorrect:8,notes:'private note'}],reviews:[],cycles:[]}};
 if(!missing){const s=await v2BuildSnapshot(state,g);g=(await (await owner('/v2/app/snapshot','PUT',s)).json()).grant;}
 const mint=(expected={})=>call('/v2/connection','POST',{subject:'a'.repeat(64),expectedGrantId:null,expectedGrantVersion:0,...expected});
 const token=async()=>{const r=await mint();assert.equal(r.status,200);return (await r.json()).accessToken;};
 const read=(token,name='getPlanningOverview',args={})=>call('/v2/planning','POST',{name,arguments:args},token);
 const consent=async(scope='planning:read')=>{const q=new URLSearchParams({response_type:'code',client_id:client,redirect_uri:callback,resource:MCP_RESOURCE,scope,state:'state',code_challenge:challenge,code_challenge_method:'S256'});const r=await worker.fetch(new Request(BRIDGE_BASE+'/oauth/authorize?'+q),env);assert.equal(r.status,200);const html=await r.text();return {ticket:html.match(/name="ticket" value="([^"]+)"/)[1],cookie:r.headers.get('Set-Cookie').split(';')[0]};};
 const form=(path,body,headers={})=>worker.fetch(new Request(BRIDGE_BASE+path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',...headers},body:new URLSearchParams(body)}),env);
 const allow=c=>form('/oauth/authorize',{ticket:c.ticket,secret,decision:'allow'},{Origin:BRIDGE_BASE,Cookie:c.cookie});
 const exchange=code=>form('/oauth/token',{grant_type:'authorization_code',client_id:client,redirect_uri:callback,resource:MCP_RESOURCE,code,code_verifier:verifier});
 const oauth=async(scope)=>{const r=await allow(await consent(scope));assert.equal(r.status,303);const result=await exchange(new URL(r.headers.get('Location')).searchParams.get('code'));assert.equal(result.status,200);return result.json();};
 const rpc=(token,name,args={})=>call('/mcp','POST',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},token,{Accept:'application/json, text/event-stream'});
 return {sql,queries,env,call,owner,mint,token,read,oauth,rpc,consent,allow,exchange,state,grant:()=>g,setTime:t=>clock=t,setBeforeFirst:f=>beforeFirst=f};
}
test('consultas só funcionam com flag, token vinculado e autorização ativa; segredo bruto não lê dados',async t=>{
 const a=await fixture(t),count=a.queries.length;
 assert.equal((await a.read(secret)).status,401);assert.equal(a.queries.length,count);
 a.env.AI_V2_READ_ENABLED='false';assert.equal((await a.mint()).status,404);assert.equal(a.queries.length,count);
 assert.deepEqual(await (await a.call('/healthz?check=reads','GET',undefined)).json(),{service:'missao-tatica-ai-bridge',readsVersion:1,enabled:false});assert.equal(a.queries.length,count);
 a.env.AI_V2_READ_ENABLED='true';const token=await a.token();
 assert.equal((await a.call('/v2/planning','POST',{name:'getPlanningOverview',arguments:{}},token,{Origin:'https://attacker.example'})).status,403);
 const before=a.queries.length;assert.equal((await a.read(token+'x')).status,401);assert.equal(a.queries.length,before);
 a.env.ACTION_SECRET='rotated-synthetic-secret-'.padEnd(48,'y');assert.equal((await a.read(token)).status,401);
});
test('resumo e listas retornam DTOs autorizados e estudos agregados, com data e limites reais',async t=>{
 const a=await fixture(t),token=await a.token(),summary=await (await a.read(token)).json();
 assert.deepEqual(summary.counts,{missions:55,radar:1,studies:2});assert.equal(summary.freshness,'fresh');assert.equal(summary.availabilityVerified,false);assert.equal(summary.partial,true);
 assert.equal(summary.sourceSavedAt,new Date(initial).toISOString());assert.equal(Date.parse(summary.freshUntil),initial+86400000);
 const missions=await (await a.read(token,'listMissions',{status:'completed',category:'pessoal',pageSize:50})).json();assert.ok(missions.total>0);assert.ok(missions.items.every(e=>e.fields.status==='completed'&&e.fields.category==='pessoal'));
 const known=await (await a.read(token,'listMissions',{weekStart:'2026-10-12',pageSize:50})).json();assert.ok(known.items.every(e=>e.fields.weekStart==='2026-10-12'));
 const radar=await (await a.read(token,'listRadarDemands',{status:'waiting',query:'demanda'})).json();assert.equal(radar.items[0].fields.waitingFor,'Equipe');
 const studies=await (await a.read(token,'listStudies',{kind:'study.subject'})).json();assert.deepEqual(studies.items[0].fields.progress,{minutes:40,sessions:1,questions:10,correct:8});
 assert.doesNotMatch(JSON.stringify({summary,missions,radar,studies}),/private-local|private-radar|private note|synthetic-planning-secret/);
 for(const args of [{pageSize:51},{status:'closed'},{weekStart:'2026-10-13'},{xp:999}])assert.equal((await a.read(token,'listMissions',args)).status,400);
});
test('paginação é completa, cursor opaco e condicionado ao filtro, grant e projeção',async t=>{
 const a=await fixture(t),token=await a.token();let cursor,items=[];
 do{const result=await (await a.read(token,'listMissions',{pageSize:25,...(cursor?{cursor}:{})})).json();assert.ok(result.items.length<=25);items.push(...result.items);cursor=result.nextCursor;}while(cursor);
 assert.equal(items.length,55);assert.equal(new Set(items.map(e=>e.ref)).size,55);
 const first=await (await a.read(token,'listMissions',{pageSize:25,query:'Missão'})).json();
 assert.equal((await a.read(token,'listMissions',{query:'Missão',cursor:first.nextCursor,pageSize:25})).status,200);
 assert.equal((await a.read(token,'listRadarDemands',{cursor:first.nextCursor,pageSize:25,query:'Missão'})).status,400);
 assert.equal((await a.read(token,'listMissions',{cursor:first.nextCursor,pageSize:50,query:'Missão'})).status,400);
 assert.equal((await a.read(token,'listMissions',{cursor:first.nextCursor+'x'})).status,400);
 const g=a.grant();await a.owner('/v2/app/snapshot','PUT',await v2BuildSnapshot(a.state,g,g.projectionVersion));
 assert.equal((await a.read(token,'listMissions',{cursor:first.nextCursor,pageSize:25,query:'Missão'})).status,409);
});
test('módulos recusados não expõem entidades; cópia ausente e antiga não fingem disponibilidade',async t=>{
 const a=await fixture(t,{modules:{missions:true,radar:false,studies:false},missing:true}),token=await a.token();
 const absent=await (await a.read(token)).json();assert.equal(absent.freshness,'unavailable');assert.deepEqual(absent.counts,{missions:null,radar:null,studies:null});
 const list=await (await a.read(token,'listMissions')).json();assert.equal(list.total,null);assert.deepEqual(list.items,[]);
 for(const name of ['listRadarDemands','listStudies'])assert.equal((await a.read(token,name)).status,403);
 const b=await fixture(t);b.setTime(initial+86400001);const stale=await (await b.read(await b.token())).json();assert.equal(stale.freshness,'stale');assert.equal(stale.availabilityVerified,false);assert.equal(stale.counts.missions,55);
});
test('revogar, substituir grant ou expirar bloqueia tokens anteriores e renovação silenciosa',async t=>{
 const a=await fixture(t),token=await a.token(),g=a.grant();await a.owner('/v2/app/grant','DELETE',{grantId:g.grantId,expectedVersion:g.version});
 assert.equal((await a.read(token)).status,401);assert.equal((await a.mint({expectedGrantId:g.grantId,expectedGrantVersion:g.version})).status,401);
 assert.equal(a.sql.prepare('SELECT snapshot FROM ai_v2_access').get().snapshot,null);
 await a.owner('/v2/app/grant','PUT',{grantId:'replacement-grant-0001',expectedVersion:g.version+1,choices:g.choices,frozenRefs:[]});
 assert.equal((await a.read(token)).status,401);assert.equal((await a.mint({expectedGrantId:g.grantId,expectedGrantVersion:g.version})).status,401);
 const current=await a.token();a.setTime(initial+300000);const count=a.queries.length;assert.equal((await a.read(current)).status,401);assert.equal(a.queries.length,count);
 a.setTime(initial+30*86400000);assert.equal((await a.mint()).status,401);
});
test('alteração concorrente durante consulta e payload contaminado não retornam dados antigos ou privados',async t=>{
 const a=await fixture(t),token=await a.token();a.setBeforeFirst(q=>{if(q.startsWith('SELECT version')){a.setBeforeFirst(null);a.sql.prepare("UPDATE ai_v2_access SET version=version+1,status='revoked',snapshot=NULL").run();}});
 const r=await a.read(token,'listMissions');assert.equal(r.status,409);assert.deepEqual(await r.json(),{error:'planning_changed'});
 const b=await fixture(t),bt=await b.token(),row=b.sql.prepare('SELECT snapshot FROM ai_v2_access').get(),s=JSON.parse(row.snapshot);s.entities[0].fields.secret='do not expose';b.sql.prepare('UPDATE ai_v2_access SET snapshot=?').run(JSON.stringify(s));
 const invalid=await b.read(bt);assert.equal(invalid.status,422);assert.doesNotMatch(await invalid.text(),/do not expose/);
});
test('OAuth direto não amplia tokens antigos; novo consentimento vincula grant e scope somente de leitura',async t=>{
 const a=await fixture(t),old=await a.oauth('context:read');assert.equal((await a.rpc(old.access_token,'getPlanningOverview')).status,403);
 const next=await a.oauth('planning:read');assert.equal(next.expires_in,3600);
 const response=await (await a.rpc(next.access_token,'listStudies',{kind:'study.subject'})).json();assert.equal(response.result.structuredContent.items.length,1);
 assert.equal((await a.rpc(next.access_token,'submitProposal',{})).status,403);
 const c=await a.consent();const g=a.grant();await a.owner('/v2/app/grant','DELETE',{grantId:g.grantId,expectedVersion:g.version});
 assert.equal((await a.allow(c)).status,401);assert.equal((await a.rpc(next.access_token,'getPlanningOverview')).status,401);
});
