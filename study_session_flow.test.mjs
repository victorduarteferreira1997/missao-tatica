import test from 'node:test';
import assert from 'node:assert/strict';
import {boot,plain} from './test-support/app_boot.mjs';
function fixture(){
 const b=boot();b.state.studyData.subjects=[{id:101,name:'Disciplina'}];
 b.state.studyData.studyPlan.weeklyBlocks=[{id:'a',title:'Bloco A',subjectId:101,plannedMinutes:30,studyType:'teoria',day:'tuesday',status:'planned',campaignId:1},{id:'b',title:'Bloco B',subjectId:101,plannedMinutes:45,studyType:'questoes',day:'tuesday',status:'planned',campaignId:1}];
 for(const [id,value]of Object.entries({'session-subject':'','session-topic':'','session-type':'leitura','session-duration':'60','session-q-total':'0','session-q-correct':'0','session-conf-before':'2','session-conf-after':'4'}))b.elements[id]={value};
 b.window.showToast=()=>{};b.window.showAlertModal=message=>{b.alert=message;};let saves=0;b.window.saveState=()=>saves++;b.window.saveStudyPlanningState=()=>saves++;
 return {...b,get saves(){return saves;},get alert(){return b.alert;},open(id='a'){b.window.prefillStudySessionFromPlan(id);return [...b.timers.values()].at(-1);}};
}
test('abrir e preencher sessão planejada não modifica progresso nem solicita gravação',()=>{
 const b=fixture(),before=plain(b.state),fill=b.open();fill();assert.equal(b.elements['session-topic'].value,'Bloco A');assert.equal(Number(b.elements['session-duration'].value),30);assert.deepEqual(plain(b.state),before);assert.equal(b.saves,0);
});
test('somente registro válido atualiza o bloco de origem para parcial, sem concluir ou duplicar',()=>{
 const b=fixture();b.open()();b.elements['session-duration'].value='';b.window.logStudySession();assert.match(b.alert,/5 minutos/);assert.equal(b.state.studyData.sessions.length,0);assert.equal(b.state.studyData.studyPlan.weeklyBlocks[0].status,'planned');assert.equal(b.saves,0);
 b.elements['session-duration'].value='25';b.window.logStudySession();assert.equal(b.state.studyData.sessions.length,1);assert.equal(b.state.studyData.sessions[0].duration,25);assert.equal(b.state.studyData.studyPlan.weeklyBlocks[0].status,'partial');assert.equal(b.state.studyData.studyPlan.weeklyBlocks[1].status,'planned');assert.equal(b.ui.studySessionPlanOrigin,null);assert.equal(b.saves,1);
});
test('fechar, trocar de aba ou abrir outro bloco cancela o preenchimento atrasado anterior',()=>{
 for(const leave of [b=>{b.ui.showStudyModal=false;},b=>b.window.setStudyTab('planning'),b=>{b.state.currentPlanningWeekStart='2026-11-09';}]){const b=fixture(),fill=b.open();leave(b);fill();assert.equal(b.elements['session-topic'].value,'');assert.equal(b.state.studyData.studyPlan.weeklyBlocks[0].status,'planned');assert.equal(b.saves,0);}
 const b=fixture(),first=b.open('a'),second=b.open('b');first();assert.equal(b.elements['session-topic'].value,'');second();assert.equal(b.elements['session-topic'].value,'Bloco B');assert.equal(b.saves,0);
});
test('sessão com contexto alterado não modifica bloco de outra semana, removido ou já concluído',()=>{
 for(const change of [b=>{b.state.currentPlanningWeekStart='2026-11-09';},b=>{b.state.studyData.studyPlan.weeklyBlocks[0].status='completed';},b=>{b.state.studyData.studyPlan.weeklyBlocks.shift();},b=>{b.elements['session-topic'].value='Estudo avulso';},b=>{b.ui.studySessionPlanOrigin={...b.ui.studySessionPlanOrigin,state:{}};}]){
  const b=fixture();b.open()();change(b);const before=plain(b.state.studyData.studyPlan.weeklyBlocks);b.window.logStudySession();assert.equal(b.state.studyData.sessions.length,1);assert.deepEqual(plain(b.state.studyData.studyPlan.weeklyBlocks),before);
 }
});
