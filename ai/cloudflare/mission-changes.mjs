import {AuthError,createFirebaseVerifier} from './firebase_auth.mjs';
import {v2ValidateChoices,v2ValidateSnapshot,V2_FRESH_MS,v2Hash,v2Ref,v2Integer,v2Exact,V2ValidationError} from '../v2/contract.js';
import {missionChangeFields,missionChangeRequest,missionChangeRow,MISSION_CHANGE_KIND,MISSION_CHANGE_TTL} from '../v2/mission_changes.js';
const MISSION_CHANGE_SCHEMA=["-- Additive and repeatable: leaves all existing queues, grants and records intact.\nCREATE TABLE IF NOT EXISTS ai_mission_changes (\n id TEXT PRIMARY KEY CHECK(length(id)=64), grant_id TEXT NOT NULL,\n grant_version INTEGER NOT NULL, payload_hash TEXT NOT NULL,\n version INTEGER NOT NULL DEFAULT 1,\n status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','applying','accepted','rejected','expired')),\n created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,\n fields TEXT CHECK(fields IS NULL OR length(CAST(fields AS BLOB))<=12000),\n expected_task_version TEXT, review_hash TEXT, receipt_ref TEXT\n)", "CREATE INDEX IF NOT EXISTS ai_mission_changes_status ON ai_mission_changes(status,created_at,id)", "CREATE INDEX IF NOT EXISTS ai_mission_changes_grant ON ai_mission_changes(grant_id,grant_version,created_at,id)"];
const CHANGE_ORIGIN='https://victorduarteferreira1997.github.io';
export class MissionChangeError extends Error{constructor(status,code){super(code);this.status=status;this.code=code;}}
const changeFail=(status,code)=>{throw new MissionChangeError(status,code);};
export function createMissionChanges({now=Date.now,verifyOwner=createFirebaseVerifier(),readBody}={}){
 const ready=env=>{if(!['AI_V2_ENABLED','AI_V2_READ_ENABLED','AI_V2_PROPOSALS_ENABLED','AI_V2_APPLY_ENABLED','AI_MISSION_CHANGES_ENABLED'].every(k=>env[k]==='true'))changeFail(404,'mission_changes_not_enabled');};
 const dbFor=env=>env.DB?.withSession?env.DB.withSession('first-primary'):env.DB;
 const run=async statement=>{const r=await statement.run();if(!r.success)throw Error('database');return r.meta.changes;};
 const initialized=new WeakMap();
 async function ensure(env){const key=env.DB;if(!initialized.has(key)){const pending=(async()=>{const db=dbFor(env);for(const sql of MISSION_CHANGE_SCHEMA)await run(db.prepare(sql).bind());})();initialized.set(key,pending);pending.catch(()=>initialized.delete(key));}await initialized.get(key);}
 const find=(db,id)=>db.prepare('SELECT * FROM ai_mission_changes WHERE id=?').bind(id).first();
 const map=row=>missionChangeRow({id:row.id,grantId:row.grant_id,grantVersion:row.grant_version,version:row.version,kind:MISSION_CHANGE_KIND,status:row.status,createdAt:new Date(row.created_at).toISOString(),expiresAt:new Date(row.expires_at).toISOString(),fields:row.fields?JSON.parse(row.fields):null,expectedTaskVersion:row.expected_task_version||null,receiptRef:row.receipt_ref||null});
 async function cleanup(db){await run(db.prepare("UPDATE ai_mission_changes SET status='expired',fields=NULL,expected_task_version=NULL,version=version+1 WHERE id IN (SELECT id FROM ai_mission_changes WHERE status='pending' AND expires_at<=? LIMIT 50)").bind(now()));await run(db.prepare("UPDATE ai_mission_changes SET fields=NULL WHERE id IN (SELECT id FROM ai_mission_changes WHERE status IN ('accepted','rejected') AND fields IS NOT NULL AND expires_at<=? LIMIT 50)").bind(now()));}
 async function consent(db,claims,scope){
  if(!claims?.scope?.split(' ').includes(scope))changeFail(403,'insufficient_scope');
  const row=await db.prepare("SELECT choices FROM ai_v2_access WHERE singleton=1 AND grant_id=? AND version=? AND status='active' AND expires_at>?").bind(claims.grantId,claims.grantVersion,now()).first();
  if(!row)changeFail(401,'grant_changed');if(v2ValidateChoices(JSON.parse(row.choices)).allowMissionChanges!==true)changeFail(403,'mission_change_consent_required');
 }
 async function cursor(value,env,body=null){
  const secret=env.ACTION_SECRET;if(typeof secret!=='string'||secret.length<32)changeFail(503,'service_unavailable');
  const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
  const b64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  if(body){const payload=b64(enc.encode(JSON.stringify(body)));return payload+'.'+b64(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode('mission-change-cursor.'+payload))));}
  try{if(typeof value!=='string'||value.length>4096)throw Error();const [p,s,...extra]=value.split('.');if(extra.length||!p||!s||!/^[A-Za-z0-9_-]+$/.test(p+s))throw Error();const decode=x=>Uint8Array.from(atob(x.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));if(!await crypto.subtle.verify('HMAC',key,decode(s),enc.encode('mission-change-cursor.'+p)))throw Error();return JSON.parse(new TextDecoder().decode(decode(p)));}catch{changeFail(400,'invalid_cursor');}
 }
 async function validateTarget(db,claims,fields){
  const row=await db.prepare("SELECT * FROM ai_v2_access WHERE singleton=1 AND grant_id=? AND version=? AND status='active' AND expires_at>?").bind(claims.grantId,claims.grantVersion,now()).first();
  if(!row?.snapshot)changeFail(409,'mission_snapshot_required');
  const g={grantId:row.grant_id,version:row.version,choices:v2ValidateChoices(JSON.parse(row.choices)),frozenRefs:JSON.parse(row.frozen_refs)},snapshot=JSON.parse(row.snapshot);v2ValidateSnapshot(snapshot,g,now());
  if(snapshot.expectedProjectionVersion!==row.projection_version-1||snapshot.sourceSavedAt!==row.source_saved_at||!Number.isSafeInteger(row.synced_at)||row.synced_at>now()+60000||Math.min(Date.parse(snapshot.sourceSavedAt),row.synced_at)+V2_FRESH_MS<=now())changeFail(409,'mission_snapshot_stale');
  const target=snapshot.entities.find(e=>e.kind==='mission'&&e.ref===fields.targetRef);if(!target||target.entityVersion!==fields.targetVersion)changeFail(409,'mission_target_changed');
  if(target.fields.activityType!=='task'||target.fields.status!=='planned')changeFail(409,'mission_target_not_editable');
  if(fields.patch.subtaskEdits?.some(s=>!target.fields.subtasks[s.index])||(target.fields.subtasks.length+(fields.patch.addSubtasks?.length||0))>100)changeFail(422,'invalid_subtasks');
 }
 async function submit(args,claims,env){
  ready(env);const a=missionChangeRequest(args),db=dbFor(env);await consent(db,claims,'proposals:create');await ensure(env);await cleanup(db);
  const payload=JSON.stringify(a.fields),hash=await v2Hash(payload),id=await v2Hash('mission-change:'+claims.grantId+':'+claims.grantVersion+':'+a.idempotencyKey);let row=await find(db,id);
  if(row){if(row.payload_hash!==hash)changeFail(409,'idempotency_conflict');await consent(db,claims,'proposals:create');return {schemaVersion:1,part:map(row),replayed:true};}
  await validateTarget(db,claims,a.fields);
  await run(db.prepare("INSERT INTO ai_mission_changes(id,grant_id,grant_version,payload_hash,created_at,expires_at,fields) SELECT ?,?,?,?,?,?,? FROM ai_v2_access WHERE singleton=1 AND grant_id=? AND version=? AND status='active' AND expires_at>? AND json_extract(choices,'$.allowMissionChanges')=1 AND (SELECT COUNT(*) FROM ai_mission_changes)<1000 AND (SELECT COUNT(*) FROM ai_mission_changes WHERE status IN ('pending','applying'))<100 ON CONFLICT(id) DO NOTHING").bind(id,claims.grantId,claims.grantVersion,hash,now(),now()+MISSION_CHANGE_TTL,payload,claims.grantId,claims.grantVersion,now()));
  row=await find(db,id);await consent(db,claims,'proposals:create');if(!row)changeFail(409,'mission_change_capacity_reached');if(row.payload_hash!==hash)changeFail(409,'idempotency_conflict');return {schemaVersion:1,part:map(row),replayed:false};
 }
 async function list(args,claims,env,owner=false){
  ready(env);if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!['status','cursor'].includes(k))||args.status!==undefined&&!['pending','applying','accepted','rejected','expired'].includes(args.status)||args.cursor!==undefined&&(typeof args.cursor!=='string'||args.cursor.length>4096))changeFail(400,'invalid_arguments');
  const db=dbFor(env);if(!owner)await consent(db,claims,'planning:read');await ensure(env);await cleanup(db);const status=args.status||'pending',binding=owner?'owner':claims.grantId+':'+claims.grantVersion;let after=-1,id='';
  if(args.cursor){const c=await cursor(args.cursor,env);if(c.binding!==binding||c.status!==status||c.expiresAt<=now()||!Number.isSafeInteger(c.after)||c.after<0)changeFail(400,'invalid_cursor');v2Ref(c.id);after=c.after;id=c.id;}
  const result=await db.prepare(`SELECT * FROM ai_mission_changes WHERE status=? ${owner?'':'AND grant_id=? AND grant_version=?'} AND (created_at>? OR (created_at=? AND id>?)) ORDER BY created_at,id LIMIT 6`).bind(status,...(owner?[]:[claims.grantId,claims.grantVersion]),after,after,id).all();if(!result.success)throw Error('database');
  const rows=result.results,items=rows.slice(0,5).map(map),last=rows[4];const nextCursor=rows.length>5?await cursor(null,env,{binding,status,after:last.created_at,id:last.id,expiresAt:now()+600000}):null;if(!owner)await consent(db,claims,'planning:read');
  return {schemaVersion:1,...(!owner?{grantId:claims.grantId,grantVersion:claims.grantVersion}:{}),items,nextCursor};
 }
 async function reserve(body,env){
  v2Exact(body,['id','expectedVersion','fields','expectedTaskVersion']);v2Ref(body.id);v2Integer(body.expectedVersion);v2Ref(body.expectedTaskVersion);const fields=missionChangeFields(body.fields);
  const db=dbFor(env);await ensure(env);await cleanup(db);let row=await find(db,body.id);if(!row)changeFail(404,'mission_change_not_found');
  const hash=await v2Hash(JSON.stringify({fields,expectedTaskVersion:body.expectedTaskVersion}));
  if(['applying','accepted'].includes(row.status)){if(row.review_hash!==hash)changeFail(409,'application_conflict');return {schemaVersion:1,part:map(row)};}
  if(row.status!=='pending'||!row.fields)changeFail(409,'mission_change_changed');
  const original=JSON.parse(row.fields);if(original.targetRef!==fields.targetRef||original.targetVersion!==fields.targetVersion)changeFail(409,'mission_change_changed');
  await run(db.prepare("UPDATE ai_mission_changes SET status='applying',fields=?,expected_task_version=?,review_hash=?,version=version+1 WHERE id=? AND status='pending' AND version=? AND expires_at>?").bind(JSON.stringify(fields),body.expectedTaskVersion,hash,body.id,body.expectedVersion,now()));row=await find(db,body.id);if(row.review_hash!==hash)changeFail(409,'mission_change_changed');return {schemaVersion:1,part:map(row)};
 }
 async function acknowledge(body,env){v2Exact(body,['id','receiptRef']);v2Ref(body.id);v2Ref(body.receiptRef);const db=dbFor(env);await ensure(env);await run(db.prepare("UPDATE ai_mission_changes SET status='accepted',receipt_ref=?,version=version+1 WHERE id=? AND status='applying'").bind(body.receiptRef,body.id));const row=await find(db,body.id);if(!row||row.status!=='accepted'||row.receipt_ref!==body.receiptRef)changeFail(409,'application_conflict');return {schemaVersion:1,part:map(row)};}
 async function reject(body,env){v2Exact(body,['id','expectedVersion']);v2Ref(body.id);v2Integer(body.expectedVersion);const db=dbFor(env);await ensure(env);await cleanup(db);await run(db.prepare("UPDATE ai_mission_changes SET status='rejected',version=version+1 WHERE id=? AND status='pending' AND version=? AND expires_at>?").bind(body.id,body.expectedVersion,now()));const row=await find(db,body.id);if(!row||row.status!=='rejected'||row.version!==body.expectedVersion+1)changeFail(409,'mission_change_changed');return {schemaVersion:1,part:map(row)};}
 let minute=-1,count=0;
 return {submit,list,async call(name,args,claims,env){if(name==='submitMissionChange')return submit(args,claims,env);if(name==='listMissionChanges')return list(args,claims,env);changeFail(400,'invalid_arguments');},async fetch(request,env){
  const url=new URL(request.url);if(!['/v2/app/mission-changes','/v2/app/mission-changes/reserve','/v2/app/mission-changes/acknowledge','/v2/app/mission-changes/reject'].includes(url.pathname))return null;
  const cors=request.headers.get('Origin')===CHANGE_ORIGIN?{'Access-Control-Allow-Origin':CHANGE_ORIGIN,Vary:'Origin'}:{},send=(status,body)=>Response.json(body,{status,headers:{...cors,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  try{ready(env);if(request.headers.get('Origin')!==CHANGE_ORIGIN)changeFail(403,'origin_not_allowed');const method=url.pathname==='/v2/app/mission-changes'?'GET':'POST';
   if(request.method==='OPTIONS'){if(request.headers.get('Access-Control-Request-Method')!==method||(request.headers.get('Access-Control-Request-Headers')||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean).some(k=>!['authorization','content-type','x-firebase-appcheck'].includes(k)))changeFail(403,'preflight_not_allowed');return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':method,'Access-Control-Allow-Headers':'Authorization, Content-Type, X-Firebase-AppCheck'}});}
   if(request.method!==method||method==='POST'&&url.search)changeFail(404,'not_found');await verifyOwner(request);const slot=Math.floor(now()/60000);if(slot!==minute){minute=slot;count=0;}if(++count>60)changeFail(429,'rate_limited');
   if(method==='GET'){const args={};for(const [k,v] of url.searchParams){if(Object.hasOwn(args,k))changeFail(400,'invalid_arguments');args[k]=v;}return send(200,await list(args,null,env,true));}
   const body=await readBody(request,14000),operation=url.pathname.split('/').pop();return send(200,await ({reserve,acknowledge,reject}[operation])(body,env));
  }catch(error){return send(error instanceof AuthError?401:error instanceof MissionChangeError?error.status:error instanceof V2ValidationError?422:error?.status===413?413:503,{error:error instanceof AuthError?'unauthorized':error instanceof MissionChangeError?error.code:error instanceof V2ValidationError?'invalid_arguments':error?.status===413?'body_too_large':'service_unavailable'});}
 }};
}
