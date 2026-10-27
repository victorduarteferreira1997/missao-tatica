import {RECURRENCE_DAYS,validRecurrenceDate,addRecurrenceDays,occurrenceDate,hasRecurrence} from './recurrence.v1.js?v=1.9.66.1';
// Date-only scheduling. No rewards, network calls, new IDs or inferred legacy dates.
export function scheduleForDate(date) {
 if(!validRecurrenceDate(date))throw Error('Escolha uma data válida.');
 const index=(new Date(date+'T12:00:00Z').getUTCDay()+6)%7;
 return {day:RECURRENCE_DAYS[index],planningWeekStart:addRecurrenceDays(date,-index)};
}
export function scheduleWeek(task,state){return task.googleCalendarWeekStart||task.planningWeekStart||state.planning?.legacyWeek||state.currentPlanningWeekStart;}
export function assertScheduleWeekOpen(state,week){
 if(!validRecurrenceDate(week)||new Date(week+'T12:00:00Z').getUTCDay()!==1)throw Error('Semana inválida.');
 if(state.planning?.lastClosedWeek&&week<=state.planning.lastClosedWeek || state.planning?.history?.some(row=>row.week===week))throw Error('Esta semana já foi fechada. Escolha uma data em uma semana aberta.');
}
export function planMissionSchedule(state,task,date){
 const schedule=scheduleForDate(date),sourceDate=occurrenceDate(task,state),changed=sourceDate!==date;
 if(changed){
  if(task.googleCalendarSource==='primary')throw Error('Altere a data no Google Agenda e sincronize novamente.');
  if(hasRecurrence(task))throw Error('Altere os dias em Repetição. As ocorrências da série são preservadas.');
  if(task.completed)throw Error('Missões concluídas mantêm sua data de histórico.');
  assertScheduleWeekOpen(state,scheduleWeek(task,state));assertScheduleWeekOpen(state,schedule.planningWeekStart);
 }
 return {...schedule,date,sourceDate,sourceWeek:scheduleWeek(task,state),changed};
}
export function applyMissionSchedule(state,task,date){
 const plan=planMissionSchedule(state,task,date);if(!plan.changed)return plan;
 const moves=state.planning?.calendarMoves||[];
 const track=plan.sourceWeek!==plan.planningWeekStart&&Boolean(state.calendarSync?.calendarId||state.calendarSyncTest?.calendarId);
 if(track&&!moves.some(row=>String(row.taskId)===String(task.id)&&row.week===plan.sourceWeek)){
  if(moves.length>=2000)throw Error('Sincronize o Google Agenda antes de continuar reagendando.');
  state.planning||={};state.planning.calendarMoves=[...moves,{taskId:String(task.id),week:plan.sourceWeek}];
 }
 task.day=plan.day;task.planningWeekStart=plan.planningWeekStart;
 if(task.googleCalendarWeekStart)task.googleCalendarWeekStart=plan.planningWeekStart;
 const orders=(state.tasks||[]).filter(row=>row!==task&&row.day===plan.day&&scheduleWeek(row,state)===plan.planningWeekStart).map(row=>Number.isFinite(row.order)?row.order:0);
 task.order=Math.max(0,...orders)+1;
 return plan;
}
export const formatMissionDate=date=>validRecurrenceDate(date)?date.split('-').reverse().join('/'):'Data não definida';
