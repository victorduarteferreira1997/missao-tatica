import {createFirebaseVerifier,AuthError} from './firebase_auth.mjs';
import {V2ValidationError,V2_GRANT_MS,V2_FRESH_MS,v2Exact,v2Integer,v2GrantId,v2ValidateGrantRequest,v2ValidateSnapshot} from '../v2/contract.js';
const V2_ORIGIN='https://victorduarteferreira1997.github.io';
export function createV2Foundation({verifyOwner=createFirebaseVerifier(),now=Date.now}={}) {
    let slot=-1,count=0;
    return {async fetch(request,env){
        const url=new URL(request.url),method=request.method,origin=request.headers.get('Origin');
        const cors=origin===V2_ORIGIN?{'Access-Control-Allow-Origin':V2_ORIGIN,Vary:'Origin'}:{};
        const send=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...cors}});
        if(env.AI_V2_ENABLED!=='true')return send(404,{error:'v2_not_enabled'});
        if(origin!==V2_ORIGIN)return send(403,{error:'origin_not_allowed'});
        const methods=url.pathname==='/v2/app/grant'?['GET','PUT','DELETE']:url.pathname==='/v2/app/snapshot'?['PUT']:[];
        if(url.search || !methods.length)return send(404,{error:'not_found'});
        if(method==='OPTIONS'){
            const headers=(request.headers.get('Access-Control-Request-Headers')||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
            if(!methods.includes(request.headers.get('Access-Control-Request-Method'))||headers.some(h=>!['authorization','content-type','x-firebase-appcheck'].includes(h)))return send(403,{error:'preflight_not_allowed'});
            return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':methods.join(', '),'Access-Control-Allow-Headers':'Authorization, Content-Type, X-Firebase-AppCheck'}});
        }
        if(!methods.includes(method))return send(404,{error:'not_found'});
        try {
            await verifyOwner(request);
            const minute=Math.floor(now()/60000);if(slot!==minute){slot=minute;count=0;}if(++count>60)return send(429,{error:'rate_limited'});
            const db=env.DB.withSession?env.DB.withSession('first-primary'):env.DB;
            const cleanup=await db.prepare("UPDATE ai_v2_access SET snapshot=NULL,source_saved_at=NULL,synced_at=NULL WHERE singleton=1 AND expires_at<=? AND snapshot IS NOT NULL").bind(now()).run();
            if(cleanup.success!==true)throw new Error('D1 failure');
            const load=()=>db.prepare('SELECT * FROM ai_v2_access WHERE singleton=1').bind().first();
            const map=row=>row?{grantId:row.grant_id,version:row.version,status:row.status==='active'&&row.expires_at<=now()?'expired':row.status,issuedAt:new Date(row.issued_at).toISOString(),expiresAt:new Date(row.expires_at).toISOString(),choices:JSON.parse(row.choices),frozenRefs:JSON.parse(row.frozen_refs),projectionVersion:row.projection_version,sourceSavedAt:row.source_saved_at,syncedAt:row.synced_at?new Date(row.synced_at).toISOString():null,freshUntil:row.synced_at&&row.source_saved_at?new Date(Math.min(Date.parse(row.source_saved_at),row.synced_at)+V2_FRESH_MS).toISOString():null}:null;
            if(method==='GET')return send(200,{grant:map(await load())});
            if((request.headers.get('Content-Type')||'').split(';')[0]!=='application/json')return send(415,{error:'json_required'});
            const reader=request.body?.getReader();if(!reader)return send(422,{error:'invalid_data'});
            const chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>70000){await reader.cancel();return send(413,{error:'body_too_large'});}chunks.push(value);}}finally{reader.releaseLock();}
            const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
            let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return send(422,{error:'invalid_data'});}
            if(url.pathname==='/v2/app/grant' && method==='PUT'){
                const b=v2ValidateGrantRequest(body),time=now();
                const result=b.expectedVersion===0
                    ? await db.prepare("INSERT INTO ai_v2_access (singleton,grant_id,version,status,issued_at,expires_at,choices,frozen_refs) VALUES (1,?,1,'active',?,?,?,?) ON CONFLICT(singleton) DO NOTHING").bind(b.grantId,time,time+V2_GRANT_MS,JSON.stringify(b.choices),JSON.stringify(b.frozenRefs)).run()
                    : await db.prepare("UPDATE ai_v2_access SET grant_id=?,version=version+1,status='active',issued_at=?,expires_at=?,choices=?,frozen_refs=?,projection_version=0,source_saved_at=NULL,synced_at=NULL,snapshot=NULL WHERE singleton=1 AND version=?").bind(b.grantId,time,time+V2_GRANT_MS,JSON.stringify(b.choices),JSON.stringify(b.frozenRefs),b.expectedVersion).run();
                if(result.success!==true)throw new Error('D1 failure');
                if(!result.meta.changes)return send(409,{error:'grant_changed'});
                return send(200,{grant:map(await load())});
            }
            if(method==='DELETE'){
                v2Exact(body,['grantId','expectedVersion']);v2GrantId(body.grantId);v2Integer(body.expectedVersion);
                const result=await db.prepare("UPDATE ai_v2_access SET status='revoked',version=version+1,snapshot=NULL,source_saved_at=NULL,synced_at=NULL WHERE singleton=1 AND grant_id=? AND version=?").bind(body.grantId,body.expectedVersion).run();
                if(result.success!==true)throw new Error('D1 failure');if(!result.meta.changes)return send(409,{error:'grant_changed'});return send(200,{grant:map(await load())});
            }
            const row=await load(),grant=map(row);if(!grant || grant.status!=='active')return send(409,{error:'grant_not_active'});
            const snapshot=v2ValidateSnapshot(body,grant,now()),time=now();
            const result=await db.prepare(`UPDATE ai_v2_access SET snapshot=?,projection_version=projection_version+1,source_saved_at=?,synced_at=? WHERE singleton=1 AND grant_id=? AND version=? AND status='active' AND expires_at>? AND projection_version=?`).bind(JSON.stringify(snapshot),snapshot.sourceSavedAt,time,grant.grantId,grant.version,time,snapshot.expectedProjectionVersion).run();
            if(result.success!==true)throw new Error('D1 failure');if(!result.meta.changes)return send(409,{error:'projection_changed'});return send(200,{grant:map(await load())});
        }catch(error){
            if(error instanceof AuthError)return send(401,{error:'unauthorized'});
            if(error instanceof V2ValidationError)return send(422,{error:'invalid_data'});
            return send(503,{error:'service_unavailable'});
        }
    }};
}
