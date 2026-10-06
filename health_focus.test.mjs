import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
const app=await readFile(new URL('./app.html',import.meta.url),'utf8');
const section=(start,end)=>{const a=app.indexOf(start),b=app.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,start);return app.slice(a,b);};
const plain=v=>JSON.parse(JSON.stringify(v));
class FixedDate extends Date{constructor(...args){super(...(args.length?args:['2026-10-06T20:00:00Z']));}static now(){return Date.parse('2026-10-06T20:00:00Z');}}
function engine(){
 const elements={};let id=0;
 const c={state:{xp:200,coins:71,energy:94,prestige:{campaign:3},healthData:{workouts:[],bodyMetrics:[],habits:[],goals:[{title:'Preservar'}]},focusData:{cycles:[]},tasks:[{id:'123.45',text:'Missão teste',day:'ter',category:'work',completed:false}],activeTab:'ter',currentFilter:'all',focusedTaskId:'123.45',stats:{pomodorosCompleted:0},economy:{rules:{pomodoroCoins:10}},pomodoroSettings:{focus:25,shortBreak:5,longBreak:15,cycles:4}},
 uiState:{healthTab:'dashboard',confirm:{},alert:{},customPrompt:{}},pomodoro:{isRunning:false,timeLeft:1500,mode:'focus',cycle:1},Date:FixedDate,render(){},
 setInterval(callback){c.tick=callback;return 1;},clearInterval(){},Audio:function(){this.play=()=>{};},
 document:{activeElement:null,getElementById:id=>elements[id]||null},
 window:{showToast(){},showAlertModal(message){c.alert=message;},checkLevelUp(){},checkGameTriggers(){},saveState(){c.saves=(c.saves||0)+1;},
 newFinanceRecordId:()=>`fin-${++id}`,normalizePrestige:()=>c.state.prestige,formatTime:seconds=>`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`,
 getComboMultiplier:()=>1,awardTacticalCoins(){c.state.coins+=10;return 10;},recordCampaignStat(){},bindFormDialog(root,options){c.binding=options;}}};
 runInNewContext([
 section('const WORKOUT_TYPES =','const DEFAULT_RECHARGE_ACTIONS ='),
 section('window.getLocalDateKey =','window.spawnFloatingText ='),section('window.escapeHtml =','// Ponte temporária'),section('window.changeEnergy =','window.getMissionStatus ='),
 section('window.getFinanceSum =','// Exportação financeira XLSX:'),
 section('const HEALTH_TABS =','// MÓDULO 3: TESOURARIA TÁTICA'),section('window.renderWorkDialog =','const FINANCE_TABS ='),
 section('window.renderHealthForm =','// --- FINANÇAS ---'),
 section('window.findTaskByExactId =','window.renderQGPerformanceDashboard ='),
 'window.healthView=renderHealthContent;'
 ].join('\n'),c);
 c.field=(id,value,extra={})=>elements[id]={id,value:String(value),...extra};return c;
}
test('Corpo começa com resumo vazio claro e formulários recolhidos, sem diagnóstico pela bateria',()=>{
 const c=engine(),before=JSON.stringify(c.state);const html=c.window.healthView();assert.ok(!/999|Sedentarismo|Condição Ideal|carga moderada/.test(html));assert.match(html,/Nenhum treino registrado/);assert.equal(JSON.stringify(c.state),before);
 for(const tab of ['treinos','metricas','habitos']){c.window.setHealthTab(tab);assert.ok(!/<details[^>]*\sopen(?:\s|>)/.test(c.window.healthView()));}
 assert.match(c.window.renderHealthDialog(),/role="dialog" aria-modal="true"/);assert.match(c.window.renderHealthDialog(),/health-module-body/);
});
test('resumo conta sete dias locais, exclui datas futuras/inválidas e mantém todo o histórico',()=>{
 const c=engine();c.state.healthData.workouts=[{date:'2026-09-30',duration:20},{date:'2026-09-29',duration:10},{date:'2026-10-06',duration:30},{date:'2027-01-01',duration:40},{date:null,duration:50}];
 const s=c.window.getHealthSummary();assert.equal(s.total,5);assert.equal(s.recent,2);assert.equal(s.minutes,50);assert.equal(s.lastKey,'2026-10-06');assert.equal(s.days,0);
});
test('registrar treino preserva bônus e HP das modalidades e guarda efeito real da campanha',()=>{
 const c=engine();c.field('wo-type','Musculação');c.field('wo-intensity','Moderado');c.field('wo-notes','Ficha teste');
 for(const duration of ['',0,-5,'NaN']){c.field('wo-duration',duration);c.window.logWorkout();}assert.equal(c.state.healthData.workouts.length,0);
 c.field('wo-duration',45);c.window.logWorkout();assert.equal(c.state.xp,270);assert.equal(c.state.energy,74);assert.equal(c.state.coins,71);assert.equal(c.state.healthData.workouts[0].xpCampaign,3);assert.equal(c.state.healthData.workouts[0].energyDeltaApplied,-20);
 c.state.energy=99;c.field('wo-type','Descanso ativo');c.field('wo-intensity','Leve');c.window.logWorkout();assert.equal(c.state.energy,100);assert.equal(c.state.healthData.workouts[1].energyDeltaApplied,1);
});
test('medidas parciais não inventam zeros e entradas inválidas não alteram progresso',()=>{
 const c=engine();c.field('metric-weight','');c.field('metric-waist','');c.window.logBodyMetric();assert.equal(c.state.healthData.bodyMetrics.length,0);
 c.field('metric-weight',78.2);c.window.logBodyMetric();assert.equal(c.state.healthData.bodyMetrics[0].waist,null);assert.equal(c.state.xp,200);
 c.field('metric-weight',-1);c.window.logBodyMetric();assert.equal(c.state.healthData.bodyMetrics.length,1);
});
test('check-in aceita itens opcionais e zeros reais, sem valores de sono/água predefinidos',()=>{
 const c=engine();for(const id of ['habit-sleep','habit-water','habit-mood','habit-fatigue'])c.field(id,'');
 c.window.logHabit();assert.equal(c.state.healthData.habits.length,0);c.field('habit-sleep',25);c.window.logHabit();assert.equal(c.state.healthData.habits.length,0);
 c.field('habit-sleep','');c.field('habit-mood','Bom');c.window.logHabit();assert.equal(c.state.healthData.habits[0].sleep,null);assert.equal(c.state.healthData.habits[0].water,null);assert.equal(c.state.xp,220);
 c.field('habit-sleep',0);c.field('habit-water',0);c.window.logHabit();assert.equal(c.state.healthData.habits[1].sleep,0);assert.equal(c.state.healthData.habits[1].xpAwarded,20);
});
test('históricos de Corpo e foco oferecem todos os registros e escapam conteúdo importado',()=>{
 const c=engine();c.state.healthData.workouts=Array.from({length:23},()=>({date:'2026-10-01',type:'<img onerror=evil()>',notes:'<script>evil()</script>',duration:20}));
 c.window.setHealthPage('treinos',2);const html=c.window.renderHealthHistory('treinos');assert.match(html,/3 de 3/);assert.equal((html.match(/<article/g)||[]).length,3);assert.ok(!html.includes('<img'));assert.ok(!html.includes('<script>'));
 c.state.focusData.cycles=Array.from({length:21},()=>({date:'2026-10-01',taskText:'<img onerror=evil()>',focusMinutes:25,efficiency:80,distractions:1,notes:'<script>evil()</script>'}));
 c.window.setFocusHistoryPage(2);const history=c.window.renderFocusHistory();assert.match(history,/3 de 3/);assert.match(history,/25 min/);assert.ok(!history.includes('<img'));assert.ok(!/<details[^>]*\sopen(?:\s|>)/.test(history));
});
test('Pomodoro inicia, pausa e retoma preservando missão exata, tempo e recompensas',()=>{
 const c=engine();c.field('pomodoro-focused-task-select','123.45');assert.match(c.window.renderPomodoroTimer(),/Iniciar foco/);
 c.window.togglePomodoro();c.tick();assert.equal(c.pomodoro.timeLeft,1499);assert.equal(c.pomodoro.focusLock.id,'123.45');assert.match(c.window.renderPomodoroTimer(),/>Pausar</);
 c.window.togglePomodoro();assert.match(c.window.renderPomodoroTimer(),/Retomar/);assert.equal(c.pomodoro.timeLeft,1499);c.window.togglePomodoro();assert.equal(c.pomodoro.timeLeft,1499);
 c.window.handlePomodoroEnd();assert.equal(c.state.xp,230);assert.equal(c.state.energy,89);assert.equal(c.pomodoro.mode,'shortBreak');assert.equal(c.uiState.pomodoroEvaluationData.taskId,'123.45');assert.equal(c.uiState.pomodoroEvaluationData.xpAwarded,30);
 c.field('pomo-eval-focus',4);c.field('pomo-eval-distractions',2);c.field('pomo-eval-notes','Notas');c.window.savePomodoroEvaluation();assert.equal(c.state.focusData.cycles[0].efficiency,66);assert.equal(c.state.xp,230);assert.equal(c.uiState.pomodoroEvaluationData,null);
});
test('salvar tempos pausa exigida, reinicia o ciclo e limpa rascunho; avaliações preservam ajustes alheios',()=>{
 const c=engine();for(const [id,value]of Object.entries({'pomo-focus-min':30,'pomo-short-min':6,'pomo-long-min':20,'pomo-cycles-long':3}))c.field(id,value);
 c.pomodoro.isRunning=true;c.window.savePomodoroSettings();assert.equal(c.state.pomodoroSettings.focus,25);c.pomodoro.isRunning=false;c.pomodoro.currentFocusStartedAt='data';c.window.savePomodoroSettings();assert.equal(c.pomodoro.timeLeft,1800);assert.equal(c.pomodoro.currentFocusStartedAt,null);
 c.uiState.pomodoroDraft={'pomo-focus-min':'35','pomo-eval-notes':'Antes'};c.uiState.pomodoroEvaluationData={taskId:'x'};c.field('pomo-eval-focus',3);c.field('pomo-eval-distractions',0);c.field('pomo-eval-notes','Depois');c.window.savePomodoroEvaluation();
 c.window.restorePomodoroDraft({querySelector:selector=>selector==='#pomo-focus-min'?c.document.getElementById('pomo-focus-min'):null});assert.equal(c.document.getElementById('pomo-focus-min').value,'35');assert.equal(c.uiState.pomodoroDraft['pomo-eval-notes'],undefined);
});
test('rascunho de Corpo restaura campos e rolagem e é removido após registro',()=>{
 const c=engine();const input={id:'wo-notes',value:'Ficha digitada',type:'textarea'};
 const dom=(field,scroll=100)=>{const body={scrollTop:scroll,querySelectorAll:selector=>selector.startsWith('details')?[]:[field]};const dialog={dataset:{workTab:'treinos'},querySelector:()=>body,contains:()=>false};return{querySelector:selector=>selector==='#health-module-dialog'?dialog:null,body};};
 const old=dom(input),snap=c.window.captureWorkDialogs(old);const fresh={...input,value:''},root=dom(fresh,0);c.window.bindWorkDialogs(root,snap);assert.equal(fresh.value,'Ficha digitada');assert.equal(root.body.scrollTop,100);
 c.window.finishHealthForm('treinos');c.window.captureWorkDialogs(old);fresh.value='';c.window.bindWorkDialogs(root,snap);assert.equal(fresh.value,'');assert.equal(c.uiState.workDrafts['health:treinos'],undefined);
});
