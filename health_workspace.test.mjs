import test from 'node:test';
import assert from 'node:assert/strict';
import {installHealthWorkspace} from './ui/health_workspace.v1.js';
import {boot,plain} from './test-support/app_boot.mjs';
function fixture(){let state={},ui={confirm:{},alert:{},customPrompt:{}};const fields={},doc={activeElement:null,getElementById:id=>fields[id]},w={};installHealthWorkspace(w,{document:doc,getState:()=>state,getUiState:()=>ui});return {w,doc,fields,ui,switchAccount(){state={};},dialog(tab,top=0){const body={scrollTop:top};return {dataset:{workTab:tab},body,querySelector:()=>body,contains:el=>Object.values(fields).includes(el)};}};}
test('cada aba de Corpo mantém a posição ao voltar e uma aba nova começa no início',()=>{
 const f=fixture();f.w.captureHealthWorkspace(f.dialog('treinos',420));f.w.captureHealthWorkspace(f.dialog('metricas',170));for(const [tab,expected] of [['treinos',420],['metricas',170],['habitos',0]]){const d=f.dialog(tab,999);f.w.restoreHealthWorkspace(d);assert.equal(d.body.scrollTop,expected);}
});
test('trocar conta ou limpar Corpo descarta somente o contexto visual dessa sessão',()=>{
 const f=fixture();f.w.captureHealthWorkspace(f.dialog('treinos',420));f.switchAccount();const next=f.dialog('treinos',999);f.w.restoreHealthWorkspace(next);assert.equal(next.body.scrollTop,0);f.w.captureHealthWorkspace(f.dialog('metricas',150));f.w.clearHealthWorkspace();const clean=f.dialog('metricas');f.w.restoreHealthWorkspace(clean);assert.equal(clean.body.scrollTop,0);
});
test('cadastro mantém modalidade e intensidade, limpa duração e notas e respeita a edição seguinte',()=>{
 const f=fixture();for(const [id,value] of Object.entries({'wo-type':'Musculação','wo-intensity':'Moderado','wo-duration':'30','wo-notes':'Rascunho enviado'}))f.fields[id]={value};f.w.resetHealthSavedFields('treinos');assert.equal(f.fields['wo-duration'].value,'');assert.equal(f.fields['wo-notes'].value,'');f.fields['wo-type'].value='Yoga / Alongamento';f.fields['wo-intensity'].value='Leve';f.fields['wo-duration'].value='45';f.w.restoreHealthWorkspace(f.dialog('treinos'));assert.equal(f.fields['wo-type'].value,'Musculação');assert.equal(f.fields['wo-intensity'].value,'Moderado');assert.equal(f.fields['wo-duration'].value,'');f.fields['wo-duration'].value='20';f.w.restoreHealthWorkspace(f.dialog('treinos'));assert.equal(f.fields['wo-duration'].value,'20');
});
test('cursor é restaurado após confirmação, sem focar campos por trás de outra janela',()=>{
 const f=fixture();let focused=0,caret;const field={id:'wo-notes',selectionStart:2,selectionEnd:5,focus:()=>focused++,setSelectionRange:(...args)=>caret=args,getClientRects:()=>[{}]};f.fields['wo-notes']=field;f.doc.activeElement=field;const d=f.dialog('treinos');f.w.captureHealthWorkspace(d);f.ui.alert.show=true;f.w.restoreHealthWorkspace(d);assert.equal(focused,0);f.ui.alert.show=false;f.w.restoreHealthWorkspace(d);assert.equal(focused,1);assert.deepEqual(caret,[2,5]);
});
test('cliques repetidos em treino não duplicam registro, XP ou efeito na bateria',()=>{
 const b=boot();b.window.saveState=()=>{};b.window.showToast=()=>{};b.window.showAlertModal=()=>{};b.window.checkGameTriggers=()=>{};b.window.checkLevelUp=()=>{};for(const [id,value] of Object.entries({'wo-type':'Musculação','wo-intensity':'Moderado','wo-duration':'30','wo-notes':'Teste'}))b.elements[id]={value};b.window.logWorkout();assert.equal(b.state.healthData.workouts.length,1);const after=plain(b.state);b.window.logWorkout();assert.deepEqual(plain(b.state),after);assert.equal(b.elements['wo-duration'].value,'');assert.equal(b.elements['wo-type'].value,'Musculação');
});
test('medidas e check-in parciais limpam o formulário, preservam ausências e não duplicam recompensas',()=>{
 const b=boot();b.window.saveState=()=>{};b.window.showToast=()=>{};b.window.showAlertModal=()=>{};b.window.checkGameTriggers=()=>{};b.window.checkLevelUp=()=>{};b.elements['metric-weight']={value:'80.5'};b.elements['metric-waist']={value:''};b.window.logBodyMetric();b.window.logBodyMetric();assert.equal(b.state.healthData.bodyMetrics.length,1);assert.equal(b.state.healthData.bodyMetrics[0].waist,null);
 for(const [id,value] of Object.entries({'habit-sleep':'0','habit-water':'','habit-mood':'','habit-fatigue':''}))b.elements[id]={value};const xp=b.state.xp;b.window.logHabit();b.window.logHabit();assert.equal(b.state.healthData.habits.length,1);assert.equal(b.state.healthData.habits[0].sleep,0);assert.equal(b.state.healthData.habits[0].water,null);assert.equal(b.state.xp,xp+20);assert.equal(b.elements['habit-sleep'].value,'');assert.equal(b.elements['habit-mood'].value,'');
});
test('paginação de Corpo focaliza histórico e preserva rascunhos sem gravar registros',()=>{
 const b=boot();b.state.healthData.workouts=Array.from({length:13},(_,i)=>({id:i,date:'2026-10-06',type:'Musculação',duration:20}));let focused=0,scrolled=0,saves=0;b.elements['health-history']={focus:()=>focused++,scrollIntoView:()=>scrolled++};b.window.saveState=()=>saves++;b.ui.workDrafts={'health:treinos':{fields:[{id:'wo-notes',value:'Ainda não salvei'}]}};const before=plain(b.state);b.window.setHealthPage('treinos',1);assert.equal(b.ui.healthPages.treinos,1);assert.equal(focused,1);assert.equal(scrolled,1);assert.equal(saves,0);assert.deepEqual(plain(b.state),before);assert.equal(b.ui.workDrafts['health:treinos'].fields[0].value,'Ainda não salvei');
});
test('histórico formata decimais em português e distingue zero de valor não informado',()=>{
 const b=boot(),before=plain(b.state);const metric=b.window.renderHealthRow({date:'2026-11-11',weight:81.2,waist:null},'metricas');assert.match(metric,/81,2 kg/);assert.match(metric,/Não informado/);const habits=b.window.renderHealthRow({date:'2026-11-11',sleep:0,water:null},'habitos');assert.match(habits,/0 h/);assert.ok(!habits.includes('0 L'));assert.deepEqual(plain(b.state),before);
});
