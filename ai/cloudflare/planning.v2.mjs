import {MISSION_CHANGE_TOOLS} from '../v2/mission_changes.js';
import {MissionChangeError} from './mission-changes.mjs';
import {DAYS,validateWeek,ContractError} from '../contract.v1.js';
import {V2_FRESH_MS,V2ValidationError,v2ValidateChoices,v2ValidateSnapshot,v2Module,v2GrantId,v2Integer,v2Ref} from '../v2/contract.js';
import {V2_PROPOSAL_SCOPE,v2ProposalAllowed,V2_ENTITY_KINDS,V2_PROPOSAL_TOOLS} from '../v2/proposals.js';
import {LIBRARY_IMPORT_TOOLS} from '../v2/library_import.js';
import {CatalogError} from './library-import.mjs';
import {ProposalError} from './proposals.v2.mjs';

export const PLANNING_SCOPE='planning:read';
const PLANNING_BASE='https://missao-tatica-ai-bridge.victorduarteferreira1997.workers.dev';
const planningEncoder=new TextEncoder();
const pageProperties={pageSize:{type:'integer',minimum:1,maximum:50,default:25},cursor:{type:'string',maxLength:4096},query:{type:'string',maxLength:100}};
const filterString={type:'string',maxLength:200};
const missionStatuses=['planned','in_progress','paused','completed','not_held'];
const radarStatuses=['active','waiting','backlog','closed'];
const studyKinds=['study.track','study.subject','study.block','study.review','study.cycle'];
function planningTool(name,title,description,properties={}){return {name,title,description,inputSchema:{type:'object',additionalProperties:false,required:[],properties},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},securitySchemes:[{type:'oauth2',scopes:[PLANNING_SCOPE]}]};}
export const PLANNING_TOOLS=[
    planningTool('getPlanningOverview','Consultar planejamento autorizado','Resumo dos módulos autorizados no app por 30 dias, com datas da última cópia e aviso de desatualização. Ausência de dados não comprova disponibilidade.'),
    planningTool('listMissions','Consultar missões autorizadas','Lista paginada de missões de todas as categorias autorizadas, incluindo concluídas. Filtre estado, categoria, dia ou semana conhecida; não invente semana para registros antigos.',{...pageProperties,status:{type:'string',enum:missionStatuses},category:filterString,day:{type:'string',enum:DAYS},weekStart:{type:'string',pattern:'^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'}}),
    planningTool('listRadarDemands','Consultar demandas autorizadas do RADAR','Lista paginada do RADAR autorizado, com próxima ação, espera e acompanhamento. closed indica demanda encerrada, sem afirmar sucesso.',{...pageProperties,status:{type:'string',enum:radarStatuses},area:filterString,project:filterString}),
    planningTool('listStudies','Consultar estudos e progresso autorizado','Consulta trilhas, disciplinas, ciclos, blocos e revisões de estudos, com progresso agregado. Blocos semanais não garantem data nem disponibilidade. Não cria ou modifica planos.',{...pageProperties,kind:{type:'string',enum:studyKinds}})
];
export class PlanningError extends Error{constructor(status,code){super(code);this.status=status;this.code=code;}}
const planningFail=(status,code)=>{throw new PlanningError(status,code);};
const planningB64=b=>btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
function planningUnb64(s){if(typeof s!=='string'||s.length>8192||!/^[A-Za-z0-9_-]+$/.test(s))planningFail(401,'invalid_token');return Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));}
function planningSecret(s){if(typeof s!=='string'||s.length<32||s.length>256||/\s/.test(s))planningFail(503,'service_unavailable');}
export function planningArguments(name,args){
    const t=[...PLANNING_TOOLS,...V2_PROPOSAL_TOOLS,...LIBRARY_IMPORT_TOOLS,...MISSION_CHANGE_TOOLS].find(t=>t.name===name);
    if(!t||!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!Object.hasOwn(t.inputSchema.properties,k)))planningFail(400,'invalid_arguments');
    if(t.inputSchema.required.some(k=>!Object.hasOwn(args,k)))planningFail(400,'invalid_arguments');
    for(const [k,v] of Object.entries(args)){
        const p=t.inputSchema.properties[k];
        if(p.type==='integer'&&(!Number.isInteger(v)||v<p.minimum||v>p.maximum))planningFail(400,'invalid_arguments');
        if(p.type==='string'&&(typeof v!=='string'||v.length>(p.maxLength||200)||/[\u0000-\u001f]/.test(v)||p.enum&&!p.enum.includes(v)))planningFail(400,'invalid_arguments');
        if(k==='weekStart')try{validateWeek(v);}catch{planningFail(400,'invalid_arguments');}
    }
    return args;
}
export function createPlanningService({now=Date.now,readBody,proposals,libraryImports,missionChanges}={}){
    let cachedSecret='',cachedKey;
    async function signingKey(secret){planningSecret(secret);if(secret!==cachedSecret){cachedSecret=secret;cachedKey=crypto.subtle.importKey('raw',planningEncoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}return cachedKey;}
    async function seal(kind,p,secret){const body=planningB64(planningEncoder.encode(JSON.stringify(p)));return body+'.'+planningB64(new Uint8Array(await crypto.subtle.sign('HMAC',await signingKey(secret),planningEncoder.encode(kind+'.'+body))));}
    async function unseal(kind,token,secret){
        try{if(typeof token!=='string'||token.length>8192)planningFail(401,'invalid_token');const parts=token.split('.');if(parts.length!==2||!await crypto.subtle.verify('HMAC',await signingKey(secret),planningUnb64(parts[1]),planningEncoder.encode(kind+'.'+parts[0])))planningFail(401,'invalid_token');const p=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(planningUnb64(parts[0])));if(!Number.isInteger(p.exp)||p.exp<=Math.floor(now()/1000)||!Number.isInteger(p.iat)||p.iat>Math.floor(now()/1000))planningFail(401,'invalid_token');return p;}catch(e){if(e instanceof PlanningError&&e.status===503)throw e;planningFail(401,'invalid_token');}
    }
    async function equal(a,b){const hashes=await Promise.all([a,b].map(s=>crypto.subtle.digest('SHA-256',planningEncoder.encode(s))));const x=new Uint8Array(hashes[0]),y=new Uint8Array(hashes[1]);let d=0;for(let i=0;i<x.length;i++)d|=x[i]^y[i];return d===0;}
    const ready=env=>{if(env.AI_V2_ENABLED!=='true'||env.AI_V2_READ_ENABLED!=='true')planningFail(404,'v2_reads_not_enabled');};
    const database=env=>{if(!env.DB)planningFail(503,'service_unavailable');return env.DB.withSession?env.DB.withSession('first-primary'):env.DB;};
    function grant(row){
        const g={grantId:row.grant_id,version:row.version,choices:JSON.parse(row.choices),frozenRefs:JSON.parse(row.frozen_refs)};
        v2GrantId(g.grantId);v2Integer(g.version);v2ValidateChoices(g.choices);if(!Array.isArray(g.frozenRefs)||g.frozenRefs.length>200)throw new V2ValidationError();g.frozenRefs.forEach(v2Ref);return g;
    }
    async function activeGrant(env,expected){
        ready(env);const db=database(env);
        const row=await db.prepare('SELECT grant_id,version,choices,frozen_refs,expires_at FROM ai_v2_access WHERE singleton=1 AND status=\'active\' AND expires_at>?').bind(now()).first();
        if(!row)planningFail(401,'grant_not_active');grant(row);
        if(expected&&(row.grant_id!==expected.grantId||row.version!==expected.grantVersion))planningFail(401,'grant_changed');return row;
    }
    async function oauthGrant(env,scope=PLANNING_SCOPE){const row=await activeGrant(env);if(scope.split(' ').includes(V2_PROPOSAL_SCOPE)){if(env.AI_V2_PROPOSALS_ENABLED!=='true')planningFail(404,'v2_proposals_not_enabled');const choices=grant(row).choices;if(!(env.AI_MISSION_CHANGES_ENABLED==='true'&&choices.allowMissionChanges===true)&&!(env.AI_LIBRARY_IMPORT_ENABLED==='true'&&choices.allowLibraryProposals===true)&&!['mission.create',...(env.AI_V2_ENTITIES_ENABLED==='true'?V2_ENTITY_KINDS:[])].some(kind=>v2ProposalAllowed(choices,kind)))planningFail(403,'proposal_consent_required');}return {grantId:row.grant_id,grantVersion:row.version};}
    async function bind(body,env){
        const requestedScope=body?.requestedScope??PLANNING_SCOPE;
        if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).sort().join(',')!==(Object.hasOwn(body,'requestedScope')?'expectedGrantId,expectedGrantVersion,requestedScope,subject':'expectedGrantId,expectedGrantVersion,subject')||!/^[a-f0-9]{64}$/.test(body.subject)||![PLANNING_SCOPE,V2_PROPOSAL_SCOPE].includes(requestedScope))planningFail(400,'invalid_arguments');
        if(body.expectedGrantId===null){if(body.expectedGrantVersion!==0)planningFail(400,'invalid_arguments');}else{try{v2GrantId(body.expectedGrantId);v2Integer(body.expectedGrantVersion);}catch{planningFail(400,'invalid_arguments');}if(body.expectedGrantVersion===0)planningFail(400,'invalid_arguments');}
        const row=await activeGrant(env,body.expectedGrantId===null?null:{grantId:body.expectedGrantId,grantVersion:body.expectedGrantVersion});
        if(requestedScope===V2_PROPOSAL_SCOPE)await oauthGrant(env,requestedScope);
        const iat=Math.floor(now()/1000),exp=Math.min(iat+300,Math.ceil(row.expires_at/1000));
        const p={iss:PLANNING_BASE,aud:PLANNING_BASE+'/v2/planning',sub:body.subject,scope:requestedScope,grantId:row.grant_id,grantVersion:row.version,iat,exp};
        const accessToken=await seal('planning-access',p,env.ACTION_SECRET);
        await activeGrant(env,p);
        return {accessToken,expiresAt:new Date(exp*1000).toISOString(),grantId:p.grantId,grantVersion:p.grantVersion,scope:requestedScope};
    }
    async function read(name,args,claims,env){
        ready(env);planningArguments(name,args);
        if(MISSION_CHANGE_TOOLS.some(t=>t.name===name))return missionChanges.call(name,args,claims,env);
        if(LIBRARY_IMPORT_TOOLS.some(t=>t.name===name))return libraryImports.call(name,args,claims,env);
        if(V2_PROPOSAL_TOOLS.some(t=>t.name===name))return proposals.call(name,args,claims,env);
        if(typeof claims?.scope!=='string'||!claims.scope.split(' ').includes(PLANNING_SCOPE))planningFail(403,'insufficient_scope');
        try{v2GrantId(claims.grantId);v2Integer(claims.grantVersion);}catch{planningFail(401,'invalid_token');}
        const db=database(env);
        const row=await db.prepare("SELECT * FROM ai_v2_access WHERE singleton=1 AND grant_id=? AND version=? AND status='active' AND expires_at>?").bind(claims.grantId,claims.grantVersion,now()).first();
        if(!row)planningFail(401,'grant_changed');const g=grant(row);
        const module=name==='listMissions'?'missions':name==='listRadarDemands'?'radar':name==='listStudies'?'studies':null;
        if(module&&!g.choices.modules[module])planningFail(403,'module_not_shared');
        let snapshot=null;
        if(row.snapshot){snapshot=JSON.parse(row.snapshot);v2ValidateSnapshot(snapshot,g,now());if(snapshot.expectedProjectionVersion!==row.projection_version-1||snapshot.sourceSavedAt!==row.source_saved_at||!Number.isSafeInteger(row.synced_at)||row.synced_at>now()+60000)throw new V2ValidationError();}
        const freshUntil=snapshot?Math.min(Date.parse(snapshot.sourceSavedAt),row.synced_at)+V2_FRESH_MS:null;
        const metadata={schemaVersion:2,grantId:g.grantId,grantVersion:g.version,projectionVersion:row.projection_version,expiresAt:new Date(row.expires_at).toISOString(),sourceSavedAt:snapshot?.sourceSavedAt||null,syncedAt:snapshot?new Date(row.synced_at).toISOString():null,freshUntil:freshUntil?new Date(freshUntil).toISOString():null,freshness:!snapshot?'unavailable':freshUntil>now()?'fresh':'stale',coverage:{...g.choices.modules},omissions:snapshot?.omissions||['A cópia autorizada ainda não foi sincronizada.'],partial:true,availabilityVerified:false};
        let data;
        if(name==='getPlanningOverview'){
            const counts={missions:null,radar:null,studies:null};if(snapshot)for(const k of Object.keys(counts))if(g.choices.modules[k])counts[k]=snapshot.entities.filter(e=>v2Module(e.kind)===k).length;
            data={...metadata,counts};
        }else{
            const filters=Object.fromEntries(Object.entries({...args,pageSize:args.pageSize??25}).filter(([k])=>k!=='cursor').sort(([a],[b])=>a.localeCompare(b)));let offset=0;
            if(args.cursor){let c;try{c=await unseal('planning-cursor',args.cursor,env.ACTION_SECRET);}catch(e){if(e instanceof PlanningError&&e.status===503)throw e;planningFail(400,'invalid_cursor');}
                if(c.grantId!==g.grantId||c.grantVersion!==g.version||c.name!==name||c.filters!==JSON.stringify(filters)||!Number.isSafeInteger(c.offset)||c.offset<0||c.offset>200)planningFail(400,'invalid_cursor');if(c.projectionVersion!==row.projection_version)planningFail(409,'projection_changed');offset=c.offset;
            }
            const matching=(snapshot?.entities||[]).filter(e=>v2Module(e.kind)===module&&Object.entries(args).every(([k,v])=>{
                if(['cursor','pageSize'].includes(k))return true;
                if(k==='kind')return e.kind===v;
                if(k==='query')return (e.fields.title||e.fields.name||'').toLocaleLowerCase('pt-BR').includes(v.toLocaleLowerCase('pt-BR'));
                return e.fields[k]===v;
            })).sort((a,b)=>a.ref.localeCompare(b.ref));
            const items=matching.slice(offset,offset+filters.pageSize),next=offset+items.length;
            const nextCursor=next<matching.length?await seal('planning-cursor',{grantId:g.grantId,grantVersion:g.version,projectionVersion:row.projection_version,name,filters:JSON.stringify(filters),offset:next,iat:Math.floor(now()/1000),exp:Math.min(Math.floor(now()/1000)+600,Math.ceil(row.expires_at/1000))},env.ACTION_SECRET):null;
            data={...metadata,items,total:snapshot?matching.length:null,nextCursor};
        }
        const current=await db.prepare("SELECT version FROM ai_v2_access WHERE singleton=1 AND grant_id=? AND version=? AND projection_version=? AND status='active' AND expires_at>?").bind(g.grantId,g.version,row.projection_version,now()).first();
        if(!current)planningFail(409,'planning_changed');return data;
    }
    let minute=-1,count=0;
    async function fetchRoute(request,env){
        const url=new URL(request.url);if(!['/v2/connection','/v2/planning'].includes(url.pathname))return null;
        const send=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
        try{
            ready(env);if(url.search||request.method!=='POST')planningFail(404,'not_found');
            const origin=request.headers.get('Origin');if(origin&&origin!=='https://missao-tatica-conexao.victorduarteferreira.chatgpt.site')planningFail(403,'origin_not_allowed');
            const authorization=request.headers.get('Authorization')||'';
            let claims;
            if(url.pathname==='/v2/connection'){planningSecret(env.ACTION_SECRET);if(!await equal(authorization,'Bearer '+env.ACTION_SECRET))planningFail(401,'unauthorized');}
            else{if(!authorization.startsWith('Bearer '))planningFail(401,'invalid_token');claims=await unseal('planning-access',authorization.slice(7),env.ACTION_SECRET);if(claims.iss!==PLANNING_BASE||claims.aud!==PLANNING_BASE+'/v2/planning'||!/^[a-f0-9]{64}$/.test(claims.sub)||claims.exp-claims.iat>300)planningFail(401,'invalid_token');}
            const slot=Math.floor(now()/60000);if(slot!==minute){minute=slot;count=0;}if(++count>120)planningFail(429,'rate_limited');
            const body=await readBody(request,16000);
            if(url.pathname==='/v2/connection')return send(200,await bind(body,env));
            if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).sort().join(',')!=='arguments,name')planningFail(400,'invalid_arguments');
            return send(200,await read(body.name,body.arguments,claims,env));
        }catch(e){return send(e instanceof PlanningError||e instanceof ProposalError||e instanceof CatalogError||e instanceof MissionChangeError?e.status:e?.status===413?413:e?.status===415?415:e instanceof ContractError?400:e instanceof V2ValidationError?422:503,{error:e instanceof PlanningError||e instanceof ProposalError||e instanceof CatalogError||e instanceof MissionChangeError?e.code:e?.status===413?'body_too_large':e?.status===415?'json_required':e instanceof ContractError?'invalid_arguments':e instanceof V2ValidationError?'invalid_shared_data':'service_unavailable'});}
    }
    return {oauthGrant,bind,read,fetch:fetchRoute};
}
