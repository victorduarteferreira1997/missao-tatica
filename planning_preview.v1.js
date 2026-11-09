import {taskWeek,validWeek} from './planning.v1.js';
import {reconcileRecurrenceWeek,occurrenceDate,addRecurrenceDays} from './recurrence.v1.js';
// Read-only projections. No persistence, rewards or IDs allocated in the real state.
export function planningPreview(state,week,currentWeek){
 if(!validWeek(week)||!validWeek(currentWeek))throw Error('Semana inválida.');
 const copy=JSON.parse(JSON.stringify({tasks:state.tasks||[],planning:state.planning||{},currentPlanningWeekStart:state.currentPlanningWeekStart,operationalControl:state.operationalControl,prestige:state.prestige})), original=new Set((state.tasks||[]).map(t=>String(t.id)));
 if(week>currentWeek && !(state.planning?.lastClosedWeek&&week<=state.planning.lastClosedWeek)){
  for(const group of Object.keys(copy.planning?.recurrenceRules||{}))reconcileRecurrenceWeek(copy,group,week,{now:currentWeek+'T12:00:00Z',today:currentWeek,makeId:(()=>{let i=0;return()=>`preview:${group}:${week}:${i++}`;})()});
  // Legacy series without explicit rules retain their existing weekly pattern.
  for(const t of state.tasks||[]){
   if(!t.recurrenceGroupId||copy.planning?.recurrenceRules?.[t.recurrenceGroupId]||t.recurrenceCancelled||taskWeek(t,state)>=week)continue;
   for(const day of t.recurrenceDays||[]){
    if(copy.tasks.some(r=>r.recurrenceGroupId===t.recurrenceGroupId&&r.day===day&&taskWeek(r,copy)===week))continue;
    copy.tasks.push({...t,id:`preview:${t.recurrenceGroupId}:${week}:${day}`,day,planningWeekStart:week,completed:false,workflowStatus:'planned',subtasks:(t.subtasks||[]).map(s=>({...s,completed:false}))});
   }
  }
 }
 const tasks=(copy.tasks||[]).filter(t=>taskWeek(t,copy)===week&&!t.recurrenceCancelled).map(t=>original.has(String(t.id))?t:{...t,planningPreview:true});
 const history=(state.planning?.history||[]).find(h=>h.week===week);
 const statusWeek=state.planning?.studyStatusWeek || (state.planning?.lastClosedWeek?addRecurrenceDays(state.planning.lastClosedWeek,7):state.planning?.legacyWeek) || currentWeek;
 const blocks=history?.studyBlocks||state.studyData?.studyPlan?.weeklyBlocks||[];
 const studies=blocks.filter(b=>b.status!=='cancelled').map(b=>week===statusWeek||history?{...b}:{...b,status:'planned',planningPreview:true});
 return {tasks,studies};
}
