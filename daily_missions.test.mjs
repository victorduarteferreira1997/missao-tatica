import test from 'node:test';
import assert from 'node:assert/strict';
import {boot,plain} from './test-support/app_boot.mjs';

function setup(){
 const app=boot();const s=app.state;s.currentFilter='all';s.activeTab='monday';
 s.tasks=[
  {id:1,text:'Primeira',day:'monday',category:'work',order:1,completed:false},
  {id:2,text:'Concluída',day:'monday',category:'work',order:2,completed:true},
  {id:3,text:'Terceira',day:'monday',category:'work',order:3,completed:false},
  {id:4,text:'Pessoal',day:'monday',category:'life',order:4,completed:false},
  {id:5,text:'Não ocorreu',day:'monday',category:'work',order:5,activityType:'meeting',meetingOutcome:'not_held',completed:false},
  {id:6,text:'Outro dia',day:'tuesday',category:'work',order:1,completed:true}
 ];
 for(const task of s.tasks)task.planningWeekStart=s.currentPlanningWeekStart;
 app.window.saveState=()=>{};app.window.showToast=()=>{};return app;
}
const ids=rows=>Array.from(rows,t=>t.id);

test('agrupar concluídas não altera registros nem a ordem usada na semana',()=>{
 const {state:s,window:w}=setup(),before=plain(s.tasks);
 const html=w.renderDailyMissionBoard(w.sortTasksForDay('monday'));
 assert.ok(html.indexOf('daily-pending-missions')<html.indexOf('data-daily-completed'));
 assert.match(html,/Concluídas \(1\)/);assert.doesNotMatch(html,/data-daily-mission-row="6"/);
 assert.deepEqual(plain(s.tasks),before);assert.deepEqual(ids(w.sortTasksForDay('monday')),[1,2,3,4,5]);
 s.tasks[0].completed=true;w.renderDailyMissionBoard(w.sortTasksForDay('monday'));s.tasks[0].completed=false;
 assert.deepEqual(plain(s.tasks),before);assert.deepEqual(ids(w.getDailyReorderTasks('monday')),[1,3,4,5]);
});

test('subir uma pendente pula concluídas, respeita filtro e mantém posições das demais',()=>{
 const {state:s,window:w}=setup();s.currentFilter='work';w.moveTaskOrder(3,-1);
 assert.deepEqual(ids(w.getDailyReorderTasks('monday')),[3,1,5]);
 assert.equal(s.tasks.find(t=>t.id===2).order,2);assert.equal(s.tasks.find(t=>t.id===4).order,4);
 assert.equal(s.tasks.find(t=>t.id===6).order,1);
 const before=plain(s.tasks);w.moveTaskOrder(2,-1);assert.deepEqual(plain(s.tasks),before);
});

test('arraste não pode usar concluída, categoria oculta ou missão de outro dia',()=>{
 const {state:s,window:w}=setup();s.currentFilter='work';
 const drop=(source,target)=>w.handleTaskDrop(target,{preventDefault(){},stopPropagation(){},dataTransfer:{getData:()=>String(source)}});
 const before=plain(s.tasks);drop(2,1);drop(4,1);drop(6,1);assert.deepEqual(plain(s.tasks),before);
 drop(3,1);assert.deepEqual(ids(w.getDailyReorderTasks('monday')),[3,1,5]);assert.equal(s.tasks[1].completed,true);
});

test('ordenação explícita também funciona com registros antigos sem order e não repete IDs',()=>{
 const {state:s,window:w}=setup();s.tasks.forEach(t=>delete t.order);
 const before=ids(w.getDailyReorderTasks('monday'));const last=before.at(-1);w.moveTaskOrder(last,-1);
 const expected=[...before];[expected[expected.length-2],expected[expected.length-1]]=[expected.at(-1),expected.at(-2)];
 assert.deepEqual(ids(w.getDailyReorderTasks('monday')),expected);assert.equal(new Set(s.tasks.map(t=>t.id)).size,s.tasks.length);
});
