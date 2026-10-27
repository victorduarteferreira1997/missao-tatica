import {planMissionSchedule,formatMissionDate} from '../mission_schedule.v1.js';
import {occurrenceDate,hasRecurrence} from '../recurrence.v1.js?v=1.9.66.1';
export function installMissionScheduling(window,{document,getState,getUiState,render,move,saveConfirmed}){
 let draft=null;
 window.resetMissionScheduling=()=>{draft=null;};
 window.isMissionScheduleOpen=()=>Boolean(draft);
 window.openMissionReschedule=id=>{
  const state=getState(),task=state.tasks.find(row=>String(row.id)===String(id));if(!task)return;
  if(task.completed||hasRecurrence(task)||task.googleCalendarSource==='primary'){window.showAlertModal('Use a edição da repetição ou o Google Agenda. Missões concluídas mantêm sua data.');return;}
  window.closeMissionMenus?.();draft={id:task.id,date:occurrenceDate(task,state),signature:JSON.stringify(task),state,busy:false,error:'',needsSave:false};render();
 };
 window.closeMissionReschedule=()=>{if(!draft?.busy){draft=null;render();}};
 window.editMissionReschedule=date=>{if(draft&&!draft.busy&&!draft.needsSave){draft.date=date;draft.error='';const feedback=document.getElementById('reschedule-feedback');if(feedback)feedback.textContent='';}};
 window.confirmMissionReschedule=async()=>{
  if(!draft||draft.busy)return;const current=draft,state=getState(),task=state.tasks.find(row=>String(row.id)===String(current.id));
  try{
   if(state!==current.state||!task||JSON.stringify(task)!==current.signature)throw Error('A missão mudou. Feche e abra o reagendamento novamente.');
   planMissionSchedule(state,task,current.date);
   current.busy=true;current.error='';render();
   if(!current.needsSave){const changed=move(task,current.date);current.signature=JSON.stringify(task);current.needsSave=changed;}
   const saved=await saveConfirmed();if(draft!==current||getState()!==state)return;
   if(!saved){current.error='A alteração está neste dispositivo, mas ainda não foi confirmada na nuvem. Confira a conexão e tente salvar novamente.';return;}
   draft=null;window.showToast('Missão reagendada',formatMissionDate(current.date)+' · Salva na nuvem. Frenesi preservado.','calendar-days','text-cyan-300');
  }catch(error){if(draft===current)current.error=error.message;}
  finally{if(draft===current)current.busy=false;render();}
 };
 window.renderMissionReschedule=()=>{
  if(!draft)return '';const task=getState().tasks.find(row=>String(row.id)===String(draft.id)),e=window.escapeHtml,disabled=draft.busy?'disabled':'';
  return window.renderFormDialog({id:'mission-reschedule-dialog',titleId:'reschedule-title',title:'Reagendar missão',description:task?.text||'Missão',closeLabel:'Fechar reagendamento',closeHandler:'closeMissionReschedule',submitHandler:'confirmMissionReschedule',layer:'z-[90]',body:`<label for="reschedule-date" class="${window.formDialogStyles.label}">Data de destino<input id="reschedule-date" type="date" value="${e(draft.date)}" ${draft.busy||draft.needsSave?'disabled':''} oninput="window.editMissionReschedule(this.value)" class="${window.formDialogStyles.field}"></label><p id="reschedule-feedback" role="status" aria-live="polite" class="text-sm text-amber-200">${e(draft.busy?'Salvando…':draft.error)}</p>`,footer:`<div class="flex justify-end gap-2"><button type="button" ${disabled} onclick="window.closeMissionReschedule()" class="min-h-11 rounded-lg px-4 text-sm text-slate-300">Cancelar</button><button type="submit" ${disabled} class="min-h-11 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white disabled:opacity-60">${draft.busy?'Salvando…':draft.needsSave?'Tentar salvar novamente':'Salvar'}</button></div>`}).replace('aria-label="Fechar reagendamento"','id="reschedule-close" aria-label="Fechar reagendamento"');
 };
 window.bindMissionReschedule=root=>{if(draft)window.bindFormDialog(root,{id:'mission-reschedule-dialog',initialFocus:draft.busy?'reschedule-close':'reschedule-date',close:window.closeMissionReschedule,blocked:getUiState().confirm.show||getUiState().alert.show});};
}
