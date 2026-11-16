import test from 'node:test';
import assert from 'node:assert/strict';
import {boot,plain} from './test-support/app_boot.mjs';

function fixture(){
    const b=boot();b.state.currentPlanningWeekStart='2026-11-02';b.state.activeTab='sunday';
    b.state.currentFilter='work';b.state.focusedTaskId=1;
    b.state.tasks=[{id:1,text:'Entrega concluída',day:'monday',planningWeekStart:'2026-11-02',category:'work',completed:true,time:'30 min',subtasks:[{id:11,text:'Preservar',completed:true}]},
        {id:2,text:'Entrega da próxima semana',day:'monday',planningWeekStart:'2026-11-09',category:'work',completed:false,time:'45 min',dependsOnTaskIds:[],subtasks:[{id:12,text:'Primeiro passo',completed:true}]}];
    b.window.getPlanningToday=()=> '2026-11-08';
    return b;
}
test('planejar domingo, avançar e abrir segunda usa uma renderização e não escreve dados nem encerra semana',()=>{
    const b=fixture(),before=plain(b.state);let writes=0,renders=0,markup='';
    b.window.saveState=()=>writes++;
    Object.defineProperty(b.elements.app,'innerHTML',{get:()=>markup,set:value=>{markup=value;renders++;},configurable:true});
    b.window.setMainView('week');b.window.setPlanningCalendarWeek('forward');
    assert.equal(b.state.currentPlanningWeekStart,'2026-11-09');
    renders=0;b.window.openPlanningDay('monday');assert.equal(renders,1);
    assert.equal(b.ui.mainView,'day');assert.equal(b.state.activeTab,'monday');
    assert.match(markup,/Segunda, 09\/11\/2026/);assert.match(markup,/Entrega da próxima semana/);assert.doesNotMatch(markup,/Entrega concluída/);
    const after=plain(b.state);after.currentPlanningWeekStart=before.currentPlanningWeekStart;after.activeTab=before.activeTab;
    assert.deepEqual(after,before);assert.equal(writes,0);
    b.window.openPlanningDay('next_week');assert.equal(renders,1);
});
test('voltar à Semana recupera expansão e posição sem alterar o filtro da categoria',()=>{
    const b=fixture(),scroll=[];b.window.scrollY=380;b.window.scrollTo=p=>{scroll.push(p);b.window.scrollY=p.top;};
    b.ui.mainView='week';b.ui.weeklyExpandedSections['2026-11-02:sunday']=true;
    b.window.openPlanningDay('sunday');assert.equal(scroll.at(-1).top,0);
    b.window.setMainView('week');assert.equal(scroll.at(-1).top,380);
    assert.equal(b.ui.weeklyExpandedSections['2026-11-02:sunday'],true);assert.equal(b.state.currentFilter,'work');
});
test('dia mostra ano e datas de todos os sete dias, com estado selecionado explícito',()=>{
    const b=fixture();b.state.currentPlanningWeekStart='2026-11-09';b.window.openPlanningDay('wednesday');
    const html=b.window.renderPlanningDayTabs();assert.equal((html.match(/<button /g)||[]).length,7);
    assert.match(html,/aria-label="Segunda, 09\/11\/2026"/);assert.match(html,/aria-label="Domingo, 15\/11\/2026"/);
    assert.match(html,/aria-label="Quarta, 11\/11\/2026" aria-pressed="true"/);
    assert.match(b.elements.app.innerHTML,/Quarta, 11\/11\/2026/);
});
test('Agenda sem pendências fica recolhida após os sete dias, com conexões e ações preservadas',()=>{
    const b=fixture();b.window.calendarSync.view=()=>({enabled:true,connected:true,status:'Sincronizado'});
    b.window.setMainView('week');const html=b.elements.app.innerHTML;
    assert.ok(html.indexOf('aria-label="Planejamento por dia"')<html.indexOf('id="planning-calendar"'));
    assert.match(html,/<details data-state-key="[^"]+" ontoggle="[^"]+" >/);
    for(const text of ['Google Agenda','Sincronizado','Sincronizar tudo','Pausar','calendar-inbox-panel'])assert.ok(html.includes(text));
    assert.equal((html.match(/id="planning-calendar"/g)||[]).length,1);
});
test('pendência ou erro da Agenda abre painel entre resumo e dias e conserva a decisão manual',()=>{
    const b=fixture(),week=b.state.currentPlanningWeekStart;
    b.window.calendarSync.view=()=>({enabled:true,connected:true,status:'Sincronizado'});
    b.state.calendarInboxItems=[{id:'evt',weekStart:week,status:'pending',summary:'Compromisso fictício',eventDate:'2026-11-04',day:'wednesday'}];
    b.window.setMainView('week');let html=b.elements.app.innerHTML;
    assert.ok(html.indexOf('weekly-planning-title')<html.indexOf('id="planning-calendar"'));
    assert.ok(html.indexOf('id="planning-calendar"')<html.indexOf('aria-label="Planejamento por dia"'));
    assert.match(html,/1 para classificar/);assert.match(html,/<details data-state-key="[^"]+" ontoggle="[^"]+" open>/);
    const before=plain(b.state);b.window.openCalendarInboxItem('evt');assert.equal(b.ui.showCreateTaskModal,true);assert.deepEqual(plain(b.state),before);
    b.window.calendarSync.view=()=>({enabled:true,connected:false,error:'<Falha de teste>',status:'Reconectar'});
    html=b.window.renderPlanningCalendar('attention');assert.match(html,/&lt;Falha de teste&gt;/);assert.match(html,/Reconectar/);
    assert.equal(b.window.renderPlanningCalendar('quiet'),'');
});
test('atualizar a Agenda reconstrói só o painel e mantém rascunho do editor',()=>{
    const b=fixture();b.ui.showOperationalDemandModal=true;b.ui.operationalDemandDraft={fields:[{id:'op-demand-title',value:'Rascunho'}]};
    b.elements['planning-calendar']={outerHTML:''};const original=b.elements.app.innerHTML,draft=plain(b.ui.operationalDemandDraft);
    b.window.calendarSync.view=()=>({enabled:true,connected:false,error:'Sem conexão',status:'Reconectar'});
    b.c.calendarOnChange();assert.equal(b.elements.app.innerHTML,original);
    assert.match(b.elements['planning-calendar'].outerHTML,/Sem conexão/);assert.deepEqual(plain(b.ui.operationalDemandDraft),draft);assert.equal(b.ui.showOperationalDemandModal,true);
});
test('follow-ups têm uma linha por demanda, todas as datas e acesso ao RADAR sem repetir controles de cadastro',()=>{
    const b=fixture();b.state.operationalControl.demands=[{id:'aguarda',title:'Documento esperado',workflowStatus:'waiting',waitingFor:'Fornecedor',followUpAt:'2026-11-03',nextReviewAt:'2026-11-05',dueDate:'2026-11-06'},
        {id:'ativa',title:'Frente sem ação',workflowStatus:'active',nextAction:'Preparar entrega'}];
    const before=plain(b.state),html=b.window.renderRadarWeek();
    assert.equal((html.match(/data-radar-week-id="aguarda"/g)||[]).length,1);assert.equal((html.match(/data-radar-week-id="ativa"/g)||[]).length,1);
    for(const date of ['03/11/2026','05/11/2026','06/11/2026'])assert.ok(html.includes(date));
    assert.match(html,/Aguardando Fornecedor/);assert.match(html,/RADARs ativos sem missão executável \(1\)/);
    assert.doesNotMatch(html,/Criar missão|Vincular missão existente|Missões vinculadas · 0/);assert.match(html,/Abrir demanda/);assert.deepEqual(plain(b.state),before);
});
test('abrir demanda pelo Dia mostra leitura, não edição, e retorna à data, filtro e posição originais',()=>{
    const b=fixture();b.state.activeTab='wednesday';b.ui.mainView='day';b.window.scrollY=270;
    b.state.operationalControl.demands=[{id:'r',title:'Demanda fictícia',workflowStatus:'waiting',waitingFor:'Pessoa'}];
    const before=plain(b.state);let shown,scrolled;
    b.window.showRadarDetails=id=>shown=id;b.window.scrollTo=p=>scrolled=p;
    b.window.openPlanningRadarDemand('r');assert.equal(shown,'r');assert.equal(b.ui.mainView,'control');
    assert.equal(b.ui.showOperationalDemandModal,false);assert.match(b.window.renderOperationalControl(),/Voltar ao dia de 04\/11\/2026/);
    b.window.returnToPlanning();assert.equal(b.ui.mainView,'day');assert.equal(b.state.activeTab,'wednesday');assert.equal(scrolled.top,270);assert.deepEqual(plain(b.state),before);
});
test('contexto de outra conta não pode restaurar a semana e navegação manual dispensa o retorno',()=>{
    const b=fixture();b.ui.planningReturn={state:{},week:'2099-01-05',view:'day'};
    const before=plain(b.state);b.window.returnToPlanning();assert.deepEqual(plain(b.state),before);
    assert.doesNotMatch(b.window.renderOperationalControl(),/Você abriu esta demanda/);
    b.window.setMainView('week');assert.equal(b.ui.planningReturn,null);
});
test('carga prevista usa a mesma regra para missões, estudos e leituras concluídos e exclui reunião não realizada',()=>{
    const b=fixture();b.state.currentPlanningWeekStart='2026-11-09';b.state.tasks=[{id:1,day:'monday',planningWeekStart:'2026-11-09',text:'Entrega concluída',category:'work',completed:true,time:'30 min'},
        {id:3,day:'monday',planningWeekStart:'2026-11-09',text:'Reunião não realizada',category:'work',activityType:'meeting',meetingOutcome:'not_held',completed:false,time:'60 min'}];
    b.state.studyData.studyPlan.weeklyBlocks=[{id:'s',day:'monday',title:'Estudo concluído',plannedMinutes:60,status:'completed'}];
    b.window.getLibraryOccurrences=date=>date==='2026-11-09'?[{id:'l',status:'completed',plannedMinutes:20}]:[];
    b.window.renderLibraryOccurrence=()=>'<p>Leitura concluída</p>';b.window.getPlanningPreview=()=>null;
    const before=plain(b.state),html=b.window.renderWeeklyPlanningOverview();
    assert.match(html,/110 min previstos/);assert.match(html,/1h 50min de carga prevista/);assert.match(html,/Reunião não realizada/);assert.deepEqual(plain(b.state),before);
});
test('mais de duas demandas do Dia continuam consultáveis sem ir para outra tela',()=>{
    const b=fixture();b.state.operationalControl.demands=Array.from({length:4},(_,i)=>({id:'r'+i,title:'Alerta '+i,workflowStatus:'waiting',waitingFor:'Pessoa',attentionLevel:'immediate'}));
    const html=b.window.renderOperationalDayPanel();assert.match(html,/Mais 2 demandas com avisos neste dia/);
    for(let i=0;i<4;i++)assert.equal((html.match(new RegExp('data-radar-day-id="r'+i+'"','g'))||[]).length,1);
});
test('gerenciar categorias pelo filtro abre o cadastro sem alterar categoria ou dados',()=>{
    const b=fixture(),before=plain(b.state);b.elements['daily-category-filter']={value:'__manage__'};
    b.window.selectDailyCategory('__manage__');assert.equal(b.ui.showCategoryModal,true);assert.equal(b.elements['daily-category-filter'].value,'work');assert.deepEqual(plain(b.state),before);
});
