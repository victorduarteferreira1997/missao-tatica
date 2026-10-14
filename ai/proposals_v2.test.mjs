import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createWorker,APP_ORIGIN} from './cloudflare/worker.mjs';
import {AuthError} from './cloudflare/firebase_auth.mjs';
import {V2_PROPOSAL_TTL,v2ProposalRequest} from './v2/proposals.js';
import {installAiV2Proposals} from '../ui/ai_proposals.v2.js';
import {AI_OWNER_UID} from './contract.v1.js';
const base='https://missao-tatica-ai-bridge.victorduarteferreira1997.workers.dev',initial=Date.parse('2026-10-13T12:00:00Z'),secret='synthetic-proposals-secret-1234567890';
const schemas=await Promise.all(['schema.sql','oauth-schema.sql','v2-schema.sql','proposals-v2-schema.sql','apply-v2-schema.sql','entities-v2-schema.sql'].map(p=>readFile(new URL('./cloudflare/'+p,import.meta.url),'utf8')));
const fields={title:'Proposta fictícia',weekStart:'2026-10-12',day:'tuesday',durationMinutes:30,startTime:'',endTime:'',subtasks:['Passo fictício'],category:'pessoal'};
const proposal=(id='test-key-0001')=>({idempotencyKey:id,kind:'mission.create',fields:{...fields}});
async function fixture(t,{consent=true}={}){
 const sql=new DatabaseSync(':memory:');schemas.forEach(s=>sql.exec(s));t.after(()=>sql.close());let clock=initial,beforeRun=null;const calls=[];
 const db={prepare(q){return {bind(...a){return {first:async()=>{calls.push(q);return sql.prepare(q).get(...a)||null;},all:async()=>{calls.push(q);return {success:true,results:sql.prepare(q).all(...a)};},run:async()=>{calls.push(q);beforeRun?.(q);return {success:true,meta:{changes:Number(sql.prepare(q).run(...a).changes)}};}}}}}};
 const env={DB:db,ACTION_SECRET:secret,AI_V2_ENABLED:'true',AI_V2_READ_ENABLED:'true',AI_V2_PROPOSALS_ENABLED:'true'};
 const worker=createWorker({now:()=>clock,verifyOwner:async r=>{if(r.headers.get('Authorization')!=='Bearer synthetic-owner')throw new AuthError();}});
 const call=(path,method='POST',body,token=secret,headers={})=>worker.fetch(new Request(base+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})}),env);
 const owner=(path,method='GET',body)=>call(path,method,body,'synthetic-owner',{Origin:APP_ORIGIN});
 const g=(await (await owner('/v2/app/grant','PUT',{grantId:'proposal-grant-0001',expectedVersion:0,choices:{modules:{missions:true,radar:true,studies:true},includeFuture:true,...(consent?{allowProposals:true}:{})},frozenRefs:[]})).json()).grant;
 const token=async(scope='proposals:create')=>{const r=await call('/v2/connection','POST',{subject:'a'.repeat(64),expectedGrantId:g.grantId,expectedGrantVersion:g.version,...(scope!=='planning:read'?{requestedScope:scope}:{})});return {r,token:r.ok?(await r.json()).accessToken:null};};
 const rpc=(token,name,args)=>call('/v2/planning','POST',{name,arguments:args},token);
 return {sql,env,calls,g,call,owner,token,rpc,setTime:n=>clock=n,setBeforeRun:f=>beforeRun=f};
}
test('sem consentimento específico, flag ou token de criação não há proposta',async t=>{
 const a=await fixture(t,{consent:false});assert.equal((await a.token()).r.status,403);assert.equal(a.sql.prepare('SELECT COUNT(*) n FROM ai_v2_proposals').get().n,0);
 const b=await fixture(t);const read=await b.token('planning:read');assert.equal((await b.rpc(read.token,'createProposal',proposal())).status,403);
 b.env.AI_V2_PROPOSALS_ENABLED='false';const count=b.calls.length;assert.equal((await b.owner('/v2/app/proposals')).status,404);assert.equal(b.calls.length,count);
 assert.equal((await b.call('/healthz?check=proposals','GET')).status,200);
});
test('cria sem snapshot nem contexto semanal; repete a mesma chave sem duplicar e mantém horários não conferidos',async t=>{
 const a=await fixture(t),{token}=await a.token();assert.equal(a.sql.prepare('SELECT snapshot FROM ai_v2_access').get().snapshot,null);assert.equal(a.sql.prepare('SELECT COUNT(*) n FROM ai_context').get().n,0);
 const body=proposal(),first=await (await a.rpc(token,'createProposal',body)).json();assert.equal(first.proposal.status,'pending');assert.equal(first.proposal.applyEligible,false);assert.equal(first.proposal.conflictCheck,'unverified');assert.equal(first.replayed,false);
 const duplicate=await (await a.rpc(token,'createProposal',{kind:body.kind,fields:{category:'pessoal',subtasks:fields.subtasks,endTime:'',startTime:'',durationMinutes:30,day:'tuesday',weekStart:'2026-10-12',title:fields.title},idempotencyKey:body.idempotencyKey})).json();assert.equal(duplicate.replayed,true);assert.equal(duplicate.proposal.id,first.proposal.id);
 assert.equal(a.sql.prepare('SELECT COUNT(*) n FROM ai_v2_proposals').get().n,1);
 assert.equal((await a.rpc(token,'createProposal',{...body,fields:{...fields,title:'Outro conteúdo'}})).status,409);
 assert.equal(a.sql.prepare('SELECT COUNT(*) n FROM ai_proposals').get().n,0);
});
test('valida limites, campos permitidos, semana/dia e coerência de duração/horários',async t=>{
 const a=await fixture(t),{token}=await a.token();
 const bad=[{...proposal(),admin:true},{...proposal(),fields:{...fields,xp:999}},{...proposal(),fields:{...fields,weekStart:'2026-10-13'}},{...proposal(),fields:{...fields,startTime:'10:00',endTime:'10:45'}},{...proposal(),fields:{...fields,subtasks:Array(13).fill('a')}},{...proposal(),basis:{projectionVersion:-1}}];
 for(const b of bad)assert.ok((await a.rpc(token,'createProposal',b)).status>=400);
 assert.equal(a.sql.prepare('SELECT COUNT(*) n FROM ai_v2_proposals').get().n,0);
 const valid=proposal();valid.basis={projectionVersion:0};assert.equal((await a.rpc(token,'createProposal',valid)).status,200);
 assert.throws(()=>v2ProposalRequest({...proposal(),fields:{...fields,title:'a'.repeat(201)}},{grantId:a.g.grantId,grantVersion:a.g.version}));
});
test('concorrência da chave cria uma vez e revogação antes do insert impede criação',async t=>{
 const a=await fixture(t),{token}=await a.token();const results=await Promise.all([a.rpc(token,'createProposal',proposal()),a.rpc(token,'createProposal',proposal())]);assert.deepEqual(results.map(r=>r.status),[200,200]);assert.equal(a.sql.prepare('SELECT COUNT(*) n FROM ai_v2_proposals').get().n,1);
 const b=await fixture(t),bt=(await b.token()).token;b.setBeforeRun(q=>{if(q.startsWith('INSERT INTO ai_v2_proposals')){b.setBeforeRun(null);b.sql.prepare("UPDATE ai_v2_access SET version=version+1,status='revoked'").run();}});
 assert.equal((await b.rpc(bt,'createProposal',proposal())).status,401);assert.equal(b.sql.prepare('SELECT COUNT(*) n FROM ai_v2_proposals').get().n,0);
});
test('owner consulta e recusa após revogação; revisão é condicional, idempotente e sem aceitação definitiva',async t=>{
 const a=await fixture(t),{token}=await a.token(),p=(await (await a.rpc(token,'createProposal',proposal())).json()).proposal;
 await a.owner('/v2/app/grant','DELETE',{grantId:a.g.grantId,expectedVersion:a.g.version});
 assert.equal((await a.rpc(token,'createProposal',proposal('test-key-0002'))).status,401);
 const rows=await (await a.owner('/v2/app/proposals')).json();assert.equal(rows.items.length,1);
 const body={id:p.id,expectedVersion:p.version};assert.equal((await a.owner('/v2/app/proposals/reject','POST',body)).status,200);assert.equal((await a.owner('/v2/app/proposals/reject','POST',body)).status,200);
 assert.equal((await a.owner('/v2/app/proposals/reject','POST',{...body,expectedVersion:99})).status,409);
 assert.equal((await a.owner('/v2/app/proposals/reject','POST',{...body,status:'accepted'})).status,422);
 assert.equal(a.sql.prepare('SELECT status FROM ai_v2_proposals').get().status,'rejected');assert.equal((await (await a.owner('/v2/app/proposals')).json()).items.length,0);
});
test('listas MCP só mostram o grant atual e cursos não atravessam autorização, filtro ou página',async t=>{
 const a=await fixture(t),write=(await a.token()).token,read=(await a.token('planning:read')).token;
 for(let i=0;i<3;i++)await a.rpc(write,'createProposal',proposal('pagination-key-'+i));
 const first=await (await a.rpc(read,'listProposals',{pageSize:2})).json();assert.equal(first.items.length,2);assert.ok(first.nextCursor);
 const next=await (await a.rpc(read,'listProposals',{cursor:first.nextCursor,pageSize:2})).json();assert.equal(next.items.length,1);assert.equal(next.nextCursor,null);
 assert.equal((await a.rpc(read,'listProposals',{cursor:first.nextCursor,pageSize:2,status:'rejected'})).status,400);
 assert.equal((await a.owner('/v2/app/proposals?cursor='+encodeURIComponent(first.nextCursor)+'&pageSize=2')).status,400);
 const rows=await (await a.owner('/v2/app/proposals')).json();assert.equal(rows.items.length,3);
 assert.equal((await a.call('/v2/app/proposals','GET',undefined,read,{Origin:APP_ORIGIN})).status,401);
});
test('expiração remove payload e preserva marcador de repetição; capacidade limita novas chaves',async t=>{
 const a=await fixture(t),{token}=await a.token();const p=(await (await a.rpc(token,'createProposal',proposal())).json()).proposal;a.setTime(initial+V2_PROPOSAL_TTL+1);
 const rows=await (await a.owner('/v2/app/proposals?status=expired')).json();assert.equal(rows.items[0].fields,null);assert.equal(rows.items[0].status,'expired');assert.equal(a.sql.prepare('SELECT payload FROM ai_v2_proposals WHERE id=?').get(p.id).payload,null);assert.equal(a.sql.prepare('SELECT COUNT(*) n FROM ai_v2_proposals').get().n,1);
 const b=await fixture(t),bt=(await b.token()).token;await b.rpc(bt,'createProposal',proposal());const seed=b.sql.prepare('SELECT * FROM ai_v2_proposals').get();const stmt=b.sql.prepare('INSERT INTO ai_v2_proposals(id,grant_id,grant_version,payload_hash,created_at,expires_at,payload) VALUES(?,?,?,?,?,?,?)');for(let i=1;i<100;i++)stmt.run(i.toString(16).padStart(64,'0'),seed.grant_id,seed.grant_version,seed.payload_hash,seed.created_at,seed.expires_at,seed.payload);
 assert.equal((await b.rpc(bt,'createProposal',proposal('capacity-new-key'))).status,409);assert.equal(b.sql.prepare('SELECT COUNT(*) n FROM ai_v2_proposals').get().n,100);
});
test('fila do app não abre nem consulta com flag desligada; erros e sessão anterior não removem itens nem reabrem janela',async()=>{
 const w={escapeHtml:s=>String(s).replaceAll('<','&lt;'),bindFormDialog(){}};let user={uid:AI_OWNER_UID},calls=0,resolve;
 installAiV2Proposals(w,{config:{enabled:true,proposalsEnabled:false},getUser:()=>user,store:{list:()=>calls++},render(){}});await w.openAiV2Proposals();assert.equal(calls,0);assert.equal(w.renderAiV2ProposalsButton(),'');
 installAiV2Proposals(w,{config:{enabled:true,proposalsEnabled:true},getUser:()=>user,store:{list:()=>new Promise(r=>resolve=r)},render(){}});const load=w.openAiV2Proposals();w.closeAiV2Proposals();resolve({items:[],nextCursor:null});await load;assert.equal(w.renderAiV2Proposals(),'');
 const second=w.openAiV2Proposals();user=null;w.resetAiV2Proposals();resolve({items:[],nextCursor:null});await second;assert.equal(w.renderAiV2Proposals(),'');
});

