import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from './library.v2.js';
const clone=structuredClone,today='2026-10-22',options={today,now:today+'T12:00:00Z'};
function fixture(kind='read',metric='pages'){
 const state={tasks:[{id:1}],studyData:{sessions:[{id:2}]},combo:7,xp:90,coins:50,energy:80};R.initializeLibrary(state);
 const book=R.saveLibraryBook(state,{title:'Livro fictício',authors:'Autoria fictícia',editions:[{format:'physical',pageCount:400},{format:'kindle'}],historyToAdd:1});
 const reading=R.startLibraryReading(state,{bookId:book.id,editionId:state.libraryData.editions[0].id,kind,metric,position:10,startedOn:'2026-10-19'},options);
 return {state,book,reading};
}
function plan(f,extra={}){return R.saveReadingPlan(f.state,{readingId:f.reading.id,days:['monday','wednesday','friday'],startDate:'2026-10-19',endDate:'2026-11-10',minutes:20,startTime:'18:00',...extra},options);}
function log(f,extra={},opts={}){return R.saveReadingSession(f.state,{readingId:f.reading.id,date:today,position:50,minutes:'',notes:'',requestKey:'request-'+Math.random(),...extra},{...options,...opts});}
const outside=state=>{const value=clone(state);delete value.libraryData;return value;};
const atomic=(state,fn,pattern)=>{const before=clone(state);assert.throws(fn,pattern);assert.deepEqual(state,before);};

