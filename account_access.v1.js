// The allowlist is managed in the Firebase Console/Admin SDK, never by this app.
export async function authorizeAccount(user, { ownerUid, readAccess }) {
    if (!user?.uid) return false;
    if (user.uid === ownerUid) return true;
    const access = await readAccess(user.uid);
    return access?.enabled === true && access?.role === 'member';
}
