import {v2GrantId,v2Integer,v2ValidateChoices,v2Ref,v2Assert,v2Date} from './contract.js?v=1.9.75';
import {AI_OWNER_UID} from '../contract.v1.js';
const V2_BRIDGE='https://missao-tatica-ai-bridge.victorduarteferreira1997.workers.dev';
export function createV2BrowserRequest({getUser,getAppCheckToken,fetchImpl=fetch}) {
    async function call(path,method='GET',body){
        const user=getUser();if(user?.uid!==AI_OWNER_UID)throw Error('Entre com a conta autorizada.');
        const [id,check]=await Promise.all([user.getIdToken(),getAppCheckToken()]);if(getUser()!==user)throw Error('A sessão mudou.');
        const r=await fetchImpl(V2_BRIDGE+path,{method,credentials:'omit',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+id,'X-Firebase-AppCheck':check,'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})});
        if(getUser()!==user)throw Error('A sessão mudou.');
        if(!r.ok){const e=new Error(r.status===409?(path.startsWith('/v2/app/proposals')?'A proposta mudou ou há um cadastro em andamento. Atualize a fila e use Retomar cadastro se aparecer.':'A autorização ou a cópia mudou em outra janela. Reabra este painel e confira os dados antes de sincronizar.'):r.status===404?'A integração nova ainda precisa ser ativada no Cloudflare.':'Não foi possível atualizar o compartilhamento.');e.status=r.status;throw e;}
        const result=await r.json();if(getUser()!==user)throw Error('A sessão mudou.');
        return result;
    }
    return call;
}
export function createV2BrowserStore(options) {
    const request=createV2BrowserRequest(options);
    async function call(path,method='GET',body){
        const result=await request(path,method,body),g=result.grant;
        if(g!==null){v2Assert(g&&typeof g==='object');v2GrantId(g.grantId);v2Integer(g.version);v2Integer(g.projectionVersion);v2ValidateChoices(g.choices);v2Date(g.expiresAt);v2Assert(['active','revoked','expired'].includes(g.status)&&Array.isArray(g.frozenRefs)&&g.frozenRefs.length<=200);g.frozenRefs.forEach(v2Ref);}
        else v2Assert(method==='GET');
        return g;
    }
    return {get:()=>call('/v2/app/grant'),authorize:b=>call('/v2/app/grant','PUT',b),revoke:b=>call('/v2/app/grant','DELETE',b),publish:b=>call('/v2/app/snapshot','PUT',b)};
}
