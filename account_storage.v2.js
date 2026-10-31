// Only authenticated, authorized sessions may call this store. Never read the legacy
// cache at startup: it belongs exclusively to the original owner.
export const LEGACY_STATE_KEY = 'planeamento_semanal_v11';
export const accountStateKey = uid => `missao_tatica:v2:state:${uid}`;
export const AUTH_TRANSITION_KEY = 'missao_tatica:v2:auth-transition';

export function validateAccountState(value, uid, { legacyOwner = false, ownerUid } = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.tasks)) throw Error('Backup ou estado inválido.');
    if (value.ownerUid !== uid && !(legacyOwner && uid === ownerUid && !value.ownerUid)) throw Error('Este arquivo pertence a outra conta ou não identifica o titular.');
    return { ...value, ownerUid: uid };
}

export function createAccountStorage(storage, ownerUid) {
    const observed = new Map();
    return {
        load(uid) {
            const key = accountStateKey(uid);
            let raw = storage.getItem(key);
            if (!raw && uid === ownerUid) {
                const legacy = storage.getItem(LEGACY_STATE_KEY);
                if (legacy) {
                    const candidate = validateAccountState(JSON.parse(legacy), uid, { legacyOwner: true, ownerUid });
                    // Retain the original byte-for-byte for recovery and older releases.
                    raw = JSON.stringify(candidate);
                    storage.setItem(key, raw);
                }
            }
            observed.set(uid, raw);
            return raw ? validateAccountState(JSON.parse(raw), uid) : null;
        },
        save(uid, value) {
            const payload = JSON.stringify(validateAccountState(value, uid));
            const key = accountStateKey(uid), previous = storage.getItem(key);
            if (!observed.has(uid) || previous !== observed.get(uid)) throw Error('Outra aba alterou a cópia local. Reentre na conta antes de salvar.');
            storage.setItem(key, payload);
            observed.set(uid, payload);
        }
    };
}

// Recovery copies are never silently replaced. A full local buffer stops the
// operation so the current account cache stays available until copies are saved.
export function createAccountRecovery(storage, ownerUid, {maxCopies = 5, maxBytes = 2000000} = {}) {
    const key = uid => 'missao_tatica_conflict_backup_' + uid;
    function archive(uid){
        const value=JSON.parse(storage.getItem(key(uid)+':v2')||'null');
        const result=Array.isArray(value)?{copies:value,settledLegacy:[]}:value||{copies:[],settledLegacy:[]};
        if(!Array.isArray(result.copies)||!Array.isArray(result.settledLegacy)||[...result.copies,...result.settledLegacy].some(raw=>typeof raw!=='string'))throw Error('Cópias de recuperação inválidas.');
        return result;
    }
    function legacy(uid){
        const first=storage.getItem(key(uid)),history=JSON.parse(storage.getItem(key(uid)+':history')||'[]');
        if(!Array.isArray(history)||history.some(raw=>typeof raw!=='string'))throw Error('Cópias de recuperação inválidas.');
        return [...(first?[first]:[]),...history];
    }
    const content=(uid,raw)=>recoveryContent(validateAccountState(JSON.parse(raw),uid,{legacyOwner:true,ownerUid}));
    function read(uid) {
        const saved=archive(uid),settled=new Set(saved.settledLegacy);
        const copies=[...new Set([...saved.copies,...legacy(uid).filter(raw=>!settled.has(content(uid,raw)))])];
        for(const raw of copies)validateAccountState(JSON.parse(raw),uid,{legacyOwner:true,ownerUid});
        return copies;
    }
    return {
        list(uid) {
            return read(uid).map(raw => validateAccountState(JSON.parse(raw), uid, {legacyOwner:true, ownerUid}));
        },
        preserve(uid, value) {
            const payload = JSON.stringify(validateAccountState(value, uid, {legacyOwner:true, ownerUid}));
            const copies = read(uid);
            if (copies.some(raw=>sameRecoveryContent(validateAccountState(JSON.parse(raw),uid,{legacyOwner:true,ownerUid}),JSON.parse(payload)))) return;
            if (copies.length >= maxCopies || [...copies, payload].reduce((size, raw) => size + raw.length * 2, 0) > maxBytes) {
                const error = Error('As cópias de recuperação atingiram o limite local. Baixe as cópias preservadas e limpe esse histórico antes de tentar novamente.');
                error.code = 'recovery-full';
                throw error;
            }
            if(storage.getItem(key(uid)+':v2'))storage.setItem(key(uid)+':v2',JSON.stringify({copies:[...copies,payload],settledLegacy:archive(uid).settledLegacy}));
            else if (!copies.length) storage.setItem(key(uid), payload);
            else storage.setItem(key(uid) + ':history', JSON.stringify([...copies.slice(1), payload]));
        },
        async compact(uid,cloud,receipts,canWrite=()=>true){
            validateAccountState(cloud,uid,{legacyOwner:true,ownerUid});
            const original=read(uid),kept=[],seen=new Set();
            for(const raw of original){const value=validateAccountState(JSON.parse(raw),uid,{legacyOwner:true,ownerUid}),content=recoveryContent(value);
                if(sameRecoveryContent(value,cloud)||await receipts.isConfirmed(uid,value)||seen.has(content))continue;
                seen.add(content);kept.push(raw);
            }
            if(!canWrite()||kept.length===original.length)return;
            if(JSON.stringify(read(uid))!==JSON.stringify(original))throw Error('Outra aba alterou as cópias locais. Tente entrar novamente.');
            // One atomic archive, without rewriting legacy keys: an older open tab
            // can still add a unique recovery snapshot, and read() will discover it.
            const retained=new Set(kept.map(raw=>content(uid,raw))),settled=new Set(archive(uid).settledLegacy);
            for(const raw of original)if(!retained.has(content(uid,raw)))settled.add(content(uid,raw));
            const legacyContents=new Set(legacy(uid).map(raw=>content(uid,raw)));
            storage.setItem(key(uid)+':v2',JSON.stringify({copies:kept,settledLegacy:[...settled].filter(value=>legacyContents.has(value))}));
        },
        clear(uid) { storage.removeItem(key(uid)); storage.removeItem(key(uid) + ':history');storage.removeItem(key(uid)+':v2'); }
    };
}

