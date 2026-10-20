import {validWeek,linkedTasks,taskWeek,blockingDependencies} from './planning.v1.js';
export const radarStatus={active:'Ativo',waiting:'Aguardando',backlog:'Backlog',closed:'Encerrado'};
export const taskStatus=task=>task.completed?'Concluída':task.meetingOutcome==='not_held'||task.googleCalendarSourceStatus==='cancelled'?'Não realizada':task.workflowStatus==='paused'?'Pausada':task.workflowStatus==='in_progress'||task.subtasks?.some(s=>s.completed)?'Em andamento':'Planejada';
export function validDate(value){if(!/^20\d\d-\d\d-\d\d$/.test(value||''))return false;const d=new Date(value+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===value;}
export function weekDate(week,offset){if(!validWeek(week))return '';const d=new Date(week+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);}
export const shortDate=value=>validDate(value)?value.split('-').reverse().join('/'):'Sem data';
export function executableMission(state,task,week){return !task.completed&&!['Pausada','Não realizada'].includes(taskStatus(task))&&taskWeek(task,state)===week&&!blockingDependencies(state,task).length;}
// Read-only projections: no backfills, automatic mission creation or mutations.
export function radarWeek(state,week,today){
 if(!validWeek(week))return {followups:[],withoutMission:[]};
 const end=weekDate(week,6),open=(state.operationalControl?.demands||[]).filter(d=>d.workflowStatus!=='closed');
 const all=open.map(demand=>{
  const missions=linkedTasks(state,demand.id),withoutMission=(demand.workflowStatus||'active')==='active'&&!missions.some(t=>executableMission(state,t,week));
  const dates=[['dueDate','Prazo'],['nextReviewAt','Revisão'],['followUpAt','Follow-up']].filter(([key])=>validDate(demand[key])).map(([key,label])=>({key,label,date:demand[key]}));
  const reasons=dates.filter(row=>row.date>=week&&row.date<=end);
  const immediate=demand.attentionLevel==='immediate'&&validDate(today)&&week<=today&&end>=today&&(dates.some(row=>row.date<week)||!dates.length);
  if(immediate)reasons.push({key:'immediate',label:'Atenção imediata pendente',date:today});
  return {demand,missions,withoutMission,reasons};
 });
 const followups=all.filter(row=>row.reasons.length).sort((a,b)=>a.reasons[0].date.localeCompare(b.reasons[0].date)||String(a.demand.title).localeCompare(String(b.demand.title),'pt-BR'));
 return {followups,withoutMission:all.filter(row=>row.withoutMission)};
}
export function allPlanningMissions(state){const rows=new Map();for(const entry of state.planning?.history||[])for(const task of entry.tasks||[])rows.set(String(task.id),task);for(const task of state.tasks||[])rows.set(String(task.id),task);return [...rows.values()];}
export function setRadarLink(state,taskId,demandId){
 const task=allPlanningMissions(state).find(t=>String(t.id)===String(taskId));
 if(!task)throw Error('Esta missão não está disponível para edição.');
 if(demandId!=null&&!(state.operationalControl?.demands||[]).some(d=>String(d.id)===String(demandId)))throw Error('O RADAR não está mais disponível.');
 // Change only the chosen canonical record, without copying or recreating it.
 task.radarDemandId=demandId==null?null:String(demandId);return task;
}
