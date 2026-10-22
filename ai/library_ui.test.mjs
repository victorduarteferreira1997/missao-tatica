import test from 'node:test';
import assert from 'node:assert/strict';
import {installLibraryImports} from '../ui/library_import.v1.js';
import {libraryImportFields} from './v2/library_import.js';
import {emptyLibrary} from '../library.v2.js';
import {applyLibraryImport} from '../library_import.v1.js';
import {AI_OWNER_UID} from './contract.v1.js';
const fields=libraryImportFields({title:'Catálogo',batchKey:'ui-catalog-batch',partIndex:1,partCount:1,books:[{sourceKey:'row-1',title:'Original',authors:'Autoria',category:'',editions:[{format:'physical'}]}]});
function fixture(){
 let user={uid:AI_OWNER_UID},row={id:'b'.repeat(64),grantId:'library-ui-grant-001',grantVersion:1,version:1,kind:'library.catalog.import',status:'pending',createdAt:'2026-10-22T12:00:00Z',expiresAt:'2027-01-20T12:00:00Z',fields:structuredClone(fields),selection:null,receiptRef:null};
 const state={tasks:[{id:1}],xp:10,combo:8,libraryData:emptyLibrary()},ui={library:{busy:false},confirm:{show:false},alert:{show:false}},calls={save:0,reserve:0,apply:0,ack:0};let failAck=false,canSave=true,hold=null;
 const window={escapeHtml:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),showConfirmModal:(message,callback)=>{ui.confirm={show:true,message,callback};}};
 const document={getElementById:()=>null};
 installLibraryImports(window,{document,getState:()=>state,getUiState:()=>ui,getUser:()=>user,render:()=>{},saveConfirmed:async()=>{calls.save++;return canSave;},applyPart:async part=>{calls.apply++;const receipt=await applyLibraryImport(state,part.fields,part.selection,{proposalId:part.id});return {receipt};},store:{list:async()=>({items:[row],nextCursor:null}),reserve:async(_,f,selection)=>{calls.reserve++;if(hold)await hold;row={...row,status:'applying',version:2,fields:structuredClone(f),selection:[...selection]};return row;},acknowledge:async()=>{calls.ack++;if(failAck){failAck=false;throw Error('Synthetic failed acknowledgment');}row={...row,status:'accepted',receiptRef:'a'.repeat(64)};return row;}}});
 return {window,ui,state,calls,review:async()=>{await window.openLibraryImports();window.reviewLibraryImport(row.id);},failAck:()=>failAck=true,saveFails:()=>canSave=false,hold:p=>hold=p,switchUser:()=>user={uid:'independent-member'}};
}
test('review requires checking final edits, preserves typed values and escapes spreadsheet text',async()=>{
 const a=fixture();await a.review();a.window.editLibraryImportBook(0,'title','Final <script>');await a.window.confirmLibraryImport();assert.equal(a.calls.reserve,0);assert.match(a.window.renderLibraryImports(),/Conferir ajustes/);assert.match(a.window.renderLibraryImports(),/Final &lt;script>/);a.window.checkLibraryImport();await a.window.confirmLibraryImport();assert.equal(a.state.libraryData.books[0].title,'Final <script>');assert.equal(a.ui.library.busy,false);assert.equal(a.ui.libraryImportOpen,true);assert.equal(a.state.tasks.length,1);assert.equal(a.state.xp,10);
});
test('unsaved cloud or a changed shelf blocks reservation and preserves the reviewed draft',async()=>{
 const a=fixture();await a.review();a.saveFails();await a.window.confirmLibraryImport();assert.equal(a.calls.reserve,0);assert.equal(a.state.libraryData.books.length,0);
 const b=fixture();await b.review();b.state.libraryData.books.push({id:'other',title:'Other',authors:''});await b.window.confirmLibraryImport();assert.equal(b.calls.reserve,0);assert.match(b.window.renderLibraryImports(),/Biblioteca/);
});
test('lost acknowledgment and repeated click recover with one book and a persistent receipt',async()=>{
 const a=fixture();await a.review();a.failAck();await a.window.confirmLibraryImport();assert.equal(a.state.libraryData.books.length,1);assert.match(a.window.renderLibraryImports(),/Retomar cadastro/);await a.window.confirmLibraryImport();assert.equal(a.state.libraryData.books.length,1);assert.equal(a.state.libraryData.imports.length,1);assert.equal(a.calls.ack,2);assert.equal(a.ui.libraryImportOpen,true);
 const b=fixture();await b.review();let release;b.hold(new Promise(resolve=>release=resolve));const first=b.window.confirmLibraryImport();await new Promise(resolve=>setImmediate(resolve));await b.window.confirmLibraryImport();assert.equal(b.calls.reserve,1);release();await first;assert.equal(b.calls.apply,1);
});
test('account changes invalidate pending work; members cannot open the owner integration',async()=>{
 const a=fixture();await a.review();let release;a.hold(new Promise(resolve=>release=resolve));const pending=a.window.confirmLibraryImport();await new Promise(resolve=>setImmediate(resolve));a.switchUser();a.window.resetLibraryImports();release();await pending;assert.equal(a.calls.apply,0);assert.equal(a.window.renderLibraryImports(),'');await a.window.openLibraryImports();assert.equal(a.window.renderLibraryImportButton(),'');
});