test('reserva congela campos, impede recusa concorrente e confirmação pode repetir sem outro cadastro',async t=>{
 const a=await fixture(t),token=(await a.token()).token;const p=(await (await a.rpc(token,'createProposal',proposal())).json()).proposal;
 const body={id:p.id,expectedVersion:p.version,applicationId:p.id,fields:{...fields,title:'Título revisado'}};
 assert.equal((await a.owner('/v2/app/proposals/reserve','POST',body)).status,404);a.env.AI_V2_APPLY_ENABLED='true';
 const reserved=await (await a.owner('/v2/app/proposals/reserve','POST',body)).json();assert.equal(reserved.proposal.status,'applying');assert.equal(reserved.proposal.fields.title,'Título revisado');
 assert.equal((await a.owner('/v2/app/proposals/reject','POST',{id:p.id,expectedVersion:1})).status,409);
 assert.equal((await a.owner('/v2/app/proposals/reserve','POST',{...body,fields:{...fields,title:'Outro'}})).status,409);
 const ack={id:p.id,applicationId:p.id,taskRef:'b'.repeat(64)};assert.equal((await a.owner('/v2/app/proposals/acknowledge','POST',ack)).status,200);assert.equal((await a.owner('/v2/app/proposals/acknowledge','POST',ack)).status,200);
 assert.equal((await (await a.owner('/v2/app/proposals')).json()).items.length,0);assert.equal((await (await a.owner('/v2/app/proposals?status=accepted')).json()).items.length,1);
 assert.equal((await a.owner('/v2/app/proposals/acknowledge','POST',{...ack,taskRef:'c'.repeat(64)})).status,409);
 assert.equal(a.sql.prepare('SELECT COUNT(*) n FROM ai_v2_applications').get().n,1);
});
test('recusa anterior impede reserva; reserva sobrevive expiração para recuperação',async t=>{
 const a=await fixture(t);a.env.AI_V2_APPLY_ENABLED='true';const token=(await a.token()).token,p=(await (await a.rpc(token,'createProposal',proposal())).json()).proposal;
 await a.owner('/v2/app/proposals/reject','POST',{id:p.id,expectedVersion:1});assert.equal((await a.owner('/v2/app/proposals/reserve','POST',{id:p.id,expectedVersion:1,applicationId:p.id,fields})).status,409);
 const b=await fixture(t);b.env.AI_V2_APPLY_ENABLED='true';const bp=(await (await b.rpc((await b.token()).token,'createProposal',proposal())).json()).proposal;
 await b.owner('/v2/app/proposals/reserve','POST',{id:bp.id,expectedVersion:1,applicationId:bp.id,fields});b.setTime(initial+V2_PROPOSAL_TTL+1);
 const list=await (await b.owner('/v2/app/proposals?status=applying')).json();assert.equal(list.items.length,1);assert.equal(list.items[0].fields.title,fields.title);
});

