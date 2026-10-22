import {AuthError,createFirebaseVerifier} from './firebase_auth.mjs';
import {v2ValidateChoices,v2Hash,v2Ref,v2Integer,v2Exact,V2ValidationError} from '../v2/contract.js';
import {libraryImportFields,libraryImportRequest,libraryImportSelection,libraryImportRow,LIBRARY_IMPORT_KIND,LIBRARY_IMPORT_TTL} from '../v2/library_import.js';
const CATALOG_ORIGIN='https://victorduarteferreira1997.github.io';
export class CatalogError extends Error{constructor(status,code){super(code);this.status=status;this.code=code;}}
const catalogFail=(status,code)=>{throw new CatalogError(status,code);};
export function createLibraryImports({now=Date.now,verifyOwner=createFirebaseVerifier(),readBody}={}){
 const ready=env=>{if(!['AI_V2_ENABLED','AI_V2_READ_ENABLED','AI_V2_PROPOSALS_ENABLED','AI_V2_APPLY_ENABLED','AI_LIBRARY_IMPORT_ENABLED'].every(k=>env[k]==='true'))catalogFail(404,'library_import_not_enabled');};
 const dbFor=env=>env.DB?.withSession?env.DB.withSession('first-primary'):env.DB;
 const run=async statement=>{const r=await statement.run();if(!r.success)throw Error('database');return r.meta.changes;};
 const find=(db,id)=>db.prepare('SELECT * FROM ai_library_imports WHERE id=?').bind(id).first();
 const map=row=>libraryImportRow({id:row.id,grantId:row.grant_id,grantVersion:row.grant_version,version:row.version,kind:LIBRARY_IMPORT_KIND,status:row.status,createdAt:new Date(row.created_at).toISOString(),expiresAt:new Date(row.expires_at).toISOString(),fields:row.fields?JSON.parse(row.fields):null,selection:row.selection?JSON.parse(row.selection):null,receiptRef:row.receipt_ref||null});
 async function cleanup(db){await run(db.prepare("UPDATE ai_library_imports SET status='expired',fields=NULL,selection=NULL,version=version+1 WHERE id IN (SELECT id FROM ai_library_imports WHERE status='pending' AND expires_at<=? LIMIT 50)").bind(now()));await run(db.prepare("UPDATE ai_library_imports SET fields=NULL,selection=NULL WHERE id IN (SELECT id FROM ai_library_imports WHERE status IN ('accepted','rejected') AND fields IS NOT NULL AND expires_at<=? LIMIT 50)").bind(now()));}
 async function consent(db,claims,scope){
  if(!claims?.scope?.split(' ').includes(scope))catalogFail(403,'insufficient_scope');
  const row=await db.prepare("SELECT choices FROM ai_v2_access WHERE singleton=1 AND grant_id=? AND version=? AND status='active' AND expires_at>?").bind(claims.grantId,claims.grantVersion,now()).first();
  if(!row)catalogFail(401,'grant_changed');if(v2ValidateChoices(JSON.parse(row.choices)).allowLibraryProposals!==true)catalogFail(403,'library_consent_required');
 }
 async function cursor(value,env,body=null){
  const secret=env.ACTION_SECRET;if(typeof secret!=='string'||secret.length<32)catalogFail(503,'service_unavailable');
  const enc=new TextEncoder(),key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
  const b64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  if(body){const payload=b64(enc.encode(JSON.stringify(body)));return payload+'.'+b64(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode('catalog-cursor.'+payload))));}
  try{if(typeof value!=='string'||value.length>4096)throw Error();const [p,s,...extra]=value.split('.');if(extra.length||!p||!s||!/^[A-Za-z0-9_-]+$/.test(p+s))throw Error();const decode=x=>Uint8Array.from(atob(x.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));if(!await crypto.subtle.verify('HMAC',key,decode(s),enc.encode('catalog-cursor.'+p)))throw Error();return JSON.parse(new TextDecoder().decode(decode(p)));}catch{catalogFail(400,'invalid_cursor');}
 }
 async function submit(args,claims,env){
  ready(env);const a=libraryImportRequest(args),db=dbFor(env);await consent(db,claims,'proposals:create');await cleanup(db);
  const payload=JSON.stringify(a.fields),hash=await v2Hash(payload),id=await v2Hash('library:'+claims.grantId+':'+claims.grantVersion+':'+a.idempotencyKey);let row=await find(db,id);
  if(row){if(row.payload_hash!==hash)catalogFail(409,'idempotency_conflict');await consent(db,claims,'proposals:create');return {schemaVersion:1,part:map(row),replayed:true};}
  await run(db.prepare("INSERT INTO ai_library_imports(id,grant_id,grant_version,payload_hash,created_at,expires_at,fields) SELECT ?,?,?,?,?,?,? FROM ai_v2_access WHERE singleton=1 AND grant_id=? AND version=? AND status='active' AND expires_at>? AND json_extract(choices,'$.allowLibraryProposals')=1 AND (SELECT COUNT(*) FROM ai_library_imports)<1000 AND (SELECT COUNT(*) FROM ai_library_imports WHERE status IN ('pending','applying'))<100 ON CONFLICT(id) DO NOTHING").bind(id,claims.grantId,claims.grantVersion,hash,now(),now()+LIBRARY_IMPORT_TTL,payload,claims.grantId,claims.grantVersion,now()));
  row=await find(db,id);await consent(db,claims,'proposals:create');if(!row)catalogFail(409,'library_capacity_reached');if(row.payload_hash!==hash)catalogFail(409,'idempotency_conflict');return {schemaVersion:1,part:map(row),replayed:false};
 }
 async function list(args,claims,env,owner=false){
  ready(env);if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!['status','cursor'].includes(k))||args.status!==undefined&&!['pending','applying','accepted','rejected','expired'].includes(args.status)||args.cursor!==undefined&&(typeof args.cursor!=='string'||args.cursor.length>4096))catalogFail(400,'invalid_arguments');
  const db=dbFor(env);if(!owner)await consent(db,claims,'planning:read');await cleanup(db);const status=args.status||'pending',binding=owner?'owner':claims.grantId+':'+claims.grantVersion;let after=-1,id='';
  if(args.cursor){const c=await cursor(args.cursor,env);if(c.binding!==binding||c.status!==status||c.expiresAt<=now()||!Number.isSafeInteger(c.after)||c.after<0)catalogFail(400,'invalid_cursor');v2Ref(c.id);after=c.after;id=c.id;}
  const result=await db.prepare(`SELECT * FROM ai_library_imports WHERE status=? ${owner?'':'AND grant_id=? AND grant_version=?'} AND (created_at>? OR (created_at=? AND id>?)) ORDER BY created_at,id LIMIT 6`).bind(status,...(owner?[]:[claims.grantId,claims.grantVersion]),after,after,id).all();if(!result.success)throw Error('database');
  const rows=result.results,items=rows.slice(0,5).map(map),last=rows[4];const nextCursor=rows.length>5?await cursor(null,env,{binding,status,after:last.created_at,id:last.id,expiresAt:now()+600000}):null;if(!owner)await consent(db,claims,'planning:read');
  return {schemaVersion:1,...(!owner?{grantId:claims.grantId,grantVersion:claims.grantVersion}:{}),items,nextCursor};
 }
 async function reserve(body,env){
  v2Exact(body,['id','expectedVersion','fields','selection']);v2Ref(body.id);v2Integer(body.expectedVersion);const fields=libraryImportFields(body.fields);libraryImportSelection(fields,body.selection);
  const db=dbFor(env);await cleanup(db);let row=await find(db,body.id);if(!row)catalogFail(404,'library_part_not_found');
  const hash=await v2Hash(JSON.stringify({fields,selection:[...body.selection].sort()}));
  if(['applying','accepted'].includes(row.status)){if(row.review_hash!==hash)catalogFail(409,'application_conflict');return {schemaVersion:1,part:map(row)};}
  if(row.status!=='pending'||!row.fields)catalogFail(409,'library_part_changed');
  const original=JSON.parse(row.fields);if(['batchKey','partIndex','partCount'].some(k=>original[k]!==fields[k])||JSON.stringify(original.books.map(b=>b.sourceKey))!==JSON.stringify(fields.books.map(b=>b.sourceKey)))catalogFail(409,'library_part_changed');
  await run(db.prepare("UPDATE ai_library_imports SET status='applying',fields=?,selection=?,review_hash=?,version=version+1 WHERE id=? AND status='pending' AND version=? AND expires_at>?").bind(JSON.stringify(fields),JSON.stringify(body.selection),hash,body.id,body.expectedVersion,now()));row=await find(db,body.id);if(row.review_hash!==hash)catalogFail(409,'library_part_changed');return {schemaVersion:1,part:map(row)};
 }
 async function acknowledge(body,env){v2Exact(body,['id','receiptRef']);v2Ref(body.id);v2Ref(body.receiptRef);const db=dbFor(env);await run(db.prepare("UPDATE ai_library_imports SET status='accepted',receipt_ref=?,version=version+1 WHERE id=? AND status='applying'").bind(body.receiptRef,body.id));const row=await find(db,body.id);if(!row||row.status!=='accepted'||row.receipt_ref!==body.receiptRef)catalogFail(409,'application_conflict');return {schemaVersion:1,part:map(row)};}
 async function reject(body,env){v2Exact(body,['id','expectedVersion']);v2Ref(body.id);v2Integer(body.expectedVersion);const db=dbFor(env);await cleanup(db);await run(db.prepare("UPDATE ai_library_imports SET status='rejected',version=version+1 WHERE id=? AND status='pending' AND version=? AND expires_at>?").bind(body.id,body.expectedVersion,now()));const row=await find(db,body.id);if(!row||row.status!=='rejected'||row.version!==body.expectedVersion+1)catalogFail(409,'library_part_changed');return {schemaVersion:1,part:map(row)};}
 let minute=-1,count=0;
 return {submit,list,async call(name,args,claims,env){if(name==='submitLibraryCatalog')return submit(args,claims,env);if(name==='listLibraryImports')return list(args,claims,env);catalogFail(400,'invalid_arguments');},async fetch(request,env){
  const url=new URL(request.url);if(!['/v2/app/library-imports','/v2/app/library-imports/reserve','/v2/app/library-imports/acknowledge','/v2/app/library-imports/reject'].includes(url.pathname))return null;
  const cors=request.headers.get('Origin')===CATALOG_ORIGIN?{'Access-Control-Allow-Origin':CATALOG_ORIGIN,Vary:'Origin'}:{},send=(status,body)=>Response.json(body,{status,headers:{...cors,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  try{ready(env);if(request.headers.get('Origin')!==CATALOG_ORIGIN)catalogFail(403,'origin_not_allowed');const method=url.pathname==='/v2/app/library-imports'?'GET':'POST';
   if(request.method==='OPTIONS'){if(request.headers.get('Access-Control-Request-Method')!==method||(request.headers.get('Access-Control-Request-Headers')||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean).some(k=>!['authorization','content-type','x-firebase-appcheck'].includes(k)))catalogFail(403,'preflight_not_allowed');return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':method,'Access-Control-Allow-Headers':'Authorization, Content-Type, X-Firebase-AppCheck'}});}
   if(request.method!==method||method==='POST'&&url.search)catalogFail(404,'not_found');await verifyOwner(request);const slot=Math.floor(now()/60000);if(slot!==minute){minute=slot;count=0;}if(++count>60)catalogFail(429,'rate_limited');
   if(method==='GET'){const args={};for(const [k,v] of url.searchParams){if(Object.hasOwn(args,k))catalogFail(400,'invalid_arguments');args[k]=v;}return send(200,await list(args,null,env,true));}
   const body=await readBody(request,14000),operation=url.pathname.split('/').pop();return send(200,await ({reserve,acknowledge,reject}[operation])(body,env));
  }catch(error){return send(error instanceof AuthError?401:error instanceof CatalogError?error.status:error instanceof V2ValidationError?422:error?.status===413?413:503,{error:error instanceof AuthError?'unauthorized':error instanceof CatalogError?error.code:error instanceof V2ValidationError?'invalid_arguments':error?.status===413?'body_too_large':'service_unavailable'});}
 }};
}
