// Session-only feedback. Retrying writes the current state through the existing
// confirmed writer; it never replays task creation, recurrence or date changes.
export function installMissionFeedback(window,{document,getState,getUser,getUiState=()=>({}),render}) {
    let notice=null,sequence=0,submitted=new WeakMap();
    const fieldErrors=new Map();
    const e=value=>window.escapeHtml(String(value??''));
    const current=()=>notice&&notice.state===getState()&&notice.user===getUser()?notice:null;
    window.resetMissionFeedback=()=>{notice=null;sequence++;submitted=new WeakMap();fieldErrors.clear();};
    const signature=prefix=>JSON.stringify([getUiState().calendarInboxEventId,['text','date','day','time','nature','priority','complexity','impact-type','category','subtasks','start-time','end-time','repeat-end-mode','repeat-end-date',...['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(d=>'repeat-'+d)].map(field=>{const el=document.getElementById(prefix+'-'+field);return [el?.value,el?.checked];})]);
    window.missionFormAlreadySubmitted=prefix=>{const input=document.getElementById(`${prefix}-text`);return Boolean(input&&submitted.get(input)===signature(prefix));};
    window.markMissionFormSubmitted=prefix=>{const input=document.getElementById(`${prefix}-text`);if(input)submitted.set(input,signature(prefix));};
    window.renderMissionSaveFeedback=(place='page')=>{
        const n=current();
        const status=n?.status||'idle';
        const message=!n?'':status==='pending'?'Salvando na nuvem…':status==='saved'?'Salvo na nuvem.':'Salvamento não confirmado. Confira a conexão e tente novamente.';
        return `<div data-mission-save-feedback="${e(place)}" class="mission-save-feedback" ${n?'':'hidden'}>${n?`<div class="mission-save-message" tabindex="-1" role="status" aria-live="polite" aria-atomic="true"><strong>${e(message)}</strong><p>${e(n.label)}</p></div>${status==='failed'?'<button type="button" class="mission-feedback-button" onclick="window.retryMissionSave()">Tentar novamente</button>':''}${status==='saved'?'<button type="button" class="mission-feedback-dismiss" aria-label="Dispensar confirmação de salvamento" onclick="window.dismissMissionSaveFeedback()">Fechar</button>':''}`:''}</div>`;
    };
    const refresh=()=>{
        // No app render on network completion: preserves a newly opened form,
        // selection, keyboard focus and the next continuous-registration draft.
        for(const node of (document.querySelectorAll?.('[data-mission-save-feedback]')||[])){
            const template=document.createElement('template');template.innerHTML=window.renderMissionSaveFeedback(node.dataset.missionSaveFeedback);
            const focused=node.contains(document.activeElement),next=template.content.firstElementChild;
            node.replaceWith(next);
            if(focused){const target=next.querySelector('button')||next.querySelector('[role="status"]')||document.getElementById('ct-text')||document.getElementById('et-text')||document.getElementById('new-mission-button');target?.focus({preventScroll:true});}
        }
    };
    window.restoreMissionFormOrigin=id=>{
        const app=document.getElementById('app');
        if(app&&window.getTopFormDialog?.(app))return;
        const row=[...(document.querySelectorAll?.('[data-daily-mission-row]')||[])].find(row=>String(row.getAttribute('data-daily-mission-row'))===String(id));
        const trigger=row?.querySelector('summary[title="Mais ações"]');
        (trigger||document.getElementById('new-mission-button'))?.focus?.({preventScroll:true});
    };
    window.dismissMissionSaveFeedback=()=>{if(current()?.status==='saved'){notice=null;refresh();}};
    async function persist(n,initial=true){
        const token=++sequence;n.status='pending';
        let saving;try{saving=window.saveStateNow(true,n.reason);}catch{saving=Promise.resolve(false);}
        // The confirmed writer saves the local snapshot synchronously before
        // yielding. Only this first update changes the task list.
        if(initial){render();window.restoreMissionFormOrigin(n.returnTaskId);}else refresh();
        let saved=false;try{saved=await saving;}catch{}
        if(token!==sequence||current()!==n)return false;
        n.status=saved?'saved':'failed';refresh();return saved;
    }
    window.saveMissionWithFeedback=options=>{
        notice={...options,state:getState(),user:getUser(),status:'pending'};
        return persist(notice);
    };
    window.retryMissionSave=()=>{const n=current();if(!n||n.status!=='failed')return Promise.resolve(false);return persist(n,false);};

    window.showMissionFieldError=(prefix,field,message)=>{
        const input=document.getElementById(`${prefix}-${field}`),error=document.getElementById(`${prefix}-${field}-error`);
        if(!input||!error){window.showAlertModal(message);return false;}
        fieldErrors.set(input.id,{message,value:input.value});
        input.setAttribute('aria-invalid','true');error.textContent=message;error.hidden=false;
        for(let parent=input.closest?.('details');parent;parent=parent.parentElement?.closest('details'))parent.open=true;
        input.focus?.();input.scrollIntoView?.({block:'nearest'});return false;
    };
    window.missionFieldError=id=>{const error=fieldErrors.get(id);return error&&document.getElementById(id)?.value===error.value?error.message:'';};
    window.clearMissionFieldError=input=>{
        if(!input?.id)return;fieldErrors.delete(input.id);input.removeAttribute('aria-invalid');
        const error=document.getElementById(input.id+'-error');if(error)error.hidden=true;
    };
    window.validateMissionNumbers=prefix=>{
        for(const [field,min,max,label] of [['time',5,240,'duração'],['complexity',1,5,'dificuldade']]){
            if(field==='time'&&document.getElementById(`${prefix}-activity-type`)?.value==='meeting')continue;
            const input=document.getElementById(`${prefix}-${field}`);
            if(!input||input.disabled||input.readOnly)continue;
            const value=Number(input.value);
            if(!String(input.value??'').trim()||!Number.isInteger(value)||value<min||value>max)return window.showMissionFieldError(prefix,field,`Informe a ${label} entre ${min} e ${max}${field==='time'?' minutos':''}.`);
        }
        return true;
    };
}
