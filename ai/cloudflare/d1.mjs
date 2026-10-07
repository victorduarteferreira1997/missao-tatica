import { validateWeek,validateContext,validateProposal } from '../contract.v1.js';

export class CapacityError extends Error {}
export function createD1Store(db) {
    if (!db?.prepare) throw new Error('Missing DB binding.');
    const id = value => { if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('Invalid proposal ID.'); return value; };
    const changes = result => { if (result.success !== true) throw new Error('D1 failure.'); return result.meta.changes; };
    return {
        async context(week) {
            const row = await db.prepare('SELECT payload FROM ai_context WHERE week_start = ?').bind(validateWeek(week)).first();
            return row ? JSON.parse(row.payload) : null;
        },
        async publish(context,now) {
            const c = validateContext(context,now);
            // Keep at most 52 contexts. Replacement/removal is always available to the owner.
            const result = await db.prepare(`INSERT INTO ai_context (week_start,revision,expires_at,payload)
                SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM ai_context) < 52 OR EXISTS (SELECT 1 FROM ai_context WHERE week_start = ?)
                ON CONFLICT(week_start) DO UPDATE SET revision=excluded.revision,expires_at=excluded.expires_at,payload=excluded.payload`)
                .bind(c.weekStart,c.revision,Date.parse(c.expiresAt),JSON.stringify(c),c.weekStart).run();
            if (!changes(result)) throw new CapacityError();
        },
        async revoke(week) { changes(await db.prepare('DELETE FROM ai_context WHERE week_start = ?').bind(validateWeek(week)).run()); },
        async proposal(key) {
            const row = await db.prepare('SELECT payload,status FROM ai_proposals WHERE id = ?').bind(id(key)).first();
            return row ? {payload:JSON.parse(row.payload),status:row.status} : null;
        },
        async createProposal(key,proposal,context,now) {
            const p = validateProposal(proposal);
            // The context check and insert are ONE statement: a concurrent revocation/republication wins.
            // A fixed cap preserves idempotency records without unbounded storage growth.
            const result = await db.prepare(`INSERT INTO ai_proposals (id,payload,status,created_at)
                SELECT ?,?,'pending',? FROM ai_context
                WHERE week_start = ? AND revision = ? AND expires_at > ? AND payload = ?
                AND (SELECT COUNT(*) FROM ai_proposals) < 1000
                AND (SELECT COUNT(*) FROM ai_proposals WHERE status = 'pending') < 100
                ON CONFLICT(id) DO NOTHING`)
                .bind(id(key),JSON.stringify(p),new Date(now).toISOString(),p.weekStart,p.contextRevision,now,JSON.stringify(context)).run();
            return changes(result) > 0;
        },
        async pending() {
            const result = await db.prepare("SELECT id,payload,status FROM ai_proposals WHERE status = 'pending' ORDER BY created_at,id LIMIT 50").all();
            if (result.success !== true) throw new Error('D1 failure.');
            return result.results.map(row => ({id:id(row.id),status:'pending',proposal:validateProposal(JSON.parse(row.payload))}));
        },
        async review(key,status,now) {
            if (!['accepted','rejected'].includes(status)) throw new Error('Invalid review.');
            const result = await db.prepare("UPDATE ai_proposals SET status = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'")
                .bind(status,new Date(now).toISOString(),id(key)).run();
            if (changes(result)) return true;
            const existing = await this.proposal(key);
            return existing?.status === status;
        }
    };
}
