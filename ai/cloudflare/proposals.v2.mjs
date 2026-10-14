import {AuthError,createFirebaseVerifier} from './firebase_auth.mjs';
import {ContractError} from '../contract.v1.js';
import {v2ValidateChoices,v2GrantId,v2Integer,v2Ref,v2Hash,v2Exact,V2ValidationError} from '../v2/contract.js';
import {V2_PROPOSAL_SCOPE,V2_PROPOSAL_TTL,v2ProposalRequest,v2ProposalRow} from '../v2/proposals.js';
const PROPOSAL_ORIGIN='https://victorduarteferreira1997.github.io';
export class ProposalError extends Error{constructor(status,code){super(code);this.status=status;this.code=code;}}
const proposalFail=(status,code)=>{throw new ProposalError(status,code);};
const proposalEncoder=new TextEncoder();
const proposalB64=b=>btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export function createV2Proposals({now=Date.now,verifyOwner=createFirebaseVerifier(),readBody}={}){
 const ready=env=>{if(env.AI_V2_ENABLED!=='true'||env.AI_V2_PROPOSALS_ENABLED!=='true')proposalFail(404,'v2_proposals_not_enabled');};
 const database=env=>env.DB?.withSession?env.DB.withSession('first-primary'):env.DB;
 const run=async q=>{const r=await q.run();if(r.success!==true)throw Error('database');return r.meta.changes;};
 async function cleanup(db){await run(db.prepare("UPDATE ai_v2_proposals SET status='expired',payload=NULL,version=version+1 WHERE id IN (SELECT id FROM ai_v2_proposals WHERE expires_at<=? AND status!='expired' ORDER BY expires_at,id LIMIT 50)").bind(now()));}
 function map(r){const p=r.payload?JSON.parse(r.payload):null;return v2ProposalRow({id:r.id,grantId:r.grant_id,grantVersion:r.grant_version,version:r.version,kind:'mission.create',status:r.expires_at<=now()?'expired':r.status,createdAt:new Date(r.created_at).toISOString(),expiresAt:new Date(r.expires_at).toISOString(),reviewedAt:r.reviewed_at===null?null:new Date(r.reviewed_at).toISOString(),fields:r.expires_at<=now()?null:p?.fields||null,basis:r.expires_at<=now()?null:p?.basis||null,conflictCheck:'unverified',applyEligible:false});}
 async function active(db,claims){
  v2GrantId(claims?.grantId);v2Integer(claims?.grantVersion);
  const row=await db.prepare("SELECT grant_id,version,choices FROM ai_v2_access WHERE singleton=1 AND grant_id=? AND version=? AND status='active' AND expires_at>?").bind(claims.grantId,claims.grantVersion,now()).first();
  if(!row)proposalFail(401,'grant_changed');const c=v2ValidateChoices(JSON.parse(row.choices));if(!c.modules.missions||c.allowProposals!==true)proposalFail(403,'proposal_consent_required');return row;
 }
 async function cursorKey(env){if(typeof env.ACTION_SECRET!=='string'||env.ACTION_SECRET.length<32)proposalFail(503,'service_unavailable');return crypto.subtle.importKey('raw',proposalEncoder.encode(env.ACTION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
 async function encodeCursor(p,env){const b=proposalB64(proposalEncoder.encode(JSON.stringify(p)));return b+'.'+proposalB64(new Uint8Array(await crypto.subtle.sign('HMAC',await cursorKey(env),proposalEncoder.encode('proposal-cursor.'+b))));}
 async function decodeCursor(v,env){try{if(typeof v!=='string'||v.length>4096)throw Error();const [b,s,...extra]=v.split('.');if(extra.length||!b||!s||!/^[A-Za-z0-9_-]+$/.test(b+s))throw Error();const bytes=x=>Uint8Array.from(atob(x.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));if(!await crypto.subtle.verify('HMAC',await cursorKey(env),bytes(s),proposalEncoder.encode('proposal-cursor.'+b)))throw Error();return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes(b)));}catch(e){if(e instanceof ProposalError&&e.status===503)throw e;proposalFail(400,'invalid_cursor');}}
 function listArgs(a){if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!['status','pageSize','cursor'].includes(k))||a.status!==undefined&&!['pending','rejected','expired'].includes(a.status)||a.pageSize!==undefined&&(!Number.isInteger(a.pageSize)||a.pageSize<1||a.pageSize>50)||a.cursor!==undefined&&(typeof a.cursor!=='string'||a.cursor.length>4096))proposalFail(400,'invalid_arguments');return {status:a.status||'pending',pageSize:a.pageSize??25,cursor:a.cursor};}
 async function list(a,claims,env,owner=false){
  ready(env);const f=listArgs(a),db=database(env);if(!owner){if(!claims?.scope?.split(' ').includes('planning:read'))proposalFail(403,'insufficient_scope');await active(db,claims);}await cleanup(db);
  const binding=owner?'owner':claims.grantId+':'+claims.grantVersion;let after=-1,id='';
  if(f.cursor){const c=await decodeCursor(f.cursor,env);if(c.binding!==binding||c.status!==f.status||c.pageSize!==f.pageSize||c.expiresAt<=now()||!Number.isSafeInteger(c.after)||c.after<0)proposalFail(400,'invalid_cursor');v2Ref(c.id);after=c.after;id=c.id;}
  const result=await db.prepare(`SELECT * FROM ai_v2_proposals WHERE status=? ${owner?'':'AND grant_id=? AND grant_version=?'} AND (created_at>? OR (created_at=? AND id>?)) ORDER BY created_at,id LIMIT ?`).bind(f.status,...(owner?[]:[claims.grantId,claims.grantVersion]),after,after,id,f.pageSize+1).all();
  if(result.success!==true)throw Error('database');const rows=result.results,items=rows.slice(0,f.pageSize).map(map),last=rows[Math.min(rows.length,f.pageSize)-1];
  const nextCursor=rows.length>f.pageSize?await encodeCursor({binding,status:f.status,pageSize:f.pageSize,after:last.created_at,id:last.id,expiresAt:now()+600000},env):null;
  if(!owner)await active(db,claims);
  return {schemaVersion:2,...(!owner?{grantId:claims.grantId,grantVersion:claims.grantVersion}:{}),items,nextCursor};
 }
 async function create(a,claims,env){
  ready(env);if(!claims?.scope?.split(' ').includes(V2_PROPOSAL_SCOPE))proposalFail(403,'insufficient_scope');
  const p=v2ProposalRequest(a,claims),json=JSON.stringify(p),hash=await v2Hash(json),id=await v2Hash(p.grantId+':'+p.grantVersion+':'+p.idempotencyKey),db=database(env);await active(db,claims);await cleanup(db);
  const find=()=>db.prepare('SELECT * FROM ai_v2_proposals WHERE id=?').bind(id).first();let old=await find();
  if(old){if(old.payload_hash!==hash)proposalFail(409,'idempotency_conflict');await active(db,claims);return {schemaVersion:2,proposal:map(old),replayed:true};}
  const time=now();const changed=await run(db.prepare(`INSERT INTO ai_v2_proposals (id,grant_id,grant_version,payload_hash,status,created_at,expires_at,payload)
   SELECT ?,?,?,?,'pending',?,?,? FROM ai_v2_access WHERE singleton=1 AND grant_id=? AND version=? AND status='active' AND expires_at>?
   AND json_extract(choices,'$.allowProposals')=1 AND json_extract(choices,'$.modules.missions')=1
   AND (SELECT COUNT(*) FROM ai_v2_proposals)<1000 AND (SELECT COUNT(*) FROM ai_v2_proposals WHERE status='pending')<100 ON CONFLICT(id) DO NOTHING`).bind(id,p.grantId,p.grantVersion,hash,time,time+V2_PROPOSAL_TTL,json,p.grantId,p.grantVersion,time));
  old=await find();if(!changed){await active(db,claims);if(!old)proposalFail(409,'proposal_capacity_reached');if(old.payload_hash!==hash)proposalFail(409,'idempotency_conflict');}
  await active(db,claims);return {schemaVersion:2,proposal:map(old),replayed:!changed};
 }
 async function reject(body,env){v2Exact(body,['id','expectedVersion']);v2Ref(body.id);v2Integer(body.expectedVersion);const db=database(env);await cleanup(db);const changed=await run(db.prepare("UPDATE ai_v2_proposals SET status='rejected',version=version+1,reviewed_at=? WHERE id=? AND version=? AND status='pending' AND expires_at>?").bind(now(),body.id,body.expectedVersion,now()));const row=await db.prepare('SELECT * FROM ai_v2_proposals WHERE id=?').bind(body.id).first();if(!row)proposalFail(404,'proposal_not_found');if(!changed&&!(row.status==='rejected'&&row.version===body.expectedVersion+1))proposalFail(409,'proposal_changed');return {schemaVersion:2,proposal:map(row)};}
 let slot=-1,count=0;
 async function fetchRoute(request,env){
  const url=new URL(request.url);if(!['/v2/app/proposals','/v2/app/proposals/reject'].includes(url.pathname))return null;
  const origin=request.headers.get('Origin'),cors=origin===PROPOSAL_ORIGIN?{'Access-Control-Allow-Origin':PROPOSAL_ORIGIN,Vary:'Origin'}:{};
  const send=(s,d)=>Response.json(d,{status:s,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...cors}});
  try{ready(env);if(origin!==PROPOSAL_ORIGIN)proposalFail(403,'origin_not_allowed');const methods=url.pathname.endsWith('/reject')?['POST']:['GET'];
   if(request.method==='OPTIONS'){const h=(request.headers.get('Access-Control-Request-Headers')||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);if(!methods.includes(request.headers.get('Access-Control-Request-Method'))||h.some(s=>!['authorization','content-type','x-firebase-appcheck'].includes(s)))proposalFail(403,'preflight_not_allowed');return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':methods.join(', '),'Access-Control-Allow-Headers':'Authorization, Content-Type, X-Firebase-AppCheck'}});}
   if(!methods.includes(request.method))proposalFail(404,'not_found');if(request.method==='POST'&&url.search)proposalFail(400,'invalid_arguments');
   await verifyOwner(request);const minute=Math.floor(now()/60000);if(slot!==minute){slot=minute;count=0;}if(++count>60)proposalFail(429,'rate_limited');
   if(request.method==='GET'){const a={};for(const [k,v] of url.searchParams){if(Object.hasOwn(a,k)||!['status','pageSize','cursor'].includes(k))proposalFail(400,'invalid_arguments');a[k]=k==='pageSize'&&/^\d+$/.test(v)?Number(v):v;}return send(200,await list(a,null,env,true));}
   return send(200,await reject(await readBody(request,2000),env));
  }catch(e){const status=e instanceof AuthError?401:e instanceof ProposalError?e.status:e instanceof V2ValidationError||e instanceof ContractError?422:e?.status===413?413:e?.status===415?415:503;return send(status,{error:e instanceof AuthError?'unauthorized':e instanceof ProposalError?e.code:status===422?'invalid_arguments':status===413?'body_too_large':status===415?'json_required':'service_unavailable'});}
 }
 return {create,list,reject,fetch:fetchRoute,async call(name,args,claims,env){if(name==='createProposal')return create(args,claims,env);if(name==='listProposals')return list(args,claims,env);proposalFail(400,'invalid_arguments');}};
}