const radarFields={title:'Demanda fictícia',area:'Pessoal',project:'Teste',nextAction:'Conferir informações',status:'active',attentionLevel:'controlled',dueDate:'',nextReviewAt:'',waitingFor:'',waitingSince:'',followUpAt:''};
const studyFields={title:'Plano fictício',weeklyGoalMinutes:60,subjects:[{name:'Inglês'}],blocks:[{title:'Vocabulário',subjectIndex:0,day:'monday',plannedMinutes:30,startTime:'',endTime:'',studyType:'teoria'}]};
async function entityConsent(a,permissions={radar:true,studies:true}){
 a.env.AI_V2_ENTITIES_ENABLED='true';a.env.AI_V2_APPLY_ENABLED='true';const choices={modules:{missions:false,radar:true,studies:true},includeFuture:true,allowProposals:false,allowRadarProposals:permissions.radar,allowStudyProposals:permissions.studies};
 await a.owner('/v2/app/grant','PUT',{grantId:a.g.grantId,expectedVersion:1,choices,frozenRefs:[]});a.g.version=2;
 return (await a.token()).token;
}
test('RADAR e estudo exigem suas permissões; token novo não precisa compartilhar missões; Finanças e Corpo são recusados',async t=>{
 const a=await fixture(t),old=(await a.token()).token;assert.equal((await a.rpc(old,'createProposal',{kind:'radar.create',idempotencyKey:'radar-key-0001',fields:radarFields})).status,404);
 const token=await entityConsent(a,{radar:true,studies:false});assert.ok(token);const body={kind:'radar.create',idempotencyKey:'radar-key-0001',fields:radarFields};const reply=await (await a.rpc(token,'createProposal',body)).json();assert.equal(reply.proposal.kind,'radar.create');assert.equal(reply.proposal.applyEligible,true);
 assert.equal((await a.rpc(token,'createProposal',{kind:'study.plan.create',idempotencyKey:'study-key-0001',fields:studyFields})).status,403);
 for(const kind of ['finance.create','body.create'])assert.equal((await a.rpc(token,'createProposal',{kind,idempotencyKey:'other-key-0001',fields:radarFields})).status,400);
 assert.equal((await a.rpc(token,'createProposal',{...body,fields:{...radarFields,dueDate:'2026-99-01'}})).status,422);
});
test('planos validam disciplinas, blocos, horários e repetição; reserva e lista preservam kind',async t=>{
 const a=await fixture(t),token=await entityConsent(a),body={kind:'study.plan.create',idempotencyKey:'study-key-0001',fields:studyFields};
 const p=(await (await a.rpc(token,'createProposal',body)).json()).proposal;assert.equal((await (await a.rpc(token,'createProposal',body)).json()).replayed,true);
 for(const fields of [{...studyFields,xp:99},{...studyFields,blocks:[{...studyFields.blocks[0],subjectIndex:1}]},{...studyFields,subjects:[{name:'Inglês'},{name:' inglês '}]},{...studyFields,blocks:[{...studyFields.blocks[0],startTime:'10:00',endTime:'10:05'}]}])assert.equal((await a.rpc(token,'createProposal',{...body,idempotencyKey:'bad-study-key-001',fields})).status,422);
 const reserved=await (await a.owner('/v2/app/proposals/reserve','POST',{id:p.id,expectedVersion:1,applicationId:p.id,fields:studyFields})).json();assert.equal(reserved.proposal.kind,'study.plan.create');
 await a.owner('/v2/app/proposals/acknowledge','POST',{id:p.id,applicationId:p.id,taskRef:'a'.repeat(64)});const listed=await (await a.owner('/v2/app/proposals?status=accepted')).json();assert.equal(listed.items[0].kind,'study.plan.create');
});
test('alteração RADAR só aceita alvo/version consultados; snapshot concorrente bloqueia insert e alvo não pode mudar na revisão',async t=>{
 const a=await fixture(t),token=await entityConsent(a);const entity={ref:'a'.repeat(64),kind:'radar',entityVersion:'b'.repeat(64),fields:radarFields};
 a.sql.prepare('UPDATE ai_v2_access SET snapshot=?').run(JSON.stringify({entities:[entity]}));
 const body={kind:'radar.update',idempotencyKey:'radar-update-key-01',fields:{...radarFields,targetRef:entity.ref,targetVersion:entity.entityVersion}};
 assert.equal((await a.rpc(token,'createProposal',{...body,fields:{...body.fields,targetRef:'c'.repeat(64)}})).status,409);
 const p=(await (await a.rpc(token,'createProposal',body)).json()).proposal;
 assert.equal((await a.owner('/v2/app/proposals/reserve','POST',{id:p.id,expectedVersion:1,applicationId:p.id,fields:{...body.fields,targetRef:'c'.repeat(64)}})).status,409);
 a.setBeforeRun(q=>{if(q.startsWith('INSERT INTO ai_v2_proposals')){a.setBeforeRun(null);a.sql.prepare('UPDATE ai_v2_access SET snapshot=?').run(JSON.stringify({entities:[]}));}});
 assert.equal((await a.rpc(token,'createProposal',{...body,idempotencyKey:'radar-update-key-02'})).status,409);
 assert.equal((await (await a.rpc(token,'createProposal',body)).json()).replayed,true);
});
