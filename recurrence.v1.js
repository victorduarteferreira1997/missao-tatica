// Additive rules for mission series. Old records are never deleted by scheduling.
export const RECURRENCE_DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const copy = value => JSON.parse(JSON.stringify(value));
const rows = value => Array.isArray(value) ? value : [];
export function validRecurrenceDate(value) {
    if (!/^20\d\d-\d\d-\d\d$/.test(value || '')) return false;
    const d = new Date(value + 'T12:00:00Z');
    return Number.isFinite(+d) && d.toISOString().slice(0,10) === value;
}
export function addRecurrenceDays(value, amount) {
    if (!validRecurrenceDate(value)) throw Error('Data de repetição inválida.');
    const d = new Date(value + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + amount);
    return d.toISOString().slice(0,10);
}
export function recurrenceToday(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
    return ['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('-');
}
export function occurrenceDate(task, state) {
    const week = task.googleCalendarWeekStart || task.planningWeekStart || state.planning?.legacyWeek || state.currentPlanningWeekStart;
    const index = RECURRENCE_DAYS.indexOf(task.day);
    return index >= 0 && validRecurrenceDate(week) ? addRecurrenceDays(week,index) : '';
}
export function recurrenceRule(state, task) {
    return task?.googleCalendarSource !== 'primary' && task?.recurrenceGroupId ? state.planning?.recurrenceRules?.[task.recurrenceGroupId] || null : null;
}
export function hasRecurrence(task) { return Boolean(task?.recurrenceGroupId && (task.isRecurring || rows(task.recurrenceDays).length)); }
export function protectedOccurrence(task, state, from) {
    const date = occurrenceDate(task,state);
    return !date || date < from || task.completed || ['in_progress','paused'].includes(task.workflowStatus) || Boolean(task.startedAt || task.focusStartedAt || rows(task.subtasks).some(s=>s.completed));
}
export function recurrenceAllows(rule, date, day) {
    return Boolean(validRecurrenceDate(date) && rows(rule?.days).includes(day) && date >= (rule.effectiveFrom || rule.startsOn) && (!rule.endDate || date <= rule.endDate) && (!rule.stoppedAfter || date <= rule.stoppedAfter));
}
const TEMPLATE_KEYS = ['text','activityType','category','xp','energyCost','priority','time','complexity','impactType','missionNature','startTime','endTime','radarDemandId','dependsOnTaskIds','dependencyReceipts','subtasks'];
export function recurrenceTemplate(task) {
    return Object.fromEntries(TEMPLATE_KEYS.filter(k=>task[k]!==undefined).map(k=>[k,copy(task[k])]));
}
function ruleStore(state) {
    state.planning ||= {};
    if (!state.planning.recurrenceRules || typeof state.planning.recurrenceRules !== 'object' || Array.isArray(state.planning.recurrenceRules)) state.planning.recurrenceRules = {};
    return state.planning.recurrenceRules;
}
export function setRecurrenceRule(state, task, days, endDate, {from, create = false} = {}) {
    days = RECURRENCE_DAYS.filter(day=>rows(days).includes(day));
    if (!days.length) throw Error('Selecione ao menos um dia. Para parar a série, use Encerrar repetição.');
    if (!validRecurrenceDate(from)) throw Error('Data inicial da repetição inválida.');
    if (endDate && (!validRecurrenceDate(endDate) || endDate < from)) throw Error('A data final deve ser igual ou posterior ao início das próximas ocorrências.');
    if (endDate && !Array.from({length:7},(_,i)=>addRecurrenceDays(from,i)).some(date=>date<=endDate && days.includes(RECURRENCE_DAYS[(new Date(date+'T12:00:00Z').getUTCDay()+6)%7]))) throw Error('Não há nenhum dia selecionado até a data final. Ajuste os dias ou a data.');
    const old = recurrenceRule(state,task);
    if (old?.stoppedAfter) throw Error('Esta repetição foi encerrada. Cadastre uma nova missão para iniciar outra série.');
    const start = old?.startsOn || occurrenceDate(task,state) || from;
    const rule = {days,endDate:endDate||'',startsOn:create?from:start,effectiveFrom:from,template:recurrenceTemplate(task)};
    ruleStore(state)[task.recurrenceGroupId] = rule;
    return rule;
}
export function stopRecurrence(state, task, today, now = new Date().toISOString()) {
    if (!hasRecurrence(task) || task.googleCalendarSource === 'primary' || !validRecurrenceDate(today)) throw Error('Esta missão não possui repetição gerenciada pelo app.');
    let rule = recurrenceRule(state,task);
    if (!rule) {
        const dates = rows(state.tasks).filter(t=>t.recurrenceGroupId===task.recurrenceGroupId).map(t=>occurrenceDate(t,state)).filter(Boolean).sort();
        rule = {days:RECURRENCE_DAYS.filter(day=>rows(task.recurrenceDays).includes(day)),endDate:'',startsOn:dates[0]||today,effectiveFrom:dates[0]||today,template:recurrenceTemplate(task)};
    }
    ruleStore(state)[task.recurrenceGroupId] = {...rule,stoppedAfter:today,stoppedAt:now};
    return ruleStore(state)[task.recurrenceGroupId];
}
function cancel(task,reason) {
    if (!task.recurrenceCancelled) task.recurrencePreviousStatus = {workflowStatus:task.workflowStatus || 'planned',skipped:Boolean(task.skipped)};
    task.recurrenceCancelled = reason; task.workflowStatus = 'cancelled'; task.skipped = true;
}
function restore(task) {
    if (task.recurrenceCancelled !== 'schedule') return;
    Object.assign(task,task.recurrencePreviousStatus || {workflowStatus:'planned',skipped:false});
    delete task.recurrenceCancelled; delete task.recurrencePreviousStatus;
}
export function reconcileRecurrenceWeek(state, groupId, week, {applyChanges=false,makeId=null,sources=null,now=new Date().toISOString(),today=recurrenceToday(now)}={}) {
    const rule = state.planning?.recurrenceRules?.[groupId];
    if (!rule || !validRecurrenceDate(week)) return [];
    const tasks=rows(state.tasks),members=tasks.filter(t=>String(t.recurrenceGroupId)===String(groupId) && t.googleCalendarSource!=='primary' && (t.planningWeekStart||state.planning?.legacyWeek||state.currentPlanningWeekStart)===week);
    const touched=[];
    for(const task of members) {
        const date=occurrenceDate(task,state);
        // Only future unstarted records can be withdrawn. Past and work in progress survive.
        if (!recurrenceAllows(rule,date,task.day) && (rule.stoppedAfter || date >= rule.effectiveFrom) && !protectedOccurrence(task,state,today)) cancel(task,rule.stoppedAfter?'stopped':'schedule');
    }
    for(const day of rule.days) {
        const date=occurrenceDate({day,planningWeekStart:week},state);
        if (!recurrenceAllows(rule,date,day)) continue;
        let task=members.find(t=>t.day===day && !t.recurrenceCancelled) || members.find(t=>t.day===day);
        if (task) {
            if (task.recurrenceCancelled==='stopped') continue;
            if (task.recurrenceCancelled==='schedule') {if(protectedOccurrence(task,state,today))continue;restore(task);}
            if (applyChanges && !protectedOccurrence(task,state,rule.effectiveFrom)) {
                const {subtasks,...values}=rule.template;Object.assign(task,copy(values));
            }
        } else {
            const allRecords=[...tasks,...rows(state.planning?.history).flatMap(w=>rows(w.tasks))];
            const id=makeId?makeId():Math.max(Date.now(),...allRecords.map(t=>Math.ceil(Number(t.id)||0)))+1;
            const previous=rows(sources||tasks).filter(t=>String(t.recurrenceGroupId)===String(groupId)&&t.day===day&&!t.recurrenceCancelled&&occurrenceDate(t,state)<date).sort((a,b)=>occurrenceDate(b,state).localeCompare(occurrenceDate(a,state)))[0];
            const template={...copy(rule.template),...(previous?{dependsOnTaskIds:copy(previous.dependsOnTaskIds||[]),dependencyReceipts:copy(previous.dependencyReceipts||[]),radarDemandId:previous.radarDemandId||null,subtasks:copy(previous.subtasks||[])}:{})};
            if (template.radarDemandId && !rows(state.operationalControl?.demands).some(d=>String(d.id)===String(template.radarDemandId))) template.radarDemandId=null;
            if (tasks.some(t=>String(t.id)===String(id)) || rows(state.planning?.history).some(w=>rows(w.tasks).some(t=>String(t.id)===String(id)))) throw Error('Identificador de ocorrência duplicado. Tente novamente.');
            task={...template,id,day,planningWeekStart:week,order:tasks.filter(t=>t.day===day).length+1,createdAt:now,completed:false,workflowStatus:'planned',skipped:false,campaignId:state.prestige?.campaign||1,subtasks:rows(template.subtasks).map((s,i)=>({...s,id:String(id)+':sub:'+i,completed:false}))};
            tasks.push(task);
        }
        // Historic/protected records retain their own fields, including their old schedule.
        if (!protectedOccurrence(task,state,rule.effectiveFrom) || !hasRecurrence(task)) Object.assign(task,{isRecurring:true,recurrenceGroupId:groupId,recurrenceDays:[...rule.days]});
        touched.push(task);
    }
    state.tasks=tasks;return touched;
}
export function reconcileKnownRecurrenceWeeks(state,groupId,options={}) {
    const weeks=new Set(rows(state.tasks).filter(t=>String(t.recurrenceGroupId)===String(groupId)).map(t=>t.planningWeekStart||state.planning?.legacyWeek||state.currentPlanningWeekStart));
    weeks.add(state.currentPlanningWeekStart);
    return [...weeks].flatMap(week=>reconcileRecurrenceWeek(state,groupId,week,options));
}
export function recurrenceCutoff(state,task,today=recurrenceToday()) {
    return [today,occurrenceDate(task,state)].filter(Boolean).sort().at(-1);
}
export function recurrenceSummary(state,task,labels=RECURRENCE_DAYS) {
    const rule=recurrenceRule(state,task),days=rule?.days||rows(task.recurrenceDays),label=days.map(day=>labels[RECURRENCE_DAYS.indexOf(day)]||day).join(', ');
    const fmt=date=>date.split('-').reverse().join('/');
    if(rule?.stoppedAfter)return 'Repetição encerrada após '+fmt(rule.stoppedAfter);
    return label+(rule?.endDate?' · até '+fmt(rule.endDate):' · sem data final');
}
