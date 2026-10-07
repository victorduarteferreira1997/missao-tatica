import { AI_PROJECT, AI_DATABASE, AI_OWNER_UID, validateWeek, validateContext, validateProposal } from './contract.v1.js';
const root = `https://firestore.googleapis.com/v1/projects/${AI_PROJECT}/databases/${AI_DATABASE}/documents/users/${AI_OWNER_UID}`;
export function createAiBrowserStore({getUser,getAppCheckToken,fetchImpl = (...args) => fetch(...args)}) {
    async function request(path, method, body) {
        const user = getUser();
        if (user?.uid !== AI_OWNER_UID) throw new Error('Entre com a conta autorizada.');
        const [idToken,appCheckToken] = await Promise.all([user.getIdToken(),getAppCheckToken()]);
        if (getUser() !== user) throw new Error('A sessão mudou.');
        const response = await fetchImpl(root+path,{method,headers:{Authorization:'Bearer '+idToken,'X-Firebase-AppCheck':appCheckToken,'Content-Type':'application/json'},
            ...(body ? {body:JSON.stringify(body)} : {}),signal:AbortSignal.timeout(15000)});
        if (!response.ok) throw new Error('Não foi possível acessar a integração. Confira banco, regras e conexão.');
        const result = await response.json();
        if (getUser() !== user) throw new Error('A sessão mudou.');
        return result;
    }
    return {
        async publish(context) {
            const valid = validateContext(context);
            await request('/context/'+validateWeek(valid.weekStart),'PATCH',{fields:{payload:{stringValue:JSON.stringify(valid)}}});
        },
        async revoke(week) { await request('/context/'+validateWeek(week),'DELETE'); },
        async pending() {
            const rows = await request(':runQuery','POST',{structuredQuery:{from:[{collectionId:'inbox'}],
                where:{fieldFilter:{field:{fieldPath:'status'},op:'EQUAL',value:{stringValue:'pending'}}},limit:50}});
            return rows.filter(r => r.document).map(({document:d}) => {
                const id = d.name.slice(d.name.lastIndexOf('/')+1);
                if (!/^[a-f0-9]{64}$/.test(id) || d.fields?.status?.stringValue !== 'pending') throw new Error('Entrada inválida.');
                return {id,status:'pending',proposal:validateProposal(JSON.parse(d.fields.payload.stringValue))};
            });
        },
        async review(id,status) {
            if (!/^[a-f0-9]{64}$/.test(id) || !['accepted','rejected'].includes(status)) throw new Error('Revisão inválida.');
            await request('/inbox/'+id+'?updateMask.fieldPaths=status&updateMask.fieldPaths=reviewedAt&currentDocument.exists=true','PATCH',
                {fields:{status:{stringValue:status},reviewedAt:{timestampValue:new Date().toISOString()}}});
        }
    };
}