// Only navigation/save bookkeeping is ignored. Unknown fields and all record
// contents (including deletion, order, rewards and AI receipts) remain significant.
const RECOVERY_VIEW_FIELDS=new Set(['activeTab','currentFilter','currentPlanningWeekStart','focusMode','focusedTaskId','focusContext','lastSavedAt','updatedAt','lastSaveReason']);
export function recoveryContent(value){
 const usesImplicitWeek=!value.planning?.legacyWeek&&Array.isArray(value.tasks)&&value.tasks.some(t=>t.day&&!t.googleCalendarWeekStart&&!t.planningWeekStart);
 const sort=(item,root=false)=>Array.isArray(item)?item.map(row=>sort(row)):item&&typeof item==='object'?Object.fromEntries(Object.keys(item).sort().filter(key=>!root||!RECOVERY_VIEW_FIELDS.has(key)||(key==='currentPlanningWeekStart'&&usesImplicitWeek)).map(key=>[key,sort(item[key])])):item;
 return JSON.stringify(sort(value,true));
}
export const sameRecoveryContent=(a,b)=>recoveryContent(a)===recoveryContent(b);
async function recoveryDigest(value){const bytes=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(recoveryContent(value)));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
export function createSyncReceipts(storage,ownerUid){
 const key=uid=>'missao_tatica:v2:confirmed:'+uid;
 const list=uid=>{try{const value=JSON.parse(storage.getItem(key(uid))||'[]');return Array.isArray(value)?value.filter(s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s)).slice(-8):[];}catch{return [];}};
 return {
  async confirm(uid,state,canWrite=()=>true){validateAccountState(state,uid,{legacyOwner:true,ownerUid});const digest=await recoveryDigest(state);if(!canWrite())return;const previous=list(uid);if(previous.includes(digest))return;storage.setItem(key(uid),JSON.stringify([...previous,digest].slice(-8)));},
  async isConfirmed(uid,state){validateAccountState(state,uid,{legacyOwner:true,ownerUid});const receipts=list(uid);return receipts.length>0&&receipts.includes(await recoveryDigest(state));}
 };
}
