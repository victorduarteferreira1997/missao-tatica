import { createServer } from 'node:http';
import { createHash,timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { ContractError,validateWeek,validateContext,validateProposal } from '../contract.v1.js';
import { createFirestoreStore } from './firestore.mjs';
const digest = s => createHash('sha256').update(s).digest();
export function createActionServer({secret,store,now = Date.now,requestsPerMinute = 60}) {
    if (typeof secret !== 'string' || secret.length < 32 || /\s/.test(secret)) throw new Error('A private action secret of at least 32 characters is required.');
    const expected = digest('Bearer '+secret);
    let minute = -1, requests = 0;
    const server = createServer(async (req,res) => {
        function send(status,data) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(JSON.stringify(data)); }
        try {
            const url = new URL(req.url,'http://localhost');
            if (req.method === 'GET' && url.pathname === '/healthz' && !url.search) { send(200,{ok:true}); return; }
            if (!timingSafeEqual(expected,digest(req.headers.authorization || ''))) { send(401,{error:'unauthorized'}); return; }
            const slot = Math.floor(now()/60000); if (slot !== minute) { minute = slot; requests = 0; }
            if (++requests > requestsPerMinute) { res.setHeader('Retry-After','60'); send(429,{error:'rate_limited'}); return; }
            if (req.method === 'GET' && url.pathname === '/v1/week') {
                if ([...url.searchParams.keys()].length !== 1 || !url.searchParams.has('weekStart')) throw new ContractError('Parâmetros inválidos.');
                const week = validateWeek(url.searchParams.get('weekStart'));
                const context = await store.context(week);
                if (!context) { send(404,{error:'context_not_published'}); return; }
                const valid = validateContext(context,now());
                if (valid.weekStart !== week) throw new ContractError('Semana do contexto inválida.');
                send(200,valid); return;
            }
            if (req.method !== 'POST' || url.pathname !== '/v1/proposals' || url.search) { send(404,{error:'not_found'}); return; }
            if ((req.headers['content-type'] || '').split(';')[0].trim() !== 'application/json') { send(415,{error:'json_required'}); return; }
            let bytes = 0; const chunks = [];
            for await (const chunk of req) { bytes += chunk.length; if (bytes > 12000) { send(413,{error:'body_too_large'}); return; } chunks.push(chunk); }
            let parsed; try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ContractError('JSON inválido.'); }
            const p = validateProposal(parsed), key = digest(p.idempotencyKey).toString('hex');
            async function replay(existing) {
                if (JSON.stringify(validateProposal(existing.payload)) !== JSON.stringify(p)) { send(409,{error:'idempotency_conflict'}); return; }
                if (!['pending','accepted','rejected'].includes(existing.status)) throw new Error('Invalid inbox status.');
                send(200,{proposalId:key,status:existing.status,replayed:true});
            }
            const existing = await store.proposal(key);
            if (existing) { await replay(existing); return; }
            const context = await store.context(p.weekStart);
            if (!context) { send(409,{error:'context_not_published'}); return; }
            const valid = validateContext(context,now());
            if (valid.weekStart !== p.weekStart || valid.revision !== p.contextRevision) { send(409,{error:'context_changed'}); return; }
            if (!await store.createProposal(key,p,new Date(now()).toISOString())) {
                const concurrent = await store.proposal(key); if (!concurrent) throw new Error('Concurrent create failed.');
                await replay(concurrent); return;
            }
            send(201,{proposalId:key,status:'pending',replayed:false});
        } catch (error) {
            if (!res.headersSent) send(error instanceof ContractError ? 422 : 503,{error:error instanceof ContractError ? 'invalid_or_expired_data' : 'service_unavailable'});
        }
    });
    server.requestTimeout = 20000; server.headersTimeout = 10000;
    return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const server = createActionServer({secret:process.env.ACTION_SECRET,store:createFirestoreStore({project:process.env.GOOGLE_CLOUD_PROJECT || 'missao-tatica',database:process.env.AI_DATABASE || 'missao-tatica-ai'})});
    server.listen(Number(process.env.PORT || 8080),'0.0.0.0');
}
