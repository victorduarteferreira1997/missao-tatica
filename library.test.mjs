import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from './library.v2.js';
import {validateAccountState,createAccountStorage} from './account_storage.v1.js';
const clone=x=>JSON.parse(JSON.stringify(x));
const draft=(extra={})=>({title:'A República',authors:'Platão',category:'Filosofia',intent:'reread',targetMonth:'2026-11',notes:'',editions:[{format:'physical',edition:'Edição de bolso',pageCount:'400',owned:true}],historyToAdd:0,...extra});
function setup(){const state={ownerUid:'test-reader',tasks:[{id:'mission',completed:false}],xp:90,coins:20,combo:7,energy:70,prestige:{campaign:3},studyData:{sessions:[{id:'study'}]}};L.initializeLibrary(state);return state;}
const put=(s,d=draft(),options={})=>L.saveLibraryBook(s,d,options);
const outside=s=>{const copy=clone(s);delete copy.libraryData;return copy;};

test('initialization is additive, idempotent and retains unknown or malformed library versions byte-for-byte',()=>{
 const s={tasks:[{id:'keep'}],libraryData:{version:99,books:[{secret:'keep'}]}};const before=JSON.stringify(s);L.initializeLibrary(s);assert.equal(JSON.stringify(s),before);assert.throws(()=>L.libraryData(s),/versão/);
 const fresh=setup(),before2=JSON.stringify(fresh);L.initializeLibrary(fresh);assert.equal(JSON.stringify(fresh),before2);
});
test('one work owns multiple formats; owning a book never creates reading history, sessions or missions',()=>{
 const s=setup(),before=outside(s),book=put(s,draft({editions:[{format:'physical',pageCount:400,owned:true},{format:'kindle',pageCount:'',owned:true,url:'https://example.test/book'}]}));
 assert.equal(s.libraryData.books.length,1);assert.equal(s.libraryData.editions.length,2);assert.equal(L.bookSummary(s.libraryData,book).count,0);assert.equal(L.bookSummary(s.libraryData,book).status,'Sem leitura registrada');assert.deepEqual(s.libraryData.plans,[]);assert.deepEqual(s.libraryData.sessions,[]);assert.deepEqual(outside(s),before);
});
test('previous readings have stable identities and unknown completion dates, without rewards or scheduling',()=>{
 const s=setup(),before=outside(s),book=put(s,draft({historyToAdd:3}));const rows=L.completedReadings(s.libraryData,book.id);
 assert.equal(rows.length,3);assert.equal(new Set(rows.map(r=>r.id)).size,3);assert.ok(rows.every(r=>r.completedOn===null&&r.editionId===null));assert.equal(L.bookSummary(s.libraryData,book).status,'Lido 3 vezes');assert.deepEqual(outside(s),before);
});
test('validation failures are atomic, including unsafe URLs, empty title, bad pages/month and duplicate editions',()=>{
 for(const change of [{title:' '},{targetMonth:'2026-99'},{historyToAdd:-1},{editions:[{format:'pdf',url:'javascript:alert(1)'}]},{editions:[{format:'pdf',url:'https://user:password@example.test'}]},{editions:[{format:'physical',pageCount:-1}]},{editions:[{format:'physical'},{format:'physical'}]}]){
  const s=setup(),before=clone(s);assert.throws(()=>put(s,draft(change)));assert.deepEqual(s,before);
 }
});
test('case/accents/whitespace duplicate detection includes archived books and never overwrites them',()=>{
 const s=setup(),book=put(s);L.archiveLibraryBook(s,book.id,true);const before=clone(s);
 assert.throws(()=>put(s,draft({title:' a republica ',authors:'platao'})),/já estão/);assert.deepEqual(s,before);
 put(s,draft({title:'Outro volume'}));assert.equal(s.libraryData.books.length,2);
});
test('editing preserves IDs, extension fields, formats, historical entries and future plans',()=>{
 const s=setup(),book=put(s,draft({historyToAdd:1})),data=s.libraryData,edition=data.editions[0];book.customField='keep';edition.customField='keep';
 data.plans.push({id:'plan',bookId:book.id,status:'paused'});const history=clone(data.readings),plans=clone(data.plans),signature=L.bookEditSignature(s,book.id);
 const revised=put(s,draft({title:'Título revisado',editions:[{...edition,edition:'Edição identificada'}]}),{bookId:book.id,expectedSignature:signature});
 assert.equal(revised.id,book.id);assert.equal(revised.customField,'keep');assert.equal(s.libraryData.editions[0].id,edition.id);assert.equal(s.libraryData.editions[0].customField,'keep');assert.deepEqual(s.libraryData.readings,history);assert.deepEqual(s.libraryData.plans,plans);
});
test('stale edit or editions from another work are rejected before committing',()=>{
 const s=setup(),book=put(s),signature=L.bookEditSignature(s,book.id);s.libraryData.books[0].notes='Changed externally';const before=clone(s);
 assert.throws(()=>put(s,draft({editions:s.libraryData.editions}),{bookId:book.id,expectedSignature:signature}),/mudou/);assert.deepEqual(s,before);
 assert.throws(()=>put(s,draft({title:'Different',editions:s.libraryData.editions})),/pertence/);assert.deepEqual(s,before);
});
test('historical edition references and page metrics cannot be silently changed or omitted',()=>{
 const s=setup(),book=put(s),edition=s.libraryData.editions[0];s.libraryData.readings.push({id:'active',bookId:book.id,editionId:edition.id,status:'active',metric:'pages',position:250});
 assert.throws(()=>put(s,draft({editions:[{...edition,format:'kindle'}]}),{bookId:book.id}),/formato/);
 assert.throws(()=>put(s,draft({editions:[{...edition,pageCount:100}]}),{bookId:book.id}),/progresso/);
 assert.throws(()=>put(s,draft({editions:[{format:'pdf'}]}),{bookId:book.id}),/removidas/);
});
test('archive is hidden by default, searchable separately, restorable and does not change reading history',()=>{
 const s=setup(),book=put(s,draft({historyToAdd:1})),history=clone(s.libraryData.readings);L.archiveLibraryBook(s,book.id,true);
 assert.equal(L.selectLibraryBooks(s).length,0);assert.equal(L.selectLibraryBooks(s,{status:'archived',query:'platao'}).length,1);assert.deepEqual(s.libraryData.readings,history);L.archiveLibraryBook(s,book.id,false);assert.equal(L.selectLibraryBooks(s,{status:'read',intent:'reread'}).length,1);assert.deepEqual(s.libraryData.readings,history);
});
test('active reading or plan must be paused before archiving; no automatic plan changes',()=>{
 const s=setup(),book=put(s);s.libraryData.plans.push({id:'plan',bookId:book.id,status:'active'});const before=clone(s);assert.throws(()=>L.archiveLibraryBook(s,book.id,true),/Pause/);assert.deepEqual(s,before);
});
test('permanent removal is limited to books without history/plans; other works and state are untouched',()=>{
 const s=setup(),first=put(s),second=put(s,draft({title:'Outro',historyToAdd:1})),before=outside(s);
 assert.throws(()=>L.deleteLibraryBook(s,second.id),/histórico/);L.deleteLibraryBook(s,first.id);assert.equal(s.libraryData.books.length,1);assert.equal(s.libraryData.books[0].id,second.id);assert.ok(s.libraryData.editions.every(e=>e.bookId===second.id));assert.deepEqual(outside(s),before);
});
test('correcting one declared historical reading preserves work and other readings; linked records are protected',()=>{
 const s=setup(),book=put(s,draft({historyToAdd:2})),[a,b]=s.libraryData.readings;
 s.libraryData.sessions.push({id:'session',bookId:book.id,readingId:b.id});assert.throws(()=>L.removeLibraryHistory(s,b.id),/vinculado/);L.removeLibraryHistory(s,a.id);assert.equal(L.completedReadings(s.libraryData,book.id).length,1);assert.equal(s.libraryData.books.length,1);
});
test('catalog search covers authors/category/edition/ISBN/location, including the last result in a large catalog',()=>{
 const s=setup();for(let i=0;i<300;i++)put(s,draft({title:'Livro '+i,editions:[{format:'physical',isbn:String(1000+i),location:'Prateleira '+i}]}));
 assert.equal(s.libraryData.books.length,300);assert.equal(L.selectLibraryBooks(s,{query:'1299'})[0].title,'Livro 299');assert.equal(L.selectLibraryBooks(s,{query:'filosofia'}).length,300);assert.equal(new Set(s.libraryData.editions.map(e=>e.id)).size,300);
});
test('size guard refuses additional payload atomically, preserving original data',()=>{
 const s=setup();s.largeUnrelatedField='x'.repeat(750000);const before=clone(s);assert.throws(()=>put(s),/grande demais/);assert.deepEqual(s,before);
});
test('backup roundtrip retains complete library and storage remains UID-scoped',()=>{
 const s=setup();put(s,draft({historyToAdd:1}));const backup=JSON.stringify(s),restored=validateAccountState(JSON.parse(backup),s.ownerUid);assert.deepEqual(restored,s);assert.throws(()=>validateAccountState(restored,'other-reader'),/outra conta/);
 const cache=new Map(),storage={getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v)};const store=createAccountStorage(storage,'owner');store.load(s.ownerUid);store.save(s.ownerUid,s);store.load('other-reader');store.save('other-reader',{ownerUid:'other-reader',tasks:[],libraryData:L.emptyLibrary()});assert.equal(store.load(s.ownerUid).libraryData.books.length,1);assert.equal(store.load('other-reader').libraryData.books.length,0);
});
