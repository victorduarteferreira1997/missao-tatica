// Shared allowlists for the browser and the private GPT Actions bridge.
export const AI_DATABASE = 'missao-tatica-ai';
export const AI_PROJECT = 'missao-tatica';
export const AI_OWNER_UID = '1LDBfIQ5vQTUtaE5j0k4Sp9w7Rj2';
export const DAYS = Object.freeze(['monday','tuesday','wednesday','thursday','friday','saturday','sunday']);
export const MAX_CONTEXT_AGE_MS = 24 * 60 * 60 * 1000;
export class ContractError extends Error {}
function requireValue(ok, message) { if (!ok) throw new ContractError(message); }
function exact(value, keys) {
    requireValue(value && typeof value === 'object' && !Array.isArray(value), 'Objeto inválido.');
    requireValue(Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value,k)), 'Campos inválidos.');
}
function string(value, min, max) {
    requireValue(typeof value === 'string' && value.trim() === value && value.length >= min && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value), 'Texto inválido.');
    return value;
}
function integer(value, min, max) { requireValue(Number.isInteger(value) && value >= min && value <= max, 'Número inválido.'); return value; }
function identifier(value) { string(value,1,80); requireValue(/^[A-Za-z0-9_-]+$/.test(value),'Identificador inválido.'); return value; }
export function validateWeek(value) {
    requireValue(typeof value === 'string' && /^20\d\d-\d\d-\d\d$/.test(value), 'Semana inválida.');
    const date = new Date(value+'T00:00:00Z');
    requireValue(Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value && date.getUTCDay() === 1,'Use a data da segunda-feira.');
    return value;
}
function clock(value) { requireValue(value === '' || (typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)), 'Horário inválido.'); return value; }
function range(start, end) { clock(start); clock(end); requireValue(!end || (start && end > start),'Fim deve ser posterior ao início.'); }
function timestamp(value) { string(value,24,24); requireValue(Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value,'Data inválida.'); return value; }
export function validateContext(value, now = Date.now(), fresh = true) {
    exact(value,['schemaVersion','weekStart','timezone','revision','publishedAt','expiresAt','partial','missions']);
    requireValue(value.schemaVersion === 1 && value.timezone === 'America/Sao_Paulo' && value.partial === true,'Contexto inválido.');
    const weekStart = validateWeek(value.weekStart), revision = identifier(value.revision);
    const publishedAt = timestamp(value.publishedAt), expiresAt = timestamp(value.expiresAt);
    requireValue(Date.parse(expiresAt) > Date.parse(publishedAt) && Date.parse(expiresAt)-Date.parse(publishedAt) <= MAX_CONTEXT_AGE_MS,'Validade inválida.');
    if (fresh) requireValue(Date.parse(publishedAt) <= now+60000 && Date.parse(expiresAt) > now,'Contexto expirado; publique novamente no app.');
    requireValue(Array.isArray(value.missions) && value.missions.length <= 60,'Limite de 60 missões.');
    const ids = new Set();
    const missions = value.missions.map(m => {
        exact(m,['ref','title','day','durationMinutes','startTime','endTime','completed']);
        const ref = identifier(m.ref); requireValue(!ids.has(ref),'Referência repetida.'); ids.add(ref);
        requireValue(DAYS.includes(m.day) && typeof m.completed === 'boolean','Missão inválida.'); range(m.startTime,m.endTime);
        return {ref,title:string(m.title,1,200),day:m.day,durationMinutes:integer(m.durationMinutes,5,240),startTime:m.startTime,endTime:m.endTime,completed:m.completed};
    });
    return {schemaVersion:1,weekStart,timezone:'America/Sao_Paulo',revision,publishedAt,expiresAt,partial:true,missions};
}
// No spreading or serializing state. Only individually selected tasks are projected.
export function buildContext(state, selectedIds, {weekStart,revision,now = Date.now()}) {
    requireValue(Array.isArray(selectedIds),'Seleção inválida.');
    const selected = new Set(selectedIds.map(String));
    const tasks = (Array.isArray(state?.tasks) ? state.tasks : []).filter(t => selected.has(String(t.id)));
    requireValue(tasks.length === selected.size,'Uma missão selecionada mudou; revise a seleção.');
    return validateContext({schemaVersion:1,weekStart,timezone:'America/Sao_Paulo',revision,
        publishedAt:new Date(now).toISOString(),expiresAt:new Date(now+MAX_CONTEXT_AGE_MS).toISOString(),partial:true,
        missions:tasks.map((t,i) => ({ref:'mission-'+(i+1),title:String(t.text || '').trim(),day:t.day,
            durationMinutes:parseInt(t.time,10) || 30,startTime:t.startTime || '',endTime:t.endTime || '',completed:t.completed === true}))},now);
}
export function validateProposal(value) {
    exact(value,['idempotencyKey','weekStart','contextRevision','title','day','durationMinutes','startTime','endTime','subtasks']);
    const idempotencyKey = identifier(value.idempotencyKey); requireValue(idempotencyKey.length >= 8,'Chave de repetição curta.');
    const weekStart = validateWeek(value.weekStart), contextRevision = identifier(value.contextRevision);
    requireValue(DAYS.includes(value.day),'Dia inválido.'); range(value.startTime,value.endTime);
    requireValue(Array.isArray(value.subtasks) && value.subtasks.length <= 12,'Limite de 12 subtarefas.');
    return {idempotencyKey,weekStart,contextRevision,title:string(value.title,1,200),day:value.day,
        durationMinutes:integer(value.durationMinutes,5,240),startTime:value.startTime,endTime:value.endTime,
        subtasks:value.subtasks.map(s => string(s,1,200))};
}
export function proposalFormFields(value) {
    const p = validateProposal(value);
    return {'ct-text':p.title,'ct-day':p.day,'ct-time':p.durationMinutes,'ct-start-time':p.startTime,'ct-end-time':p.endTime,'ct-subtasks':p.subtasks.join('\n')};
}
