import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createWorker,APP_ORIGIN} from './cloudflare/worker.mjs';
import {BRIDGE_BASE,MCP_RESOURCE,PLUGIN_TOOLS} from './cloudflare/plugin.mjs';
import {AuthError} from './cloudflare/firebase_auth.mjs';
import {buildContext} from './contract.v1.js';
const secret='test-only-plugin-secret-'.padEnd(48,'x'),client='https://chatgpt.com/oauth/client.json',callback='https://chatgpt.com/connector_platform_oauth_redirect';
const verifier='a'.repeat(43),hash=async s=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))).toString('base64url');
const challenge=await hash(verifier),initial=Date.parse('2026-10-08T00:00:00Z');
const schemas=await Promise.all(['schema.sql','oauth-schema.sql'].map(p=>readFile(new URL('./cloudflare/'+p,import.meta.url),'utf8')));
function api(t,{badMetadata=false}={}){
    const sql=new DatabaseSync(':memory:');schemas.forEach(s=>sql.exec(s));t.after(()=>sql.close());let time=initial,metadataCalls=0;const calls=[];
    const db={prepare(query){return {bind(...args){const stmt=sql.prepare(query);return {
        async first(){calls.push(query);return stmt.get(...args)||null;},async all(){calls.push(query);return {success:true,results:stmt.all(...args)};},async run(){calls.push(query);return {success:true,meta:{changes:Number(stmt.run(...args).changes)}};}
    };}};}};
    const env={DB:db,ACTION_SECRET:secret};
    const worker=createWorker({now:()=>time,verifyOwner:async r=>{if(r.headers.get('Authorization')!=='Bearer test-owner')throw new AuthError();},pluginFetch:async(url,options)=>{
        metadataCalls++;assert.equal(url,client);assert.equal(options.redirect,'manual');assert.equal(options.headers,undefined);
        return badMetadata?new Response(null,{status:302,headers:{Location:'https://attacker.example'}}):Response.json({client_id:client,redirect_uris:[callback],token_endpoint_auth_methods_supported:['none']});
    }});
    const call=(path,method='GET',body,headers={})=>worker.fetch(new Request(BRIDGE_BASE+path,{method,headers,...(body!==undefined?{body}: {})}),env);
    const form=(path,body,headers={})=>call(path,'POST',new URLSearchParams(body).toString(),{'Content-Type':'application/x-www-form-urlencoded',...headers});
    const authQuery=(changes={})=>'/oauth/authorize?'+new URLSearchParams({response_type:'code',client_id:client,redirect_uri:callback,resource:MCP_RESOURCE,scope:'context:read proposals:write',state:'test-state',code_challenge:challenge,code_challenge_method:'S256',...changes});
    async function consent(changes={}){
        const r=await call(authQuery(changes));assert.equal(r.status,200);const html=await r.text();
        assert.ok(!html.includes(secret));assert.equal(r.headers.get('Referrer-Policy'),'no-referrer');assert.match(r.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
        return {ticket:html.match(/name="ticket" value="([^"]+)"/)[1],cookie:r.headers.get('Set-Cookie').split(';')[0]};
    }
    async function authorize(changes={}){
        const c=await consent(changes),r=await form('/oauth/authorize',{ticket:c.ticket,secret,decision:'allow'},{Origin:BRIDGE_BASE,Cookie:c.cookie});
        assert.equal(r.status,303);const redirect=new URL(r.headers.get('Location'));assert.equal(redirect.origin,'https://chatgpt.com');assert.equal(redirect.searchParams.get('state'),'test-state');assert.equal(redirect.searchParams.get('iss'),BRIDGE_BASE);
        return redirect.searchParams.get('code');
    }
    const exchange=(code,changes={})=>form('/oauth/token',{grant_type:'authorization_code',client_id:client,redirect_uri:callback,resource:MCP_RESOURCE,code,code_verifier:verifier,...changes});
    const rpc=(token,method,params={},changes={})=>call('/mcp','POST',JSON.stringify({jsonrpc:'2.0',id:1,method,params,...changes}),{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25'});
    return {env,sql,calls,call,form,authQuery,consent,authorize,exchange,rpc,setTime:v=>time=v,metadataCalls:()=>metadataCalls};
}
test('plugin OAuth: descoberta, consentimento e PKCE reais; código só pode ser consumido uma vez',async t=>{
    const a=api(t),metadata=await (await a.call('/.well-known/oauth-authorization-server')).json();
    assert.equal(metadata.issuer,BRIDGE_BASE);assert.equal(metadata.client_id_metadata_document_supported,true);assert.deepEqual(metadata.code_challenge_methods_supported,['S256']);
    const resource=await (await a.call('/.well-known/oauth-protected-resource/mcp')).json();assert.equal(resource.resource,MCP_RESOURCE);assert.equal(a.calls.length,0);
    const code=await a.authorize();assert.equal(a.metadataCalls(),1);
    const wrong=await a.exchange(code,{code_verifier:'b'.repeat(43)});assert.equal(wrong.status,400);
    const [one,two]=await Promise.all([a.exchange(code),a.exchange(code)]);assert.deepEqual([one.status,two.status].sort(),[200,400]);
    const token=await (one.ok?one:two).json();assert.equal(token.token_type,'Bearer');assert.equal(token.expires_in,86400);assert.ok(!JSON.stringify(token).includes(secret));
    const init=await (await a.rpc(token.access_token,'initialize',{protocolVersion:'2025-11-25'})).json();assert.equal(init.result.protocolVersion,'2025-11-25');
    const list=await (await a.rpc(token.access_token,'tools/list')).json();assert.deepEqual(list.result.tools.map(t=>t.name),['getSharedWeek','submitProposal']);assert.equal(list.result.tools[0].annotations.readOnlyHint,true);
    assert.equal(list.result.tools[1].annotations.idempotentHint,true);assert.ok(!JSON.stringify(list).includes(secret));
    assert.equal((await a.exchange(code)).status,400);
});
test('plugin recusa segredo bruto, tokens adulterados, expirados, rotacionados e origem estranha antes de SQL',async t=>{
    const a=api(t);let r=await a.rpc(secret,'tools/list');assert.equal(r.status,401);assert.match(r.headers.get('WWW-Authenticate'),/resource_metadata=/);assert.equal(a.calls.length,0);
    const good=await (await a.exchange(await a.authorize())).json(),count=a.calls.length;
    const [data,sig]=good.access_token.split('.'),p=JSON.parse(Buffer.from(data,'base64url'));p.aud='https://attacker.example/mcp';
    assert.equal((await a.rpc(Buffer.from(JSON.stringify(p)).toString('base64url')+'.'+sig,'tools/list')).status,401);assert.equal(a.calls.length,count);
    assert.equal((await a.call('/mcp','POST','{}',{Origin:'https://attacker.example',Authorization:'Bearer '+good.access_token})).status,403);
    assert.equal((await a.call('/v1/app/inbox','GET',undefined,{Origin:APP_ORIGIN,Authorization:'Bearer '+good.access_token})).status,401);
    a.setTime(initial+86400000);assert.equal((await a.rpc(good.access_token,'tools/list')).status,401);
    a.setTime(initial);const code=await a.authorize();a.env.ACTION_SECRET='rotated-test-secret-'.padEnd(48,'y');
    assert.equal((await a.rpc(good.access_token,'tools/list')).status,401);assert.equal((await a.exchange(code)).status,400);
});
test('consentimento recusa CSRF, redirecionamentos/clients/resources extras e segredo errado; cancelamento não grava',async t=>{
    const a=api(t);
    for(const change of [{redirect_uri:'https://attacker.example'},{client_id:'https://attacker.example/metadata'},{resource:BRIDGE_BASE},{code_challenge_method:'plain'},{scope:'admin'},{state:''},{extra:'x'}])assert.equal((await a.call(a.authQuery(change))).status,400);
    assert.equal(a.calls.length,0);assert.equal(a.metadataCalls(),0);
    const c=await a.consent();
    assert.equal((await a.form('/oauth/authorize',{ticket:c.ticket,secret,decision:'allow'},{Cookie:c.cookie})).status,403);
    assert.equal((await a.form('/oauth/authorize',{ticket:c.ticket,secret,decision:'allow'},{Origin:BRIDGE_BASE,Cookie:'mt_oauth=wrong'})).status,403);
    assert.equal((await a.form('/oauth/authorize',{ticket:c.ticket,secret:'wrong',decision:'allow'},{Origin:BRIDGE_BASE,Cookie:c.cookie})).status,401);
    assert.equal(a.calls.length,0);
    const denied=await a.form('/oauth/authorize',{ticket:c.ticket,decision:'deny'},{Origin:BRIDGE_BASE,Cookie:c.cookie});assert.equal(denied.status,303);assert.equal(new URL(denied.headers.get('Location')).searchParams.get('error'),'access_denied');assert.equal(a.calls.length,0);
    a.setTime(initial+600000);assert.equal((await a.form('/oauth/authorize',{ticket:c.ticket,secret,decision:'allow'},{Origin:BRIDGE_BASE,Cookie:c.cookie})).status,401);
});
test('OAuth não segue redirects de metadata; códigos vencem; consentimento errado tem taxa limitada',async t=>{
    const bad=api(t,{badMetadata:true});assert.equal((await bad.call(bad.authQuery())).status,503);assert.equal((await bad.call(bad.authQuery())).status,503);assert.equal(bad.metadataCalls(),1);assert.equal(bad.calls.length,0);
    const a=api(t),code=await a.authorize();a.setTime(initial+300000);assert.equal((await a.exchange(code)).status,400);
    const c=await a.consent();for(let i=0;i<10;i++)assert.equal((await a.form('/oauth/authorize',{ticket:c.ticket,secret:'wrong',decision:'allow'},{Origin:BRIDGE_BASE,Cookie:c.cookie})).status,401);
    assert.equal((await a.form('/oauth/authorize',{ticket:c.ticket,secret:'wrong',decision:'allow'},{Origin:BRIDGE_BASE,Cookie:c.cookie})).status,429);
});
test('MCP limita transporte, JSON e argumentos antes de SQL, aceita notificações e não abre SSE',async t=>{
    const a=api(t),token=await (await a.exchange(await a.authorize())).json(),count=a.calls.length;
    const headers={Authorization:'Bearer '+token.access_token,'Content-Type':'application/json',Accept:'application/json, text/event-stream'};
    assert.equal((await a.call('/mcp','GET',undefined,headers)).status,405);
    assert.equal((await a.call('/mcp','POST',JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'}),headers)).status,202);
    assert.equal((await a.call('/mcp','POST','{',headers)).status,400);
    assert.equal((await a.call('/mcp','POST','{}',{...headers,'Content-Type':'text/plain'})).status,415);
    assert.equal((await a.call('/mcp','POST','x'.repeat(16001),headers)).status,413);
    assert.equal((await a.call('/mcp','POST','{}',{...headers,Accept:'application/json'})).status,406);
    assert.equal((await a.call('/mcp','POST','{}',{...headers,'MCP-Protocol-Version':'1900-01-01'})).status,400);
    for(const body of [[],null,{jsonrpc:'2.0',id:[],method:'tools/list'}])assert.equal((await (await a.call('/mcp','POST',JSON.stringify(body),headers)).json()).error.code,-32600);
    assert.equal(a.calls.length,count);
});
test('OAuth limita códigos ativos e remove expirados sem tocar contextos/propostas',async t=>{
    const a=api(t),c=await a.consent(),stmt=a.sql.prepare('INSERT INTO ai_oauth_codes VALUES (?,?,?)');
    for(let i=0;i<128;i++)stmt.run('dummy-'+i,'unused',initial+300000);
    const grant=()=>a.form('/oauth/authorize',{ticket:c.ticket,secret,decision:'allow'},{Origin:BRIDGE_BASE,Cookie:c.cookie});
    assert.equal((await grant()).status,429);assert.equal(a.sql.prepare('SELECT COUNT(*) AS n FROM ai_oauth_codes').get().n,128);
    a.setTime(initial+300000);assert.equal((await grant()).status,303);assert.equal(a.sql.prepare('SELECT COUNT(*) AS n FROM ai_oauth_codes').get().n,1);
    assert.equal(a.sql.prepare('SELECT COUNT(*) AS n FROM ai_context').get().n,0);assert.equal(a.sql.prepare('SELECT COUNT(*) AS n FROM ai_proposals').get().n,0);
});
test('MCP reutiliza validação/D1: publicar, ler, propor, repetir, revogar; não expõe operações do proprietário',async t=>{
    const a=api(t),context=buildContext({tasks:[{id:'private-id',text:'Teste',day:'thursday',time:'30 min'}]},['private-id'],{weekStart:'2026-10-05',revision:'rev1',now:initial});
    const owner={'Content-Type':'application/json',Origin:APP_ORIGIN,Authorization:'Bearer test-owner'};
    assert.equal((await a.call('/v1/app/context?weekStart=2026-10-05','PUT',JSON.stringify(context),owner)).status,200);
    const token=await (await a.exchange(await a.authorize())).json();
    const week=await (await a.rpc(token.access_token,'tools/call',{name:'getSharedWeek',arguments:{weekStart:'2026-10-05'}})).json();assert.equal(week.result.structuredContent.missions.length,1);assert.ok(!JSON.stringify(week).includes('private-id'));
    const args={idempotencyKey:'plugin-test-001',weekStart:'2026-10-05',contextRevision:'rev1',title:'Proposta',day:'friday',durationMinutes:30,startTime:'10:00',endTime:'10:30',subtasks:[]};
    const proposal=await (await a.rpc(token.access_token,'tools/call',{name:'submitProposal',arguments:args})).json();assert.equal(proposal.result.structuredContent.status,'pending');assert.equal(a.sql.prepare('SELECT COUNT(*) AS n FROM ai_proposals').get().n,1);
    const replay=await (await a.rpc(token.access_token,'tools/call',{name:'submitProposal',arguments:args})).json();assert.equal(replay.result.structuredContent.replayed,true);
    for(const params of [{name:'revoke',arguments:{}},{name:'submitProposal',arguments:{...args,xp:999}}])assert.equal((await (await a.rpc(token.access_token,'tools/call',params)).json()).error.code,-32602);
    const invalid=await (await a.rpc(token.access_token,'tools/call',{name:'submitProposal',arguments:{...args,idempotencyKey:'plugin-test-002',contextRevision:'stale'}})).json();assert.equal(invalid.result.isError,true);assert.equal(a.sql.prepare('SELECT COUNT(*) AS n FROM ai_proposals').get().n,1);
    const readOnly=await (await a.exchange(await a.authorize({scope:'context:read'}))).json();assert.equal((await a.rpc(readOnly.access_token,'tools/call',{name:'submitProposal',arguments:args})).status,403);
    assert.equal((await a.call('/v1/app/context?weekStart=2026-10-05','DELETE',undefined,owner)).status,200);
    const removed=await (await a.rpc(token.access_token,'tools/call',{name:'getSharedWeek',arguments:{weekStart:'2026-10-05'}})).json();assert.equal(removed.result.isError,true);assert.equal(removed.result.content[0].text,'{"error":"context_not_published"}');
});
test('pacote privado não inclui headers/segredos nem operações administrativas',async()=>{
    const manifest=JSON.parse(await readFile(new URL('./plugin/missao-tatica/plugin.json',import.meta.url),'utf8'));
    assert.ok(manifest.extensions['com.openai'].interface.shortDescription.length<=30);
    const mcp=JSON.parse(await readFile(new URL('./plugin/missao-tatica/mcp.json',import.meta.url),'utf8'));assert.deepEqual(mcp.mcpServers['missao-tatica'],{type:'streamable-http',url:MCP_RESOURCE});
    assert.equal(PLUGIN_TOOLS.length,2);
});
