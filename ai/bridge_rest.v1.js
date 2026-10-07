import { AI_OWNER_UID,validateWeek,validateContext,validateProposal } from './contract.v1.js';

const BRIDGE_URL = 'https://missao-tatica-ai-bridge.victorduarteferreira1997.workers.dev';
const ERROR_CODES = new Set(['unauthorized','origin_not_allowed','preflight_not_allowed','rate_limited',
    'invalid_or_expired_data','service_unavailable','firebase_keys_unavailable','verification_unavailable',
    'database_unavailable','context_storage_full','json_required','body_too_large','not_found',
    'review_conflict','context_changed_or_inbox_full']);
export function createAiBrowserStore({getUser,getAppCheckToken,fetchImpl=(...args)=>fetch(...args)}) {
    async function request(path,method,body) {
        const user=getUser();
        if(user?.uid!==AI_OWNER_UID)throw new Error('Entre com a conta autorizada.');
        const [idToken,appCheckToken]=await Promise.all([user.getIdToken(),getAppCheckToken()]);
        if(getUser()!==user)throw new Error('A sessão mudou.');
        const response=await fetchImpl(BRIDGE_URL+path,{method,credentials:'omit',redirect:'error',
            headers:{Authorization:'Bearer '+idToken,'X-Firebase-AppCheck':appCheckToken,'Content-Type':'application/json'},
            ...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
        if(!response.ok) {
            let code = '';
            try { const body = await response.json(); if(ERROR_CODES.has(body?.error))code = body.error; } catch {}
            const message = response.status===401?'Sua sessão ou verificação do app expirou. Entre novamente.':
                response.status===409?'O contexto ou a proposta mudou, ou a caixa atingiu seu limite. Atualize e revise.':
                'Não foi possível acessar a integração.';
            // Show fixed diagnostic codes only: never server text, HTML, credentials or database details.
            throw new Error(message+' (HTTP '+response.status+(code?' · '+code:'')+')');
        }
        const result=await response.json(); if(getUser()!==user)throw new Error('A sessão mudou.'); return result;
    }
    return {
        async publish(context) { const c=validateContext(context); await request('/v1/app/context?weekStart='+c.weekStart,'PUT',c); },
        async revoke(week) { await request('/v1/app/context?weekStart='+validateWeek(week),'DELETE'); },
        async pending() {
            const result=await request('/v1/app/inbox','GET');
            if(!Array.isArray(result.items) || result.items.length>50)throw new Error('Caixa de entrada inválida.');
            return result.items.map(item=>{
                if(!/^[a-f0-9]{64}$/.test(item.id) || item.status!=='pending')throw new Error('Entrada inválida.');
                return {id:item.id,status:'pending',proposal:validateProposal(item.proposal)};
            });
        },
        async review(id,status) {
            if(!/^[a-f0-9]{64}$/.test(id) || !['accepted','rejected'].includes(status))throw new Error('Revisão inválida.');
            await request('/v1/app/inbox/'+id,'PATCH',{status});
        }
    };
}
