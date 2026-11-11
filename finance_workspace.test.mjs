import test from 'node:test';
import assert from 'node:assert/strict';
import {installFinanceWorkspace} from './ui/finance_workspace.v1.js';
import {boot,plain} from './test-support/app_boot.mjs';
function fixture(){let state={},ui={confirm:{},alert:{},customPrompt:{}},fields={};const doc={activeElement:null,getElementById:id=>fields[id]},w={};installFinanceWorkspace(w,{document:doc,getState:()=>state,getUiState:()=>ui});return {w,doc,fields,get ui(){return ui;},switchAccount(){state={};},dialog(tab,period='all',top=0){const body={scrollTop:top};return {dataset:{workTab:tab,financePeriod:period},body,querySelector:()=>body,contains:el=>Object.values(fields).includes(el)};}};}
test('cada aba e período financeiro conserva a própria posição, inclusive após fechar',()=>{
 const f=fixture();f.w.captureFinanceWorkspace(f.dialog('variaveis','all',430));f.w.captureFinanceWorkspace(f.dialog('receitas','all',180));f.w.captureFinanceWorkspace(f.dialog('variaveis','current',90));
 for(const [tab,period,expected] of [['variaveis','all',430],['receitas','all',180],['variaveis','current',90],['variaveis','previous',0]]){const d=f.dialog(tab,period,999);f.w.restoreFinanceWorkspace(d);assert.equal(d.body.scrollTop,expected);}
});
test('voltar de confirmação preserva cursor sem tirar o foco da confirmação aberta',()=>{
 const f=fixture();let focus=0,caret;const input={id:'var-desc',selectionStart:3,selectionEnd:7,disabled:false,getClientRects:()=>[{}],focus:()=>focus++,setSelectionRange:(a,b)=>caret=[a,b]};f.fields['var-desc']=input;f.doc.activeElement=input;const d=f.dialog('variaveis','all',200);f.w.captureFinanceWorkspace(d);f.ui.confirm.show=true;f.w.restoreFinanceWorkspace(d);assert.equal(focus,0);f.ui.confirm.show=false;f.w.restoreFinanceWorkspace(d);assert.equal(focus,1);assert.deepEqual(caret,[3,7]);
});
test('seleções sobrevivem ao cadastro; texto e valor enviados são limpos antes de novo clique',()=>{
 const f=fixture();for(const [id,value] of Object.entries({'var-desc':'Livro','var-amount':'25','var-cat':'Educação','var-trigger':'Planejado'}))f.fields[id]={value};f.w.resetFinanceSavedFields('variaveis');assert.equal(f.fields['var-desc'].value,'');assert.equal(f.fields['var-amount'].value,'');f.fields['var-cat']={value:'Outro',options:[{value:'Educação'},{value:'Outro'}]};f.fields['var-trigger']={value:'Impulso'};f.w.restoreFinanceWorkspace(f.dialog('variaveis'));assert.equal(f.fields['var-cat'].value,'Educação');assert.equal(f.fields['var-trigger'].value,'Planejado');
 // Defaults are consumed once; later user changes are respected.
 f.fields['var-cat'].value='Outro';f.w.restoreFinanceWorkspace(f.dialog('variaveis'));assert.equal(f.fields['var-cat'].value,'Outro');
});
test('posição e seleções não atravessam troca de conta ou limpeza do módulo',()=>{
 const f=fixture();f.w.captureFinanceWorkspace(f.dialog('variaveis','all',300));f.switchAccount();const d=f.dialog('variaveis','all',90);f.w.restoreFinanceWorkspace(d);assert.equal(d.body.scrollTop,0);f.w.captureFinanceWorkspace(f.dialog('receitas','all',170));f.w.clearFinanceWorkspace();const fresh=f.dialog('receitas');f.w.restoreFinanceWorkspace(fresh);assert.equal(fresh.body.scrollTop,0);
});
test('repetir clique em receita, conta fixa ou diário não duplica registro nem recompensa',()=>{
 for(const [handler,values,collection] of [['addIncome',{'inc-desc':'Salário','inc-amount':'10','inc-cat':'Extra'},'incomes'],['addFixedExpense',{'fix-desc':'Internet','fix-amount':'20','fix-cat':'Outro'},'fixedExpenses'],['logMoneyJournal',{'mj-event':'Organizei as contas','mj-thought':'','mj-mood':'Calmo'},'moneyJournal']]){
  const b=boot();b.window.saveState=()=>{};b.window.showToast=()=>{};b.window.showAlertModal=()=>{};b.window.checkLevelUp=()=>{};b.window.checkGameTriggers=()=>{};for(const [id,value] of Object.entries(values))b.elements[id]={value};const beforeXp=b.state.xp;b.window[handler]();const afterXp=b.state.xp;b.window[handler]();assert.equal(b.state.financeData[collection].length,1);assert.equal(b.state.xp,afterXp);assert.equal(afterXp-beforeXp,handler==='logMoneyJournal'?15:0);
 }
});
test('voltar da revisão da compra libera formulário e preserva os dados sem criar gasto ou XP',()=>{
 const b=boot();b.window.showToast=()=>{};for(const [id,value] of Object.entries({'var-desc':'Livro','var-amount':'180','var-cat':'Educação','var-trigger':'Planejado'}))b.elements[id]={value};const before=plain(b.state);b.window.tryAddVariableExpense();assert.ok(b.ui.financeGuardianData);b.window.backToFinanceForm();assert.equal(b.ui.financeGuardianData,null);assert.equal(b.ui.customPrompt.show,false);assert.equal(b.elements['var-desc'].value,'Livro');assert.deepEqual(plain(b.state),before);b.elements['var-amount'].value='15';b.window.saveState=()=>{};b.window.tryAddVariableExpense();assert.equal(b.state.financeData.variableExpenses.length,1);assert.equal(b.state.financeData.variableExpenses[0].amount,15);
});
test('paginar desloca foco para o histórico e mantém rascunho, sem gravar dados',()=>{
 const b=boot();b.state.financeData.incomes=Array.from({length:15},(_,i)=>({id:i,date:'2026-10-06',amount:1,description:'Receita '+i}));let focused=0,scrolled=0,saves=0;b.elements['finance-history']={focus:()=>focused++,scrollIntoView:()=>scrolled++};b.window.saveState=()=>saves++;b.ui.workDrafts={'finance:receitas':{fields:[{id:'inc-desc',value:'Rascunho'}]}};const before=plain(b.state);b.window.setFinancePage('receitas',1);assert.equal(b.ui.financePages.receitas,1);assert.equal(focused,1);assert.equal(scrolled,1);assert.equal(saves,0);assert.deepEqual(plain(b.state),before);assert.equal(b.ui.workDrafts['finance:receitas'].fields[0].value,'Rascunho');
});
