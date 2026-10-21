import {recurrenceRule,reconcileRecurrenceWeek,occurrenceDate} from './recurrence.v1.js?v=1.9.66.1';
// Pure planning rules. No network, credentials, rewards or automatic scheduling.
export const PLANNING_LIMITS=Object.freeze({historyWeeks:12,historyBytes:320000,weekItems:500,dependencies:20});
const clone=value=>JSON.parse(JSON.stringify(value));
const sid=value=>String(value??'');
const list=value=>Array.isArray(value)?value:[];
export function validWeek(value){if(!/^20\d\d-\d\d-\d\d$/.test(value||''))return false;const d=new Date(value+'T12:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===value&&d.getUTCDay()===1;}
export function nextWeek(week){if(!validWeek(week))throw Error('Semana inválida.');const d=new Date(week+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+7);return d.toISOString().slice(0,10);}
export function taskWeek(task,state){return task.googleCalendarWeekStart||task.planningWeekStart||state.planning?.legacyWeek||state.currentPlanningWeekStart;}
export function tasksForWeek(state,week=state.currentPlanningWeekStart){return list(state.tasks).filter(task=>taskWeek(task,state)===week);}
export function normalizePlanning(state){
 state.planning=state.planning&&typeof state.planning==='object'&&!Array.isArray(state.planning)?state.planning:{};
 if(!validWeek(state.planning.legacyWeek))state.planning.legacyWeek=state.currentPlanningWeekStart;
 if(!Array.isArray(state.planning.history))state.planning.history=[];
 if(!Number.isFinite(state.planning.dailyMinutes))state.planning.dailyMinutes=360;
 if(!Number.isFinite(state.planning.dailyTasks))state.planning.dailyTasks=6;
 for(const task of list(state.tasks)){
  if(!validWeek(task.planningWeekStart)&&!task.googleCalendarWeekStart)task.planningWeekStart=state.planning.legacyWeek;
  if(!Array.isArray(task.dependsOnTaskIds))task.dependsOnTaskIds=[];
  // Do not silently erase imported relationships; dangling references stay visible.
  task.dependsOnTaskIds=[...new Set(task.dependsOnTaskIds.map(sid).filter(Boolean))];
 }
 return state.planning;
}
export function findPlanningTask(state,id){
 const active=list(state.tasks).find(task=>sid(task.id)===sid(id));if(active)return active;
 for(const week of [...list(state.planning?.history)].reverse()){const task=list(week.tasks).find(row=>sid(row.id)===sid(id));if(task)return task;}
 return null;
}
export function blockingDependencies(state,task){
 return list(task.dependsOnTaskIds).map(id=>{
  const actual=findPlanningTask(state,id),receipt=list(task.dependencyReceipts).find(row=>sid(row.id)===sid(id)&&row.completed===true);
  const target=actual||receipt;
  return !target?.completed?{id:sid(id),title:target?.text||'Missão removida ou fora do histórico',missing:!target}:null;
 }).filter(Boolean);
}
export function validateRelations(state,taskId,relations){
 const demandId=sid(relations.radarDemandId),dependencies=[...new Set(list(relations.dependsOnTaskIds).map(sid).filter(Boolean))];
 if(demandId&&!list(state.operationalControl?.demands).some(row=>sid(row.id)===demandId))throw Error('A demanda do RADAR não está mais disponível.');
 if(dependencies.length>PLANNING_LIMITS.dependencies)throw Error('Escolha no máximo 20 pré-requisitos.');
 const edited=findPlanningTask(state,taskId),editedIds=new Set([sid(taskId)]);
 if(edited?.recurrenceGroupId)for(const row of list(state.tasks))if(row.recurrenceGroupId===edited.recurrenceGroupId&&taskWeek(row,state)===taskWeek(edited,state))editedIds.add(sid(row.id));
 for(const id of dependencies){
  if(id===sid(taskId))throw Error('Uma missão não pode depender dela mesma.');
  if(!findPlanningTask(state,id)&&!list(edited?.dependencyReceipts).some(row=>sid(row.id)===id&&row.completed===true))throw Error('Um pré-requisito foi removido. Revise a seleção.');
  const seen=new Set(),queue=[id];
  while(queue.length){const current=queue.pop();if(editedIds.has(current))throw Error('Essa dependência criaria um ciclo entre missões ou ocorrências da mesma recorrência.');if(seen.has(current))continue;seen.add(current);queue.push(...list(findPlanningTask(state,current)?.dependsOnTaskIds).map(sid));}
 }
 return {radarDemandId:demandId||null,dependsOnTaskIds:dependencies};
}
export function linkedTasks(state,demandId){const rows=new Map();for(const week of list(state.planning?.history))for(const task of list(week.tasks))rows.set(sid(task.id),task);for(const task of list(state.tasks))rows.set(sid(task.id),task);return [...rows.values()].filter(task=>sid(task.radarDemandId)===sid(demandId));}
const minutes=value=>Math.max(0,parseInt(value,10)||0);
const cancelled=task=>task.meetingOutcome==='not_held'||task.googleCalendarSourceStatus==='cancelled';
const normalTitle=value=>sid(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const clock=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value||'')?Number(value.slice(0,2))*60+Number(value.slice(3)):null;
export function analyzePlanning(state,week=state.currentPlanningWeekStart){
 const archived=list(state.planning?.history).find(row=>row.week===week);if(archived?.summary)return clone(archived.summary);
 const tasks=tasksForWeek(state,week),pending=tasks.filter(task=>!task.completed&&!cancelled(task));
 const studies=list(state.studyData?.studyPlan?.weeklyBlocks).filter(row=>row.status!=='cancelled');
 const slots=[...pending.map(task=>({id:'task:'+task.id,title:task.text,day:task.day,minutes:minutes(task.time),start:clock(task.startTime),end:clock(task.endTime),kind:'mission'})),...studies.filter(row=>row.status!=='completed').map(row=>({id:'study:'+row.id,title:row.title,day:row.day,minutes:minutes(row.plannedMinutes),start:clock(row.startTime),end:clock(row.endTime),kind:'study'}))];
 const duplicates=[],conflicts=[],days={};
 const groups=new Map();for(const row of pending){const title=normalTitle(row.text);if(!title)continue;if(!groups.has(title))groups.set(title,[]);groups.get(title).push(row);}for(const group of groups.values())if(group.length>1)duplicates.push({title:group[0].text,ids:group.map(row=>sid(row.id)),recurring:group.every(row=>row.recurrenceGroupId&&row.recurrenceGroupId===group[0].recurrenceGroupId)});
 for(const row of slots){const day=days[row.day] ||= {minutes:0,tasks:0,studies:0,unscheduled:0};day.minutes+=row.minutes;day[row.kind==='mission'?'tasks':'studies']++;if(row.start===null)day.unscheduled++;}
 for(let i=0;i<slots.length;i++)for(let j=i+1;j<slots.length;j++){const a=slots[i],b=slots[j];if(a.day!==b.day||a.start===null||b.start===null)continue;const ae=a.end??a.start+a.minutes,be=b.end??b.start+b.minutes;if(ae>a.start&&be>b.start&&a.start<be&&b.start<ae)conflicts.push({day:a.day,a:a.title,b:b.title,aId:a.id,bId:b.id});}
 const dailyMinutes=Math.max(30,Math.min(1440,Number(state.planning?.dailyMinutes)||360)),dailyTasks=Math.max(1,Math.min(100,Number(state.planning?.dailyTasks)||6));
 const overload=Object.entries(days).filter(([,row])=>row.minutes>dailyMinutes||row.tasks>dailyTasks).map(([day,row])=>({day,...row}));
 const blocked=pending.map(task=>({id:sid(task.id),title:task.text,dependencies:blockingDependencies(state,task)})).filter(row=>row.dependencies.length);
 const radar=list(state.operationalControl?.demands),openRadar=radar.filter(row=>row.workflowStatus!=='closed');
 return {week,total:tasks.length,completed:tasks.filter(row=>row.completed).length,pending:pending.length,minutes:slots.reduce((n,row)=>n+row.minutes,0),duplicates,conflicts,overload,blocked,days,dailyMinutes,dailyTasks,openRadar:openRadar.length,waitingRadar:openRadar.filter(row=>row.workflowStatus==='waiting').length,unlinkedRadar:openRadar.filter(row=>!linkedTasks(state,row.id).length).length,unscheduled:slots.filter(row=>row.start===null).length};
}
export function planningSummary(state,week=state.currentPlanningWeekStart){
 const a=analyzePlanning(state,week);
 return [`Planejamento da semana de ${week}: ${a.total} missões, ${a.completed} concluídas, ${a.pending} pendentes.`,`Carga pendente registrada (missões + estudos): ${a.minutes} min.`,`RADAR: ${a.openRadar} demandas abertas, ${a.waitingRadar} aguardando retorno, ${a.unlinkedRadar} sem missões vinculadas.`,`${a.blocked.length} missões com pré-requisitos pendentes; ${a.conflicts.length} possíveis conflitos de horário; ${a.duplicates.filter(row=>!row.recurring).length} grupos de títulos semelhantes; ${a.overload.length} dias acima dos limites definidos.`,...a.blocked.slice(0,10).map(row=>`Pré-requisito: ${row.title} aguarda ${row.dependencies.map(d=>d.title).join('; ')}.`),...a.conflicts.slice(0,10).map(row=>`Possível conflito (${row.day}): ${row.a} / ${row.b}.`),...a.duplicates.filter(row=>!row.recurring).slice(0,10).map(row=>`Possível duplicidade: ${row.title}.`),'Análise por regras dos registros disponíveis. Não inclui eventos externos não convertidos; falta de horário não significa tempo livre.'].join('\n');
}
function historyBytes(history){return new TextEncoder().encode(JSON.stringify(history)).byteLength;}
export function buildWeekTransition(state,{now=new Date().toISOString(),newId=null}={}){
 const week=state.currentPlanningWeekStart,target=nextWeek(week),planning=state.planning||{},history=list(planning.history);
 if((planning.lastClosedWeek && week<=planning.lastClosedWeek)||history.some(row=>row.week===week))throw Error('Esta semana já foi fechada. Consulte seu histórico.');
 const tasks=tasksForWeek(state,week),blocks=list(state.studyData?.studyPlan?.weeklyBlocks);
 if(tasks.length+blocks.length>PLANNING_LIMITS.weekItems)throw Error('Esta semana excede 500 itens. Exporte um backup e reduza os registros antes de fechar.');
 const snapshot={week,closedAt:now,tasks:clone(tasks),studyBlocks:clone(blocks),summary:analyzePlanning(state,week)};
 const kept=[...history, snapshot].sort((a,b)=>a.week.localeCompare(b.week));
 let removedWeeks=0;while(kept.length>PLANNING_LIMITS.historyWeeks){kept.shift();removedWeeks++;}
 while(historyBytes(kept)>PLANNING_LIMITS.historyBytes&&kept.length>1){kept.shift();removedWeeks++;}
 if(historyBytes(kept)>PLANNING_LIMITS.historyBytes)throw Error('Os registros desta semana excedem o limite do histórico. Exporte um backup e reduza seu tamanho antes de fechar.');
 const owned=tasks.filter(row=>row.googleCalendarSource!=='primary'),ownedIds=new Set(owned.map(row=>sid(row.id)));
 const nextTasks=list(state.tasks).filter(row=>!ownedIds.has(sid(row.id))).map(clone),usedIds=new Set([...nextTasks,...tasks,...history.flatMap(row=>list(row.tasks))].map(row=>sid(row.id))),mapping=new Map(),newRecurringIds=new Set(),carriedIds=new Set();
 let generatedId=Date.now();const makeId=newId||(()=>{while(usedIds.has(sid(generatedId)))generatedId++;return generatedId++;});
 for(const task of owned.filter(row=>!recurrenceRule(state,row)&&(row.isRecurring||list(row.recurrenceDays).length))){
  const existing=nextTasks.find(row=>row.recurrenceGroupId&&row.recurrenceGroupId===task.recurrenceGroupId&&row.day===task.day&&taskWeek(row,state)===target);
  if(existing){mapping.set(sid(task.id),existing.id);continue;}
  let id=makeId();if(!Number.isFinite(id)||usedIds.has(sid(id)))throw Error('Não foi possível gerar um identificador de missão. Tente novamente.');usedIds.add(sid(id));mapping.set(sid(task.id),id);newRecurringIds.add(sid(id));
  const copy={...clone(task),id,planningWeekStart:target,completed:false,workflowStatus:'planned',skipped:false,subtasks:list(task.subtasks).map(clone).map(row=>({...row,completed:false})),createdAt:now};
  for(const key of Object.keys(copy))if(key.startsWith('rewarded')||key==='aiV2ProposalId'||key==='aiProposalId')delete copy[key];
  delete copy.meetingOutcome;delete copy.completedAt;copy.campaignId=state.prestige?.campaign||1;nextTasks.push(copy);
 }
 // Controlled rules generate only eligible dates, including partial weeks and one-day series.
 const nextState={...state,tasks:nextTasks,currentPlanningWeekStart:target};
 for(const groupId of Object.keys(state.planning?.recurrenceRules||{})){
  const before=new Set(nextTasks.map(t=>sid(t.id)));
  reconcileRecurrenceWeek(nextState,groupId,target,{now,sources:[...nextTasks,...owned],makeId:()=>{const id=makeId();if(!Number.isFinite(id)||usedIds.has(sid(id)))throw Error('Não foi possível gerar um identificador de missão. Tente novamente.');usedIds.add(sid(id));return id;}});
  for(const t of nextTasks.filter(t=>!before.has(sid(t.id))))newRecurringIds.add(sid(t.id));
  for(const old of owned.filter(t=>String(t.recurrenceGroupId)===String(groupId))){const next=nextTasks.find(t=>String(t.recurrenceGroupId)===String(groupId)&&t.day===old.day&&!t.recurrenceCancelled&&taskWeek(t,nextState)===target);if(next)mapping.set(sid(old.id),next.id);}
 }
 if(nextTasks.filter(t=>taskWeek(t,nextState)===target).length>PLANNING_LIMITS.weekItems)throw Error('A próxima semana excede 500 itens. Revise as repetições antes de fechar.');
 let carried=0;
 for(const task of owned.filter(row=>!row.recurrenceCancelled&&!row.isRecurring&&!list(row.recurrenceDays).length&&!row.completed&&!cancelled(row))){
  const copy={...clone(task),planningWeekStart:target,startTime:'',endTime:'',carryover:{firstWeek:task.carryover?.firstWeek||week,lastWeek:week,count:(task.carryover?.count||0)+1}};nextTasks.push(copy);carriedIds.add(sid(copy.id));carried++;
 }
 const entering=nextTasks.filter(row=>taskWeek(row,state)===target);
 for(const task of entering){
  if(newRecurringIds.has(sid(task.id))||carriedIds.has(sid(task.id)))task.dependsOnTaskIds=list(task.dependsOnTaskIds).map(id=>mapping.has(sid(id))&&(newRecurringIds.has(sid(task.id))||!findPlanningTask(state,id)?.completed)?sid(mapping.get(sid(id))):sid(id));
  const receipts=new Map(list(task.dependencyReceipts).map(row=>[sid(row.id),row]));
  for(const id of list(task.dependsOnTaskIds)){const dependency=findPlanningTask(state,id);if(dependency?.completed)receipts.set(sid(id),{id:sid(id),text:dependency.text,completed:true});}
  task.dependencyReceipts=[...receipts.values()].filter(row=>list(task.dependsOnTaskIds).some(id=>sid(id)===sid(row.id))).slice(0,PLANNING_LIMITS.dependencies);
 }
 const nextBlocks=clone(blocks).map(block=>{if(block.status!=='cancelled')block.status='planned';for(const key of ['linkedSessionId','completedAt','partialAt','remarkedAt','lastActionAt'])delete block[key];for(const key of Object.keys(block))if(key.startsWith('rewarded'))delete block[key];return block;});
 return {week,target,carried,recurring:newRecurringIds.size,removedWeeks,history:kept,tasks:nextTasks,studyBlocks:nextBlocks};
}
export function applyWeekTransition(state,transition){
 if(state.currentPlanningWeekStart!==transition.week)throw Error('A semana mudou. Revise o fechamento novamente.');
 state.tasks=transition.tasks;state.planning={...state.planning,history:transition.history,lastClosedWeek:transition.week};
 if(state.studyData?.studyPlan)state.studyData.studyPlan.weeklyBlocks=transition.studyBlocks;
 state.currentPlanningWeekStart=transition.target;state.focusedTaskId=null;state.focusMode=false;state.activeTab='monday';state.currentFilter='all';return state;
}
