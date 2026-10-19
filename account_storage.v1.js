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
