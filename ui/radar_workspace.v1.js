import {linkedTasks} from '../planning.v1.js';
import {operationalSignals} from '../radar_attention.v1.js';
import {validDate} from '../radar_missions.v2.js';

const filters = [['all','Todas'],['attention','Precisam de atenção'],['active','Ativas'],['waiting','Aguardando'],['backlog','Para depois']];
const statusMeta = {
    active: ['Ativa','play-circle'], waiting: ['Aguardando','clock-3'],
    backlog: ['Para depois','archive'], closed: ['Encerrada','check-circle-2']
};
const severityRank = {critical:0,attention:1,upcoming:2,info:3};
const dateKinds = [['followUpAt','Follow-up'],['nextReviewAt','Revisão'],['dueDate','Prazo']];
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
const matches = (demand, query) => !query || normalize([demand.title,demand.nextAction,demand.waitingFor,demand.owner,demand.requester,demand.area,demand.project].join(' ')).includes(query);
const pageSize = 20;

// Read-only view: neither the filters nor pagination write into the account state.
export function radarWorkspace(state, ui = {}, today) {
    const demands = state.operationalControl?.demands || [];
    const signals = new Map(operationalSignals(state.operationalControl,today).map(row => [String(row.demand.id),row]));
    const all = demands.filter(d => d.workflowStatus !== 'closed');
    const counts = Object.fromEntries(filters.map(([key]) => [key,all.filter(d => key==='all' || (key==='attention' ? signals.has(String(d.id)) : (d.workflowStatus || 'active')===key)).length]));
    const filter = filters.some(([key]) => key===ui.filter) ? ui.filter : 'all';
    const query = normalize(ui.query);
    const rows = all.filter(d => matches(d,query) && (filter==='all' || (filter==='attention' ? signals.has(String(d.id)) : (d.workflowStatus || 'active')===filter)));
    const attentionOrder = {immediate:0,attention:1,controlled:2}, statusOrder = {active:0,waiting:1,backlog:2};
    rows.sort((a,b) => (signals.get(String(a.id))?.severityRank ?? 9)-(signals.get(String(b.id))?.severityRank ?? 9)
        || (attentionOrder[a.attentionLevel] ?? 2)-(attentionOrder[b.attentionLevel] ?? 2)
        || (statusOrder[a.workflowStatus] ?? 0)-(statusOrder[b.workflowStatus] ?? 0)
        || (signals.get(String(a.id))?.nextRelevantDate || a.followUpAt || a.nextReviewAt || a.dueDate || '9999').localeCompare(signals.get(String(b.id))?.nextRelevantDate || b.followUpAt || b.nextReviewAt || b.dueDate || '9999')
        || String(a.title).localeCompare(String(b.title),'pt-BR'));
    const history = demands.filter(d => d.workflowStatus==='closed').filter(d => matches(d,normalize(ui.historyQuery)))
        .sort((a,b) => String(b.closedAt || b.updatedAt || '').localeCompare(String(a.closedAt || a.updatedAt || '')) || String(a.title).localeCompare(String(b.title),'pt-BR'));
    const pages = Math.max(1,Math.ceil(history.length/pageSize));
    const page = Math.min(pages-1,Math.max(0,Math.trunc(Number(ui.historyPage)||0)));
    return {rows,counts,filter,signals,history:history.slice(page*pageSize,(page+1)*pageSize),historyCount:history.length,
        closedCount:demands.length-all.length,page,pages,pageSize};
}