test('reading is edition-specific and independent of missions, studies and rewards; one open cycle per book',()=>{
 const f=fixture(),before=outside(f.state);plan(f);log(f);assert.deepEqual(outside(f.state),before);
 atomic(f.state,()=>R.startLibraryReading(f.state,{bookId:f.book.id,editionId:f.state.libraryData.editions[1].id,kind:'read',metric:'percent'},options),/aberto/);
 assert.equal(f.state.libraryData.readings[0].completedOn,null);assert.equal(R.readingProgress(f.state.libraryData,f.state.libraryData.readings[1]).percent,12.5);
});
test('invalid edition, metric, position and dates never partially create readings',()=>{
 for(const patch of [{editionId:'missing'},{metric:'hours'},{position:401},{startedOn:'2026-02-30'},{startedOn:'2026-10-23'},{kind:'invalid'}]){
  const f=fixture();R.finishLibraryReading(f.state,f.reading.id,options);
  atomic(f.state,()=>R.startLibraryReading(f.state,{bookId:f.book.id,editionId:f.state.libraryData.editions[0].id,kind:'reread',metric:'pages',...patch},options));
 }
});
test('session logs preserve final edited values, permit optional real minutes, and deduplicate retries',()=>{
 const f=fixture(),input={date:today,position:80,minutes:17,notes:'Texto revisado',requestKey:'stable-request-key'};
 const a=log(f,input),b=log(f,input);assert.equal(a.id,b.id);assert.equal(f.state.libraryData.sessions.length,1);assert.equal(b.minutes,17);assert.equal(b.notes,'Texto revisado');
 atomic(f.state,()=>log(f,{...input,position:90}),/outros valores/);
 const corrected=log(f,{position:90,minutes:'',notes:'Corrigido'},{sessionId:a.id});assert.equal(corrected.id,a.id);assert.equal(corrected.minutes,null);assert.equal(f.state.libraryData.readings[1].position,90);
});
test('invalid session correction is atomic; removal recomputes progress from remaining real logs',()=>{
 const f=fixture(),a=log(f,{date:'2026-10-20',position:40}),b=log(f,{position:70});
 atomic(f.state,()=>log(f,{date:'2026-10-20',position:90},{sessionId:a.id}),/anterior/);
 R.removeReadingSession(f.state,b.id);assert.equal(f.state.libraryData.readings[1].position,40);
 R.removeReadingSession(f.state,a.id);assert.equal(f.state.libraryData.readings[1].position,10);
 for(const patch of [{position:401},{position:1},{position:'',minutes:''},{date:'2026-10-23'},{date:'2026-10-18'},{minutes:1.5}])atomic(f.state,()=>log(f,patch));
});
test('percent accepts two decimals; unknown page count never invents a progress percentage',()=>{
 const f=fixture('read','percent');log(f,{position:37.29});assert.equal(f.state.libraryData.readings[1].position,37.29);atomic(f.state,()=>log(f,{position:37.291}));
 const g=fixture();g.state.libraryData.editions[0].pageCount=null;assert.equal(R.readingProgress(g.state.libraryData,g.reading).percent,null);
});
test('revisiting may move between passages and is never counted as a full read; rereading preserves history',()=>{
 const f=fixture('revisit');log(f,{date:'2026-10-20',position:90});log(f,{position:20});R.finishLibraryReading(f.state,f.reading.id,options);
 assert.equal(R.completedReadings(f.state.libraryData,f.book.id).length,1);
 const next=R.startLibraryReading(f.state,{bookId:f.book.id,editionId:f.state.libraryData.editions[1].id,kind:'reread',metric:'percent',position:0},options);
 assert.equal(f.state.libraryData.sessions.length,2);assert.equal(next.position,0);assert.equal(f.state.libraryData.readings.length,3);
 R.finishLibraryReading(f.state,next.id,options);assert.equal(R.completedReadings(f.state.libraryData,f.book.id).length,2);
});
test('weekly occurrences use inclusive end and selected weekdays, without stored duplicates or automatic backlog',()=>{
 const f=fixture();plan(f);const occurrences=R.readingOccurrences(f.state,'2026-11-02','2026-11-15');
 assert.deepEqual(occurrences.map(o=>o.date),['2026-11-02','2026-11-04','2026-11-06','2026-11-09']);
 assert.equal(f.state.libraryData.sessions.length,0);assert.equal(R.readingOccurrences(f.state,'2026-10-22','2026-10-22').length,0);
 assert.deepEqual(JSON.parse(JSON.stringify(f.state)).libraryData.plans,f.state.libraryData.plans);
});
test('planned and actual dates, time and completion stay separate; logging never finishes the book',()=>{
 const f=fixture(),p=plan(f);log(f,{position:400,minutes:7,planId:p.id,planDate:'2026-10-21',planCompleted:false});
 const occurrence=R.readingOccurrences(f.state,'2026-10-19','2026-10-25').find(o=>o.sourceDate==='2026-10-21');
 assert.equal(occurrence.date,today);assert.equal(occurrence.status,'partial');assert.equal(occurrence.minutes,20);assert.equal(occurrence.actualMinutes,7);assert.equal(f.state.libraryData.readings[1].status,'active');
 assert.equal(R.readingOccurrences(f.state,'2026-10-21','2026-10-21').length,0);
 atomic(f.state,()=>log(f,{planId:p.id,planDate:'2026-10-21'}),/já tem/);
});
test('rescheduling maintains occurrence identity; collisions and recorded/cancelled slots are guarded',()=>{
 const f=fixture(),p=plan(f);R.moveReadingOccurrence(f.state,p.id,'2026-10-21',today,options);
 const moved=R.readingOccurrences(f.state,today,today)[0];assert.equal(moved.key,p.id+':2026-10-21');
 atomic(f.state,()=>R.moveReadingOccurrence(f.state,p.id,'2026-10-23',today,options),/Já há/);
 R.moveReadingOccurrence(f.state,p.id,'2026-10-23',null,options);assert.equal(R.readingOccurrences(f.state,'2026-10-23','2026-10-23').length,0);
 atomic(f.state,()=>log(f,{planId:p.id,planDate:'2026-10-23'}),/cancelada/);
 log(f,{planId:p.id,planDate:'2026-10-21',planCompleted:true});atomic(f.state,()=>R.moveReadingOccurrence(f.state,p.id,'2026-10-21','2026-10-24',options),/registro/);
});
test('pausing and resuming cannot generate catch-up sessions or resume a manually paused plan',()=>{
 const f=fixture(),p=plan(f);R.setLibraryReadingStatus(f.state,f.reading.id,'paused',options);assert.equal(f.state.libraryData.plans[0].status,'paused');assert.equal(R.readingOccurrences(f.state,'2026-10-19','2026-10-25').length,0);
 R.setLibraryReadingStatus(f.state,f.reading.id,'active',options);assert.deepEqual(R.readingOccurrences(f.state,'2026-10-19','2026-10-25').map(o=>o.date),['2026-10-23']);
 R.setReadingPlanStatus(f.state,p.id,'paused',options);R.setLibraryReadingStatus(f.state,f.reading.id,'paused',options);R.setLibraryReadingStatus(f.state,f.reading.id,'active',options);assert.equal(f.state.libraryData.plans[0].status,'paused');
});
test('editing/ending plan preserves actual records even after weekdays change, and finish affects only its own plan',()=>{
 const f=fixture(),p=plan(f),s=log(f,{planId:p.id,planDate:'2026-10-21',planCompleted:true});
 R.saveReadingPlan(f.state,{readingId:f.reading.id,days:['sunday'],startDate:'2026-10-25',endDate:'2026-11-01',minutes:25},{...options,planId:p.id});
 assert.equal(f.state.libraryData.plans[0].id,p.id);assert.equal(f.state.libraryData.sessions[0].id,s.id);assert.equal(R.readingOccurrences(f.state,today,today)[0].sessionId,s.id);
 R.setReadingPlanStatus(f.state,p.id,'ended',options);assert.equal(R.readingOccurrences(f.state,'2026-10-25','2026-11-01').length,0);assert.equal(R.readingOccurrences(f.state,today,today)[0].status,'completed');
 atomic(f.state,()=>R.setReadingPlanStatus(f.state,p.id,'active',options),/encerrado/);
});
test('finishing and correcting completed reading logs preserves all cycles and prevents backdated completion',()=>{
 const f=fixture(),p=plan(f),s=log(f,{planId:p.id,planDate:'2026-10-21',planCompleted:true});
 atomic(f.state,()=>R.finishLibraryReading(f.state,f.reading.id,{...options,completedOn:'2026-10-21'}),/posterior/);
 R.finishLibraryReading(f.state,f.reading.id,options);assert.equal(f.state.libraryData.plans[0].status,'ended');assert.equal(R.readingOccurrences(f.state,today,today).length,1);
 log(f,{position:65,minutes:15},{sessionId:s.id});assert.equal(f.state.libraryData.readings[1].position,65);assert.equal(f.state.libraryData.readings[1].status,'completed');assert.equal(f.state.libraryData.readings[0].completedOn,null);
});
test('stale actions are rejected without changing current library or another account',()=>{
 const f=fixture(),signature=R.readingActionSignature(f.state);log(f);
 atomic(f.state,()=>R.finishLibraryReading(f.state,f.reading.id,{...options,expectedSignature:signature}),/mudou/);
 const account=fixture(),before=clone(account.state);R.setLibraryReadingStatus(f.state,f.reading.id,'paused',options);assert.deepEqual(account.state,before);
});

