import {v2Hash,v2Project} from './contract.js';
import {missionChangeFields} from './mission_changes.js';
import {applyMissionSchedule,assertScheduleWeekOpen,scheduleWeek} from '../../mission_schedule.v1.js';
import {occurrenceDate,hasRecurrence} from '../../recurrence.v1.js';
export async function missionChangeTarget(state,row,fields=row.fields){
 for(const task of state.tasks||[]){if(await v2Hash(row.grantId+':mission:'+String(task.id))!==fields.targetRef)continue;
  const [entity]=await v2Project({tasks:[task]},{grantId:row.grantId,choices:{modules:{missions:true,radar:false,studies:false},includeFuture:true}});
  if(entity.entityVersion!==fields.targetVersion)throw Error('A missão mudou depois da consulta da IA. Sincronize e peça uma nova proposta.');
  if(task.completed||task.cancelled||task.recurrenceCancelled||task.workflowStatus==='cancelled')throw Error('Missões concluídas ou canceladas mantêm seu histórico.');
  if(task.activityType==='meeting'||task.googleCalendarSource==='primary')throw Error('Edite reuniões e eventos externos pelo fluxo habitual.');
  if(hasRecurrence(task)||task.isRecurring||task.recurrenceGroupId)throw Error('Edite esta série em Repetição; as ocorrências serão preservadas.');
  if(['in_progress','paused'].includes(task.workflowStatus)||task.startedAt||task.focusStartedAt)throw Error('Finalize o foco em andamento e edite esta missão pelo fluxo habitual.');
  assertScheduleWeekOpen(state,scheduleWeek(task,state));return {task,entity,taskVersion:await v2Hash(JSON.stringify(task))};
 }throw Error('A missão original não está mais disponível. Nenhum registro foi alterado.');
}
export async function previewMissionChange(state,row,fields=row.fields,{calculateCost}={}){
 const f=missionChangeFields(fields),before=await missionChangeTarget(state,row,f),copy=JSON.parse(JSON.stringify(state)),task=copy.tasks.find(t=>String(t.id)===String(before.task.id)),p=f.patch;
 if(p.date)applyMissionSchedule(copy,task,p.date);
 if(Object.hasOwn(p,'title'))task.text=p.title;
 if(Object.hasOwn(p,'priority'))task.priority=p.priority;
 if(Object.hasOwn(p,'durationMinutes'))task.time=String(p.durationMinutes);
 if(Object.hasOwn(p,'startTime'))task.startTime=p.startTime;
 if(Object.hasOwn(p,'durationMinutes')||Object.hasOwn(p,'startTime')){
  if(task.startTime){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(task.startTime))throw Error('Confira o horário atual desta missão.');const duration=Number.parseInt(task.time,10),[h,m]=task.startTime.split(':').map(Number),end=h*60+m+duration;if(!Number.isInteger(duration)||duration<5||duration>240||end>=1440)throw Error('O horário e a duração devem terminar no mesmo dia.');task.endTime=String(Math.floor(end/60)).padStart(2,'0')+':'+String(end%60).padStart(2,'0');}else task.endTime='';
 }
 if(p.subtaskEdits){for(const edit of p.subtaskEdits){if(!task.subtasks?.[edit.index])throw Error('Uma subtarefa não está mais disponível. Solicite uma nova proposta.');task.subtasks[edit.index].text=edit.title;}}
 if(p.addSubtasks){task.subtasks||=[];if(task.subtasks.length+p.addSubtasks.length>100)throw Error('Limite de 100 subtarefas atingido.');task.subtasks.push(...p.addSubtasks.map((text,i)=>({id:'ai-change-'+row.id+'-'+i,text,completed:false})));}
 if(calculateCost&&(Object.hasOwn(p,'priority')||Object.hasOwn(p,'durationMinutes'))){const cost=calculateCost(task.priority,task.complexity,task.time,task.impactType,task.missionNature);task.xp=cost.xp;task.energyCost=cost.hp;}
 return {before:before.task,after:task,beforeDate:occurrenceDate(before.task,state),afterDate:occurrenceDate(task,copy),taskVersion:before.taskVersion,planning:copy.planning};
}
export async function applyMissionChange(state,row,options={}){
 if(row.status!=='applying'||!row.expectedTaskVersion)throw Error('Confirme a revisão antes de aplicar.');
 const preview=await previewMissionChange(state,row,row.fields,options);if(preview.taskVersion!==row.expectedTaskVersion)throw Error('A missão mudou durante a revisão. Nenhuma alteração foi aplicada; confira o app antes de retomar.');
 const index=state.tasks.findIndex(t=>String(t.id)===String(preview.before.id));state.tasks[index]=preview.after;if(preview.planning)state.planning=preview.planning;
 return {taskId:preview.after.id,kind:'mission.update'};
}
