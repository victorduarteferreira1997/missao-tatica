import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {normalizePrimaryEvent, buildWeekEvents} from './calendar_sync.v2.js';
import {installPlanningViews} from './ui/planning_views.v3.js';
import {installTaskForms} from './ui/task_forms.v3.js';
import {installFormDialogs} from './ui/form_dialogs.v1.js';
const app = await readFile(new URL('./app.html', import.meta.url), 'utf8');
const event = {id:'sample',summary:'Reunião · Coaktion',status:'confirmed',start:{dateTime:'2026-10-07T10:00:00-03:00'},end:{dateTime:'2026-10-07T11:00:00-03:00'},organizer:{email:'confidential@example.com'},attendees:[{email:'private@example.com'}],description:'confidential',location:'confidential',htmlLink:'https://private.example.com',conferenceData:{entryPoints:[{uri:'https://private.example.com'}]}};
const getMeetingSource = app.slice(app.indexOf('        window.getMeetingStatus ='),app.indexOf('        window.handleActivityTypeChange ='));
function statusWindow(tasks){
 const state={tasks};let toggles=0,saves=0,alerts=0;
 const window={toggleTask:id=>{tasks.find(t=>t.id===id).completed=!tasks.find(t=>t.id===id).completed;toggles++;},saveState(){saves++;},showAlertModal(){alerts++;}};
 runInNewContext(getMeetingSource,{window,state});return {window,state,counts:()=>({toggles,saves,alerts})};
}
test('Coaktion usa apenas dados permitidos, incluindo marcador com título incorreto',()=>{
 for(const incoming of [event,{...event,summary:'SEGREDO',extendedProperties:{private:{mtOrigin:'coaktion'}}}]){
  const item=normalizePrimaryEvent(incoming,'2026-10-05','America/Sao_Paulo');
  assert.equal(item.activityType,'meeting');assert.equal(item.summary,'Reunião · Coaktion');assert.equal(item.sanitizedOrigin,'coaktion');
  assert.equal(item.startTime,'10:00');assert.equal(item.endTime,'11:00');assert.equal(item.day,'wednesday');
  assert.doesNotMatch(JSON.stringify(item),/confidential|private\.example|private@|SEGREDO/);
  assert.equal(item.organizer,'');assert.equal(item.htmlLink,'');
 }
});
test('eventos comuns permitem confirmação do tipo sem reclassificar missões antigas',()=>{
 assert.equal(normalizePrimaryEvent({...event,summary:'Comprar remédio'},'2026-10-05','America/Sao_Paulo').activityType,'task');
 assert.equal(normalizePrimaryEvent({...event,summary:'Reunião de equipe'},'2026-10-05','America/Sao_Paulo').activityType,'meeting');
 assert.equal(normalizePrimaryEvent({...event,status:'cancelled'},'2026-10-05','America/Sao_Paulo'),null);
 assert.equal(normalizePrimaryEvent({...event,attendees:[{self:true,responseStatus:'declined'}]},'2026-10-05','America/Sao_Paulo'),null);
 const future={...event,start:{dateTime:'2026-10-13T10:00:00-03:00'},end:{dateTime:'2026-10-13T11:00:00-03:00'}};
 assert.equal(normalizePrimaryEvent(future,'2026-10-05','America/Sao_Paulo'),null);
 const moved=normalizePrimaryEvent(future,'2026-10-05','America/Sao_Paulo',true);assert.equal(moved.weekStart,'2026-10-12');assert.equal(moved.day,'tuesday');
});
test('status de reunião não concede realização automática e permite reabrir',()=>{
 const meeting={id:1,activityType:'meeting',completed:false};const task={id:2,completed:false};const b=statusWindow([meeting,task]);
 b.window.setMeetingStatus(1,'not_held');assert.equal(meeting.completed,false);assert.equal(b.counts().toggles,0);
 b.window.setMeetingStatus(1,'completed');assert.equal(meeting.completed,true);assert.equal(b.counts().toggles,1);
 b.window.setMeetingStatus(1,'not_held');assert.equal(meeting.completed,false);assert.equal(b.counts().toggles,2);
 b.window.setMeetingStatus(2,'completed');assert.equal(task.completed,false);
 meeting.googleCalendarSourceStatus='cancelled';b.window.setMeetingStatus(1,'completed');assert.equal(meeting.completed,false);assert.equal(b.counts().alerts,1);
 meeting.completed=true;assert.equal(b.window.getMeetingStatus(meeting),'completed','Histórico de realização permanece mesmo se a origem for cancelada depois.');
});
test('agenda de saída não duplica importadas e não exporta reuniões que não ocorreram',()=>{
 const state={currentPlanningWeekStart:'2026-10-05',tasks:[{id:1,day:'wednesday',text:'Equipe',activityType:'meeting',startTime:'10:00',endTime:'11:00'},{id:2,day:'wednesday',activityType:'meeting',meetingOutcome:'not_held'},{id:3,day:'wednesday',googleCalendarSource:'primary',googleCalendarEventId:'original'}]};
 const events=[...buildWeekEvents(state,'owner','America/Sao_Paulo').values()];assert.equal(events.length,1);assert.match(events[0].description,/Tipo: Reunião/);assert.equal(events[0].extendedProperties.private.mtActivityType,'meeting');
});
test('cartões mantêm foco para tarefas e exibem realização para reuniões sem links',()=>{
 const window={escapeHtml:s=>String(s),getTaskCategory:()=>({label:'Trabalho'}),getRecurringDaysLabel:()=>'',hasCalendarTime:()=>true,getCalendarTimeLabel:()=> '10:00–11:00',getTaskNature:()=> 'normal',getTaskNatureMeta:()=>({}),getMissionStatus:()=> 'planned',...statusWindow([]).window};
 installPlanningViews(window,{document:{addEventListener(){}},daysOfWeek:[],ICONS:{default:'target'},getState:()=>({}),getUiState:()=>({expandedSubtasks:{}}),extractMinutesFromTask:()=>60});
 const meeting=window.renderDailyMissionBoard([{id:1,text:'Reunião · Coaktion',activityType:'meeting'}]);
 assert.match(meeting,/Realizada/);assert.match(meeting,/Não ocorreu/);assert.doesNotMatch(meeting,/openTaskFocus|href=/);
 const task=window.renderDailyMissionBoard([{id:2,text:'Tarefa antiga'}]);assert.match(task,/openTaskFocus/);assert.doesNotMatch(task,/Não ocorreu/);
});
test('cadastro e edição expõem atividade e protegem horários e identidade da Coaktion',()=>{
 const window={escapeHtml:s=>String(s),getTaskCategories:()=>[{id:'work',label:'Trabalho'}],getTaskNature:()=> 'normal'};installFormDialogs(window);installTaskForms(window,{daysOfWeek:[{id:'wednesday',label:'Quarta'}],getState:()=>({activeTab:'wednesday'}),getUiState:()=>({})});
 const item=normalizePrimaryEvent(event,'2026-10-05','America/Sao_Paulo');
 const create=window.renderCreateTaskModal(item);assert.match(create,/value="meeting" selected/);assert.match(create,/ct-activity-type[^>]+disabled/);assert.match(create,/ct-start-time" type="time" readonly/);
 const edit=window.renderEditTaskModal({text:item.summary,activityType:'meeting',sanitizedOrigin:'coaktion',googleCalendarSource:'primary'});assert.match(edit,/et-text"[^>]+readonly/);assert.match(edit,/et-activity-type[^>]+disabled/);assert.match(edit,/Horários gerenciados/);
});

test('salvar exige horários, calcula duração real e bloqueia dupla conversão',()=>{
 const fields={};for(const [key,value] of Object.entries({text:'Reunião de equipe','activity-type':'meeting',nature:'neutral',priority:'media',complexity:'2',time:'30','impact-type':'drain',category:'work',day:'wednesday',subtasks:''})) fields['ct-'+key]={value};
 const state={tasks:[]};const uiState={};let alert='',converted=0;let inbox=null;
 const window={calculateTaskCost:()=>({xp:0,hp:0}),readCalendarTimeFields:()=>({startTime:'',endTime:''}),showAlertModal:message=>alert=message,getTaskCategories:()=>[{id:'work'}],getNextTaskOrder:()=>1,cloneSubtasksForNewTask:s=>s,reindexTaskOrderForDay(){},showToast(){},saveState(){}};
 const src=app.slice(app.indexOf('        window.saveNewTask ='),app.indexOf('        window.setCategoryFilter ='));
 runInNewContext(src,{window,state,uiState,document:{getElementById:id=>fields[id]},daysOfWeek:[{id:'wednesday'}],minutesFromClock:value=>{const [h,m]=value.split(':').map(Number);return h*60+m;},calendarSync:{getInbox:()=>inbox?[inbox]:[],markInboxConverted(){converted++;inbox.status='converted';}}});
 window.saveNewTask();assert.equal(state.tasks.length,0);assert.match(alert,/início e fim/);
 window.readCalendarTimeFields=()=>({startTime:'10:00',endTime:'11:30'});window.saveNewTask();assert.equal(state.tasks[0].activityType,'meeting');assert.equal(state.tasks[0].time,'90 min');
 inbox={id:'source',status:'pending',summary:'Reunião · Coaktion',sanitizedOrigin:'coaktion',startTime:'09:00',endTime:'10:00',duration:60,day:'wednesday',weekStart:'2026-10-05'};
 uiState.calendarInboxEventId='source';fields['ct-text'].value='Título confidencial';fields['ct-activity-type'].value='task';window.saveNewTask();assert.equal(state.tasks[1].activityType,'meeting');assert.equal(state.tasks[1].text,'Reunião · Coaktion');assert.equal(converted,1);
 uiState.calendarInboxEventId='source';window.saveNewTask();assert.equal(state.tasks.length,2);assert.match(alert,/já foi convertido/);
});
