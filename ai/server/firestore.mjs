import { AI_PROJECT, AI_DATABASE, AI_OWNER_UID } from '../contract.v1.js';
export function createFirestoreStore({project = AI_PROJECT,database = AI_DATABASE,owner = AI_OWNER_UID,fetchImpl = fetch,now = Date.now} = {}) {
    if (project !== AI_PROJECT || database !== AI_DATABASE || owner !== AI_OWNER_UID) throw new Error('Isolated database configuration required.');
    const root = `https://firestore.googleapis.com/v1/projects/${project}/databases/${database}/documents/users/${owner}`;
    let token = null, pendingToken = null;
    async function accessToken() {
        if (token && token.until > now()+60000) return token.value;
        if (!pendingToken) pendingToken = (async () => {
            const response = await fetchImpl('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
                {headers:{'Metadata-Flavor':'Google'},signal:AbortSignal.timeout(3000)});
            if (!response.ok) throw new Error('Workload identity unavailable.');
            const data = await response.json();
            if (typeof data.access_token !== 'string' || !Number.isFinite(data.expires_in)) throw new Error('Invalid workload token.');
            token = {value:data.access_token,until:now()+data.expires_in*1000}; return token.value;
        })().finally(() => { pendingToken = null; });
        return pendingToken;
    }
    async function request(path,method = 'GET',body) {
        const response = await fetchImpl(root+path,{method,headers:{Authorization:'Bearer '+await accessToken(),'Content-Type':'application/json'},
            ...(body ? {body:JSON.stringify(body)} : {}),signal:AbortSignal.timeout(10000)});
        if (response.status === 404 && method === 'GET') return null;
        if (response.status === 409 && method === 'POST') return false;
        if (!response.ok) { if (response.status === 401) token = null; throw new Error('Firestore unavailable.'); }
        return response.json();
    }
    function id(value) { if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('Invalid inbox ID.'); return value; }
    return {
        async context(week) {
            if (!/^20\d\d-\d\d-\d\d$/.test(week)) throw new Error('Invalid context ID.');
            const d = await request('/context/'+week); return d ? JSON.parse(d.fields.payload.stringValue) : null;
        },
        async proposal(key) {
            const d = await request('/inbox/'+id(key)); return d ? {payload:JSON.parse(d.fields.payload.stringValue),status:d.fields.status.stringValue} : null;
        },
        async createProposal(key,payload,createdAt) {
            return Boolean(await request('/inbox?documentId='+id(key),'POST',{fields:{payload:{stringValue:JSON.stringify(payload)},status:{stringValue:'pending'},createdAt:{timestampValue:createdAt}}}));
        }
    };
}
