import test from 'node:test';
import assert from 'node:assert/strict';
import {installStudyWorkspace} from './ui/study_workspace.v1.js';
import {boot,plain} from './test-support/app_boot.mjs';
const field=(id,value='',extra={})=>({id,value,checked:false,type:'text',tagName:'INPUT',...extra});
const section=(id,open=false)=>({open,getAttribute:name=>name==='data-work-section'?id:null});
function dialog(tab,inputs=[],details=[],record='new',top=0){const body={scrollTop:top};return {dataset:{workTab:tab,studyRecord:record},body,inputs,details,querySelector:s=>s==='#study-modal-scroll'?body:s==='[data-work-section="plan-editor"]'?details.find(d=>d.getAttribute('data-work-section')==='plan-editor'):null,querySelectorAll:s=>s.startsWith('input')?inputs:details};}
function fixture(){let ui={};const document={getElementById:id=>fields.find(el=>el.id===id)},fields=[];const w={};installStudyWorkspace(w,{document,getUiState:()=>ui});return {w,fields,reset:()=>ui={},get ui(){return ui;}};}
test('disciplinas mantêm rascunho, trilha, seções e posição ao voltar à aba',()=>{
 const {w}=fixture(),before=dialog('subjects',[field('new-subject-name','Privacidade'),field('new-subject-track','carreira')],[section('subject-create',true)],'new',280);w.captureStudyWorkspace(before);
 const after=dialog('subjects',[field('new-subject-name'),field('new-subject-track')],[section('subject-create')]);w.restoreStudyWorkspace(after);assert.equal(after.inputs[0].value,'Privacidade');assert.equal(after.inputs[1].value,'carreira');assert.equal(after.details[0].open,true);assert.equal(after.body.scrollTop,280);
});
test('dias escolhidos e detalhes opcionais sobrevivem à abertura de confirmação',()=>{
 const {w}=fixture(),days=()=>[field('study-block-title','Leitura'),field('', 'monday',{name:'study-block-days',type:'checkbox',checked:true}),field('', 'friday',{name:'study-block-days',type:'checkbox',checked:false})];
 w.captureStudyWorkspace(dialog('planning',days(),[section('plan-options',true)]));const next=dialog('planning',days().map(el=>({...el,value:el.id?'':el.value,checked:!el.checked})),[section('plan-options')]);w.restoreStudyWorkspace(next);assert.equal(next.inputs[0].value,'Leitura');assert.equal(next.inputs[1].checked,true);assert.equal(next.inputs[2].checked,false);assert.equal(next.details[0].open,true);
});
test('rascunho novo e edições de dois estudos não se misturam',()=>{
 const {w}=fixture();for(const [id,text] of [['new','Novo'],['1','Primeiro'],['2','Segundo']])w.captureStudyWorkspace(dialog('planning',[field('study-block-title',text)],[],id));
 for(const [id,text] of [['2','Segundo'],['new','Novo'],['1','Primeiro']]){const d=dialog('planning',[field('study-block-title')],[],id);w.restoreStudyWorkspace(d);assert.equal(d.inputs[0].value,text);}
});
test('cancelar ou salvar edição descarta só esse rascunho; reabrir usa registro atualizado',()=>{
 const {w}=fixture();w.captureStudyWorkspace(dialog('planning',[field('study-block-title','Novo ainda não salvo')]));w.captureStudyWorkspace(dialog('planning',[field('study-block-title','Alteração cancelada')],[], '1'));w.resetStudyEditorDraft('1');w.captureStudyWorkspace(dialog('planning',[field('study-block-title','Alteração cancelada')],[],'1'));
 const fresh=dialog('planning',[field('study-block-title','Registro salvo')],[section('plan-editor')],'1');w.restoreStudyWorkspace(fresh);assert.equal(fresh.inputs[0].value,'Registro salvo');assert.equal(fresh.details[0].open,true);
 const draft=dialog('planning',[field('study-block-title')]);w.restoreStudyWorkspace(draft);assert.equal(draft.inputs[0].value,'Novo ainda não salvo');
});
test('substituição da interface na troca de conta não restaura rascunho anterior',()=>{
 const f=fixture();f.w.captureStudyWorkspace(dialog('subjects',[field('new-subject-name','Privado')]));f.reset();const d=dialog('subjects',[field('new-subject-name')]);f.w.restoreStudyWorkspace(d);assert.equal(d.inputs[0].value,'');
});
test('seleção removida não é restaurada e limpeza de planejamento mantém rascunho de disciplinas',()=>{
 const f=fixture();f.w.captureStudyWorkspace(dialog('subjects',[field('new-subject-track','removida')]));f.w.captureStudyWorkspace(dialog('planning',[field('study-block-title','Plano')]));f.w.clearStudyWorkspaceDrafts('planning');
 const d=dialog('subjects',[field('new-subject-track','',{tagName:'SELECT',options:[{value:''},{value:'carreira'}]})]);f.w.restoreStudyWorkspace(d);assert.equal(d.inputs[0].value,'');assert.ok(f.ui.studyWorkspace.drafts['subjects:']);assert.ok(!f.ui.studyWorkspace.drafts['planning:new']);
});
test('salvar disciplina limpa só o nome e impede segundo cadastro por clique repetido',()=>{
 const b=boot();b.elements['new-subject-name']={value:'Direitos fundamentais'};b.elements['new-subject-track']={value:'concurso'};b.elements['new-subject-color']={value:'bg-cyan-500'};b.window.saveStudyPlanningState=()=>{};b.window.showToast=()=>{};let errors=0;b.window.showAlertModal=()=>errors++;
 const xp=b.state.xp;b.window.addSubject();b.window.addSubject();assert.equal(b.state.studyData.subjects.length,1);assert.equal(b.elements['new-subject-name'].value,'');assert.equal(b.elements['new-subject-track'].value,'concurso');assert.equal(errors,1);assert.equal(b.state.xp,xp);
});
test('salvar bloco preserva seleção, duração e dias, limpando o conteúdo já cadastrado',()=>{
 const b=boot(),values={'study-block-title':'Revisar privacidade','study-block-track':'carreira','study-block-subject':'','study-block-minutes':'45','study-block-type':'revisao','study-block-notes':'Anotações','study-block-start-time':'09:00','study-block-end-time':'09:45'};
 for(const [id,value] of Object.entries(values))b.elements[id]={value};b.window.getSelectedStudyPlanDays=()=>['tuesday','thursday'];b.window.readCalendarTimeFields=()=>({startTime:'09:00',endTime:'09:45'});b.window.saveStudyPlanningState=()=>{};b.window.showToast=()=>{};
 b.window.addStudyPlanBlock();assert.equal(b.state.studyData.studyPlan.weeklyBlocks.length,2);assert.equal(b.elements['study-block-title'].value,'');assert.equal(b.elements['study-block-notes'].value,'');assert.equal(b.elements['study-block-start-time'].value,'');assert.equal(b.elements['study-block-minutes'].value,'45');assert.equal(b.elements['study-block-track'].value,'carreira');assert.deepEqual(plain(b.state.studyData.studyPlan.weeklyBlocks.map(x=>[x.day,x.plannedMinutes])),[['tuesday',45],['thursday',45]]);
});
