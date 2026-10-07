import { AI_PROJECT, AI_OWNER_UID } from '../contract.v1.js';

export const FIREBASE_PROJECT_NUMBER = '651538676501';
export const FIREBASE_APP_ID = '1:651538676501:web:ca3dc3356a1b1769f9471c';
export const AUTH_JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
export const APP_CHECK_JWKS = 'https://firebaseappcheck.googleapis.com/v1/jwks';
export class AuthError extends Error {}
export class KeyServiceError extends Error {}
const algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
const encoder = new TextEncoder();

function decode(segment) {
    if (!segment || !/^[A-Za-z0-9_-]+$/.test(segment)) throw new AuthError();
    try {
        return Uint8Array.from(atob(segment.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
    } catch { throw new AuthError(); }
}
function parse(token) {
    if (typeof token !== 'string' || token.length > 8192) throw new AuthError();
    const parts = token.split('.');
    if (parts.length !== 3) throw new AuthError();
    try {
        const header = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decode(parts[0])));
        const claims = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decode(parts[1])));
        if (!header || !claims || Array.isArray(claims) || header.alg !== 'RS256' || header.typ !== 'JWT' ||
            typeof header.kid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(header.kid) ||
            header.crit !== undefined || header.jku !== undefined || header.jwk !== undefined) throw new AuthError();
        return {header,claims,signature:decode(parts[2]),data:encoder.encode(parts[0]+'.'+parts[1])};
    } catch { throw new AuthError(); }
}
function times(claims, now) {
    const seconds = Math.floor(now/1000);
    if (!Number.isInteger(claims.exp) || !Number.isInteger(claims.iat) || claims.exp <= seconds ||
        claims.iat > seconds || claims.iat < 0 || claims.exp <= claims.iat ||
        (claims.nbf !== undefined && (!Number.isInteger(claims.nbf) || claims.nbf > seconds))) throw new AuthError();
}

// Public, rotating Google keys only. No service account, database permission or private key.
export function createFirebaseVerifier({fetchImpl = (...args) => fetch(...args), now = Date.now} = {}) {
    const caches = new Map();
    async function key(url,kid) {
        let cache = caches.get(url);
        if (!cache) { cache = {until:0,attempt:0,keys:new Map(),pending:null}; caches.set(url,cache); }
        if (cache.until > now() && cache.keys.has(kid)) return cache.keys.get(kid);
        if (!cache.pending) {
            if (cache.attempt > now()) {
                if (cache.until > now()) throw new AuthError();
                throw new KeyServiceError();
            }
            cache.attempt = now()+30000;
            cache.pending = (async () => {
                try {
                    const response = await fetchImpl(url,{signal:AbortSignal.timeout(5000),redirect:'error'});
                    if (!response.ok) throw new KeyServiceError();
                    const body = await response.json();
                    if (!Array.isArray(body.keys) || !body.keys.length || body.keys.length > 32) throw new KeyServiceError();
                    const keys = new Map();
                    for (const jwk of body.keys) {
                        if (jwk.kty !== 'RSA' || jwk.alg !== 'RS256' || jwk.use !== 'sig' || typeof jwk.kid !== 'string' || jwk.d) throw new KeyServiceError();
                        keys.set(jwk.kid,await crypto.subtle.importKey('jwk',jwk,algorithm,false,['verify']));
                    }
                    const maxAge = Number((response.headers.get('Cache-Control') || '').match(/max-age=(\d+)/)?.[1] || 3600);
                    cache.keys = keys; cache.until = now()+Math.min(maxAge,21600)*1000;
                } catch { throw new KeyServiceError(); }
            })().finally(() => { cache.pending = null; });
        }
        await cache.pending;
        if (!cache.keys.has(kid)) throw new AuthError();
        return cache.keys.get(kid);
    }
    async function verify(parsed,url) {
        const publicKey = await key(url,parsed.header.kid);
        if (!await crypto.subtle.verify(algorithm,publicKey,parsed.signature,parsed.data)) throw new AuthError();
    }
    return async function verifyOwner(request) {
        const bearer = request.headers.get('Authorization') || '';
        if (!bearer.startsWith('Bearer ')) throw new AuthError();
        const id = parse(bearer.slice(7)), app = parse(request.headers.get('X-Firebase-AppCheck'));
        times(id.claims,now()); times(app.claims,now());
        if (id.claims.aud !== AI_PROJECT || id.claims.iss !== 'https://securetoken.google.com/'+AI_PROJECT ||
            id.claims.sub !== AI_OWNER_UID || !Number.isInteger(id.claims.auth_time) || id.claims.auth_time < 0 ||
            id.claims.auth_time > Math.floor(now()/1000)) throw new AuthError();
        if (app.claims.iss !== 'https://firebaseappcheck.googleapis.com/'+FIREBASE_PROJECT_NUMBER ||
            !Array.isArray(app.claims.aud) || !app.claims.aud.includes('projects/'+FIREBASE_PROJECT_NUMBER) ||
            app.claims.sub !== FIREBASE_APP_ID) throw new AuthError();
        await Promise.all([verify(id,AUTH_JWKS),verify(app,APP_CHECK_JWKS)]);
    };
}
