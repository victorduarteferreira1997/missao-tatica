import {DAYS} from '../contract.v1.js';
export const V2_MODULES = Object.freeze(['missions','radar','studies']);
export const V2_GRANT_MS = 30 * 86400000;
export const V2_FRESH_MS = 86400000;
export class V2ValidationError extends Error {}
export function v2Assert(ok) { if (!ok) throw new V2ValidationError('Dados de compartilhamento inválidos.'); }
export function v2Exact(value,keys) { v2Assert(value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).length===keys.length && keys.every(k=>Object.hasOwn(value,k))); }
export function v2Text(value,max=200) { v2Assert(typeof value==='string' && value.length<=max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)); return value; }
export function v2Integer(value,max=Number.MAX_SAFE_INTEGER) { v2Assert(Number.isSafeInteger(value) && value>=0 && value<=max); return value; }
export function v2Ref(value) { v2Assert(typeof value==='string' && /^[a-f0-9]{64}$/.test(value)); return value; }
export function v2GrantId(value) { v2Assert(typeof value==='string' && /^[a-zA-Z0-9_-]{16,80}$/.test(value)); return value; }
export function v2Date(value) { v2Text(value,40); v2Assert(value==='' || (Number.isFinite(Date.parse(value)) && /^20\d\d-\d\d-\d\d(?:T.*)?$/.test(value))); }
export async function v2Hash(value) { const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)); return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
export function v2ValidateChoices(value) {
    const permissions={allowProposals:'missions',allowRadarProposals:'radar',allowStudyProposals:'studies'};
    v2Exact(value,['modules','includeFuture',...Object.keys(permissions).filter(k=>Object.hasOwn(value||{},k)),...(Object.hasOwn(value||{},'allowLibraryProposals')?['allowLibraryProposals']:[])]);v2Exact(value.modules,V2_MODULES);
    for(const [key,module] of Object.entries(permissions))if(Object.hasOwn(value,key))v2Assert(typeof value[key]==='boolean'&&(!value[key]||value.modules[module]));
    if(Object.hasOwn(value,'allowLibraryProposals'))v2Assert(typeof value.allowLibraryProposals==='boolean');
    v2Assert(V2_MODULES.every(k=>typeof value.modules[k]==='boolean') && (V2_MODULES.some(k=>value.modules[k])||value.allowLibraryProposals===true) && typeof value.includeFuture==='boolean'); return value;
}
export function v2ValidateGrantRequest(value) {
    v2Exact(value,['grantId','expectedVersion','choices','frozenRefs']); v2GrantId(value.grantId); v2Integer(value.expectedVersion); v2ValidateChoices(value.choices);
    v2Assert(Array.isArray(value.frozenRefs) && value.frozenRefs.length<=200 && new Set(value.frozenRefs).size===value.frozenRefs.length); value.frozenRefs.forEach(v2Ref);
    v2Assert(!value.choices.includeFuture || value.frozenRefs.length===0); return value;
}
const v2Fields = {
    mission:['title','category','activityType','status','day','weekStart','durationMinutes','startTime','endTime','subtasks'],
    radar:['title','area','project','status','nextAction','dueDate','nextReviewAt','attentionLevel','waitingFor','waitingSince','followUpAt'],
    'study.track':['name','weeklyGoalMinutes','priority','active'],
    'study.subject':['name','trackRef','progress'],
    'study.block':['title','trackRef','subjectRef','day','status','studyType','plannedMinutes','startTime','endTime'],
    'study.review':['subjectRef','dueDate','status','intervalDays'],
    'study.cycle':['name','subjectRefs','weeklyGoalMinutes','active']
};
export function v2Module(kind) { return kind==='mission'?'missions':kind==='radar'?'radar':kind.startsWith('study.')?'studies':''; }
export function v2ValidateEntity(row) {
    v2Exact(row,['ref','kind','entityVersion','fields']); v2Ref(row.ref); v2Ref(row.entityVersion); v2Assert(Object.hasOwn(v2Fields,row.kind));
    const f=row.fields; v2Exact(f,v2Fields[row.kind]);
    for (const [key,val] of Object.entries(f)) {
        if(key==='subtasks') { v2Assert(Array.isArray(val) && val.length<=100); for(const s of val){v2Exact(s,['title','completed']);v2Text(s.title);v2Assert(typeof s.completed==='boolean');} }
        else if(key==='progress') { v2Exact(val,['minutes','sessions','questions','correct']); Object.values(val).forEach(n=>v2Integer(n));v2Assert(val.correct<=val.questions); }
        else if(key==='subjectRefs') { v2Assert(Array.isArray(val) && val.length<=200);val.forEach(v2Ref); }
        else if(['trackRef','subjectRef'].includes(key)) { if(val!==null)v2Ref(val); }
        else if(['active'].includes(key))v2Assert(typeof val==='boolean');
        else if(['durationMinutes','plannedMinutes','weeklyGoalMinutes','intervalDays'].includes(key)) { if(val!==null)v2Integer(val); }
        else { v2Text(val,key==='nextAction'?1000:200); if(['dueDate','nextReviewAt','waitingSince','followUpAt','weekStart'].includes(key))v2Date(val); }
    }
    if(row.kind==='mission')v2Assert(['task','meeting'].includes(f.activityType) && ['planned','in_progress','paused','completed','not_held'].includes(f.status));
    if(row.kind==='radar')v2Assert(['active','waiting','backlog','closed'].includes(f.status) && ['controlled','attention','immediate'].includes(f.attentionLevel));
    if(Object.hasOwn(f,'day'))v2Assert(DAYS.includes(f.day));
    for(const key of ['startTime','endTime'])if(Object.hasOwn(f,key))v2Assert(f[key]==='' || /^([01]\d|2[0-3]):[0-5]\d$/.test(f[key]));
    return row;
}
export function v2ValidateSnapshot(value,grant,now=Date.now()) {
    v2Exact(value,['schemaVersion','grantId','grantVersion','expectedProjectionVersion','sourceSavedAt','coverage','omissions','entities']);
    v2Assert(value.schemaVersion===2 && value.grantId===grant.grantId && value.grantVersion===grant.version); v2Integer(value.expectedProjectionVersion);
    v2Date(value.sourceSavedAt);const savedAt=Date.parse(value.sourceSavedAt);v2Assert(Number.isFinite(savedAt) && savedAt<=now+60000);
    v2Exact(value.coverage,V2_MODULES);v2Assert(V2_MODULES.every(k=>value.coverage[k]===grant.choices.modules[k]));
    v2Assert(Array.isArray(value.omissions) && value.omissions.length<=10);value.omissions.forEach(s=>v2Text(s));
    v2Assert(Array.isArray(value.entities) && value.entities.length<=200 && new Set(value.entities.map(e=>e.ref)).size===value.entities.length);
    for(const row of value.entities){v2ValidateEntity(row);v2Assert(grant.choices.modules[v2Module(row.kind)] && (grant.choices.includeFuture || grant.frozenRefs.includes(row.ref)));}
    const refs=new Map(value.entities.map(e=>[e.ref,e.kind]));
    for(const row of value.entities)for(const key of ['trackRef','subjectRef','subjectRefs'])if(Object.hasOwn(row.fields,key)) {
        const targets=key==='subjectRefs'?row.fields[key]:[row.fields[key]];v2Assert(targets.every(ref=>ref===null || refs.get(ref)===(key==='trackRef'?'study.track':'study.subject')));
    }
    v2Assert(new TextEncoder().encode(JSON.stringify(value)).byteLength<=64000);return value;
}
export async function v2Project(state,grant) {
    const entities=[], ref=async(kind,id)=>{v2Assert(id!==undefined && id!==null);return v2Hash(grant.grantId+':'+kind+':'+String(id));};
    const text=value=>v2Text(String(value??'')); const number=value=>{const n=Number(value);return Number.isFinite(n)&&n>=0?Math.floor(n):null;};
    async function add(kind,item,fields){const r=await ref(kind,item.id);if(!grant.choices.includeFuture && !grant.frozenRefs.includes(r))return;entities.push({ref:r,kind,entityVersion:await v2Hash(JSON.stringify(fields)),fields});}
    if(grant.choices.modules.missions)for(const t of state.tasks||[]) {
        const activityType=t.activityType==='meeting'?'meeting':'task';
        const status=t.completed?'completed':activityType==='meeting'?(t.meetingOutcome==='not_held'||t.googleCalendarSourceStatus==='cancelled'?'not_held':'planned'):['in_progress','paused'].includes(t.workflowStatus)?t.workflowStatus:'planned';
        await add('mission',t,{title:text(t.text),category:text(t.category),activityType,status,day:text(t.day),weekStart:text(t.googleCalendarWeekStart||t.planningWeekStart||''),durationMinutes:number(parseInt(t.time,10)),startTime:text(t.startTime),endTime:text(t.endTime),subtasks:(t.subtasks||[]).map(s=>({title:text(s.text),completed:Boolean(s.completed)}))});
    }
    if(grant.choices.modules.radar)for(const d of state.operationalControl?.demands||[]) await add('radar',d,{title:text(d.title),area:text(d.area),project:text(d.project),status:text(d.workflowStatus||'active'),nextAction:v2Text(String(d.nextAction||''),1000),dueDate:text(d.dueDate),nextReviewAt:text(d.nextReviewAt),attentionLevel:text(d.attentionLevel||'controlled'),waitingFor:text(d.waitingFor),waitingSince:text(d.waitingSince),followUpAt:text(d.followUpAt)});
    if(grant.choices.modules.studies){
        const s=state.studyData||{},plan=s.studyPlan||{};
        for(const t of plan.tracks||[])await add('study.track',t,{name:text(t.name),weeklyGoalMinutes:number(t.weeklyGoalMinutes),priority:text(t.priority),active:t.active!==false});
        for(const t of s.subjects||[]) {
            const sessions=(s.sessions||[]).filter(x=>String(x.subjectId)===String(t.id));const sum=key=>sessions.reduce((n,x)=>n+(number(x[key])||0),0);
            await add('study.subject',t,{name:text(t.name),trackRef:t.trackId?await ref('study.track',t.trackId):null,progress:{minutes:sum('duration'),sessions:sessions.length,questions:sum('qTotal'),correct:sum('qCorrect')}});
        }
        for(const b of plan.weeklyBlocks||[])await add('study.block',b,{title:text(b.title),trackRef:b.trackId?await ref('study.track',b.trackId):null,subjectRef:b.subjectId?await ref('study.subject',b.subjectId):null,day:text(b.day),status:text(b.status),studyType:text(b.studyType),plannedMinutes:number(b.plannedMinutes),startTime:text(b.startTime),endTime:text(b.endTime)});
        for(const r of s.reviews||[])await add('study.review',r,{subjectRef:r.subjectId?await ref('study.subject',r.subjectId):null,dueDate:text(r.dueDate),status:text(r.status),intervalDays:number(r.intervalDays)});
        for(const c of s.cycles||[])await add('study.cycle',c,{name:text(c.name),subjectRefs:await Promise.all((c.subjectIds||[]).map(id=>ref('study.subject',id))),weeklyGoalMinutes:number(Number(c.weeklyHoursGoal)*60),active:Boolean(c.active)});
    }
    const included=new Set(entities.map(e=>e.ref));for(const e of entities){for(const k of ['trackRef','subjectRef'])if(e.fields[k]&&!included.has(e.fields[k]))e.fields[k]=null;if(e.fields.subjectRefs)e.fields.subjectRefs=e.fields.subjectRefs.filter(r=>included.has(r));e.entityVersion=await v2Hash(JSON.stringify(e.fields));}
    v2Assert(entities.length<=200);return entities;
}
export async function v2BuildSnapshot(state,grant,expectedProjectionVersion=0){
    const snapshot={schemaVersion:2,grantId:grant.grantId,grantVersion:grant.version,expectedProjectionVersion,sourceSavedAt:state.lastSavedAt||state.updatedAt||'',coverage:{...grant.choices.modules},omissions:['Finanças, saúde, notas livres e anexos','Agenda externa não convertida em missão','Registros individuais de sessões e questões de estudo'],entities:await v2Project(state,grant)};
    return v2ValidateSnapshot(snapshot,grant);
}
