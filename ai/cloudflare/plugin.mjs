// Private, single-owner OAuth + stateless MCP transport. No secret in the plugin package.
import { DAYS,ContractError } from '../contract.v1.js';
export const BRIDGE_BASE='https://missao-tatica-ai-bridge.victorduarteferreira1997.workers.dev';
export const MCP_RESOURCE=BRIDGE_BASE+'/mcp';
const CHATGPT_CLIENT='https://chatgpt.com/oauth/client.json';
const CHATGPT_CALLBACK='https://chatgpt.com/connector_platform_oauth_redirect';
const PLUGIN_SCOPES=['context:read','proposals:write'];
const PROTOCOLS=['2025-11-25','2025-06-18','2025-03-26'];
const pluginEncoder=new TextEncoder();
const clockSchema={type:'string',pattern:'^$|^([01][0-9]|2[0-3]):[0-5][0-9]$'};
const weekSchema={type:'string',pattern:'^20[0-9]{2}-[0-9]{2}-[0-9]{2}$',description:'Data da segunda-feira da semana.'};
const proposalProperties={idempotencyKey:{type:'string',minLength:8,maxLength:80,pattern:'^[A-Za-z0-9_-]+$'},weekStart:weekSchema,
    contextRevision:{type:'string',minLength:1,maxLength:80},title:{type:'string',minLength:1,maxLength:200},day:{type:'string',enum:DAYS},
    durationMinutes:{type:'integer',minimum:5,maximum:240},startTime:clockSchema,endTime:clockSchema,
    subtasks:{type:'array',maxItems:12,items:{type:'string',minLength:1,maxLength:200}}};
