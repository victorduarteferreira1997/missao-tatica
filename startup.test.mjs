import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
import {createCalendarSync} from './calendar_sync.js';
import {installFormDialogs} from './ui/form_dialogs.v1.js';
import {installTaskForms} from './ui/task_forms.v1.js';
import {installPlanningViews} from './ui/planning_views.v1.js';
const app=await readFile(new URL('./app.html',import.meta.url),'utf8');
const moduleSource=app.match(/<script\s+type="module">([\s\S]*?)<\/script>/)[1].replace(/^\s*import .+;\s*$/gm,'');
const plain=v=>JSON.parse(JSON.stringify(v));
class FixedDate extends Date{constructor(...args){super(...(args.length?args:['2026-10-06T22:30:00Z']));}static now(){return Date.parse('2026-10-06T22:30:00Z');}}
function boot(saved=null){
 const elements={};const element=()=>({style:{},classList:{add(){},remove(){}},querySelector(){return null;},querySelectorAll(){return [];},addEventListener(){},innerHTML:''});
 for(const id of ['app','auth-overlay','app-wrapper','sync-text','sync-indicator','auth-access-message'])elements[id]=element();
 const stored=new Map(saved?[['planeamento_semanal_v11',JSON.stringify(saved)]]:[]),writes=[];
 const document={activeElement:null,getElementById:id=>elements[id]||null,querySelector(){return null;},querySelectorAll(){return [];},addEventListener(){}};
 const window={lucide:{createIcons(){}},location:{origin:'https://victorduarteferreira1997.github.io',pathname:'/missao-tatica/app.html'},addEventListener(){}};
 const c={window,document,Date:FixedDate,console,TextEncoder,Uint8Array,Uint32Array,DataView,URL,Blob,Intl,localStorage:{getItem:key=>stored.get(key)||null,setItem:(key,value)=>{stored.set(key,value);writes.push(key);}},
 setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},lucide:window.lucide,initializeApp:()=>({}),initializeAppCheck(){},ReCaptchaEnterpriseProvider:class{},getAuth:()=>({}),getFirestore:()=>({}),GoogleAuthProvider:class{},signInWithPopup(){},signInWithRedirect(){},signOut:async()=>{},onAuthStateChanged:(auth,callback)=>c.authCallback=callback,doc(){},getDoc(){throw Error('A inicialização não deve ler a nuvem sem login.');},setDoc(){throw Error('O teste não deve gravar na nuvem.');},createCalendarSync,installFormDialogs,installTaskForms,installPlanningViews};
 runInNewContext(moduleSource+'\nwindow.startupForTest = {getState:()=>state,getUI:()=>uiState,getTimer:()=>pomodoro,render};',c,{timeout:3000});
 return {c,window,elements,stored,writes,state:window.startupForTest.getState(),ui:window.startupForTest.getUI(),render:window.startupForTest.render};
}
test('módulo completo inicializa conta nova e mantém a tela de login sem ler ou gravar na nuvem',async()=>{
 const b=boot();assert.equal(b.state.xp,0);assert.equal(b.state.tasks.length,0);assert.deepEqual(plain(b.state.rewardOverrides),{});
 await b.c.authCallback(null);assert.equal(b.elements['auth-overlay'].style.display,'flex');assert.equal(b.elements['app-wrapper'].style.display,'none');assert.equal(b.writes.length,0);
});
test('módulo completo migra estado anterior com alvo oficial antes dos helpers de tela sem perder registros',()=>{
 const previous={ownerUid:'test-owner',activeTab:'monday',xp:25100,level:10,coins:100,energy:72,combo:0,unlockedBadges:[],tasks:[],quickTasks:[],stats:{},customRewards:[],rewardPurchases:[{id:'old',title:'30 min de Videogame',cost:220,date:'2026-10-01'}],
 economy:{weekStartKey:'2026-10-05',tacticalReserve:200,weeklyCoinsEarned:100,targetReward:{type:'default',id:'r2',title:'30 min de Videogame',cost:220}},rewardOverrides:{r2:{name:'Videogame',durationMinutes:120,cost:450,desc:'Sessão escolhida',version:'test'}},userProfile:{displayName:'Pessoa teste',gender:'feminino',configured:true},financeData:{incomes:[{id:'income',amount:14000,date:'2026-10-01'}],fixedExpenses:[],variableExpenses:[],debts:[],goals:[],categoryBudgets:[],moneyJournal:[]}};
 const b=boot(previous);assert.equal(b.state.xp,previous.xp);assert.equal(b.state.coins,100);assert.equal(b.state.economy.tacticalReserve,200);assert.equal(b.state.economy.targetReward.cost,450);assert.equal(b.state.economy.targetReward.title,'Videogame · 2 h');assert.deepEqual(plain(b.state.rewardPurchases),previous.rewardPurchases.map(r=>({...r,campaignId:null})));assert.deepEqual(plain(b.state.financeData.incomes),previous.financeData.incomes.map(r=>({...r,campaignId:null})));
 b.window.saveState(true,'release-startup');const persisted=JSON.parse(b.stored.get('planeamento_semanal_v11'));assert.equal(persisted.rewardOverrides.r2.cost,450);assert.equal(persisted.financeData.incomes[0].amount,14000);assert.equal(persisted.lastSaveReason,'release-startup');
});
test('integração completa monta Missões, Semana, Radar e todas as janelas sem dados pessoais',()=>{
 const b=boot();b.state.userProfile={displayName:'Teste',gender:'feminino',configured:true};
 for(const view of ['day','week','radar']){b.ui.mainView=view;b.render();assert.match(b.elements.app.innerHTML,/MISSÃO TÁTICA/);assert.ok(!b.elements.app.innerHTML.includes('undefined'))}
 for(const tab of ['roadmap','badges','performance','shop']){b.ui.showStatsModal=true;b.ui.statsTab=tab;b.render();assert.match(b.elements.app.innerHTML,/Quartel General/);}b.ui.showStatsModal=false;
 for(const [flag,tabs,tabKey] of [['showFinanceModal',['dashboard','receitas','fixas','variaveis','diario'],'financeTab'],['showStudyModal',['plano','planning','log','ciclos','subjects','erros','dashboard','reviews'],'studyTab'],['showHealthModal',['dashboard','treinos','metricas','habitos'],'healthTab']]){b.ui[flag]=true;for(const tab of tabs){b.ui[tabKey]=tab;b.render();assert.ok(b.elements.app.innerHTML.length>1000);}b.ui[flag]=false;}
 for(const flag of ['showRitualModal','showRechargeModal','showProfileModal']){b.ui[flag]=true;b.render();assert.ok(b.elements.app.innerHTML.length>1000);b.ui[flag]=false;}
 b.window.openIndependentPomodoro();assert.match(b.elements.app.innerHTML,/Pomodoro livre/);assert.match(b.elements.app.innerHTML,/independent-activity/);assert.equal(b.state.tasks.length,0);
});
test('entradas principal/antiga preservam parâmetros e prévias sem parâmetros abrem a versão revisada',async()=>{
 for(const file of ['index.html','teste_novos_modulos.html']){const html=await readFile(new URL('./'+file,import.meta.url),'utf8');const source=html.match(/<script>([\s\S]*?)<\/script>/)[1];let url;runInNewContext(source,{window:{location:{search:'?v=v1.9.59',hash:'#qg',replace:value=>url=value}}});assert.equal(url,'app.html?v=v1.9.59#qg');}
 for(const file of ['preview_layout_verified.html','preview_layout_simplification.html']){const html=await readFile(new URL('./'+file,import.meta.url),'utf8');assert.match(html,/c3a974c4e82589e5a3fd35d739b3aac7ea565054/);assert.ok(!html.includes('v1.9.34'));assert.match(html,/requestedCommit/);assert.match(html,/actualBuild.startsWith\(version/);}
});
