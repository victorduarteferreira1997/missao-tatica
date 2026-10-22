import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createWorker,APP_ORIGIN} from './cloudflare/worker.mjs';
import {AuthError} from './cloudflare/firebase_auth.mjs';
import {createCloudStateStore} from './v2/cloud_state.js';
import {applyLibraryImport} from '../library_import.v1.js';
import {emptyLibrary} from '../library.v2.js';
import {v2Hash} from './v2/contract.js';
const time=Date.parse('2026-10-22T12:00:00Z'),secret='synthetic-catalog-secret-long-enough';
const fields={title:'Catálogo de teste',batchKey:'catalog-batch-001',partIndex:1,partCount:1,books:[{sourceKey:'row-1',title:'Livro fictício',authors:'Autoria',category:'História',editions:[{format:'physical',owned:true}]}]};
const request=(key='catalog-request-001')=>({idempotencyKey:key,fields:structuredClone(fields)});
async function fixture(t,{consent=true,flag=true}={}){
 const sql=new DatabaseSync(':memory:');for(const path of ['schema.sql','oauth-schema.sql','v2-schema.sql','proposals-v2-schema.sql','apply-v2-schema.sql','entities-v2-schema.sql','library-import-schema.sql'])sql.exec(await readFile(new URL('./cloudflare/'+path,import.meta.url),'utf8'));t.after(()=>sql.close());let clock=time,beforeRun=null;
 const db={prepare(q){return {bind(...a){return {first:async()=>sql.prepare(q).get(...a)||null,all:async()=>({success:true,results:sql.prepare(q).all(...a)}),run:async()=>{beforeRun?.(q);return {success:true,meta:{changes:Number(sql.prepare(q).run(...a).changes)}};}};}};}};
 const env={DB:db,ACTION_SECRET:secret,AI_V2_ENABLED:'true',AI_V2_READ_ENABLED:'true',AI_V2_PROPOSALS_ENABLED:'true',AI_V2_APPLY_ENABLED:'true',AI_LIBRARY_IMPORT_ENABLED:flag?'true':'false'};
 const worker=createWorker({now:()=>clock,verifyOwner:async r=>{if(r.headers.get('Authorization')!=='Bearer owner-synthetic')throw new AuthError();}});
 const call=(path,body,token=secret,method='POST',origin)=>worker.fetch(new Request('https://bridge.example'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(origin?{Origin:origin}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
 const owner=(path,body,method=body?'POST':'GET')=>call(path,body,'owner-synthetic',method,APP_ORIGIN);
 const choices={modules:{missions:!consent,radar:false,studies:false},includeFuture:false,...(consent?{allowLibraryProposals:true}:{allowProposals:true})};
 const grant=(await (await owner('/v2/app/grant',{grantId:'library-grant-fixture',expectedVersion:0,choices,frozenRefs:[]},'PUT')).json()).grant;
 const token=async(scope='proposals:create')=>{const response=await call('/v2/connection',{subject:'a'.repeat(64),expectedGrantId:grant.grantId,expectedGrantVersion:grant.version,...(scope==='planning:read'?{}:{requestedScope:scope})});return {response,value:response.ok?(await response.json()).accessToken:null};};
 const rpc=(token,name,args)=>call('/v2/planning',{name,arguments:args},token);
 return {sql,env,call,owner,token,rpc,grant,setTime:n=>clock=n,before:fn=>beforeRun=fn};
}
test('catalog import requires its own permission, write scope, owner auth/origin and explicit server flag',async t=>{
 const a=await fixture(t,{consent:false}),write=(await a.token()).value;assert.equal((await a.rpc(write,'submitLibraryCatalog',request())).status,403);assert.equal(a.sql.prepare('SELECT COUNT(*) n FROM ai_library_imports').get().n,0);
 const b=await fixture(t),read=(await b.token('planning:read')).value;assert.equal((await b.rpc(read,'submitLibraryCatalog',request())).status,403);
 assert.equal((await b.call('/v2/app/library-imports',undefined,'wrong','GET',APP_ORIGIN)).status,401);assert.equal((await b.call('/v2/app/library-imports',undefined,'owner-synthetic','GET','https://evil.example')).status,403);
 b.env.AI_LIBRARY_IMPORT_ENABLED='false';assert.equal((await b.owner('/v2/app/library-imports')).status,404);
});
test('submit is pending and idempotent, validates payload and cannot create missions or access the shelf',async t=>{
 const a=await fixture(t),token=(await a.token()).value,first=await (await a.rpc(token,'submitLibraryCatalog',request())).json();assert.equal(first.part.status,'pending');assert.equal(first.replayed,false);
 const repeated=await (await a.rpc(token,'submitLibraryCatalog',request())).json();assert.equal(repeated.part.id,first.part.id);assert.equal(repeated.replayed,true);
 const changed=request();changed.fields.books[0].title='Other';assert.equal((await a.rpc(token,'submitLibraryCatalog',changed)).status,409);
 const bad=request('invalid-request-key');bad.fields.books[0].xp=99;assert.equal((await a.rpc(token,'submitLibraryCatalog',bad)).status,422);assert.equal(a.sql.prepare('SELECT COUNT(*) n FROM ai_library_imports').get().n,1);assert.equal(a.sql.prepare('SELECT COUNT(*) n FROM ai_v2_proposals').get().n,0);assert.equal(a.sql.prepare('SELECT snapshot FROM ai_v2_access').get().snapshot,null);
});
test('reservation preserves final edits and selection, guards identity and locks applying values for retry',async t=>{
 const a=await fixture(t),token=(await a.token()).value,row=(await (await a.rpc(token,'submitLibraryCatalog',request())).json()).part;
 const f=structuredClone(row.fields);f.books[0].title='Revisado';const body={id:row.id,expectedVersion:row.version,fields:f,selection:['row-1']};
 const reserved=await (await a.owner('/v2/app/library-imports/reserve',body)).json();assert.equal(reserved.part.status,'applying');assert.equal(reserved.part.fields.books[0].title,'Revisado');assert.equal((await a.owner('/v2/app/library-imports/reserve',body)).status,200);
 const changed=structuredClone(body);changed.fields.books[0].title='Troca';assert.equal((await a.owner('/v2/app/library-imports/reserve',changed)).status,409);assert.equal((await a.owner('/v2/app/library-imports/reject',{id:row.id,expectedVersion:1})).status,409);
 const bad=request('other-part-request');const other=(await (await a.rpc(token,'submitLibraryCatalog',bad)).json()).part;const identity=structuredClone(other.fields);identity.batchKey='changed-batch-key';assert.equal((await a.owner('/v2/app/library-imports/reserve',{id:other.id,expectedVersion:1,fields:identity,selection:[]})).status,409);
});
test('cloud transaction and lost acknowledgment recover without duplicates, preserving all old state and receipts',async t=>{
 const a=await fixture(t),token=(await a.token()).value,row=(await (await a.rpc(token,'submitLibraryCatalog',request())).json()).part;
 const reserved=(await (await a.owner('/v2/app/library-imports/reserve',{id:row.id,expectedVersion:1,fields:row.fields,selection:['row-1']})).json()).part;
 const user={uid:'synthetic-owner'},old={tasks:[{id:1}],combo:8,xp:120,libraryData:emptyLibrary()};let cloud={data:JSON.stringify(old),revision:1},writes=0;
 const store=createCloudStateStore({getUser:()=>user,transact:async(_,work)=>work({get:async()=>structuredClone(cloud),set:value=>{cloud=structuredClone(value);writes++;}})});store.observe(user,cloud);
 const apply=()=>store.applyMutation(user,row.id,s=>applyLibraryImport(s,reserved.fields,reserved.selection,{proposalId:row.id}),new Date(time).toISOString());
 const first=await apply(),retry=await apply();assert.equal(retry.replayed,true);assert.equal(writes,1);const saved=JSON.parse(cloud.data);assert.equal(saved.libraryData.books.length,1);assert.equal(saved.combo,8);assert.equal(saved.xp,120);assert.deepEqual(saved.tasks,old.tasks);assert.equal(saved.libraryData.imports.length,1);
 const receiptRef=await v2Hash(first.receipt.taskId);assert.equal((await a.owner('/v2/app/library-imports/acknowledge',{id:row.id,receiptRef})).status,200);assert.equal((await a.owner('/v2/app/library-imports/acknowledge',{id:row.id,receiptRef})).status,200);assert.equal((await a.owner('/v2/app/library-imports/acknowledge',{id:row.id,receiptRef:'f'.repeat(64)})).status,409);
});
test('revocation blocks late submits and MCP reads; owner can review existing proposals after revocation',async t=>{
 const a=await fixture(t),token=(await a.token()).value;await a.rpc(token,'submitLibraryCatalog',request());await a.owner('/v2/app/grant',{grantId:a.grant.grantId,expectedVersion:a.grant.version},'DELETE');assert.equal((await a.rpc(token,'submitLibraryCatalog',request('after-revoke-key'))).status,401);
 assert.equal((await a.owner('/v2/app/library-imports')).status,200);
 const b=await fixture(t),bt=(await b.token()).value;b.before(q=>{if(q.startsWith('INSERT INTO ai_library_imports')){b.before(null);b.sql.prepare("UPDATE ai_v2_access SET version=version+1,status='revoked'").run();}});assert.equal((await b.rpc(bt,'submitLibraryCatalog',request())).status,401);assert.equal(b.sql.prepare('SELECT COUNT(*) n FROM ai_library_imports').get().n,0);
});
test('signed paging is bounded to five parts and bound to grant/status, rejects forged cursors',async t=>{
 const a=await fixture(t),write=(await a.token()).value,read=(await a.token('planning:read')).value;for(let i=0;i<6;i++)assert.equal((await a.rpc(write,'submitLibraryCatalog',request('paging-request-'+i))).status,200);
 const first=await (await a.rpc(read,'listLibraryImports',{})).json();assert.equal(first.items.length,5);assert.ok(first.nextCursor);const next=await (await a.rpc(read,'listLibraryImports',{cursor:first.nextCursor})).json();assert.equal(next.items.length,1);assert.equal(next.nextCursor,null);
 assert.equal((await a.rpc(read,'listLibraryImports',{cursor:first.nextCursor,status:'accepted'})).status,400);assert.equal((await a.rpc(read,'listLibraryImports',{cursor:first.nextCursor+'x'})).status,400);
});
test('expiry removes payloads but retains markers; applying remains recoverable and old queues stay unchanged',async t=>{
 const a=await fixture(t),token=(await a.token()).value,one=(await (await a.rpc(token,'submitLibraryCatalog',request())).json()).part,two=(await (await a.rpc(token,'submitLibraryCatalog',request('second-catalog-key'))).json()).part;
 await a.owner('/v2/app/library-imports/reserve',{id:two.id,expectedVersion:1,fields:two.fields,selection:[]});a.setTime(time+91*86400000);const pending=await (await a.owner('/v2/app/library-imports')).json();assert.deepEqual(pending.items,[]);const expired=await (await a.owner('/v2/app/library-imports?status=expired')).json();assert.equal(expired.items[0].id,one.id);assert.equal(expired.items[0].fields,null);const applying=await (await a.owner('/v2/app/library-imports?status=applying')).json();assert.equal(applying.items[0].id,two.id);assert.ok(applying.items[0].fields);assert.equal(a.sql.prepare('SELECT COUNT(*) n FROM ai_v2_proposals').get().n,0);
});