export function installRadarWorkspace(window,{document,getState,getUiState,render,today}) {
    const e = value => window.escapeHtml(String(value ?? ''));
    const arg = value => e(JSON.stringify(String(value)));
    const view = () => getUiState().radarWorkspace ||= {filter:'all',query:'',historyQuery:'',historyPage:0};
    const project = () => radarWorkspace(getState(),view(),today());
    const detailsId = id => `radar-details-${encodeURIComponent(String(id))}`;
    const menuId = id => `radar-actions-${encodeURIComponent(String(id))}`;
    const closeMenus = root => root?.querySelectorAll?.('details[data-radar-actions]').forEach(menu => { menu.open=false; });
    const refresh = focusId => {
        render();
        document.getElementById(focusId)?.focus({preventScroll:true});
    };
    window.setRadarFilter = (filter,focusId) => {
        if(!filters.some(([key]) => key===filter))return;
        view().filter=filter;
        refresh(focusId==='radar-mobile-filter'?focusId:`radar-filter-${filter}`);
    };
    window.searchRadar = history => {
        const key = history ? 'historyQuery' : 'query', id = history ? 'radar-history-search' : 'radar-search';
        view()[key]=String(document.getElementById(id)?.value || '').slice(0,200);
        if(history)view().historyPage=0;
        refresh(id);
    };
    window.clearRadarSearch = history => {
        view()[history ? 'historyQuery' : 'query']='';
        if(history)view().historyPage=0;
        refresh(history ? 'radar-history-search' : 'radar-search');
    };
    window.setRadarHistoryPage = page => {
        view().historyPage=Math.min(project().pages-1,Math.max(0,Math.trunc(Number(page)||0)));
        refresh('radar-history-results');
    };
    window.toggleRadarDetails = (sectionKey,event) => {
        const button=event?.currentTarget,panel=document.getElementById(button?.getAttribute('aria-controls'));
        if(!button || !panel)return;
        const open=button.getAttribute('aria-expanded')!=='true';
        getUiState().radarExpandedSections[sectionKey]=open;
        panel.hidden=!open;
        button.setAttribute('aria-expanded',String(open));
        const label=button.querySelector('[data-radar-details-label]'),chevron=button.querySelector('[data-radar-details-chevron]');
        if(label)label.textContent=open?'Ocultar detalhes':'Detalhes';
        if(chevron)chevron.style.transform=open?'rotate(180deg)':'rotate(0deg)';
    };
    window.showRadarDetails = (id,missions=false) => {
        const panel=document.getElementById(detailsId(id)),button=document.getElementById(`radar-details-toggle-${encodeURIComponent(String(id))}`);
        if(!panel || !button)return;
        if(button.getAttribute('aria-expanded')!=='true')window.toggleRadarDetails(`demand:${id}`,{currentTarget:button});
        const target=missions ? panel.querySelector('details[data-view-key]') : panel;
        if(missions && target)target.open=true;
        const focusTarget=target?.querySelector('summary') || panel;
        focusTarget.focus({preventScroll:true});
        focusTarget.scrollIntoView?.({block:'nearest',behavior:'auto'});
    };
    window.runRadarAction = (action,id,event) => {
        const menu=event?.currentTarget?.closest('details[data-radar-actions]');
        // Return to a visible, stable trigger after a nested dialog closes.
        menu?.querySelector('summary')?.focus({preventScroll:true});
        closeMenus(document.getElementById('app'));
        const demand=window.getOperationalDemand(id);
        if(!demand)return;
        if(action==='edit')window.openOperationalDemandModal(id);
        else if(action==='followup')window.openOperationalDemandModal(id,'op-demand-followup');
        else if(action==='review')window.openOperationalDemandModal(id,'op-demand-review-date');
        else if(action==='create' && demand.workflowStatus!=='closed')window.createMissionForDemand(id);
        else if(action==='link')window.openRadarMissionLink(id);
        else if(action==='close')window.closeOperationalDemand(id);
        else if(action==='reopen')window.reopenOperationalDemand(id);
        else if(action==='delete')window.deleteOperationalDemand(id);
    };
    window.bindRadarWorkspace = root => {
        if(root.__radarWorkspaceBound || !root.addEventListener)return;
        root.__radarWorkspaceBound=true;
        root.addEventListener('click',event => {
            const selected=event.target.closest?.('details[data-radar-actions]');
            root.querySelectorAll('details[data-radar-actions]').forEach(menu => {if(menu!==selected)menu.open=false;});
        });
        root.addEventListener('keydown',event => {
            if(event.key!=='Escape')return;
            const menu=event.target.closest?.('details[data-radar-actions]');
            if(menu?.open){event.preventDefault();event.stopPropagation();menu.open=false;menu.querySelector('summary')?.focus({preventScroll:true});}
        });
    };

    const renderSearch = history => {
        const id=history?'radar-history-search':'radar-search', value=view()[history?'historyQuery':'query'] || '';
        return `<form class="radar-search" role="search" aria-label="${history?'Buscar nas demandas encerradas':'Buscar nas demandas abertas'}" onsubmit="event.preventDefault();window.searchRadar(${history})">
            <label for="${id}">${history?'Buscar no histórico':'Buscar demanda'}</label>
            <div class="radar-search-controls"><input id="${id}" type="search" maxlength="200" value="${e(value)}" placeholder="Título ou pessoa" autocomplete="off"><button type="submit" class="radar-button radar-button-secondary">Buscar</button>${value?`<button type="button" class="radar-button radar-button-quiet" onclick="window.clearRadarSearch(${history})">Limpar</button>`:''}</div>
        </form>`;
    };
    const actionButton = (id,action,label,cls='radar-button-quiet') => `<button type="button" class="radar-button ${cls}" aria-label="${e(label)}" onclick="window.runRadarAction('${action}',${arg(id)},event)">${label}</button>`;
    const renderCard = (demand,signals) => {
        const state=getState(), closed=demand.workflowStatus==='closed', status=demand.workflowStatus || 'active', [statusLabel,icon]=statusMeta[status] || statusMeta.active;
        const missions=linkedTasks(state,demand.id), livePending=missions.some(task => !task.completed && state.tasks?.includes(task));
        const sortedSignals=[...(signals?.signals || [])].sort((a,b)=>(severityRank[a.severity]??9)-(severityRank[b.severity]??9));
        const main=sortedSignals[0], dates=dateKinds.filter(([key])=>validDate(demand[key])).sort(([a],[b])=>demand[a].localeCompare(demand[b]));
        const next=dates.find(([key])=>demand[key]>=today());
        const sectionKey=`demand:${demand.id}`, expanded=Boolean(getUiState().radarExpandedSections[sectionKey]);
        const format = value => e(window.formatOperationalDate(value));
        let primary=closed ? ''
            : status==='waiting' ? actionButton(demand.id,'followup','Atualizar retorno','radar-button-primary')
            : status==='backlog' ? actionButton(demand.id,'review','Revisar demanda','radar-button-secondary')
            : livePending ? `<button type="button" class="radar-button radar-button-primary" onclick="window.showRadarDetails(${arg(demand.id)},true)">Ver missões (${missions.length})</button>`
            : actionButton(demand.id,'create','Criar missão','radar-button-primary');
        return `<article data-radar-demand-id="${e(demand.id)}" class="radar-card radar-card-${e(status)}${main?.severity==='critical'?' radar-card-critical':''}">
            <div class="radar-card-heading"><div class="radar-card-title"><h3>${e(demand.title)}</h3>${demand.area||demand.project?`<p class="radar-context">${e([demand.area,demand.project].filter(Boolean).join(' · '))}</p>`:''}</div><span class="radar-status radar-status-${e(status)}"><i data-lucide="${icon}" aria-hidden="true"></i>${statusLabel}</span></div>
            ${main?`<div class="radar-signal radar-signal-${e(main.severity)}"><i data-lucide="${main.severity==='critical'?'triangle-alert':'calendar-clock'}" aria-hidden="true"></i><p>${e(main.label)}</p>${sortedSignals.length>1?`<button type="button" class="radar-signal-more" onclick="window.showRadarDetails(${arg(demand.id)})" aria-controls="${detailsId(demand.id)}" aria-label="Ver mais ${sortedSignals.length-1} ${sortedSignals.length===2?'aviso':'avisos'} de ${e(demand.title)}">+${sortedSignals.length-1} ${sortedSignals.length===2?'aviso':'avisos'}</button>`:''}</div>`:''}
            ${!closed?`<div class="radar-next-action"><p class="radar-eyebrow">Próxima ação</p><p class="radar-action-text">${e(demand.nextAction || (status==='waiting'?'Acompanhar o retorno.':status==='backlog'?'Definir quando retomar.':'Defina a próxima ação ao editar.'))}</p></div>`:''}
            <div class="radar-card-context">${status==='waiting'?`<p><span>Aguardando</span> ${e(demand.waitingFor || 'Responsável não informado')}</p>`:''}${!closed&&next?`<p><span>${e(next[1])}</span> ${format(demand[next[0]])}</p>`:''}${closed&&demand.closedAt?`<p><span>Encerrada em</span> ${format(demand.closedAt)}</p>`:''}${missions.length?`<p>${missions.length} ${missions.length===1?'missão vinculada':'missões vinculadas'} · ${missions.filter(t=>t.completed).length} ${missions.filter(t=>t.completed).length===1?'concluída':'concluídas'}</p>`:''}</div>
            <div class="radar-card-controls">${primary}<button id="radar-details-toggle-${encodeURIComponent(String(demand.id))}" type="button" onclick="window.toggleRadarDetails(${arg(sectionKey)},event)" aria-expanded="${expanded}" aria-controls="${detailsId(demand.id)}" class="radar-button radar-button-quiet radar-details-button"><span data-radar-details-label>${expanded?'Ocultar detalhes':'Detalhes'}</span><i data-radar-details-chevron data-lucide="chevron-down" style="transform:rotate(${expanded?'180':'0'}deg)" aria-hidden="true"></i></button>
                <details id="${menuId(demand.id)}" data-radar-actions class="radar-actions"><summary aria-label="Mais ações para ${e(demand.title)}"><i data-lucide="ellipsis" aria-hidden="true"></i><span>Mais ações</span></summary><div class="radar-actions-list">${actionButton(demand.id,'edit','Editar demanda')}${closed?actionButton(demand.id,'reopen','Reabrir demanda'):status==='waiting'||status==='backlog'||livePending?actionButton(demand.id,'create','Criar missão'):''}${actionButton(demand.id,'link','Vincular missão existente')}${!closed?actionButton(demand.id,'close','Encerrar demanda'):''}<div class="radar-action-danger">${actionButton(demand.id,'delete','Excluir definitivamente')}</div></div></details>
            </div>
            <div id="${detailsId(demand.id)}" role="region" aria-label="Detalhes de ${e(demand.title)}" tabindex="-1" ${expanded?'':'hidden'} class="radar-detail-panel">${closed&&demand.nextAction?`<p class="radar-eyebrow">Última próxima ação registrada</p><p class="radar-action-text radar-archived-action">${e(demand.nextAction)}</p>`:''}<dl>${dateKinds.map(([key,label])=>`<div><dt>${label}</dt><dd>${format(demand[key])}</dd></div>`).join('')}${[['owner','Responsável'],['requester','Solicitante'],...(status==='waiting'?[['waitingSince','Aguardando desde']]:[])].map(([key,label])=>`<div><dt>${label}</dt><dd>${key==='waitingSince'?format(demand[key]):e(demand[key]||'Não informado')}</dd></div>`).join('')}</dl>${sortedSignals.length>1?`<h4>Outros pontos de atenção</h4><ul class="radar-other-signals">${sortedSignals.slice(1).map(item=>`<li>${e(item.label)}</li>`).join('')}</ul>`:''}${missions.length?(window.renderDemandMissions?.(demand)||''):''}</div>
        </article>`;
    };
    const pagination = (p,position) => p.pages>1?`<nav class="radar-pagination" aria-label="Páginas das demandas encerradas · ${position}"><button type="button" class="radar-button radar-button-secondary" onclick="window.setRadarHistoryPage(${p.page-1})" ${p.page===0?'disabled':''}>Anterior</button><span>Página ${p.page+1} de ${p.pages}</span><button type="button" class="radar-button radar-button-secondary" onclick="window.setRadarHistoryPage(${p.page+1})" ${p.page===p.pages-1?'disabled':''}>Próxima</button></nav>`:'';
    window.renderOperationalControl = () => {
        const p=project(), ui=getUiState();
        return `<section id="radar-workspace" class="radar-workspace" aria-labelledby="radar-heading">
            <header class="radar-header"><div class="radar-header-top"><div><h2 id="radar-heading">Radar de demandas</h2><p>Acompanhe o que fazer, de quem cobrar e o que pode esperar.</p></div><button type="button" onclick="window.openOperationalDemandModal()" class="radar-button radar-button-primary"><i data-lucide="plus" aria-hidden="true"></i>Nova demanda</button></div>
            <div class="radar-filters" role="group" aria-label="Filtrar demandas abertas">${filters.map(([key,label])=>`<button id="radar-filter-${key}" type="button" aria-pressed="${p.filter===key}" onclick="window.setRadarFilter('${key}')" class="radar-filter${p.filter===key?' is-selected':''}">${label}<span>${p.counts[key]}</span></button>`).join('')}</div><div class="radar-filter-select"><label for="radar-mobile-filter">Mostrar demandas</label><select id="radar-mobile-filter" onchange="window.setRadarFilter(this.value,'radar-mobile-filter')">${filters.map(([key,label])=>`<option value="${key}" ${p.filter===key?'selected':''}>${label} (${p.counts[key]})</option>`).join('')}</select></div>${renderSearch(false)}</header>
            <p id="radar-results" role="status" aria-live="polite" class="radar-results">${p.rows.length} ${p.rows.length===1?'demanda encontrada':'demandas encontradas'}${p.filter!=='all'?` · ${filters.find(([key])=>key===p.filter)[1]}`:''}${view().query?` · Busca: “${e(view().query)}”`:''}</p>
            <div class="radar-list" aria-label="Demandas em acompanhamento">${p.rows.map(d=>renderCard(d,p.signals.get(String(d.id)))).join('') || `<div class="radar-empty"><h3>${!p.counts.all?'Nenhuma demanda em acompanhamento':'Nenhuma demanda neste filtro'}</h3><p>${!p.counts.all?'Use o RADAR para frentes contínuas ou para acompanhar o retorno de alguém.':'Experimente outra busca ou selecione Todas para consultar as demais demandas.'}</p></div>`}</div>
            ${p.closedCount?`<details data-radar-section="history" ${ui.radarExpandedSections.history?'open':''} class="radar-history"><summary>Demandas encerradas · ${p.closedCount}</summary><div class="radar-history-body">${renderSearch(true)}<p id="radar-history-results" tabindex="-1" role="status" aria-live="polite" class="radar-results">${p.historyCount?`Exibindo ${p.page*p.pageSize+1}–${Math.min((p.page+1)*p.pageSize,p.historyCount)} de ${p.historyCount}`:'Nenhuma demanda encerrada encontrada'}${view().historyQuery?` · Busca: “${e(view().historyQuery)}”`:''}</p>${pagination(p,'topo')}<div class="radar-list">${p.history.map(d=>renderCard(d)).join('')}</div>${pagination(p,'rodapé')}</div></details>`:''}
        </section>`;
    };
}
