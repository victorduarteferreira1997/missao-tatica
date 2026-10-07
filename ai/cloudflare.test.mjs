import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createAiBrowserStore} from './bridge_rest.v1.js';
import {AI_OWNER_UID,AI_PROJECT,buildContext} from './contract.v1.js';
import {createFirebaseVerifier,AuthError,KeyServiceError,FIREBASE_PROJECT_NUMBER,FIREBASE_APP_ID,AUTH_JWKS,APP_CHECK_JWKS} from './cloudflare/firebase_auth.mjs';
import {createD1Store,CapacityError} from './cloudflare/d1.mjs';
import {createWorker,APP_ORIGIN,sha256} from './cloudflare/worker.mjs';
import {dashboardSource} from './cloudflare/build-dashboard.mjs';
const now=Date.parse('2026-10-07T20:00:00Z'),seconds=now/1000,secret='test-only-secret-'.padEnd(48,'x');
const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'test-key',alg:'RS256',use:'sig'};
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
async function token(claims,header={alg:'RS256',typ:'JWT',kid:'test-key'}) {
    const data=encode(header)+'.'+encode(claims);
    const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(data));
    return data+'.'+Buffer.from(sig).toString('base64url');
}
const idClaims=()=>({iss:'https://securetoken.google.com/'+AI_PROJECT,aud:AI_PROJECT,sub:AI_OWNER_UID,iat:seconds-30,exp:seconds+3600,auth_time:seconds-60});
const appClaims=()=>({iss:'https://firebaseappcheck.googleapis.com/'+FIREBASE_PROJECT_NUMBER,aud:['projects/'+FIREBASE_PROJECT_NUMBER],sub:FIREBASE_APP_ID,iat:seconds-30,exp:seconds+3600});
const idToken=await token(idClaims()),appToken=await token(appClaims());
function verifier(options={}) {
    const calls=[];
    return {calls,verify:createFirebaseVerifier({now:()=>now,fetchImpl:async url=>{calls.push(url);assert.ok([AUTH_JWKS,APP_CHECK_JWKS].includes(url));return new Response(JSON.stringify({keys:[jwk]}),{headers:{'Cache-Control':'max-age=3600'}});},...options})};
}
const ownerHeaders={Origin:APP_ORIGIN,Authorization:'Bearer '+idToken,'X-Firebase-AppCheck':appToken};
const context=()=>buildContext({tasks:[{id:'private-id',text:'Missão fictícia',day:'wednesday',time:'30 min',xp:999,notes:'PRIVATE_NOTES'}],financeData:{secret:'PRIVATE_FINANCE'}},['private-id'],{weekStart:'2026-10-05',revision:'rev-1',now});
const proposal=()=>({idempotencyKey:'test-request-001',weekStart:'2026-10-05',contextRevision:'rev-1',title:'Missão proposta',day:'thursday',durationMinutes:30,startTime:'',endTime:'',subtasks:['Subtarefa fictícia']});
function database(t) {
    const sql=new DatabaseSync(':memory:'),calls=[];
    sql.exec(schema); t.after(()=>sql.close());
    const db={prepare(query){
        return {bind(...params){
            const statement=sql.prepare(query);
            return {async first(){calls.push(query);return statement.get(...params)||null;},async all(){calls.push(query);return {success:true,results:statement.all(...params)};},async run(){calls.push(query);const r=statement.run(...params);return {success:true,meta:{changes:Number(r.changes)}};}};
        },async all(){calls.push(query);return {success:true,results:sql.prepare(query).all()};}};
    }};
    return {sql,db,calls};
}
const schema=await readFile(new URL('./cloudflare/schema.sql',import.meta.url),'utf8');
function api(t,options={}) {
    const d=database(t),v=verifier(),worker=createWorker({verifyOwner:v.verify,now:()=>now,...options});
    return {...d,keyCalls:v.calls,worker,call:(path,method='GET',body,owner=false,headers={})=>worker.fetch(new Request('https://bridge.example'+path,{method,
        headers:{...(owner?ownerHeaders:{Authorization:'Bearer '+secret}),'Content-Type':'application/json',...headers},
        ...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{})}),{DB:d.db,ACTION_SECRET:secret})};
}
test('Firebase e App Check verificam assinaturas RSA reais, projeto, proprietário e app; chaves públicas são cacheadas',async()=>{
    const v=verifier(),r=new Request('https://bridge.example',{headers:ownerHeaders});
    await v.verify(r);await v.verify(r);assert.equal(v.calls.length,2);
    const changed=idToken.split('.');changed[1]=encode({...idClaims(),exp:seconds+999999});
    await assert.rejects(()=>v.verify(new Request(r,{headers:{...ownerHeaders,Authorization:'Bearer '+changed.join('.')}})),AuthError);
});
test('tokens ausentes, forjados, expirados e claims de outro projeto/UID/app são recusados antes de SQL',async()=>{
    const v=verifier();
    for(const changes of [{sub:'other'},{aud:'other'},{iss:'https://attacker.example'},{exp:seconds},{iat:seconds+1},{auth_time:seconds+1},{auth_time:'1'},{nbf:seconds+1}]) {
        await assert.rejects(()=>v.verify(new Request('https://bridge.example',{headers:{...ownerHeaders,Authorization:'Bearer '+encode({...idClaims(),...changes})+'.x.x'}})),AuthError);
        const signed=await token({...idClaims(),...changes});
        await assert.rejects(()=>v.verify(new Request('https://bridge.example',{headers:{...ownerHeaders,Authorization:'Bearer '+signed}})),AuthError);
    }
    for(const changes of [{sub:'other-app'},{aud:['projects/other']},{aud:'projects/'+FIREBASE_PROJECT_NUMBER},{iss:'other'},{exp:seconds}]) {
        const signed=await token({...appClaims(),...changes});
        await assert.rejects(()=>v.verify(new Request('https://bridge.example',{headers:{...ownerHeaders,'X-Firebase-AppCheck':signed}})),AuthError);
    }
    for(const header of [{alg:'none',typ:'JWT',kid:'test-key'},{alg:'RS256',typ:'other',kid:'test-key'},{alg:'RS256',typ:'JWT',kid:'test-key',crit:['x']},{alg:'RS256',typ:'JWT',kid:'test-key',jku:'https://attacker.example'}]) {
        const signed=await token(idClaims(),header);
        await assert.rejects(()=>v.verify(new Request('https://bridge.example',{headers:{...ownerHeaders,Authorization:'Bearer '+signed}})),AuthError);
    }
    await assert.rejects(()=>v.verify(new Request('https://bridge.example',{headers:{...ownerHeaders,'X-Firebase-AppCheck':''}})),AuthError);
    assert.equal(v.calls.length,0);
});
test('rotação, expiração e falhas de JWKS fecham o acesso sem usar chaves vencidas ou URLs do token',async()=>{
    let clock=now,count=0,fail=false;
    const verify=createFirebaseVerifier({now:()=>clock,fetchImpl:async url=>{count++;assert.ok([AUTH_JWKS,APP_CHECK_JWKS].includes(url));if(fail)throw Error('private infrastructure detail');return new Response(JSON.stringify({keys:[jwk]}),{headers:{'Cache-Control':'max-age=30'}});}});
    const r=new Request('https://bridge.example',{headers:ownerHeaders});await verify(r);assert.equal(count,2);
    const unknown=await token(idClaims(),{alg:'RS256',typ:'JWT',kid:'unknown-key'});
    await assert.rejects(()=>verify(new Request(r,{headers:{...ownerHeaders,Authorization:'Bearer '+unknown}})),AuthError);assert.equal(count,2);
    clock+=31000;await verify(r);assert.equal(count,4);fail=true;clock+=31000;
    await assert.rejects(()=>verify(r),KeyServiceError);
});
test('Worker não acessa D1 sem autenticação e separa credencial GPT das rotas do proprietário',async t=>{
    const a=api(t);
    assert.equal((await a.call('/healthz','GET',undefined,false,{Authorization:''})).status,200);
    assert.equal((await a.call('/v1/week?weekStart=2026-10-05','GET',undefined,false,{Authorization:''})).status,401);
    assert.equal((await a.call('/v1/app/inbox','GET',undefined,true,{Authorization:'Bearer '+secret})).status,401);
    assert.equal((await a.call('/v1/week?weekStart=2026-10-05','GET',undefined,true)).status,401);
    assert.equal((await a.call('/v1/app/inbox','GET',undefined,true,{Origin:'https://other.example'})).status,403);
    assert.equal((await a.call('/v1/app/inbox','GET',undefined,true,{Origin:''})).status,403);
    assert.equal(a.calls.length,0);
});
test('CORS permite só origem oficial, rotas/métodos/headers explícitos e nunca credenciais automáticas',async t=>{
    const a=api(t),headers={Origin:APP_ORIGIN,'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'authorization, content-type, x-firebase-appcheck'};
    const r=await a.call('/v1/app/context?weekStart=2026-10-05','OPTIONS',undefined,false,headers);
    assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),APP_ORIGIN);assert.equal(r.headers.get('Access-Control-Allow-Credentials'),null);
    for(const h of [{Origin:'null'},{'Access-Control-Request-Method':'POST'},{'Access-Control-Request-Headers':'x-arbitrary'}])assert.equal((await a.call('/v1/app/context','OPTIONS',undefined,false,{...headers,...h})).status,403);
    assert.equal((await a.call('/v1/app/other','OPTIONS',undefined,false,headers)).status,403);assert.equal(a.calls.length,0);
});
test('fluxo completo com SQLite: publicar seleção, consultar, propor, revisar e repetir após revogar sem duplicar',async t=>{
    const a=api(t),c=context(),p=proposal();
    assert.equal((await a.call('/v1/app/context?weekStart=2026-10-05','PUT',c,true)).status,200);
    const read=await a.call('/v1/week?weekStart=2026-10-05');assert.deepEqual(await read.json(),c);assert.doesNotMatch(JSON.stringify(c),/PRIVATE_|private-id|"xp"/);
    const first=await a.call('/v1/proposals','POST',p);assert.equal(first.status,201);const result=await first.json();assert.equal(result.proposalId,await sha256(p.idempotencyKey));
    const items=await (await a.call('/v1/app/inbox','GET',undefined,true)).json();assert.deepEqual(items.items,[{id:result.proposalId,status:'pending',proposal:p}]);
    assert.equal((await a.call('/v1/app/inbox/'+result.proposalId,'PATCH',{status:'accepted'},true)).status,200);
    assert.equal((await a.call('/v1/app/context?weekStart=2026-10-05','DELETE',undefined,true)).status,200);
    assert.equal((await a.call('/v1/week?weekStart=2026-10-05')).status,404);
    const replay=await a.call('/v1/proposals','POST',p);assert.equal(replay.status,200);assert.deepEqual(await replay.json(),{proposalId:result.proposalId,status:'accepted',replayed:true});
    assert.equal(a.sql.prepare('SELECT COUNT(*) AS n FROM ai_proposals').get().n,1);
    assert.deepEqual(await (await a.call('/v1/app/inbox','GET',undefined,true)).json(),{items:[]});
    assert.ok(a.calls.every(s=>!s.includes('state/main') && !s.includes('users/')));
});
test('propostas alteradas, contexto ausente/expirado/contaminado e parâmetros extras são recusados',async t=>{
    const a=api(t),p=proposal();assert.equal((await a.call('/v1/proposals','POST',p)).status,409);
    await createD1Store(a.db).publish(context(),now);
    assert.equal((await a.call('/v1/proposals','POST',{...p,contextRevision:'old'})).status,409);
    for(const path of ['/v1/week?weekStart=2026-10-05&owner=other','/v1/week?weekStart=2026-10-05&weekStart=2026-10-12','/v1/app/inbox?owner=other'])assert.equal((await a.call(path,'GET',undefined,path.startsWith('/v1/app/'))).status,422);
    assert.equal((await a.call('/v1/proposals','POST',{...p,xp:999})).status,422);
    assert.equal((await a.call('/v1/proposals','POST',p)).status,201);
    assert.equal((await a.call('/v1/proposals','POST',{...p,title:'Changed'})).status,409);
    const expired={...context(),expiresAt:new Date(now).toISOString()};a.sql.prepare('UPDATE ai_context SET payload = ?').run(JSON.stringify(expired));
    assert.equal((await a.call('/v1/week?weekStart=2026-10-05')).status,422);
    assert.equal((await a.call('/v1/proposals','POST',{...p,idempotencyKey:'new-request'})).status,422);
    a.sql.prepare('UPDATE ai_context SET payload = ?').run(JSON.stringify({...context(),financeData:{secret:'private'}}));
    assert.equal((await a.call('/v1/week?weekStart=2026-10-05')).status,422);
    assert.equal((await a.call('/users/other/state/main')).status,404);
});
test('revogação ou republicação concorrente impede insert; corrida com a mesma chave retorna o registro vencedor',async t=>{
    const d=database(t),store=createD1Store(d.db),p=proposal(),key=await sha256(p.idempotencyKey),c=context();
    await store.publish(c,now);await store.revoke(c.weekStart);assert.equal(await store.createProposal(key,p,c,now),false);
    await store.publish({...c,revision:'new'},now);assert.equal(await store.createProposal(key,p,c,now),false);
    await store.publish(c,now);const result=await Promise.all([store.createProposal(key,p,c,now),store.createProposal(key,p,c,now)]);assert.deepEqual(result,[true,false]);
    assert.deepEqual(await store.proposal(key),{payload:p,status:'pending'});
});
test('revisão é condicional e idempotente: outro status não substitui decisão, campos arbitrários não entram',async t=>{
    const a=api(t),p=proposal(),s=createD1Store(a.db);await s.publish(context(),now);const key=await sha256(p.idempotencyKey);await s.createProposal(key,p,context(),now);
    const route='/v1/app/inbox/'+key;
    assert.equal((await a.call(route,'PATCH',{status:'rejected',payload:p},true)).status,422);
    assert.equal((await a.call(route,'PATCH',{status:'rejected'},true)).status,200);
    assert.equal((await a.call(route,'PATCH',{status:'rejected'},true)).status,200);
    assert.equal((await a.call(route,'PATCH',{status:'accepted'},true)).status,409);
    assert.equal((await a.call('/v1/app/inbox/'+'a'.repeat(64),'PATCH',{status:'accepted'},true)).status,409);
    assert.equal((await s.proposal(key)).status,'rejected');
});
test('limites de corpo/UTF-8, conteúdo, JSON e taxa retornam erro sanitizado antes de SQL',async t=>{
    const a=api(t);
    assert.equal((await a.call('/v1/proposals','POST','é'.repeat(6001))).status,413);
    assert.equal((await a.call('/v1/proposals','POST','{}',false,{'Content-Type':'text/plain'})).status,415);
    assert.equal((await a.call('/v1/proposals','POST','{broken')).status,422);
    assert.equal((await a.call('/v1/app/context?weekStart=2026-10-05','PUT','x'.repeat(64001),true)).status,413);
    assert.equal(a.calls.length,0);
    const limited=api(t,{requestsPerMinute:1});assert.equal((await limited.call('/unknown')).status,404);const r=await limited.call('/unknown');assert.equal(r.status,429);assert.equal(r.headers.get('Retry-After'),'60');
    const failing=api(t,{storeFactory:()=>{throw Error('PRIVATE_CONNECTION_AND_TOKEN');}});const error=await failing.call('/v1/week?weekStart=2026-10-05');assert.equal(error.status,503);assert.doesNotMatch(await error.text(),/PRIVATE_/);
});
test('D1 limita crescimento, preserva registros de idempotência e retorna inbox de até 50 itens',async t=>{
    const d=database(t),s=createD1Store(d.db),c=context();await s.publish(c,now);
    const insert=d.sql.prepare('INSERT INTO ai_proposals (id,payload,status,created_at) VALUES (?,?,?,?)');
    for(let i=0;i<100;i++)insert.run(i.toString(16).padStart(64,'0'),JSON.stringify({...proposal(),idempotencyKey:'request-'+i}),'pending',new Date(now).toISOString());
    assert.equal((await s.pending()).length,50);assert.equal(await s.createProposal('f'.repeat(64),proposal(),c,now),false);
    d.sql.prepare("UPDATE ai_proposals SET status = 'accepted'").run();
    for(let i=100;i<1000;i++)insert.run(i.toString(16).padStart(64,'0'),JSON.stringify(proposal()),'accepted',new Date(now).toISOString());
    assert.equal(await s.createProposal('f'.repeat(64),proposal(),c,now),false);assert.equal(d.sql.prepare('SELECT COUNT(*) AS n FROM ai_proposals').get().n,1000);
    const insertContext=d.sql.prepare('INSERT INTO ai_context (week_start,revision,expires_at,payload) VALUES (?,?,?,?)');
    for(let i=0;i<51;i++)insertContext.run('dummy-'+i,'r',now,JSON.stringify(c));
    await assert.rejects(()=>s.publish({...c,weekStart:'2026-10-12'},now),CapacityError);await s.publish(c,now);await s.revoke(c.weekStart);
    await s.publish({...c,weekStart:'2026-10-12'},now);
});
test('adaptador do navegador usa somente ponte fixa, Firebase/App Check, sem segredo GPT nem estado inteiro',async()=>{
    const calls=[];let user={uid:AI_OWNER_UID,getIdToken:async()=>'firebase-token'};
    const s=createAiBrowserStore({getUser:()=>user,getAppCheckToken:async()=>'appcheck-token',fetchImpl:async(url,o)=>{calls.push([url,o]);return {ok:true,json:async()=>url.endsWith('/inbox')?{items:[]}:{} };}});
    const c=buildContext({tasks:[]},[],{weekStart:'2026-10-05',revision:'now',now:Date.now()});
    await s.publish(c);await s.pending();await s.review('a'.repeat(64),'accepted');await s.revoke(c.weekStart);
    for(const [url,o] of calls){assert.match(url,/^https:\/\/missao-tatica-ai-bridge\.victorduarteferreira1997\.workers\.dev\/v1\/app\//);assert.equal(o.headers.Authorization,'Bearer firebase-token');assert.equal(o.headers['X-Firebase-AppCheck'],'appcheck-token');assert.equal(o.redirect,'error');assert.equal(o.credentials,'omit');assert.doesNotMatch(url,/firestore|state\/main/);}
    assert.deepEqual(JSON.parse(calls[0][1].body),c);assert.deepEqual(JSON.parse(calls[2][1].body),{status:'accepted'});
    user={uid:'other'};await assert.rejects(()=>s.pending());assert.equal(calls.length,4);
});
test('adaptador recusa mudança de sessão durante obtenção do token ou resposta e valida inbox',async()=>{
    let user={uid:AI_OWNER_UID,getIdToken:async()=>{user={uid:AI_OWNER_UID};return 'token';}},fetched=0;
    let s=createAiBrowserStore({getUser:()=>user,getAppCheckToken:async()=>'app',fetchImpl:async()=>{fetched++;}});await assert.rejects(()=>s.pending(),/sessão mudou/);assert.equal(fetched,0);
    user={uid:AI_OWNER_UID,getIdToken:async()=>'token'};
    s=createAiBrowserStore({getUser:()=>user,getAppCheckToken:async()=>'app',fetchImpl:async()=>{user=null;return {ok:true,json:async()=>({items:[]})};}});await assert.rejects(()=>s.pending(),/sessão mudou/);
    user={uid:AI_OWNER_UID,getIdToken:async()=>'token'};
    s=createAiBrowserStore({getUser:()=>user,getAppCheckToken:async()=>'app',fetchImpl:async()=>({ok:true,json:async()=>({items:[{id:'../state/main',status:'pending',proposal:proposal()}]})})});await assert.rejects(()=>s.pending(),/Entrada inválida/);
});
test('arquivo do editor é reproduzível e executa a mesma ponte sem imports ou dependências; OpenAPI não expõe rotas do proprietário',async()=>{
    const source=await dashboardSource();assert.equal(await readFile(new URL('./cloudflare/worker-dashboard.js',import.meta.url),'utf8'),source);assert.doesNotMatch(source,/^import /m);
    const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
    assert.equal((await module.default.fetch(new Request('https://bridge.example/healthz'),{})).status,200);
    assert.equal((await module.default.fetch(new Request('https://bridge.example/v1/week?weekStart=2026-10-05'),{ACTION_SECRET:secret})).status,401);
    const openapi=JSON.parse(await readFile(new URL('./openapi.json',import.meta.url),'utf8'));
    assert.deepEqual(Object.keys(openapi.paths).sort(),['/v1/proposals','/v1/week']);assert.equal(openapi.paths['/v1/proposals'].post['x-openai-isConsequential'],true);
    assert.equal(openapi.servers[0].url,'https://missao-tatica-ai-bridge.victorduarteferreira1997.workers.dev');
});
