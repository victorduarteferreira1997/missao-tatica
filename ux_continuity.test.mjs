import test from 'node:test';
import assert from 'node:assert/strict';
import {boot,plain} from './test-support/app_boot.mjs';

test('navegar entre dias e filtrar não grava registros nem agenda sincronização',()=>{
 const b=boot(),before=plain(b.state);let saves=0;b.window.saveState=()=>saves++;
 const timers=b.timers.size,writes=b.writes.length;
 b.window.setTab('wednesday');b.window.setCategoryFilter('work');
 assert.equal(saves,0);assert.equal(b.timers.size,timers);assert.equal(b.writes.length,writes);
 assert.equal(b.state.activeTab,'wednesday');assert.equal(b.state.currentFilter,'work');
 const after=plain(b.state);after.activeTab=before.activeTab;after.currentFilter=before.currentFilter;assert.deepEqual(after,before);
 b.window.setTab('invalid');b.window.setCategoryFilter('invalid');assert.equal(b.state.activeTab,'wednesday');assert.equal(b.state.currentFilter,'work');
});
test('Finanças e Corpo preservam seção, página e registros após concluir cadastro',()=>{
 const b=boot();b.ui.financePages={receitas:3};b.ui.healthPages={treinos:2};
 b.ui.financeTab='receitas';b.ui.healthTab='treinos';const before=plain(b.state);
 b.window.finishFinanceForm('receitas');b.window.finishHealthForm('treinos');
 assert.equal(b.ui.financeSections['receitas:form'],true);assert.equal(b.ui.healthSections.treinos,true);
 assert.equal(b.ui.financePages.receitas,3);assert.equal(b.ui.healthPages.treinos,2);
 assert.equal(b.ui.financeTab,'receitas');assert.equal(b.ui.healthTab,'treinos');assert.deepEqual(plain(b.state),before);
});
test('cadastro contínuo preserva data e categoria, mas não replica texto, subtarefas ou vínculos',()=>{
 const b=boot();b.state.currentPlanningWeekStart='2026-11-09';b.window.showToast=()=>{};
 const values={'ct-text':'Documento','ct-date':'2026-11-11','ct-category':'work','ct-time':'45','ct-priority':'alta','ct-nature':'neutral','ct-complexity':'2','ct-impact-type':'drain','ct-subtasks':'Conferir','ct-repeat-end-mode':'none'};
 for(const [id,value] of Object.entries(values))b.elements[id]={value};b.elements['ct-add-another']={checked:true};
 b.window.saveNewTask();assert.equal(b.state.tasks.length,1);assert.equal(b.ui.showCreateTaskModal,true);
 const draft=plain(b.ui.createTaskDraft);assert.equal(draft.fields.find(f=>f.id==='ct-date').value,'2026-11-11');assert.equal(draft.fields.find(f=>f.id==='ct-add-another').checked,true);
 assert.ok(!draft.fields.some(f=>['ct-text','ct-subtasks','ct-radar','ct-start-time'].includes(f.id)));
 assert.equal(b.state.tasks[0].text,'Documento');assert.equal(b.state.tasks[0].subtasks.length,1);assert.equal(b.ui.createTaskSubtasks,null);
});
test('propostas IA e Google Agenda não oferecem cadastro contínuo',()=>{
 const b=boot();b.window.aiDraftMetadata=()=>({aiProposalId:'proposta'});assert.doesNotMatch(b.window.renderCreateTaskModal(),/ct-add-another/);
 b.window.aiDraftMetadata=()=>({});assert.doesNotMatch(b.window.renderCreateTaskModal({weekStart:'2026-11-09',day:'monday'}),/ct-add-another/);
 assert.match(b.window.renderCreateTaskModal(),/ct-add-another/);
});
test('sugestões do RADAR não abrem janela e desaparecem ao reabrir a missão',()=>{
 const b=boot();b.state.tasks=[{id:1,text:'Análise',completed:true,radarDemandId:'r'}];b.state.operationalControl.demands=[{id:'r',title:'Frente',workflowStatus:'active'}];
 const before=plain(b.state);b.window.offerRadarNextStep(b.state.tasks[0]);assert.ok(!b.ui.radarNext);assert.match(b.window.renderRadarNextSuggestions(),/Atualizar RADAR/);assert.deepEqual(plain(b.state),before);
 b.state.tasks[0].completed=false;assert.equal(b.window.renderRadarNextSuggestions(),'');b.window.openRadarNextStep(1);assert.ok(!b.ui.radarNext);
});
test('menu de módulos fecha antes de abrir destino e ignora ações desconhecidas',()=>{
 const b=boot();let opened=0,focused=0;b.elements['resource-menu']={open:true};b.elements['resource-menu-toggle']={focus(){focused++;}};
 b.window.openLibrary=()=>{assert.equal(b.elements['resource-menu'].open,false);opened++;};
 b.window.openAppResource('openLibrary');b.window.openAppResource('saveNewTask');assert.equal(opened,1);assert.equal(focused,1);
});
