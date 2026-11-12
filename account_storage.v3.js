// Same account ownership and conflict checks; save returns the immutable bytes
// already persisted locally so the cloud queue can reuse that exact snapshot.
export * from './account_storage.v2.js';
import {accountStateKey,LEGACY_STATE_KEY,validateAccountState} from './account_storage.v2.js';
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
            return payload;
        }
    };
}

