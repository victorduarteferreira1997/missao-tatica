import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyLibrary,saveLibraryBook,archiveLibraryBook} from './library.v2.js';
import {libraryImportFields,libraryImportRequest} from './ai/v2/library_import.js';
import {previewLibraryImport,applyLibraryImport} from './library_import.v1.js';
import {v2ValidateChoices,v2BuildSnapshot} from './ai/v2/contract.js';
const book=(sourceKey='row-1',title='Livro de teste',extra={})=>({sourceKey,title,authors:'Autoria fictícia',category:'História',editions:[{format:'physical',pageCount:200,owned:true}],...extra});
const fields=(books=[book()],extra={})=>({title:'Catálogo fictício',batchKey:'batch-fixture-001',partIndex:1,partCount:2,books,...extra});
const state=()=>({libraryData:emptyLibrary(),tasks:[{id:1,completed:true}],combo:7,xp:120,studyData:{sessions:[{id:2}]},financeData:{secret:'preserve'},prestige:{campaign:4}});
const apply=(s,f=fields(),selection=f.books.map(b=>b.sourceKey),id='a')=>applyLibraryImport(s,f,selection,{proposalId:id.repeat(64),now:'2026-10-22T12:00:00Z'});
test('catalog permission is independent and never projects the shelf, history or notes',async()=>{
 const choices={modules:{missions:false,radar:false,studies:false},includeFuture:false,allowLibraryProposals:true};v2ValidateChoices(choices);
 assert.throws(()=>v2ValidateChoices({...choices,allowLibraryProposals:'true'}));assert.throws(()=>v2ValidateChoices({...choices,allowLibraryProposals:false}));
 const s=state();s.lastSavedAt=new Date().toISOString();const snap=await v2BuildSnapshot(s,{grantId:'catalog-fixture-grant',version:1,choices,frozenRefs:[]});assert.deepEqual(snap.entities,[]);assert.doesNotMatch(JSON.stringify(snap),/Livro|preserve|120/);
});
test('contract does not infer ownership, format or prior reading; rejects extra fields and invalid bounds',()=>{
 const f=libraryImportFields(fields([book('row-1','Título',{editions:[{format:''}]})]));assert.equal(f.books[0].editions[0].owned,false);assert.equal(f.books[0].historyCount,0);assert.equal(f.books[0].intent,'none');
 for(const b of [book('row-1',''),book('row-1','A',{xp:9}),book('row-1','A',{historyCount:-1}),book('row-1','A',{editions:[{format:'pdf',url:'javascript:alert(1)'}]}),book('row-1','A',{editions:[{format:'pdf',pageCount:0}]})])assert.throws(()=>libraryImportFields(fields([b])));
 assert.throws(()=>libraryImportRequest({idempotencyKey:'small',fields:fields()}));assert.throws(()=>libraryImportFields(fields(Array.from({length:21},(_,i)=>book('row-'+i)))));assert.throws(()=>libraryImportFields(fields([book()],{partIndex:3})));
});
test('preview identifies exact/archived/within-part duplicates and incomplete-author matches without changing records',()=>{
 const s=state(),old=saveLibraryBook(s,book('existing'));archiveLibraryBook(s,old.id,true);const before=structuredClone(s);
 const preview=previewLibraryImport(s,fields([book('a'),book('b','New'),book('c','New'),book('d','Livro de teste',{authors:''}),book('e','Unknown format',{editions:[{format:''}]})]));
 assert.deepEqual(preview.map(p=>p.status),['duplicate','new','duplicate','possible','invalid']);assert.deepEqual(s,before);
});
test('one reviewed part is atomic, uses final fields and leaves all non-library modules unchanged',async()=>{
 const s=state(),before=structuredClone(s),f=fields([book('row-1','Título revisado',{editions:[{format:'kindle',pageCount:null,owned:false},{format:'physical',pageCount:300}]}),book('row-2','Não selecionado')]);
 const result=await apply(s,f,['row-1']);assert.equal(result.created,1);assert.equal(s.libraryData.books[0].title,'Título revisado');assert.equal(s.libraryData.editions.length,2);assert.equal(s.libraryData.readings.length,0);assert.equal(s.libraryData.plans.length,0);const after=structuredClone(s);delete before.libraryData;delete after.libraryData;assert.deepEqual(after,before);
 const invalid=fields([book('x','Valid'),book('y','Missing format',{editions:[{format:''}]})],{partIndex:2});const saved=structuredClone(s);await assert.rejects(apply(s,invalid,undefined,'b'));assert.deepEqual(s,saved);
});
test('retrying accepted part under another proposal cannot duplicate books or explicit prior readings',async()=>{
 const s=state(),f=fields([book('row-1','Lido',{historyCount:2,intent:'reread'})]);await apply(s,f);const previous=structuredClone(s);const replay=await apply(s,f,undefined,'b');assert.equal(replay.replayed,true);assert.deepEqual(s,previous);assert.equal(s.libraryData.readings.length,2);assert.ok(s.libraryData.readings.every(r=>r.completedOn===null&&r.editionId===null));
 await assert.rejects(apply(s,fields([book('row-1','Mudou')]),undefined,'c'),/outros valores/);assert.deepEqual(s,previous);
});
test('resuming later parts deduplicates across the whole shelf and rejects changed partition/source keys',async()=>{
 const s=state();await apply(s);await apply(s,fields([book('row-2'),book('row-3','Outro')],{partIndex:2}),undefined,'b');assert.equal(s.libraryData.books.length,2);assert.equal(s.libraryData.imports.length,2);assert.equal(s.libraryData.imports[1].skipped[0].reason,'duplicate');
 const before=structuredClone(s);await assert.rejects(apply(s,fields([book('row-1','Third')],{partIndex:3,partCount:3}),undefined,'c'),/divisão/);assert.deepEqual(s,before);
 const other=state();await apply(other);await assert.rejects(apply(other,fields([book('row-1','Third')],{partIndex:2}),undefined,'c'),/outra parte/);
});
test('unselected/duplicate books cannot overwrite old metadata or fabricate reading completions',async()=>{
 const s=state(),saved=saveLibraryBook(s,book('existing'));const existing=structuredClone(s.libraryData);await apply(s,fields([book('row-1',saved.title,{category:'Overwrite',historyCount:20}),book('row-2','Skip',{historyCount:3})]),['row-1']);assert.deepEqual(s.libraryData.books,existing.books);assert.deepEqual(s.libraryData.readings,[]);assert.equal(s.libraryData.imports[0].createdBookIds.length,0);
});
test('size limit and concurrent edits fail without partial imports or erasing current data',async()=>{
 const s=state();s.padding='x'.repeat(740000);const before=structuredClone(s);await assert.rejects(apply(s));assert.deepEqual(s,before);
 const t=state(),pending=apply(t);t.libraryData.books.push({id:'changed',title:'Changed',authors:''});await assert.rejects(pending,/mudou/);assert.equal(t.libraryData.books[0].id,'changed');assert.equal(t.libraryData.imports.length,0);
});
