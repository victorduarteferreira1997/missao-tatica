import test from 'node:test';
import assert from 'node:assert/strict';
import {installTaskForms} from './ui/task_forms.v7.js';
import {installFormDialogs} from './ui/form_dialogs.v1.js';
import {boot,plain} from './test-support/app_boot.mjs';
const daysOfWeek=[['monday','Segunda'],['tuesday','Terça'],['wednesday','Quarta'],['thursday','Quinta'],['friday','Sexta'],['saturday','Sábado'],['sunday','Domingo']].map(([id,label])=>({id,label}));
function fixture(week='2026-11-02'){
 let state={activeTab:'sunday',currentPlanningWeekStart:week},binding;
 const selected={dataset:{week}},hint={textContent:''},document={getElementById:id=>id==='ct-day'?{selectedOptions:[selected]}:id==='ct-date-hint'?hint:null};
 const window={escapeHtml:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),getTaskCategories:()=>[{id:'work',label:'Trabalho'}],handleActivityTypeChange(){}};
 installFormDialogs(window);window.bindFormDialog=(_,options)=>binding=options;
 installTaskForms(window,{document,daysOfWeek,getState:()=>state,getUiState:()=>({alert:{show:false},confirm:{show:false}})});
 return {window,selected,hint,replace:value=>state=value,prepare:()=>{window.bindCreateTaskDialog({});binding.prepare();}};
}
test('Sunday creation distinguishes Monday of the displayed week from the next Monday, without inventing a new week',()=>{
 const a=fixture(),markup=a.window.renderCreateTaskModal();assert.match(markup,/Data da missão/);assert.match(markup,/value="monday"[^>]*>Segunda, 02\/11\/2026<\/option>/);assert.match(markup,/value="next_week"[^>]*>Segunda, 09\/11\/2026 · próxima semana<\/option>/);assert.match(markup,/Semana de 02\/11\/2026 a 08\/11\/2026/);assert.match(markup,/value="sunday" selected[^>]*>Domingo, 08\/11\/2026/);
 a.selected.dataset.week='2026-11-09';a.window.updateCreateMissionDate();assert.equal(a.hint.textContent,'Semana de 09/11/2026 a 15/11/2026.');
 a.selected.dataset.week='2026-11-02';a.prepare();assert.equal(a.hint.textContent,'Semana de 02/11/2026 a 08/11/2026.');
});
test('restored drafts use the final selected week, and replaced account state does not retain old dates',()=>{
 const a=fixture();a.selected.dataset.week='2026-11-09';a.prepare();assert.match(a.hint.textContent,/09\/11\/2026/);
 a.replace({activeTab:'monday',currentPlanningWeekStart:'2026-11-09'});const markup=a.window.renderCreateTaskModal();assert.match(markup,/value="monday" selected[^>]*>Segunda, 09\/11\/2026/);assert.match(markup,/value="next_week"[^>]*>Segunda, 16\/11\/2026/);assert.doesNotMatch(markup,/02\/11\/2026/);
});
test('calendar conversion shows the event week and date with the date control still locked',()=>{
 const a=fixture(),markup=a.window.renderCreateTaskModal({id:'external',weekStart:'2026-11-16',day:'wednesday',activityType:'meeting'});assert.match(markup,/id="ct-day"[^>]*disabled/);assert.match(markup,/value="wednesday" selected[^>]*>Quarta, 18\/11\/2026/);assert.match(markup,/Semana de 16\/11\/2026 a 22\/11\/2026/);assert.match(markup,/data-create-section="recurrence" class="hidden"/);assert.doesNotMatch(markup,/02\/11\/2026/);
});
test('month, year and leap-day boundaries are date-only and match planning semantics',()=>{
 for(const [week,monday,next,end] of [['2026-11-30','30/11/2026','07/12/2026','06/12/2026'],['2026-12-28','28/12/2026','04/01/2027','03/01/2027'],['2028-02-28','28/02/2028','06/03/2028','05/03/2028']]){const markup=fixture(week).window.renderCreateTaskModal();assert.ok(markup.includes('Segunda, '+monday));assert.ok(markup.includes('Segunda, '+next+' · próxima semana'));assert.ok(markup.includes('Semana de '+monday+' a '+end));}
 assert.match(fixture('2028-02-28').window.renderCreateTaskModal(),/Terça, 29\/02\/2028/);
});
test('unknown or malformed week remains explicit and never substitutes the computer date',()=>{
 for(const week of [undefined,'','2026-11-03','2026-02-30','<script>']){const a=fixture(week);a.replace({activeTab:'monday',currentPlanningWeekStart:week});const markup=a.window.renderCreateTaskModal();assert.match(markup,/confira a semana/);assert.doesNotMatch(markup,/>Segunda, \d{2}\/\d{2}\/\d{4}/);assert.doesNotMatch(markup,/<script>/);}
});
function creationFixture(){
 const a=boot();a.state.currentPlanningWeekStart='2026-11-02';a.state.planning.legacyWeek='2026-11-02';
 const fields=Object.fromEntries(Object.entries({'ct-text':'Teste de data','ct-nature':'neutral','ct-priority':'media','ct-complexity':'2','ct-time':'30','ct-impact-type':'drain','ct-category':'work','ct-day':'monday','ct-subtasks':'Conferir\nEnviar','ct-start-time':'','ct-end-time':'','ct-repeat-end-mode':'none'}).map(([id,value])=>[id,{value}]));
 for(const {id} of daysOfWeek)fields['ct-repeat-'+id]={checked:false};
 const get=a.c.document.getElementById;a.c.document.getElementById=id=>fields[id]||get(id);
 return {...a,fields};
}
test('real creation persists the displayed current and following Mondays, retains old records and survives reopening',()=>{
 const a=creationFixture(),before=plain(a.state),oldCount=before.tasks.length;
 for(const [choice,date] of [['monday','2026-11-02'],['next_week','2026-11-09']]){
  a.fields['ct-day'].value=choice;a.fields['ct-text'].value='Data '+date;a.window.saveNewTask();const task=a.state.tasks.at(-1);assert.equal(task.day,'monday');assert.equal(task.planningWeekStart,date);assert.equal(task.time,'30 min');assert.deepEqual(plain(task.subtasks.map(s=>s.text)),['Conferir','Enviar']);
 }
 assert.equal(a.state.tasks.length,oldCount+2);assert.deepEqual(plain(a.state.tasks.slice(0,oldCount)),before.tasks);
 const reopened=boot(plain(a.state));for(const date of ['2026-11-02','2026-11-09'])assert.equal(reopened.state.tasks.find(t=>t.text==='Data '+date).planningWeekStart,date);
 for(const key of ['xp','coins','combo','energy','operationalControl','studyData'])assert.deepEqual(plain(a.state[key]),before[key]);
});
test('creation after changing the planning week and recurrent creation persist the same week advertised by the choices',()=>{
 const a=creationFixture();a.state.currentPlanningWeekStart='2026-11-09';a.fields['ct-day'].value='monday';a.window.saveNewTask();assert.equal(a.state.tasks.at(-1).planningWeekStart,'2026-11-09');
 a.fields['ct-day'].value='next_week';a.fields['ct-repeat-monday'].checked=true;a.fields['ct-repeat-wednesday'].checked=true;a.fields['ct-text'].value='Série na semana seguinte';a.window.saveNewTask();const series=a.state.tasks.filter(t=>t.text==='Série na semana seguinte');assert.deepEqual(plain(series.map(t=>t.day)).sort(),['monday','wednesday']);assert.ok(series.every(t=>t.planningWeekStart==='2026-11-16'));assert.equal(new Set(series.map(t=>t.recurrenceGroupId)).size,1);
});
