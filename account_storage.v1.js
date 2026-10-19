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
    function read(uid) {
        const first = storage.getItem(key(uid));
        const history = JSON.parse(storage.getItem(key(uid) + ':history') || '[]');
        if (!Array.isArray(history) || history.some(item => typeof item !== 'string')) throw Error('Cópias de recuperação inválidas.');
        const copies = [...(first ? [first] : []), ...history];
        for (const raw of copies) validateAccountState(JSON.parse(raw), uid, {legacyOwner:true, ownerUid});
        return copies;
    }
    return {
        list(uid) {
            return read(uid).map(raw => validateAccountState(JSON.parse(raw), uid, {legacyOwner:true, ownerUid}));
        },
        preserve(uid, value) {
            const payload = JSON.stringify(validateAccountState(value, uid, {legacyOwner:true, ownerUid}));
            const copies = read(uid);
            if (copies.includes(payload)) return;
            if (copies.length >= maxCopies || [...copies, payload].reduce((size, raw) => size + raw.length * 2, 0) > maxBytes) {
                const error = Error('As cópias de recuperação atingiram o limite local. Baixe as cópias preservadas e limpe esse histórico antes de tentar novamente.');
                error.code = 'recovery-full';
                throw error;
            }
            if (!copies.length) storage.setItem(key(uid), payload);
            else storage.setItem(key(uid) + ':history', JSON.stringify([...copies.slice(1), payload]));
        },
        clear(uid) { storage.removeItem(key(uid)); storage.removeItem(key(uid) + ':history'); }
    };
}
