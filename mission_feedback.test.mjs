import test from 'node:test';
import assert from 'node:assert/strict';
import {boot,plain} from './test-support/app_boot.mjs';
function create(){
 const b=boot();b.ui.showCreateTaskModal=true;b.state.currentPlanningWeekStart='2026-11-09';
 for(const [id,value] of Object.entries({'ct-text':'Entrega fictícia','ct-date':'2026-11-11','ct-time':'30','ct-complexity':'2','ct-category':'work','ct-priority':'media','ct-nature':'neutral','ct-impact-type':'drain','ct-subtasks':'Conferir'}))b.elements[id]={id,value,setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];},focus(){this.focused=true;}};
 b.window.showToast=()=>{};return b;
}
test('cadastro responde antes da nuvem, ignora clique repetido e nova tentativa salva sem cadastrar novamente',async()=>{
 const b=create();let release,calls=0;b.window.saveStateNow=()=>{calls++;return new Promise(r=>release=r);};
 const pending=b.window.saveNewTask();assert.equal(b.state.tasks.length,1);assert.equal(b.ui.showCreateTaskModal,false);
 assert.match(b.window.renderMissionSaveFeedback(),/Salvando na nuvem/);assert.doesNotMatch(b.window.renderMissionSaveFeedback(),/Salvo na nuvem/);
 b.window.saveNewTask();assert.equal(b.state.tasks.length,1);assert.equal(calls,1);
 release(false);await pending;assert.match(b.window.renderMissionSaveFeedback(),/Salvamento não confirmado/);assert.match(b.window.renderMissionSaveFeedback(),/Tentar novamente/);
 const before=plain(b.state);const retry=b.window.retryMissionSave();await b.window.retryMissionSave();assert.equal(calls,2);assert.deepEqual(plain(b.state),before);
 release(true);await retry;assert.match(b.window.renderMissionSaveFeedback(),/Salvo na nuvem/);assert.equal(b.state.tasks.length,1);
});
test('resposta de um cadastro anterior não substitui o feedback da missão mais recente',async()=>{
 const b=create(),resolve=[];b.window.saveStateNow=()=>new Promise(r=>resolve.push(r));
 const first=b.window.saveNewTask();b.elements['ct-text']={value:'Segunda entrega'};const second=b.window.saveNewTask();
 resolve[0](false);await first;assert.match(b.window.renderMissionSaveFeedback(),/Segunda entrega/);assert.match(b.window.renderMissionSaveFeedback(),/Salvando/);
 resolve[1](true);await second;assert.match(b.window.renderMissionSaveFeedback(),/Salvo na nuvem/);assert.doesNotMatch(b.window.renderMissionSaveFeedback(),/não confirmado/);
});
test('confirmação tardia não reconstrói a página nem apaga outro rascunho aberto',async()=>{
 const b=create();let release,renders=0;b.window.saveStateNow=()=>new Promise(r=>release=r);
 let html='';Object.defineProperty(b.elements.app,'innerHTML',{get:()=>html,set:v=>{html=v;renders++;}});
 const saving=b.window.saveNewTask();const after=renders;
 b.ui.showCreateTaskModal=true;b.ui.createTaskDraft={fields:[{id:'ct-text',value:'Próximo rascunho'}],sections:[]};
 release(true);await saving;assert.equal(renders,after);assert.equal(b.ui.showCreateTaskModal,true);assert.equal(b.ui.createTaskDraft.fields[0].value,'Próximo rascunho');
});
test('cadastro contínuo mantém data e categoria e confirma a primeira missão sem gravar o próximo rascunho',async()=>{
 const b=create();let release;b.elements['ct-add-another']={checked:true};b.window.saveStateNow=()=>new Promise(r=>release=r);
 const saving=b.window.saveNewTask();assert.equal(b.ui.showCreateTaskModal,true);assert.equal(b.state.tasks.length,1);
 assert.equal(b.ui.createTaskDraft.fields.find(f=>f.id==='ct-date').value,'2026-11-11');
 assert.ok(!b.ui.createTaskDraft.fields.some(f=>f.id==='ct-text'));
 release(true);await saving;assert.equal(b.state.tasks.length,1);assert.equal(b.ui.showCreateTaskModal,true);
});
test('edição com falha e nova tentativa não repete reagendamento nem altera subtarefas ou recompensas',async()=>{
 const b=create();b.state.tasks=[{id:1,text:'Original',day:'wednesday',planningWeekStart:'2026-11-09',category:'work',priority:'media',time:'30 min',subtasks:[{id:2,text:'Feita',completed:true}]}];
 b.ui.editingTaskId=1;b.ui.showEditTaskModal=true;b.ui.showCreateTaskModal=false;
 for(const [id,value] of Object.entries({'et-text':'Revisada','et-date':'2026-11-19','et-time':'45','et-complexity':'2','et-category':'work','et-priority':'media','et-nature':'neutral'}))b.elements[id]={value};
 b.window.saveStateNow=async()=>false;await b.window.saveEditedTask();const edited=plain(b.state);
 assert.equal(b.ui.showEditTaskModal,false);assert.equal(b.state.tasks[0].text,'Revisada');assert.equal(b.state.tasks[0].planningWeekStart,'2026-11-16');
 b.window.saveStateNow=async()=>true;await b.window.retryMissionSave();assert.deepEqual(plain(b.state),edited);assert.equal(b.state.tasks[0].subtasks[0].completed,true);
});
test('editar repetição usa a mesma confirmação e tentar novamente conserva o número e IDs das ocorrências',async()=>{
 const b=create();b.elements['ct-repeat-wednesday']={checked:true};b.window.saveStateNow=async()=>true;await b.window.saveNewTask();
 const task=b.state.tasks[0];b.ui.editingTaskId=task.id;b.ui.showEditTaskModal=true;
 for(const [id,value] of Object.entries({'et-text':'Série revisada','et-date':'2026-11-11','et-time':'30','et-complexity':'2','et-category':'work','et-priority':'media','et-nature':'neutral'}))b.elements[id]={value};b.elements['et-repeat-wednesday']={checked:true};
 b.window.saveStateNow=async()=>false;await b.window.saveEditedTask();assert.match(b.window.renderMissionSaveFeedback(),/Repetição atualizada/);
 const edited=plain(b.state);b.window.saveStateNow=async()=>true;await b.window.retryMissionSave();assert.deepEqual(plain(b.state),edited);
});
test('campos inválidos preservam rascunho e mostram erro junto ao campo sem gravar',()=>{
 const b=create();let saves=0;b.window.saveStateNow=async()=>{saves++;return true;};
 for(const [field,bad] of [['time',''],['time','-10'],['time','3.5'],['complexity','8'],['date','']]){
  b.elements['ct-time'].value='30';b.elements['ct-complexity'].value='2';b.elements['ct-date'].value='2026-11-11';b.elements['ct-'+field].value=bad;
  b.elements['ct-'+field+'-error']={hidden:true,textContent:''};const before=plain(b.state);b.window.saveNewTask();
  assert.equal(b.elements['ct-'+field]['aria-invalid'],'true');assert.equal(b.elements['ct-'+field+'-error'].hidden,false);assert.deepEqual(plain(b.state),before);assert.equal(b.elements['ct-subtasks'].value,'Conferir');
 }
 assert.equal(saves,0);
});
test('formulários expõem erros vinculados aos campos, botões e feedback no rodapé',()=>{
 const b=create();for(const [prefix,html] of [['ct',b.window.renderCreateTaskModal()],['et',b.window.renderEditTaskModal({text:'Editar',day:'wednesday',planningWeekStart:'2026-11-09'})]]){
  for(const field of ['date','time','complexity','start-time','end-time'])assert.match(html,new RegExp('id="'+prefix+'-'+field+'-error"'));
  assert.match(html,/data-mission-save-feedback="form"/);assert.match(html,/aria-describedby="[^\"]*time-error/);
 }
});
test('falha inesperada vira nova tentativa; troca de sessão descarta resposta antiga',async()=>{
 const b=create();b.window.saveStateNow=()=>{throw Error('Indisponível');};await b.window.saveNewTask();assert.match(b.window.renderMissionSaveFeedback(),/não confirmado/);
 let release;b.window.saveStateNow=()=>new Promise(r=>release=r);const retry=b.window.retryMissionSave();b.window.resetMissionFeedback();release(true);await retry;
 assert.doesNotMatch(b.window.renderMissionSaveFeedback(),/Entrega fictícia|Salvo na nuvem/);
});
test('erros de campo sobrevivem à confirmação de descarte e somem ao corrigir o valor',()=>{
 const b=create();b.elements['ct-time-error']={hidden:true};b.elements['ct-time'].value='0';
 b.window.saveNewTask();assert.match(b.window.renderCreateTaskModal(),/aria-invalid="true"/);assert.match(b.window.renderCreateTaskModal(),/Informe a duração entre 5 e 240/);
 b.window.showConfirmModal('Descartar?',()=>{});b.window.closeConfirmModal?.();assert.match(b.window.renderCreateTaskModal(),/Informe a duração entre 5 e 240/);
 b.elements['ct-time'].value='30';b.window.clearMissionFieldError(b.elements['ct-time']);assert.doesNotMatch(b.window.renderCreateTaskModal(),/Informe a duração entre 5 e 240/);
});
test('reunião longa usa horários e não é bloqueada pela duração auxiliar',()=>{
 const b=create();b.elements['ct-activity-type']={value:'meeting'};b.elements['ct-time'].value='480';b.elements['ct-start-time']={value:'08:00'};b.elements['ct-end-time']={value:'16:00'};
 b.window.saveStateNow=async()=>true;b.window.saveNewTask();assert.equal(b.state.tasks[0].time,'480 min');
});
test('foco retorna à missão exata e não atravessa um formulário que continua aberto',()=>{
 const b=create();let focused='';const trigger={focus:()=>focused='missão'};const row={getAttribute:()=> '12.5',querySelector:()=>trigger};
 b.c.document.querySelectorAll=selector=>selector==='[data-daily-mission-row]'?[row]:[];b.elements['new-mission-button']={focus:()=>focused='nova'};
 b.window.restoreMissionFormOrigin('12.5');assert.equal(focused,'missão');b.window.restoreMissionFormOrigin('ausente');assert.equal(focused,'nova');
 b.window.getTopFormDialog=()=>({id:'create-task-dialog'});focused='rascunho';b.window.restoreMissionFormOrigin('12.5');assert.equal(focused,'rascunho');
});
