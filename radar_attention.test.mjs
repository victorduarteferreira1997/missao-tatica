import test from 'node:test';
import assert from 'node:assert/strict';
import {operationalSignals,deadlineHorizon} from './radar_attention.v1.js';
import {radarWeek} from './radar_missions.v2.js';
import {boot,plain} from './test-support/app_boot.mjs';
const demand=(extra={})=>({id:'r1',title:'Santillana',workflowStatus:'waiting',attentionLevel:'controlled',waitingFor:'Fornecedor',nextAction:'Aguardar documento',...extra});
const control=(demands,days=2)=>({demands,config:{dueSoonDays:days}});
const example=demand({followUpAt:'2026-11-11',nextReviewAt:'2026-11-13',dueDate:'2026-11-30'});
const state=demands=>({tasks:[],operationalControl:control(demands),planning:{history:[]},currentPlanningWeekStart:'2026-11-09'});

test('exemplo Santillana não antecipa follow-up ou revisão e mantém as datas intactas',()=>{
 const c=control([example]),before=structuredClone(c);assert.deepEqual(operationalSignals(c,'2026-11-10'),[]);
 const onDate=operationalSignals(c,'2026-11-11');assert.equal(onDate.length,1);assert.deepEqual(onDate[0].signals.map(s=>s.kind),['followup']);assert.match(onDate[0].signals[0].label,/11\/11\/2026/);assert.deepEqual(c,before);
 const later=operationalSignals(c,'2026-11-13')[0];assert.deepEqual(later.signals.map(s=>s.kind),['followup','review']);assert.match(later.signals[0].label,/atrasado há 2 dias/);
});
test('revisão sem follow-up e follow-up sem revisão são válidos, inclusive ambos vazios',()=>{
 for(const extra of [{nextReviewAt:'2026-11-13'},{followUpAt:'2026-11-13'},{}]){
  const c=control([demand(extra)]);assert.deepEqual(operationalSignals(c,'2026-11-11'),[]);
  assert.equal(operationalSignals(c,'2026-11-13').length,Object.keys(extra).length?1:0);
 }
});
test('somente prazo gera aviso antecipado, respeitando o limite de dois dias',()=>{
 const c=control([demand({dueDate:'2026-11-13',followUpAt:'2026-11-13',nextReviewAt:'2026-11-13'})]);
 assert.equal(operationalSignals(c,'2026-11-10').length,0);const rows=operationalSignals(c,'2026-11-11');assert.equal(rows.length,1);assert.deepEqual(rows[0].signals.map(s=>s.kind),['due']);assert.match(rows[0].signals[0].label,/Prazo se aproximando · em 2 dias · 13\/11\/2026/);
 assert.equal(operationalSignals(c,'2026-11-13')[0].signals.length,3);
});
test('antecedência zero é preservada na validação e não avisa antes da data',()=>{
 assert.equal(deadlineHorizon(0),0);assert.equal(deadlineHorizon('0'),0);assert.equal(deadlineHorizon(undefined),2);assert.equal(deadlineHorizon(99),30);
 const c=control([demand({dueDate:'2026-11-13'})],0);assert.deepEqual(operationalSignals(c,'2026-11-12'),[]);assert.equal(operationalSignals(c,'2026-11-13').length,1);
 const b=boot();b.state.operationalControl.config.dueSoonDays=0;b.window.validateState();assert.equal(b.state.operationalControl.config.dueSoonDays,0);
});
test('follow-up de registro ativo e backlog com data não desaparecem da rotina',()=>{
 for(const status of ['active','backlog'])assert.equal(operationalSignals(control([demand({workflowStatus:status,followUpAt:'2026-11-11'})]),'2026-11-11')[0].signals[0].kind,'followup');
 assert.deepEqual(operationalSignals(control([demand({workflowStatus:'backlog'})]),'2026-11-11'),[]);
});
test('encerrados e datas inválidas não geram avisos; atenção manual permanece explícita',()=>{
 const c=control([demand({workflowStatus:'closed',dueDate:'2026-11-10'}),demand({id:'bad',dueDate:'2026-02-30',followUpAt:'invalida'}),demand({id:'manual',attentionLevel:'immediate'})]);
 const rows=operationalSignals(c,'2026-11-11');assert.equal(rows.length,1);assert.equal(rows[0].demand.id,'manual');assert.match(rows[0].signals[0].label,/Marcada como ação imediata/);assert.deepEqual(operationalSignals(c,'invalida'),[]);
});
test('avisos de informações essenciais continuam distintos das datas opcionais',()=>{
 const rows=operationalSignals(control([demand({workflowStatus:'active',nextAction:''}),demand({id:'waiting',waitingFor:''})]),'2026-11-11');assert.deepEqual(rows.flatMap(r=>r.signals.map(s=>s.kind)).sort(),['missing-next-action','missing-waiting-for']);
});
test('semana reúne prazo, revisão e follow-up num único cartão com motivos datados',()=>{
 const s=state([example]),before=structuredClone(s),rows=radarWeek(s,'2026-11-09','2026-11-11').followups;assert.equal(rows.length,1);assert.equal(rows[0].reasons.length,2);assert.ok(rows[0].reasons.every(r=>/\d{2}\/\d{2}\/2026/.test(r.label)));assert.deepEqual(s,before);
});
test('acompanhamento atrasado da semana anterior continua na atual, sem repetir em semanas futuras',()=>{
 const s=state([demand({followUpAt:'2026-11-06',nextReviewAt:'2026-11-13'})]);const rows=radarWeek(s,'2026-11-09','2026-11-11').followups;assert.equal(rows.length,1);assert.equal(rows[0].reasons.length,2);assert.match(rows[0].reasons.find(r=>r.kind==='followup').label,/atrasado/);assert.equal(radarWeek(s,'2026-11-16','2026-11-11').followups.length,0);
});
test('prazo na terça seguinte pode avisar no domingo da semana atual',()=>{
 const s=state([demand({dueDate:'2026-11-17'})]);assert.equal(radarWeek(s,'2026-11-09','2026-11-15').followups.length,1);assert.equal(radarWeek(s,'2026-11-09','2026-11-14').followups.length,0);assert.equal(radarWeek(s,'2026-11-16','2026-11-14').followups.length,1);
});
test('visão diária mostra todos os motivos no mesmo cartão e não expõe datas futuras como avisos',()=>{
 const b=boot();b.state.currentPlanningWeekStart='2026-11-09';b.state.activeTab='wednesday';b.state.operationalControl=control([demand({dueDate:'2026-11-11',followUpAt:'2026-11-11',nextReviewAt:'2026-11-13'})]);
 const html=b.window.renderOperationalDayPanel();assert.equal((html.match(/Santillana/g)||[]).length,1);assert.match(html,/Prazo neste dia/);assert.match(html,/Follow-up neste dia/);assert.doesNotMatch(html,/13\/11\/2026/);
 b.state.activeTab='tuesday';b.state.operationalControl=control([example]);assert.match(b.window.renderOperationalDayPanel(),/Nenhum aviso do RADAR para 10\/11\/2026/);
});
test('formulário explica campos opcionais e aceita limpar somente uma data',()=>{
 const b=boot();b.state.operationalControl=control([structuredClone(example)]);b.ui.showOperationalDemandModal=true;b.ui.editingOperationalDemandId='r1';const html=b.window.renderOperationalDemandModal();assert.match(html,/Preencha uma, ambas ou nenhuma/);assert.match(html,/Próxima revisão \(opcional\)/);
 for(const [id,value] of Object.entries({'op-demand-title':'Santillana','op-demand-status':'waiting','op-demand-followup':'','op-demand-review-date':'2026-11-13','op-demand-due-date':'2026-11-30','op-demand-waiting-for':'Fornecedor','op-demand-next-action':'Aguardar documento'}))b.elements[id]={value};
 b.window.saveOperationalDemand();const d=b.state.operationalControl.demands[0];assert.equal(d.followUpAt,'');assert.equal(d.nextReviewAt,'2026-11-13');assert.equal(d.dueDate,'2026-11-30');assert.equal(b.state.tasks.length,0);
});
