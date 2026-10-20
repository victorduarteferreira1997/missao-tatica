import test from 'node:test';
import assert from 'node:assert/strict';
import {radarWeek,setRadarLink,taskStatus,weekDate,allPlanningMissions} from './radar_missions.v1.js';
import {linkedTasks,validateRelations,blockingDependencies} from './planning.v1.js';
import {boot,plain} from './test-support/app_boot.mjs';
const week='2026-10-19',today='2026-10-20';
const demand=(id,extra={})=>({id,title:id,workflowStatus:'active',nextAction:'Analisar',...extra});
const task=(id,radarDemandId,extra={})=>({id,radarDemandId,planningWeekStart:week,day:'tuesday',text:id,completed:false,subtasks:[],dependsOnTaskIds:[],...extra});
function fixture(){return {tasks:[],planning:{history:[]},currentPlanningWeekStart:week,operationalControl:{demands:[]}};}
test('Cliente Exemplo aguardando aparece sem missão e com todas as datas em um único cartão da semana',()=>{
 const s=fixture();s.operationalControl.demands=[demand('Cliente Exemplo',{workflowStatus:'waiting',waitingFor:'Cliente',followUpAt:'2026-10-21',nextReviewAt:'2026-10-22',dueDate:'2026-10-23'}),demand('Backlog',{workflowStatus:'backlog',nextReviewAt:'2026-10-25'}),demand('Fechado',{workflowStatus:'closed',followUpAt:'2026-10-21'}),demand('Outra semana',{workflowStatus:'waiting',followUpAt:'2026-10-26'})];
 const before=structuredClone(s),r=radarWeek(s,week,today);assert.equal(r.followups.length,2);assert.equal(r.followups[0].demand.id,'Cliente Exemplo');assert.equal(r.followups[0].reasons.length,3);assert.equal(r.followups[0].missions.length,0);assert.equal(r.withoutMission.length,0);assert.deepEqual(s,before);
 assert.equal(radarWeek(s,'2026-10-26',today).followups[0].demand.id,'Outra semana');
});
test('ativos sem execução incluem bloqueados, pausados e semanas anteriores, mas não aguardando/backlog',()=>{
 const s=fixture();s.operationalControl.demands=['Livre','Bloqueado','Pausado','Antigo','Concluído','Executável'].map(id=>demand(id));s.operationalControl.demands.push(demand('Aguardando',{workflowStatus:'waiting'}),demand('Futuro',{workflowStatus:'backlog'}));
 s.tasks=[task('b','Bloqueado',{dependsOnTaskIds:['pre']}),task('pre',null),task('p','Pausado',{workflowStatus:'paused'}),task('a','Antigo',{planningWeekStart:'2026-10-12'}),task('c','Concluído',{completed:true}),task('e','Executável')];
 assert.deepEqual(radarWeek(s,week,today).withoutMission.map(r=>r.demand.id),['Livre','Bloqueado','Pausado','Antigo','Concluído']);s.tasks.find(t=>t.id==='pre').completed=true;assert.ok(!radarWeek(s,week,today).withoutMission.some(r=>r.demand.id==='Bloqueado'));
});
test('atenção imediata atrasada aparece na semana atual, sem poluir semanas futuras',()=>{
 const s=fixture();s.operationalControl.demands=[demand('Urgente',{attentionLevel:'immediate',dueDate:'2026-10-16'}),demand('Sem prazo',{attentionLevel:'immediate'})];assert.equal(radarWeek(s,week,today).followups.length,2);assert.equal(radarWeek(s,'2026-10-26',today).followups.length,0);assert.deepEqual(radarWeek(s,'inválida',today),{followups:[],withoutMission:[]});assert.equal(weekDate('2026-12-28',6),'2027-01-03');
});
test('três fornecedores pertencem ao mesmo RADAR sem duplicar missões nem criar dependências',()=>{
 const s=fixture();s.operationalControl.demands=[demand('Homologação')];s.tasks=['Fornecedor A','Fornecedor B','Fornecedor C'].map((id,i)=>task(id,null,{day:['monday','tuesday','wednesday'][i],extra:{preservar:true}}));
 const before=structuredClone(s);for(const t of s.tasks)setRadarLink(s,t.id,'Homologação');assert.equal(s.tasks.length,3);assert.equal(linkedTasks(s,'Homologação').length,3);assert.ok(s.tasks.every(t=>t.dependsOnTaskIds.length===0));assert.deepEqual(s.operationalControl,before.operationalControl);
 setRadarLink(s,'Fornecedor A',null);assert.equal(s.tasks[0].radarDemandId,null);assert.deepEqual(s.tasks[0].extra,before.tasks[0].extra);assert.throws(()=>setRadarLink(s,'Fornecedor C','inexistente'));assert.equal(s.tasks[2].radarDemandId,'Homologação');
});
test('dependência opcional desbloqueia após conclusão e impede ciclos sem interferir no vínculo RADAR',()=>{
 const s=fixture();s.operationalControl.demands=[demand('Empresa Exemplo')];s.tasks=[task('a','Empresa Exemplo'),task('b','Empresa Exemplo')];Object.assign(s.tasks[1],validateRelations(s,'b',{radarDemandId:'Empresa Exemplo',dependsOnTaskIds:['a']}));assert.equal(blockingDependencies(s,s.tasks[1]).length,1);s.tasks[0].completed=true;assert.equal(blockingDependencies(s,s.tasks[1]).length,0);assert.throws(()=>validateRelations(s,'a',{radarDemandId:null,dependsOnTaskIds:['b']}),/ciclo/);assert.deepEqual(validateRelations(s,'b',{radarDemandId:'Empresa Exemplo',dependsOnTaskIds:[]}),{radarDemandId:'Empresa Exemplo',dependsOnTaskIds:[]});assert.equal(taskStatus(s.tasks[0]),'Concluída');
});
test('concluir missão preserva RADAR e oferece decisões sem executar mudança automática',()=>{
 const b=boot();b.state.userProfile={displayName:'Teste',gender:'neutro',configured:true};b.state.currentPlanningWeekStart=week;b.state.operationalControl.demands=[demand('Empresa Exemplo')];b.state.tasks=[task('a','Empresa Exemplo',{missionNature:'neutral',xp:0,energyCost:0})];b.window.spawnFloatingText=()=>{};
 const radar=plain(b.state.operationalControl),profile=plain(b.state.userProfile),campaign=plain(b.state.prestige);b.window.toggleTask('a');assert.equal(b.state.tasks[0].completed,true);assert.deepEqual(plain(b.state.operationalControl),radar);assert.ok(b.ui.radarNext);assert.match(b.elements.app.innerHTML,/Como seguir com o RADAR/);b.window.closeRadarNextStep();assert.deepEqual(plain(b.state.operationalControl),radar);assert.deepEqual(plain(b.state.userProfile),profile);assert.equal(b.state.prestige.campaign,campaign.campaign);
});
test('editar subtarefa concluída é possível, mas não se inicia uma missão bloqueada por subtarefas',()=>{
 const b=boot();b.state.tasks=[task('pre',null),task('b',null,{dependsOnTaskIds:['pre'],subtasks:[{id:1,text:'Passo',completed:false}]})];b.window.toggleSubtask('b',1);assert.equal(b.state.tasks[1].subtasks[0].completed,false);b.state.tasks[0].completed=true;b.window.toggleSubtask('b',1);assert.equal(b.state.tasks[1].subtasks[0].completed,true);
});
test('datas antigas de follow-up não são removidas silenciosamente pela validação',()=>{
 const b=boot();b.state.operationalControl.demands=[demand('Legado',{workflowStatus:'active',waitingFor:'Nome preservado',followUpAt:'2026-10-22',waitingSince:'2026-10-01'})];b.window.validateState();assert.equal(b.state.operationalControl.demands[0].followUpAt,'2026-10-22');assert.equal(b.state.operationalControl.demands[0].waitingFor,'Nome preservado');
});