test('end date also bounds rescheduled sessions; an empty move cannot silently cancel a session',()=>{
 const f=fixture(),p=plan(f);for(const target of ['',undefined,'2026-11-11','2026-10-18'])atomic(f.state,()=>R.moveReadingOccurrence(f.state,p.id,'2026-10-23',target,options),/data válida/);
 R.moveReadingOccurrence(f.state,p.id,'2026-10-23','2026-10-29',options);assert.equal(R.readingOccurrences(f.state,'2026-10-29','2026-10-29').length,1);
 R.saveReadingPlan(f.state,{readingId:f.reading.id,days:['monday','wednesday','friday'],startDate:'2026-10-19',endDate:'2026-10-28',minutes:20},{...options,planId:p.id});assert.equal(R.readingOccurrences(f.state,'2026-10-29','2026-10-29').length,0);
});

test('edition page count cannot invalidate earlier revisited pages even when current position is lower',()=>{
 const f=fixture('revisit');log(f,{date:'2026-10-20',position:90});log(f,{position:20});
 atomic(f.state,()=>R.saveLibraryBook(f.state,{...f.state.libraryData.books[0],editions:f.state.libraryData.editions.map((e,i)=>({...e,pageCount:i===0?30:e.pageCount}))},{bookId:f.book.id}),/progresso/);
});
