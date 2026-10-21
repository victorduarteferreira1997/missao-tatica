import * as R from '../recurrence.v1.js';
export function installRecurrence(window,{document,getState,getUiState,render,save,now=()=>new Date().toISOString()}) {
    const today=()=>R.recurrenceToday(now()),labels=['segunda','terça','quarta','quinta','sexta','sábado','domingo'];
    window.getMissionRecurrenceSummary=task=>R.recurrenceSummary(getState(),task,labels);
    window.getMissionRecurrenceRule=task=>R.recurrenceRule(getState(),task);
    window.renderRecurrenceEndFields=(prefix,task=null)=>{
        const rule=task?R.recurrenceRule(getState(),task):null,stopped=Boolean(rule?.stoppedAfter),date=rule?.endDate||'';
        const cancelled=task?getState().tasks.filter(t=>String(t.recurrenceGroupId)===String(task.recurrenceGroupId)&&t.recurrenceCancelled):[];
        const e=window.escapeHtml,field=window.formDialogStyles.fieldMinWidth||window.formDialogStyles.field;
        return `${stopped?`<p class="text-sm text-slate-300">${e(window.getMissionRecurrenceSummary(task))}. Para começar outra série, cadastre uma nova missão.</p>`:`<div class="grid grid-cols-1 sm:grid-cols-2 gap-3"><label class="block text-sm text-slate-300" for="${prefix}-repeat-end-mode">Término da repetição<select id="${prefix}-repeat-end-mode" onchange="window.updateRecurrenceEndFields('${prefix}')" class="${field}"><option value="none" ${!date?'selected':''}>Sem data final</option><option value="date" ${date?'selected':''}>Até uma data</option></select></label><label id="${prefix}-repeat-end-wrap" for="${prefix}-repeat-end-date" class="block text-sm text-slate-300 ${date?'':'hidden'}">Repetir até (inclusive)<input id="${prefix}-repeat-end-date" type="date" value="${e(date)}" class="${field}"></label></div><p class="text-xs text-slate-400">Depois da data final, nenhuma nova ocorrência será criada. Isso não encerra um RADAR vinculado.</p>`}
        ${task&&R.hasRecurrence(task)?`<p class="text-xs text-slate-400">As alterações da série valem a partir de ${e(R.recurrenceCutoff(getState(),task,today()).split('-').reverse().join('/'))}. Ocorrências anteriores, concluídas ou já iniciadas são preservadas.</p>${!stopped?`<button type="button" onclick="window.endMissionRecurrence(${e(JSON.stringify(String(task.id)))})" class="min-h-11 rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">Encerrar repetição…</button>`:''}`:''}${cancelled.length?`<details class="border-t border-slate-700 pt-3"><summary class="min-h-11 cursor-pointer text-sm text-slate-400">Ocorrências canceladas preservadas (${cancelled.length})</summary><div class="space-y-2 py-2 text-xs text-slate-400">${cancelled.map(t=>`<p>${e(R.occurrenceDate(t,getState()).split('-').reverse().join('/'))} · ${e(t.text)}</p>`).join('')}</div></details>`:''}`;
    };
    window.updateRecurrenceEndFields=prefix=>{
        const mode=document.getElementById(prefix+'-repeat-end-mode')?.value;
        document.getElementById(prefix+'-repeat-end-wrap')?.classList.toggle('hidden',mode!=='date');
    };
    window.readRecurrenceEndDate=(prefix,days,from)=>{
        if(!days.length)return '';
        const mode=document.getElementById(prefix+'-repeat-end-mode')?.value;
        if(mode!=='date')return '';
        const value=document.getElementById(prefix+'-repeat-end-date')?.value||'';
        if(!R.validRecurrenceDate(value)||value<from){window.showAlertModal('Informe uma data final válida, igual ou posterior ao início das próximas ocorrências.');return null;}
        if(!R.RECURRENCE_DAYS.some((day,i)=>days.includes(day)&&Array.from({length:7},(_,n)=>R.addRecurrenceDays(from,n)).some(date=>date<=value&&new Date(date+'T12:00:00Z').getUTCDay()===(i+1)%7))){window.showAlertModal('Não há nenhum dia selecionado até a data final. Ajuste os dias ou a data.');return null;}
        return value;
    };
    window.endMissionRecurrence=id=>{
        const state=getState(),task=state.tasks.find(t=>String(t.id)===String(id));
        if(!task||!R.hasRecurrence(task)||task.googleCalendarSource==='primary')return;
        if(window.isPlanningTransitionBlocked?.())return;
        const signature=JSON.stringify(state),date=today(),dependents=state.tasks.filter(t=>!t.completed&&(t.dependsOnTaskIds||[]).some(d=>state.tasks.some(x=>String(x.id)===String(d)&&x.recurrenceGroupId===task.recurrenceGroupId&&!x.completed&&R.occurrenceDate(x,state)>date))).length;
        window.showConfirmModal('Encerrar esta repetição após hoje ('+date.split('-').reverse().join('/')+')?\n\nMissões de hoje, anteriores, concluídas ou já iniciadas serão preservadas. As futuras ainda não iniciadas serão canceladas. O RADAR, o XP, as moedas e o combo não mudam.'+(dependents?'\n\nHá '+dependents+' missão(ões) com pré-requisitos nesta série. Os vínculos serão preservados; revise os bloqueios.':''),()=>{
            if(getState()!==state||JSON.stringify(state)!==signature){window.showAlertModal('Os dados mudaram. Abra a edição novamente antes de encerrar a repetição.');return;}
            if(window.isPlanningTransitionBlocked?.())return;
            const staged=JSON.parse(JSON.stringify(state));
            try { R.stopRecurrence(staged,task,date,now()); R.reconcileKnownRecurrenceWeeks(staged,task.recurrenceGroupId,{now:now(),today:date}); } catch(error){window.showAlertModal(error.message);return;}
            state.tasks=staged.tasks;state.planning=staged.planning;
            getUiState().editTaskDraft=null;
            save();window.showToast('Repetição encerrada','Histórico e missões já iniciadas preservados.','repeat','text-slate-300');
        });
    };
}