test('editar um RADAR ativo mantém o follow-up existente, sem exigir status aguardando',()=>{
 const b=boot();b.state.operationalControl.demands=[demand('Legado',{workflowStatus:'active',waitingFor:'Responsável',followUpAt:'2026-10-22',waitingSince:'2026-10-01'})];b.ui.editingOperationalDemandId='Legado';b.elements['op-demand-title']={value:'Título revisado'};b.elements['op-demand-status']={value:'active'};b.window.saveOperationalDemand();const saved=b.state.operationalControl.demands[0];assert.equal(saved.title,'Título revisado');assert.equal(saved.followUpAt,'2026-10-22');assert.equal(saved.waitingFor,'Responsável');assert.equal(saved.waitingSince,'2026-10-01');
});

test('vincular missão histórica não recria a missão, não apaga o histórico e elimina cópias da lista de seleção',()=>{
 const s=fixture();s.operationalControl.demands=[demand('Frente')];s.tasks=[task('atual',null)];s.planning.history=[{week:'2026-10-12',tasks:[task('histórica',null,{completed:true}),task('atual',null)]}];const before=structuredClone(s);assert.equal(allPlanningMissions(s).length,2);setRadarLink(s,'histórica','Frente');assert.equal(s.tasks.length,1);assert.equal(s.planning.history[0].tasks.length,2);assert.equal(s.planning.history[0].tasks[0].radarDemandId,'Frente');assert.equal(s.planning.history[0].tasks[0].completed,true);assert.deepEqual(s.tasks,before.tasks);assert.equal(linkedTasks(s,'Frente').length,1);
});