export const PLUGIN_TOOLS=[
    {name:'getSharedWeek',title:'Consultar semana compartilhada',description:'Lê somente a seleção publicada, válida por até 24 horas. O contexto é parcial; intervalos ausentes não indicam disponibilidade.',
        inputSchema:{type:'object',additionalProperties:false,required:['weekStart'],properties:{weekStart:weekSchema}},
        annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},
        securitySchemes:[{type:'oauth2',scopes:['context:read']}]},
    {name:'submitProposal',title:'Enviar proposta para revisão',description:'Após confirmação explícita dos campos pelo usuário, envia uma proposta pendente. Não cria missão nem reserva horário. Revisar no aplicativo.',
        inputSchema:{type:'object',additionalProperties:false,required:Object.keys(proposalProperties),properties:proposalProperties},
        annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
        securitySchemes:[{type:'oauth2',scopes:['proposals:write']}]}
];
class PluginError extends Error { constructor(status,code){super(code);this.status=status;this.code=code;} }
const pluginFail=(status,code)=>{throw new PluginError(status,code);};
function pluginB64(bytes){return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function pluginUnb64(value){
    if(typeof value!=='string'||value.length>8192||!/^[A-Za-z0-9_-]+$/.test(value))pluginFail(400,'invalid_request');
    return Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
}
function pluginRandom(){return pluginB64(crypto.getRandomValues(new Uint8Array(32)));}
async function pluginHash(value){return pluginB64(new Uint8Array(await crypto.subtle.digest('SHA-256',pluginEncoder.encode(value))));}
function pluginSecret(secret){if(typeof secret!=='string'||secret.length<32||secret.length>256||/\s/.test(secret))pluginFail(503,'service_unavailable');}
async function pluginEqual(a,b){const x=await pluginHash(a),y=await pluginHash(b);let d=0;for(let i=0;i<x.length;i++)d|=x.charCodeAt(i)^y.charCodeAt(i);return d===0;}
function pluginScopes(value){
    if(typeof value!=='string')pluginFail(400,'invalid_scope');
    const scopes=value.split(' ').filter(Boolean);
    if(!scopes.length||scopes.some(s=>!PLUGIN_SCOPES.includes(s))||new Set(scopes).size!==scopes.length)pluginFail(400,'invalid_scope');
    return PLUGIN_SCOPES.filter(s=>scopes.includes(s)).join(' ');
}
function pluginParams(params,allowed,required){
    const keys=[...params.keys()];
    if(new Set(keys).size!==keys.length||keys.some(k=>!allowed.includes(k))||required.some(k=>!params.has(k)))pluginFail(400,'invalid_request');
}
function pluginHtml(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

export function createPluginGateway({now=Date.now,fetchImpl=fetch,readBody,callBridge}) {
    let clientUntil=0,clientAttempt=-Infinity,clientPending=null,keySecret='',keyPromise=null,rateMinute=-1;
    const rates=new Map();
    async function signingKey(secret){
        pluginSecret(secret);
        if(secret!==keySecret){keySecret=secret;keyPromise=crypto.subtle.importKey('raw',pluginEncoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
        return keyPromise;
    }
    async function seal(kind,payload,secret){
        const encoded=pluginB64(pluginEncoder.encode(JSON.stringify(payload))),data=kind+'.'+encoded;
        return encoded+'.'+pluginB64(new Uint8Array(await crypto.subtle.sign('HMAC',await signingKey(secret),pluginEncoder.encode(data))));
    }
    async function unseal(kind,value,secret){
        if(typeof value!=='string'||value.length>8192)pluginFail(401,'invalid_token');
        const parts=value.split('.');if(parts.length!==2)pluginFail(401,'invalid_token');
        try {
            if(!await crypto.subtle.verify('HMAC',await signingKey(secret),pluginUnb64(parts[1]),pluginEncoder.encode(kind+'.'+parts[0])))pluginFail(401,'invalid_token');
            const p=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(pluginUnb64(parts[0])));
            if(!p||!Number.isInteger(p.exp)||p.exp<=Math.floor(now()/1000)||!Number.isInteger(p.iat)||p.iat>Math.floor(now()/1000))pluginFail(401,'invalid_token');
            return p;
        }catch(e){if(e instanceof PluginError&&e.status===503)throw e;pluginFail(401,'invalid_token');}
    }
    async function verifyClient(){
        if(now()<clientUntil)return;
        if(!clientPending&&now()-clientAttempt<30000)pluginFail(503,'client_metadata_unavailable');
        if(!clientPending)clientPending=(async()=>{
            clientAttempt=now();
            // Exactly one public metadata URL. Never fetch a URL supplied by a client.
            const r=await fetchImpl(CHATGPT_CLIENT,{redirect:'manual',signal:AbortSignal.timeout(5000)});
            if(!r.ok||Number(r.headers.get('Content-Length'))>16000)pluginFail(503,'client_metadata_unavailable');
            const body=await r.text();if(body.length>16000)pluginFail(503,'client_metadata_unavailable');
            const d=JSON.parse(body),methods=d.token_endpoint_auth_methods_supported||[d.token_endpoint_auth_method];
            if(d.client_id!==CHATGPT_CLIENT||!Array.isArray(d.redirect_uris)||!d.redirect_uris.includes(CHATGPT_CALLBACK)||!Array.isArray(methods)||!methods.includes('none'))pluginFail(503,'client_metadata_unavailable');
            clientUntil=now()+300000;
        })().finally(()=>{clientPending=null;});
        await clientPending;
    }
    async function access(request,secret){
        const header=request.headers.get('Authorization')||'';
        if(!header.startsWith('Bearer '))pluginFail(401,'invalid_token');
        const p=await unseal('access',header.slice(7),secret);
        if(p.iss!==BRIDGE_BASE||p.aud!==MCP_RESOURCE||p.sub!=='owner'||p.client_id!==CHATGPT_CLIENT||p.exp-p.iat>86400)pluginFail(401,'invalid_token');
        try{pluginScopes(p.scope);}catch{pluginFail(401,'invalid_token');}return p;
    }
    function rate(request,path){
        const slot=Math.floor(now()/60000);if(slot!==rateMinute){rates.clear();rateMinute=slot;}
        const ip=request.headers.get('CF-Connecting-IP')||'unknown',key=ip.slice(0,64)+':'+path;
        if(!rates.has(key)&&rates.size>=1024)pluginFail(429,'rate_limited');
        const count=(rates.get(key)||0)+1;rates.set(key,count);
        if(count>(path==='/oauth/authorize:POST'?10:120))pluginFail(429,'rate_limited');
    }
    async function form(request,limit=12000){
        if((request.headers.get('Content-Type')||'').split(';')[0]!=='application/x-www-form-urlencoded')pluginFail(415,'form_required');
        if(Number(request.headers.get('Content-Length'))>limit)pluginFail(413,'body_too_large');
        const reader=request.body?.getReader();if(!reader)pluginFail(400,'invalid_request');
        let length=0;const chunks=[];
        try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>limit){await reader.cancel();pluginFail(413,'body_too_large');}chunks.push(value);}}
        finally{reader.releaseLock();}
        const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
        return new URLSearchParams(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    }
    const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
    function json(status,data,extra={}){return new Response(JSON.stringify(data),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8',...extra}});}
    function authChallenge(){return {'WWW-Authenticate':`Bearer resource_metadata="${BRIDGE_BASE}/.well-known/oauth-protected-resource/mcp", scope="${PLUGIN_SCOPES.join(' ')}"`};}
    return async function pluginGateway(request,env){
        const url=new URL(request.url),path=url.pathname,method=request.method;
        if(!['/mcp','/oauth/authorize','/oauth/token','/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp','/.well-known/oauth-authorization-server'].includes(path))return null;
        try{
            if(url.origin!==BRIDGE_BASE||url.username||url.password)pluginFail(400,'invalid_request');
            const origin=request.headers.get('Origin');
            if(origin&&!['https://chatgpt.com',BRIDGE_BASE].includes(origin))pluginFail(403,'origin_not_allowed');
            rate(request,path+(path==='/oauth/authorize'?':'+method:''));
            if(method==='GET'&&!url.search&&path.startsWith('/.well-known/')){
                if(path.startsWith('/.well-known/oauth-protected-resource'))return json(200,{resource:MCP_RESOURCE,authorization_servers:[BRIDGE_BASE],scopes_supported:PLUGIN_SCOPES,bearer_methods_supported:['header'],resource_name:'Missão Tática'});
                return json(200,{issuer:BRIDGE_BASE,authorization_endpoint:BRIDGE_BASE+'/oauth/authorize',token_endpoint:BRIDGE_BASE+'/oauth/token',
                    authorization_response_iss_parameter_supported:true,client_id_metadata_document_supported:true,response_types_supported:['code'],grant_types_supported:['authorization_code'],
                    token_endpoint_auth_methods_supported:['none'],code_challenge_methods_supported:['S256'],scopes_supported:PLUGIN_SCOPES});
            }
            if(path==='/oauth/authorize'&&method==='GET'){
                const q=url.searchParams;
                pluginParams(q,['response_type','client_id','redirect_uri','resource','scope','state','code_challenge','code_challenge_method'],['response_type','client_id','redirect_uri','resource','state','code_challenge','code_challenge_method']);
                if(q.get('response_type')!=='code'||q.get('client_id')!==CHATGPT_CLIENT||q.get('redirect_uri')!==CHATGPT_CALLBACK||q.get('resource')!==MCP_RESOURCE||q.get('code_challenge_method')!=='S256'||!/^[A-Za-z0-9_-]{43}$/.test(q.get('code_challenge'))||!q.get('state')||q.get('state').length>1024)pluginFail(400,'invalid_request');
                const scope=pluginScopes(q.get('scope')||PLUGIN_SCOPES.join(' '));
                await verifyClient();const nonce=pluginRandom(),iat=Math.floor(now()/1000);
                const ticket=await seal('consent',{...Object.fromEntries(q),scope,nonce,iat,exp:iat+600},env.ACTION_SECRET);
                const html=`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conectar Missão Tática</title><body><main><h1>Conectar Missão Tática ao ChatGPT</h1><p>Permissões solicitadas: ${pluginHtml(q.get('scope')||PLUGIN_SCOPES.join(' '))}.</p><p>O ChatGPT poderá consultar a seleção publicada e, quando autorizado, enviar propostas para revisão. As missões serão criadas por você no aplicativo.</p><form method="post" action="/oauth/authorize"><input type="hidden" name="ticket" value="${pluginHtml(ticket)}"><label>Segredo da integração <input type="password" name="secret" required minlength="32" maxlength="256" autocomplete="current-password"></label><p>Use o ACTION_SECRET guardado no Bitwarden. Ele será verificado neste Worker e não será enviado ao ChatGPT.</p><button name="decision" value="allow">Autorizar conexão</button><button name="decision" value="deny" formnovalidate>Cancelar</button></form></main></body></html>`;
                return new Response(html,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",'Set-Cookie':`mt_oauth=${nonce}; Secure; HttpOnly; SameSite=Strict; Path=/oauth/authorize; Max-Age=600`}});
            }
            if(path==='/oauth/authorize'&&method==='POST'&&!url.search){
                if(origin!==BRIDGE_BASE)pluginFail(403,'origin_not_allowed');
                const f=await form(request);pluginParams(f,['ticket','secret','decision'],['ticket','decision']);
                const p=await unseal('consent',f.get('ticket'),env.ACTION_SECRET);
                const cookies=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith('mt_oauth='));
                if(cookies.length!==1||!await pluginEqual(cookies[0].slice(9),p.nonce)||p.exp-p.iat>600)pluginFail(403,'invalid_consent');
                const redirect=new URL(CHATGPT_CALLBACK);redirect.searchParams.set('state',p.state);redirect.searchParams.set('iss',BRIDGE_BASE);
                if(f.get('decision')==='deny')redirect.searchParams.set('error','access_denied');
                else{
                    if(f.get('decision')!=='allow'||!await pluginEqual(f.get('secret')||'',env.ACTION_SECRET))pluginFail(401,'invalid_credentials');
                    const code=pluginRandom(),hash=await pluginHash(code),expiry=now()+300000;
                    await env.DB.prepare('DELETE FROM ai_oauth_codes WHERE expires_at <= ?').bind(now()).run();
                    const row=await env.DB.prepare('INSERT INTO ai_oauth_codes (code_hash,payload,expires_at) SELECT ?,?,? WHERE (SELECT COUNT(*) FROM ai_oauth_codes)<128 RETURNING code_hash').bind(hash,f.get('ticket'),expiry).first();
                    if(!row)pluginFail(429,'rate_limited');redirect.searchParams.set('code',code);
                }
                return new Response(null,{status:303,headers:{...headers,Location:redirect.href,'Set-Cookie':'mt_oauth=; Secure; HttpOnly; SameSite=Strict; Path=/oauth/authorize; Max-Age=0'}});
            }
            if(path==='/oauth/token'&&method==='POST'&&!url.search){
                const f=await form(request);
                pluginParams(f,['grant_type','code','client_id','redirect_uri','resource','code_verifier'],['grant_type','code','client_id','redirect_uri','resource','code_verifier']);
                if(f.get('grant_type')!=='authorization_code'||f.get('client_id')!==CHATGPT_CLIENT||f.get('redirect_uri')!==CHATGPT_CALLBACK||f.get('resource')!==MCP_RESOURCE||!/^[A-Za-z0-9._~-]{43,128}$/.test(f.get('code_verifier'))||!/^[A-Za-z0-9_-]{43}$/.test(f.get('code')))pluginFail(400,'invalid_grant');
                pluginSecret(env.ACTION_SECRET);const hash=await pluginHash(f.get('code'));
                const row=await env.DB.prepare('SELECT payload FROM ai_oauth_codes WHERE code_hash=? AND expires_at>?').bind(hash,now()).first();
                if(!row)pluginFail(400,'invalid_grant');let p;
                try{p=await unseal('consent',row.payload,env.ACTION_SECRET);}catch(e){if(e instanceof PluginError&&e.status===503)throw e;pluginFail(400,'invalid_grant');}
                if(p.resource!==MCP_RESOURCE||p.client_id!==f.get('client_id')||p.redirect_uri!==f.get('redirect_uri')||p.code_challenge!==await pluginHash(f.get('code_verifier')))pluginFail(400,'invalid_grant');
                // The original signed consent binds unused codes to the signing secret.
                const used=await env.DB.prepare('DELETE FROM ai_oauth_codes WHERE code_hash=? AND expires_at>? RETURNING code_hash').bind(hash,now()).first();
                if(!used)pluginFail(400,'invalid_grant');
                const iat=Math.floor(now()/1000),scope=pluginScopes(p.scope);
                const access_token=await seal('access',{iss:BRIDGE_BASE,aud:MCP_RESOURCE,sub:'owner',client_id:CHATGPT_CLIENT,scope,iat,exp:iat+86400},env.ACTION_SECRET);
                return json(200,{access_token,token_type:'Bearer',expires_in:86400,scope});
            }
            if(path!=='/mcp'||url.search)pluginFail(404,'not_found');
            const owner=await access(request,env.ACTION_SECRET);
            if(method!=='POST')return json(405,{error:'method_not_allowed'},{Allow:'POST'});
            const version=request.headers.get('MCP-Protocol-Version');if(version&&!PROTOCOLS.includes(version))pluginFail(400,'unsupported_protocol');
            const accept=request.headers.get('Accept')||'';if(!accept.includes('application/json')||!accept.includes('text/event-stream'))pluginFail(406,'accept_required');
            let rpc;
            try{rpc=await readBody(request,16000);}catch(e){
                if(e?.status===413&&e?.code==='body_too_large')pluginFail(413,'body_too_large');
                if(e?.status===415&&e?.code==='json_required')pluginFail(415,'json_required');
                throw e;
            }
            const valid=rpc&&typeof rpc==='object'&&!Array.isArray(rpc)&&rpc.jsonrpc==='2.0'&&typeof rpc.method==='string'&&Object.keys(rpc).every(k=>['jsonrpc','id','method','params'].includes(k));
            const id=rpc?.id;
            const rpcError=(code,message)=>json(200,{jsonrpc:'2.0',id:typeof id==='string'||Number.isInteger(id)?id:null,error:{code,message}});
            if(!valid||(Object.hasOwn(rpc,'id')&&!(typeof id==='string'&&id.length<=256||Number.isSafeInteger(id))))return rpcError(-32600,'Invalid Request');
            if(!Object.hasOwn(rpc,'id'))return rpc.method.startsWith('notifications/')?new Response(null,{status:202,headers}):json(400,{error:'invalid_request'});
            const result=value=>json(200,{jsonrpc:'2.0',id,result:value});
            if(rpc.method==='initialize')return result({protocolVersion:PROTOCOLS.includes(rpc.params?.protocolVersion)?rpc.params.protocolVersion:PROTOCOLS[0],capabilities:{tools:{listChanged:false}},serverInfo:{name:'missao-tatica',version:'1.0.0'},instructions:'Contexto parcial. Confirmar os campos antes de enviar proposta; criar a missão somente no aplicativo.'});
            if(rpc.method==='ping')return result({});
            if(rpc.method==='tools/list')return result({tools:PLUGIN_TOOLS.map(t=>({...t,_meta:{securitySchemes:t.securitySchemes}}))});
            if(rpc.method!=='tools/call')return rpcError(-32601,'Method not found');
            const params=rpc.params;
            if(!params||typeof params!=='object'||Array.isArray(params)||Object.keys(params).some(k=>!['name','arguments','_meta'].includes(k)))return rpcError(-32602,'Invalid params');
            const tool=PLUGIN_TOOLS.find(t=>t.name===params.name);if(!tool)return rpcError(-32602,'Unknown tool');
            if(!tool.securitySchemes[0].scopes.every(s=>owner.scope.split(' ').includes(s)))return json(403,{error:'insufficient_scope'},authChallenge());
            const args=params.arguments;
            if(!args||typeof args!=='object'||Array.isArray(args)||tool.inputSchema.required.some(k=>!Object.hasOwn(args,k))||Object.keys(args).some(k=>!Object.hasOwn(tool.inputSchema.properties,k)))return rpcError(-32602,'Invalid arguments');
            const read=params.name==='getSharedWeek';
            const internal=new Request(BRIDGE_BASE+(read?'/v1/week?weekStart='+encodeURIComponent(args.weekStart):'/v1/proposals'),{method:read?'GET':'POST',headers:{Authorization:'Bearer '+env.ACTION_SECRET,'Content-Type':'application/json'},...(!read?{body:JSON.stringify(args)}:{})});
            const response=await callBridge(internal,env),data=await response.json();
            return result({content:[{type:'text',text:JSON.stringify(data)}],...(response.ok?{structuredContent:data}:{isError:true})});
        }catch(e){
            const status=e instanceof PluginError?e.status:e instanceof ContractError?400:503,code=e instanceof PluginError?e.code:e instanceof ContractError?'invalid_request':'service_unavailable';
            return json(status,{error:code},status===401?authChallenge():status===429?{'Retry-After':'60'}:{});
        }
    };
}
