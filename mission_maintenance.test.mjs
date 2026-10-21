import test from 'node:test';
import assert from 'node:assert/strict';
import {boot,plain} from './test-support/app_boot.mjs';
import {setRecurrenceRule} from './recurrence.v1.js';

function setup(){
 const b=boot(),s=b.state;s.combo=7;s.xp=320;s.coins=52;s.energy=65;
 s.currentPlanningWeekStart='2026-10-19';s.planning.legacyWeek='2026-10-19';
 s.tasks=[{id:1,text:'Dispensável',day:'wednesday',planningWeekStart:'2026-10-19',category:'work',completed:false,subtasks:[]},{id:2,text:'Depende dela',day:'friday',planningWeekStart:'2026-10-19',category:'work',completed:false,dependsOnTaskIds:['1'],subtasks:[]}];
 s.operationalControl.demands=[{id:'radar',title:'Frente preservada',workflowStatus:'active'}];s.tasks[0].radarDemandId='radar';
 s.taskDeletionLog=[{id:'old-proof',reason:'cancelada',preserveCombo:false,comboBefore:4}];
 b.window.saveState=()=>{};b.window.saveStateNow=async()=>true;b.window.showToast=()=>{};b.window.spawnFloatingText=()=>{};b.window.unlockBadge=()=>{};
 return b;
}
const balance=s=>({combo:s.combo,xp:s.xp,coins:s.coins,energy:s.energy});

for(const reason of ['excluida','cancelada','substituida','nao_fiz'])test('exclusão preserva Frenesi, saldos, RADAR e dependências: '+reason,async()=>{
 const {window:w,state:s,ui}=setup(),before=balance(s),radar=plain(s.operationalControl),history=plain(s.taskDeletionLog);
 ui.deleteTaskPrompt={show:true,taskId:1};await w.confirmDeleteMainTask(reason);
 assert.deepEqual(balance(s),before);assert.deepEqual(plain(s.operationalControl),radar);assert.equal(s.tasks.length,1);assert.deepEqual(plain(s.tasks[0].dependsOnTaskIds),['1']);assert.equal(w.getTaskBlockers(s.tasks[0])[0].missing,true);
 assert.deepEqual(plain(s.taskDeletionLog.slice(0,1)),history);assert.equal(s.taskDeletionLog.at(-1).preserveCombo,true);assert.equal(s.taskDeletionLog.at(-1).reason,reason);
 await w.confirmDeleteMainTask(reason);assert.equal(s.taskDeletionLog.length,2);
});

test('excluir concluída mantém recompensas existentes e não credita outra conclusão',async()=>{
 const {window:w,state:s,ui}=setup();s.tasks[0].completed=true;s.tasks[0].rewardedXp=30;s.tasks[0].rewardedCoins=5;
 const before=balance(s),stats=plain(s.stats);ui.deleteTaskPrompt={show:true,taskId:1};await w.confirmDeleteMainTask();
 assert.deepEqual(balance(s),before);assert.deepEqual(plain(s.stats),stats);assert.equal(s.taskDeletionLog.at(-1).taskSnapshot.completed,true);
});

test('cancelar confirmação não altera registros e falha na nuvem não anuncia sucesso',async()=>{
 const {window:w,state:s,ui}=setup(),before=plain(s);ui.deleteTaskPrompt={show:true,taskId:1};w.cancelDeleteTaskPrompt();assert.deepEqual(plain(s),before);
 const messages=[];w.showToast=(...args)=>messages.push(args);w.saveStateNow=async()=>false;ui.deleteTaskPrompt={show:true,taskId:1};await w.confirmDeleteMainTask();
 assert.equal(messages.at(-1)[0],'Exclusão aguardando sincronização');assert.equal(s.combo,7);
});

test('reagendar dia ou próxima semana preserva Frenesi, identidade e dependências',()=>{
 const {window:w,state:s}=setup(),id=s.tasks[0].id,xp=s.xp,coins=s.coins;
 w.moveTaskFromSelect(id,null,{value:'friday'});assert.equal(s.combo,7);assert.equal(s.tasks[0].day,'friday');assert.equal(s.tasks[0].id,id);assert.equal(s.xp,xp);assert.equal(s.coins,coins);
 w.moveTaskFromSelect(id,null,{value:'next_week'});assert.equal(s.combo,7);assert.equal(s.tasks[0].day,'friday');assert.equal(s.tasks[0].planningWeekStart,'2026-10-26');assert.deepEqual(plain(s.tasks[1].dependsOnTaskIds),['1']);assert.equal(s.tasks.length,2);
 const before=plain(s.tasks);w.moveTaskFromSelect(id,null,{value:'invalid'});assert.deepEqual(plain(s.tasks),before);
});

test('excluir dia recorrente preserva histórico e outros dias após validação',async()=>{
 const {window:w,state:s,ui}=setup();s.tasks=[{...s.tasks[0],day:'wednesday',isRecurring:true,recurrenceGroupId:'series',recurrenceDays:['wednesday','friday']},{...s.tasks[0],id:3,day:'friday',isRecurring:true,recurrenceGroupId:'series',recurrenceDays:['wednesday','friday']}];
 setRecurrenceRule(s,s.tasks[0],['wednesday','friday'],'2026-11-10',{from:'2026-10-19',create:true});
 s.planning.history=[{week:'2026-10-12',tasks:[{id:'historical',text:'Concluída antes',completed:true,day:'wednesday'}]}];const history=plain(s.planning.history),before=balance(s);
 ui.deleteTaskPrompt={show:true,taskId:1};await w.confirmDeleteMainTask();w.validateState();
 assert.deepEqual(balance(s),before);assert.deepEqual(plain(s.planning.history),history);assert.equal(s.tasks.some(t=>t.id===1),false);assert.equal(s.tasks.some(t=>t.id===3),true);assert.deepEqual(plain(s.planning.recurrenceRules.series.days),['friday']);
});
