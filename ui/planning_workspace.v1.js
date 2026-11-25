import {radarWeek,shortDate,radarStatus,validDate} from '../radar_missions.v2.js';

// Presentation and navigation only. All dates, records and actions keep their
// existing domain handlers; navigating never closes a week or creates a mission.
export function installPlanningWorkspace(window,{document,calendarSync,getState,getUiState,render,daysOfWeek}) {
    const e=value=>window.escapeHtml(String(value??''));
    const arg=value=>e(JSON.stringify(String(value)));
    const positionKey=()=>`${getState().currentPlanningWeekStart}:${getUiState().mainView}`;
    const rememberPosition=()=>{
        const ui=getUiState();ui.planningPositions ||= {};
        ui.planningPositions[positionKey()]={left:window.scrollX||0,top:window.scrollY||0};
    };
    const restorePosition=()=>window.scrollTo?.({...getUiState().planningPositions?.[positionKey()]||{left:0,top:0},behavior:'instant'});
    const setMainView=window.setMainView;
    window.setMainView=view=>{
        rememberPosition();getUiState().planningReturn=null;
        setMainView(view);restorePosition();
    };
    const setWeek=window.setPlanningCalendarWeek;
    window.setPlanningCalendarWeek=direction=>{rememberPosition();setWeek(direction);restorePosition();};
    window.openPlanningDay=day=>{
        if(!daysOfWeek.some(d=>d.id===day))return;
        rememberPosition();
        getState().activeTab=day;getUiState().mainView='day';getUiState().planningReturn=null;
        render();restorePosition();
        document.getElementById('planning-day-heading')?.focus({preventScroll:true});
    };
    window.openPlanningRadarDemand=id=>{
        if(!(getState().operationalControl?.demands||[]).some(d=>String(d.id)===String(id)))return;
        const ui=getUiState(),state=getState();rememberPosition();
        ui.planningReturn={state,week:state.currentPlanningWeekStart,day:state.activeTab,date:window.getOperationalDayDateKey(state.activeTab),view:ui.mainView,focusId:document.activeElement?.id};
        ui.radarWorkspace={...ui.radarWorkspace,filter:'all',query:''};
        ui.mainView='control';render();
        window.showRadarDetails?.(id);
    };
    window.returnToPlanning=()=>{
        const ui=getUiState(),back=ui.planningReturn;
        if(!back||back.state!==getState())return;
        getState().currentPlanningWeekStart=back.week;getState().activeTab=back.day;
        ui.mainView=back.view;ui.planningReturn=null;
        render();restorePosition();
        const origin=document.getElementById(back.focusId)||(document.getElementById(back.view==='week'?'weekly-planning-title':'planning-day-heading'));
        origin?.focus({preventScroll:true});
    };
    const renderControl=window.renderOperationalControl;
    window.renderOperationalControl=()=>{
        const back=getUiState().planningReturn;
        return `${back?.state===getState()?`<div class="planning-return"><button type="button" class="planning-button" onclick="window.returnToPlanning()"><i data-lucide="arrow-left" aria-hidden="true"></i>Voltar ${back.view==='week'?'à semana':'ao dia'} de ${e(shortDate(back.view==='week'?back.week:back.date))}</button><span>Você abriu esta demanda pelo planejamento.</span></div>`:''}${renderControl()}`;
    };

    window.selectDailyCategory=value=>{
        if(value==='__manage__'){
            const field=document.getElementById('daily-category-filter');
            if(field)field.value=getState().currentFilter||'all';
            window.toggleCategoryModal();return;
        }
        window.setCategoryFilter(value);
    };
    window.renderPlanningDayTabs=()=>`<div id="planning-day-tabs" role="group" aria-label="Dias da semana selecionada" class="day-tabs">${daysOfWeek.map(day=>{
        const date=window.getOperationalDayDateKey(day.id),isToday=date===window.getPlanningToday();
        return `<button type="button" ${isToday?'aria-current="date"':''} aria-label="${e(day.label)}, ${e(shortDate(date))}" aria-pressed="${getState().activeTab===day.id}" onclick="window.setTab('${day.id}')"><span>${e(day.label.slice(0,3))}</span><span class="day-date">${e(shortDate(date).slice(0,5))}</span>${isToday?'<span class="day-today">Hoje</span>':''}</button>`;
    }).join('')}</div>`;
    window.renderDailyCategoryBar=()=>{
        const categories=[{id:'all',label:'Todas as categorias'},...window.getTaskCategories()];
        return `<div class="planning-category"><label for="daily-category-filter">Categoria</label><select id="daily-category-filter" onchange="window.selectDailyCategory(this.value)">${categories.map(c=>`<option value="${e(c.id)}" ${getState().currentFilter===c.id?'selected':''}>${e(c.label)}</option>`).join('')}<option disabled>──────────</option><option value="__manage__">Gerenciar categorias…</option></select></div>`;
    };

    const calendarAttention=()=>{
        const c=calendarSync.view();
        return Boolean(c.error || c.connecting || (c.enabled&&!c.connected) || calendarSync.getInbox().length);
    };
    const calendarKey=()=>JSON.stringify([getState().currentPlanningWeekStart,calendarSync.view().error||'',Boolean(calendarSync.view().enabled&&!calendarSync.view().connected),calendarSync.getInbox().map(item=>item.id).sort()]);
    window.setPlanningCalendarOpen=(key,open)=>{
        const ui=getUiState();ui.planningCalendarOpen ||= {};ui.planningCalendarOpen[key]=Boolean(open);
    };
    window.renderPlanningCalendar=placement=>{
        const attention=calendarAttention();
        if(placement==='attention'&&!attention || placement==='quiet'&&attention)return '';
        const c=calendarSync.view(),pending=calendarSync.getInbox().length,key=calendarKey();
        const open=getUiState().planningCalendarOpen?.[key]??attention;
        const status=c.connecting?c.status:c.busy?'Sincronizando…':c.status||'Não conectada';
        return `<section id="planning-calendar" class="planning-calendar${attention?' needs-attention':''}" aria-label="Google Agenda"><details data-state-key="${e(key)}" ontoggle="window.setPlanningCalendarOpen(this.dataset.stateKey,this.open)" ${open?'open':''}><summary><span><i data-lucide="calendar-sync" aria-hidden="true"></i><strong>Google Agenda</strong><span>${e(status)}</span>${pending?`<span class="planning-calendar-count">${pending} para classificar</span>`:''}</span></summary><div class="planning-calendar-body">${window.renderCalendarSyncPanel()}${window.renderCalendarInboxPanel()}</div></details></section>`;
    };
    window.refreshPlanningCalendar=()=>{
        const panel=document.getElementById('planning-calendar');
        if(!panel)return false;
        // Move a newly arrived error/inbox above the day list without rendering
        // the app or discarding open editors, category filters and week sections.
        const attention=calendarAttention(),html=window.renderPlanningCalendar();
        panel.outerHTML=html;
        const next=document.getElementById('planning-calendar'),days=document.querySelector('#weekly-workspace > section[aria-label="Planejamento por dia"]');
        if(next&&days){if(attention)days.before(next);else days.after(next);}
        return true;
    };

    const currentRadar=()=>radarWeek(getState(),getState().currentPlanningWeekStart,window.getPlanningToday());
    const renderRadarRow=row=>{
        const d=row.demand,context=String(getState().currentPlanningWeekStart),reason=row.reasons||[];
        return `<article data-radar-week-id="${e(d.id)}" class="planning-radar-row"><div><div class="planning-radar-row-heading"><h4>${e(d.title)}</h4><span>${e(radarStatus[d.workflowStatus]||radarStatus.active)}</span></div>${reason.length?`<ul class="planning-radar-dates">${reason.map(r=>`<li>${e(r.label)}</li>`).join('')}</ul>`:''}<p class="planning-radar-action">${e(d.nextAction||'Próxima ação ainda não definida.')}</p>${d.workflowStatus==='waiting'?`<p class="planning-radar-person">Aguardando ${e(d.waitingFor||'responsável não informado')}</p>`:''}${row.withoutMission?'<p class="planning-radar-missing">Sem missão executável nesta semana</p>':''}${row.missions?.length?`<p class="planning-radar-person">${row.missions.length} ${row.missions.length===1?'missão vinculada':'missões vinculadas'}</p>`:''}</div><button id="planning-radar-open-${encodeURIComponent(context+'-'+String(d.id))}" type="button" class="planning-button" onclick="window.openPlanningRadarDemand(${arg(d.id)})">Abrir demanda</button></article>`;
    };
    window.renderRadarWeekShortcut=()=>'';
    window.renderRadarDailySummary=()=>'';
    window.renderRadarWeek=()=>{
        const {followups,withoutMission}=currentRadar(),ids=new Set(followups.map(row=>String(row.demand.id)));
        const other=withoutMission.filter(row=>!ids.has(String(row.demand.id)));
        const groups=new Map();
        for(const row of followups){
            const dates=(row.reasons||[]).map(r=>r.date||r.dateKey).filter(validDate).sort();
            const key=dates[0]||window.getPlanningToday();
            if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);
        }
        return `<section id="radar-week-followups" class="planning-radar-week" aria-labelledby="planning-radar-heading" tabindex="-1"><div class="planning-section-heading"><div><h2 id="planning-radar-heading">Follow-ups do RADAR</h2><p>Prazos, revisões e retornos desta semana, mesmo sem missão vinculada.</p></div><span>${followups.length} ${followups.length===1?'demanda':'demandas'}</span></div>${[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([date,rows])=>`<div class="planning-radar-date-group"><h3>${date<getState().currentPlanningWeekStart?'Pendências anteriores · ':''}${e(shortDate(date))}</h3>${rows.map(renderRadarRow).join('')}</div>`).join('')||'<p class="planning-empty-note">Nenhum acompanhamento previsto nesta semana.</p>'}${withoutMission.length?`<details data-week-section="${e(getState().currentPlanningWeekStart)}:radar-without-mission" class="planning-radar-review"><summary>RADARs ativos sem missão executável (${withoutMission.length})</summary><p>Revise a próxima ação destas frentes. Aguardando e Para depois podem continuar sem missão.</p>${other.length?other.map(renderRadarRow).join(''):'<p>As demandas desta revisão já aparecem acima, sinalizadas nos próprios itens.</p>'}</details>`:''}</section>`;
    };
    window.openPlanningRadarWeek=()=>{
        window.setMainView('week');window.scrollToRadarWeek();
    };
    window.scrollToRadarWeek=()=>{
        const target=document.getElementById('radar-week-followups');
        target?.focus({preventScroll:true});target?.scrollIntoView({behavior:'auto',block:'start'});
    };

    // Keep today's signals visible; replace the second separate weekly warning
    // with a single quiet shortcut inside the same daily support section.
    const renderDayRadar=window.renderOperationalDayPanel;
    window.renderOperationalDayPanel=()=>{
        const count=currentRadar().withoutMission.length;
        return `<section class="planning-day-radar" aria-label="Acompanhamentos do RADAR">${renderDayRadar()}${count?`<button type="button" class="planning-radar-review-link" onclick="window.openPlanningRadarWeek()">${count} ${count===1?'frente ativa sem missão':'frentes ativas sem missão'} na semana · Revisar no planejamento</button>`:''}</section>`;
    };
}
