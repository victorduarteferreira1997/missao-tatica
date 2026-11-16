import test from 'node:test';
import assert from 'node:assert/strict';
import {radarWorkspace} from './ui/radar_workspace.v1.js';
import {boot,plain} from './test-support/app_boot.mjs';

const today='2026-11-14';
const demand=(id,extra={})=>({id,title:id,workflowStatus:'active',nextAction:'Analisar documento',attentionLevel:'controlled',...extra});
const fixture=()=>({tasks:[],planning:{history:[]},operationalControl:{scans:[],shutdowns:[],config:{dueSoonDays:2},demands:[
    demand('ativa'),demand('espera',{workflowStatus:'waiting',waitingFor:'Fornecedor',followUpAt:'2026-11-18'}),
    demand('futuro',{workflowStatus:'backlog',nextReviewAt:'2026-12-01'}),
    demand('vencida',{workflowStatus:'waiting',waitingFor:'Cliente',followUpAt:'2026-11-13',dueDate:'2026-11-30'}),
    ...Array.from({length:35},(_,index)=>demand(`encerrada-${index+1}`,{workflowStatus:'closed',closedAt:`2026-11-${String(index%14+1).padStart(2,'0')}T12:00:00Z`}))
]}});

test('filtros e contagens usam a mesma projeção, sem confundir espera futura com atraso',()=>{
    const s=fixture(),before=structuredClone(s),p=radarWorkspace(s,{},today);
    assert.deepEqual(p.counts,{all:4,attention:1,active:1,waiting:2,backlog:1});
    assert.equal(p.rows[0].id,'vencida');
    for(const filter of ['all','attention','active','waiting','backlog'])assert.equal(radarWorkspace(s,{filter},today).rows.length,p.counts[filter]);
    assert.equal(radarWorkspace(s,{filter:'attention'},today).rows[0].id,'vencida');
    assert.equal(radarWorkspace(s,{filter:'invalid'},today).filter,'all');
    assert.deepEqual(s,before);
});
test('as 35 encerradas são acessíveis por paginação, sem omissão ou duplicação',()=>{
    const s=fixture(),before=structuredClone(s),first=radarWorkspace(s,{},today),second=radarWorkspace(s,{historyPage:1},today);
    assert.equal(first.historyCount,35);assert.equal(first.pages,2);assert.equal(first.history.length,20);assert.equal(second.history.length,15);
    assert.equal(new Set([...first.history,...second.history].map(d=>d.id)).size,35);
    assert.equal(radarWorkspace(s,{historyPage:99},today).page,1);assert.equal(radarWorkspace(s,{historyPage:-1},today).page,0);
    s.operationalControl.demands=s.operationalControl.demands.filter(d=>d.workflowStatus!=='closed'||d.id==='encerrada-35');
    const clamped=radarWorkspace(s,{historyPage:1},today);assert.equal(clamped.page,0);assert.equal(clamped.history[0].id,'encerrada-35');
    assert.equal(before.operationalControl.demands.length,39);
});
test('buscas ignoram acentos e encontram responsáveis, contexto e histórico independentemente do filtro',()=>{
    const s=fixture();s.operationalControl.demands[0].title='Homologação de serviços';
    s.operationalControl.demands[0].project='Coaktion';
    assert.equal(radarWorkspace(s,{query:'HOMOLOGACAO'},today).rows[0].id,'ativa');
    assert.equal(radarWorkspace(s,{query:'coaktion'},today).rows.length,1);
    assert.equal(radarWorkspace(s,{filter:'waiting',query:'cliente'},today).rows[0].id,'vencida');
    const history=radarWorkspace(s,{filter:'backlog',query:'nada',historyQuery:'encerrada-35',historyPage:4},today);
    assert.equal(history.rows.length,0);assert.equal(history.historyCount,1);assert.equal(history.history[0].id,'encerrada-35');assert.equal(history.page,0);
});
test('cartão aguardando tem uma ação contextual e não impõe bloco vazio de missões',()=>{
    const b=boot();b.state.operationalControl=fixture().operationalControl;
    const before=plain(b.state),html=b.window.renderOperationalControl();
    const card=html.match(/<article data-radar-demand-id="espera"[\s\S]*?<\/article>/)[0];
    assert.match(card,/Atualizar retorno/);assert.doesNotMatch(card,/Missões vinculadas · 0/);
    const controls=card.split('class="radar-card-controls"')[1].split('<div id="radar-details-')[0];
    const visible=controls.split('<details')[0];assert.equal((visible.match(/<button /g)||[]).length,2);
    assert.match(controls,/Mais ações/);assert.match(controls,/Editar demanda/);assert.match(controls,/Excluir definitivamente/);
    assert.match(card,/18\/11\/2026/);assert.deepEqual(plain(b.state),before);
});
test('missões históricas e atuais continuam consultáveis dentro dos detalhes, sem copiar registros',()=>{
    const b=boot();b.state.operationalControl.demands=[demand('radar')];
    b.state.tasks=[{id:1,text:'Análise atual',radarDemandId:'radar',subtasks:[{id:2,text:'Conferir',completed:true}]}];
    b.state.planning.history=[{week:'2026-11-02',tasks:[{id:3,text:'Análise concluída',completed:true,radarDemandId:'radar'}]}];
    const before=plain(b.state),html=b.window.renderOperationalControl();
    assert.match(html,/Ver missões \(2\)/);assert.match(html,/2 missões vinculadas · 1 concluída/);
    assert.ok(html.indexOf('id="radar-details-radar"')<html.indexOf('Análise atual'));
    assert.match(html,/Análise concluída/);assert.match(html,/Remover vínculo/);assert.deepEqual(plain(b.state),before);
});
test('pesquisar, paginar e filtrar não salva, não duplica e preserva os dados dos demais módulos',()=>{
    const b=boot();b.state.operationalControl=fixture().operationalControl;b.ui.radarExpandedSections.history=true;
    const before=plain(b.state);let writes=0;b.window.saveState=()=>writes++;
    b.window.setRadarFilter('waiting');b.elements['radar-search']={value:'fornecedor',focus(){}};b.window.searchRadar(false);
    assert.equal(b.ui.radarWorkspace.query,'fornecedor');assert.equal(b.ui.radarWorkspace.filter,'waiting');
    b.window.setRadarHistoryPage(1);assert.match(b.window.renderOperationalControl(),/Exibindo 21–35 de 35/);
    b.elements['radar-history-search']={value:'encerrada-35',focus(){}};b.window.searchRadar(true);
    assert.equal(b.ui.radarWorkspace.historyPage,0);assert.match(b.window.renderOperationalControl(),/Exibindo 1–1 de 1/);
    assert.equal(b.ui.radarExpandedSections.history,true);b.window.clearRadarSearch(true);b.window.clearRadarSearch(false);
    assert.equal(b.ui.radarWorkspace.historyQuery,'');assert.equal(b.ui.radarWorkspace.query,'');
    assert.equal(writes,0);assert.deepEqual(plain(b.state),before);
});
test('ações contextuais abrem o editor correto sem alterar status nem criar missão automaticamente',()=>{
    const b=boot();b.state.operationalControl=fixture().operationalControl;const before=plain(b.state),calls=[];
    b.window.openOperationalDemandModal=(...args)=>calls.push(args);
    b.window.runRadarAction('followup','espera');b.window.runRadarAction('review','futuro');b.window.runRadarAction('edit','ativa');
    b.window.runRadarAction('followup','inexistente');
    assert.deepEqual(calls,[['espera','op-demand-followup'],['futuro','op-demand-review-date'],['ativa']]);
    assert.deepEqual(plain(b.state),before);
});
test('excluir pelo menu mantém confirmação, e cancelar não altera demandas, vínculos ou recompensas',()=>{
    const b=boot();b.state.operationalControl=fixture().operationalControl;
    b.state.tasks=[{id:1,text:'Preservar',radarDemandId:'ativa',completed:true,subtasks:[{id:1,text:'Concluída',completed:true}]}];
    const before=plain(b.state);b.window.runRadarAction('delete','ativa');
    assert.equal(b.ui.confirm.show,true);assert.match(b.ui.confirm.message,/Excluir definitivamente/);assert.deepEqual(plain(b.state),before);
    b.window.handleConfirmResult(false);assert.equal(b.ui.confirm.show,false);assert.deepEqual(plain(b.state),before);
    b.window.runRadarAction('create','encerrada-1');assert.deepEqual(plain(b.state),before);
});
test('títulos, busca e nomes recebidos por IA são escapados no novo RADAR',()=>{
    const b=boot();b.state.operationalControl.demands=[demand('id"<script>',{title:'<img src=x onerror=alert(1)>',waitingFor:'<script>alert(1)</script>'})];
    const html=b.window.renderOperationalControl();assert.doesNotMatch(html,/<img|<script>/);assert.match(html,/&lt;img/);
    b.ui.radarWorkspace.query='"><script>alert(2)</script>';
    assert.doesNotMatch(b.window.renderOperationalControl(),/<script>/);assert.match(b.window.renderOperationalControl(),/&lt;script&gt;/);
});

