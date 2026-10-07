import { ContractError,validateWeek,validateContext,validateProposal } from '../contract.v1.js';
import { AuthError,createFirebaseVerifier } from './firebase_auth.mjs';
import { CapacityError,createD1Store } from './d1.mjs';

export const APP_ORIGIN = 'https://victorduarteferreira1997.github.io';
const actionEncoder = new TextEncoder();
export async function sha256(value) {
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256',actionEncoder.encode(value)));
    return Array.from(bytes,b => b.toString(16).padStart(2,'0')).join('');
}
async function actionAuth(request,secret) {
    if (typeof secret !== 'string' || secret.length < 32 || secret.length > 256 || /\s/.test(secret)) throw new Error('Missing secret.');
    const actual = request.headers.get('Authorization') || '';
    if (actual.length > 512) throw new AuthError();
    const [expected,received] = await Promise.all([sha256('Bearer '+secret),sha256(actual)]);
    let different = 0;
    for (let i=0;i<expected.length;i++) different |= expected.charCodeAt(i)^received.charCodeAt(i);
    if (different) throw new AuthError();
}
class HttpError extends Error { constructor(status,code) { super(code); this.status=status; this.code=code; } }
function oneWeek(url) {
    if ([...url.searchParams.keys()].length !== 1 || !url.searchParams.has('weekStart')) throw new ContractError();
    return validateWeek(url.searchParams.get('weekStart'));
}
async function readJson(request,limit) {
    if ((request.headers.get('Content-Type') || '').split(';')[0].trim() !== 'application/json') throw new HttpError(415,'json_required');
    if (Number(request.headers.get('Content-Length')) > limit) throw new HttpError(413,'body_too_large');
    if (!request.body) throw new ContractError();
    const reader = request.body.getReader(), chunks=[]; let bytes=0;
    try {
        while (true) {
            const {done,value} = await reader.read(); if (done) break;
            bytes += value.byteLength;
            if (bytes > limit) { await reader.cancel(); throw new HttpError(413,'body_too_large'); }
            chunks.push(value);
        }
        const body = new Uint8Array(bytes); let offset=0;
        for (const chunk of chunks) { body.set(chunk,offset); offset+=chunk.byteLength; }
        try { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body)); } catch { throw new ContractError(); }
    } finally { reader.releaseLock(); }
}

export function createWorker({verifyOwner=createFirebaseVerifier(),storeFactory=createD1Store,now=Date.now,requestsPerMinute=60} = {}) {
    let minute=-1,requests=0;
    return {
        async fetch(request,env) {
            const url = new URL(request.url), method=request.method;
            const appRoute = url.pathname.startsWith('/v1/app/');
            const origin = request.headers.get('Origin');
            const cors = appRoute && origin === APP_ORIGIN ? {'Access-Control-Allow-Origin':APP_ORIGIN,'Vary':'Origin'} : {};
            function send(status,data,extra={}) {
                return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
                    'X-Content-Type-Options':'nosniff',...cors,...extra}});
            }
            try {
                if (method==='GET' && url.pathname==='/healthz' && !url.search) return send(200,{ok:true,service:'missao-tatica-ai-bridge',schemaVersion:1});
                if (appRoute && origin!==APP_ORIGIN) return send(403,{error:'origin_not_allowed'});
                const reviewId = url.pathname.match(/^\/v1\/app\/inbox\/([a-f0-9]{64})$/)?.[1];
                const appMethods = url.pathname==='/v1/app/context' ? ['PUT','DELETE'] : url.pathname==='/v1/app/inbox' ? ['GET'] : reviewId ? ['PATCH'] : [];
                if (method==='OPTIONS' && appRoute) {
                    const requested = request.headers.get('Access-Control-Request-Method');
                    const headers = (request.headers.get('Access-Control-Request-Headers') || '').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
                    if (!appMethods.includes(requested) || headers.some(h=>!['authorization','content-type','x-firebase-appcheck'].includes(h))) return send(403,{error:'preflight_not_allowed'});
                    return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':appMethods.join(', '),
                        'Access-Control-Allow-Headers':'Authorization, Content-Type, X-Firebase-AppCheck','Access-Control-Max-Age':'600'}});
                }
                if (appRoute) await verifyOwner(request); else await actionAuth(request,env.ACTION_SECRET);
                const slot=Math.floor(now()/60000); if (slot!==minute) { minute=slot;requests=0; }
                if (++requests>requestsPerMinute) return send(429,{error:'rate_limited'},{'Retry-After':'60'});
                // Validate routes/parameters before constructing a store or issuing SQL.
                if (appRoute) {
                    if (!appMethods.includes(method)) return send(404,{error:'not_found'});
                    if (url.pathname==='/v1/app/context') {
                        const week=oneWeek(url);
                        if (method==='DELETE') { await storeFactory(env.DB).revoke(week); return send(200,{removed:true}); }
                        const context=validateContext(await readJson(request,64000),now());
                        if (context.weekStart!==week) throw new ContractError();
                        await storeFactory(env.DB).publish(context,now()); return send(200,{published:true});
                    }
                    if (url.search) throw new ContractError();
                    if (method==='GET') return send(200,{items:await storeFactory(env.DB).pending()});
                    const body=await readJson(request,256);
                    if (!body || Array.isArray(body) || Object.keys(body).length!==1 || !['accepted','rejected'].includes(body.status)) throw new ContractError();
                    const reviewed=await storeFactory(env.DB).review(reviewId,body.status,now());
                    return reviewed ? send(200,{status:body.status}) : send(409,{error:'review_conflict'});
                }
                if (method==='GET' && url.pathname==='/v1/week') {
                    const week=oneWeek(url),context=await storeFactory(env.DB).context(week);
                    if (!context) return send(404,{error:'context_not_published'});
                    const valid=validateContext(context,now()); if(valid.weekStart!==week)throw new ContractError();
                    return send(200,valid);
                }
                if (method!=='POST' || url.pathname!=='/v1/proposals' || url.search) return send(404,{error:'not_found'});
                const p=validateProposal(await readJson(request,12000)),key=await sha256(p.idempotencyKey),store=storeFactory(env.DB);
                function replay(existing) {
                    if (JSON.stringify(validateProposal(existing.payload))!==JSON.stringify(p)) return send(409,{error:'idempotency_conflict'});
                    if (!['pending','accepted','rejected'].includes(existing.status)) throw new Error('Invalid inbox.');
                    return send(200,{proposalId:key,status:existing.status,replayed:true});
                }
                const existing=await store.proposal(key); if(existing)return replay(existing);
                const context=await store.context(p.weekStart); if(!context)return send(409,{error:'context_not_published'});
                const valid=validateContext(context,now());
                if(valid.weekStart!==p.weekStart || valid.revision!==p.contextRevision)return send(409,{error:'context_changed'});
                if (!await store.createProposal(key,p,valid,now())) {
                    const concurrent=await store.proposal(key); if(concurrent)return replay(concurrent);
                    return send(409,{error:'context_changed_or_inbox_full'});
                }
                return send(201,{proposalId:key,status:'pending',replayed:false});
            } catch(error) {
                if(error instanceof AuthError)return send(401,{error:'unauthorized'});
                if(error instanceof ContractError)return send(422,{error:'invalid_or_expired_data'});
                if(error instanceof CapacityError)return send(409,{error:'context_storage_full'});
                if(error instanceof HttpError)return send(error.status,{error:error.code});
                return send(503,{error:'service_unavailable'});
            }
        }
    };
}
export default createWorker();