test('seletor do celular usa os mesmos filtros e recebe foco após a atualização',()=>{
    const b=boot();b.state.operationalControl=fixture().operationalControl;let focus=0;
    b.elements['radar-mobile-filter']={focus(){focus++;}};
    const before=plain(b.state);b.window.setRadarFilter('waiting','radar-mobile-filter');
    assert.equal(focus,1);assert.match(b.window.renderOperationalControl(),/value="waiting" selected>Aguardando \(2\)/);
    assert.match(b.window.renderOperationalControl(),/aria-pressed="true" onclick="window.setRadarFilter\('waiting'\)/);
    assert.deepEqual(plain(b.state),before);
});
test('consultar missões expande o painel local e torna o destino visível sem renderizar ou salvar',()=>{
    const b=boot(),attrs={'aria-expanded':'false','aria-controls':'radar-details-demo'},focus={count:0,scroll:0};
    const summary={focus(){focus.count++;},scrollIntoView(){focus.scroll++;}};
    const missions={open:false,querySelector:()=>summary};
    b.elements['radar-details-toggle-demo']={getAttribute:key=>attrs[key],setAttribute:(key,value)=>attrs[key]=value,querySelector:()=>null};
    b.elements['radar-details-demo']={hidden:true,querySelector:()=>missions};
    const before=plain(b.state),markup=b.elements.app.innerHTML;
    b.window.showRadarDetails('demo',true);
    assert.equal(attrs['aria-expanded'],'true');assert.equal(b.elements['radar-details-demo'].hidden,false);
    assert.equal(missions.open,true);assert.equal(focus.count,1);assert.equal(focus.scroll,1);
    assert.equal(b.elements.app.innerHTML,markup);assert.deepEqual(plain(b.state),before);
});
