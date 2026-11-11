import test from 'node:test';
import assert from 'node:assert/strict';
import {installLibrary} from './ui/library.v4.js';
import {emptyLibrary,saveLibraryBook,startLibraryReading,saveReadingPlan} from './library.v2.js';
function fixture(){
 let state={libraryData:emptyLibrary(),xp:10},ui={confirm:{show:false},alert:{show:false}},renders=0,pending=new Map(),seq=0,dialog=null;
 const w={escapeHtml:s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),showAlertModal:message=>{throw Error(message);},showConfirmModal:(_,yes)=>yes(),showToast:()=>{},saveStateNow:async()=>true};
 const doc={activeElement:null,getElementById:id=>id==='library-module-dialog'?dialog:null,querySelectorAll:()=>[]};
 installLibrary(w,{document:doc,getState:()=>state,getUiState:()=>ui,render:()=>{w.captureLibraryDraft();renders++;},setTimer:fn=>{pending.set(++seq,fn);return seq;},cancelTimer:id=>pending.delete(id)});
 return {w,doc,get state(){return state;},get ui(){return ui;},get renders(){return renders;},get pending(){return pending.size;},flush(){const jobs=[...pending.values()];pending.clear();jobs.forEach(fn=>fn());},switchAccount(){state={libraryData:emptyLibrary()};dialog=null;},setDialog(tab,top=0,open=true){const detail={open,getAttribute:()=>tab+'-options'};dialog={dataset:{workTab:tab.startsWith('book:')?'book-form':tab,libraryView:tab},scroll:{scrollTop:top},detail,querySelector:s=>s==='#library-scroll'?dialog.scroll:null,querySelectorAll:()=>[detail],contains:()=>false};return dialog;},book(title='Livro de teste'){return saveLibraryBook(state,{title,authors:'Autor',editions:[{format:'physical',owned:true,pageCount:200}]});}};
}
test('busca aguarda pausa na digitação e usa o último texto sem renderizar a cada letra',()=>{
 const f=fixture();f.w.openLibrary();const before=f.renders;for(const text of ['P','Pl','Platão'])f.w.setLibraryFilter('query',text);assert.equal(f.renders,before);assert.equal(f.pending,1);f.flush();assert.equal(f.renders,before+1);assert.equal(f.ui.library.query,'Platão');
});
test('composição de texto não é interrompida e a busca aplica apenas o texto final',()=>{
 const f=fixture();f.w.openLibrary();f.w.setLibrarySearchComposing(true);f.w.setLibraryFilter('query','に');f.w.setLibraryFilter('query','日本');assert.equal(f.pending,0);f.w.setLibrarySearchComposing(false,'日本語');assert.equal(f.pending,1);f.flush();assert.equal(f.ui.library.query,'日本語');
});
test('busca pendente não reabre catálogo após trocar aba, abrir formulário, fechar ou mudar conta',()=>{
 for(const transition of [f=>f.w.setLibraryReadingTab('plans'),f=>f.w.editLibraryBook(),f=>f.w.closeLibrary(),f=>f.switchAccount()]){const f=fixture();f.w.openLibrary();f.w.setLibraryFilter('query','Teste');transition(f);const before=f.renders;f.flush();assert.equal(f.renders,before);}
});
test('cada aba conserva posição e detalhes ao voltar; fechar conserva filtros na mesma sessão',()=>{
 const f=fixture();f.w.openLibrary();f.w.setLibraryFilter('query','Livro');f.w.setLibraryFilter('status','read');f.w.setLibraryFilter('intent','reread');f.setDialog('shelf',380);f.w.setLibraryReadingTab('plans');f.setDialog('plans',190);f.w.setLibraryReadingTab('shelf');const shelf=f.setDialog('shelf',0,false);f.w.restoreLibraryView();assert.equal(shelf.scroll.scrollTop,380);assert.equal(shelf.detail.open,true);
 f.w.closeLibrary();f.w.openLibrary();assert.equal(f.ui.library.tab,'shelf');assert.equal(f.ui.library.query,'Livro');assert.equal(f.ui.library.status,'read');assert.equal(f.ui.library.intent,'reread');const restored=f.setDialog('shelf',0,false);f.w.restoreLibraryView();assert.equal(restored.scroll.scrollTop,380);
});
test('cancelar edição volta à estante sem perder posição e não ressuscita alterações descartadas',()=>{
 const f=fixture(),book=f.book();f.w.openLibrary();f.setDialog('shelf',450);f.w.editLibraryBook(book.id);f.setDialog('book:'+book.id,130);f.ui.library.form.draft.title='Descartar';f.w.cancelLibraryBook();const shelf=f.setDialog('shelf',0);f.w.restoreLibraryView();assert.equal(shelf.scroll.scrollTop,450);f.w.closeLibrary();f.w.openLibrary();assert.equal(f.ui.library.form,null);f.w.editLibraryBook(book.id);assert.equal(f.ui.library.form.draft.title,'Livro de teste');
});
test('contexto da biblioteca não atravessa troca de conta',()=>{
 const f=fixture();f.w.openLibrary();f.w.setLibraryFilter('query','Privado');f.setDialog('shelf',500);f.w.closeLibrary();f.switchAccount();f.w.openLibrary();assert.equal(f.ui.library.query,'');assert.deepEqual(f.ui.library.views,{});
});
test('salvar edição mantém livro e histórico, bloqueia envio repetido e volta ao catálogo',async()=>{
 const f=fixture(),book=f.book();let release;f.w.saveStateNow=()=>new Promise(resolve=>release=resolve);f.w.openLibrary();f.w.editLibraryBook(book.id);f.ui.library.form.draft.title='Título revisado';const save=f.w.saveLibraryBookForm();assert.equal(f.ui.library.busy,true);await f.w.saveLibraryBookForm();assert.equal(f.state.libraryData.books.length,1);assert.equal(f.state.libraryData.books[0].id,book.id);assert.equal(f.state.libraryData.books[0].title,'Título revisado');assert.equal(f.state.xp,10);assert.match(f.w.renderLibrary(),/aria-busy="true"/);release(true);await save;assert.equal(f.ui.library.busy,false);assert.equal(f.ui.library.form,null);
});
test('ver acompanhamento focaliza apenas a leitura escolhida sem modificar dados',()=>{
 const f=fixture(),book=f.book(),reading=startLibraryReading(f.state,{bookId:book.id,editionId:f.state.libraryData.editions[0].id,kind:'read',metric:'pages',position:0,startedOn:'2026-11-11'});f.w.openLibrary();const before=JSON.stringify(f.state);let focused=0,scrolled=0;const target={getAttribute:()=>reading.id,focus:()=>focused++,scrollIntoView:()=>scrolled++};f.doc.querySelectorAll=()=>[{getAttribute:()=> 'outro'},target];f.w.viewLibraryReading(reading.id);assert.equal(f.ui.library.tab,'reading');assert.equal(focused,1);assert.equal(scrolled,1);assert.equal(JSON.stringify(f.state),before);
});
test('registrar leitura e planejar continuam visíveis; opções secundárias ficam agrupadas',()=>{
 const f=fixture(),book=f.book(),reading=startLibraryReading(f.state,{bookId:book.id,editionId:f.state.libraryData.editions[0].id,kind:'read',metric:'pages',position:0,startedOn:'2026-11-11'});saveReadingPlan(f.state,{readingId:reading.id,startDate:'2026-11-11',days:['wednesday'],minutes:20});f.w.openLibrary();assert.match(f.w.renderLibraryActivityTab('reading'),/Registrar leitura/);assert.match(f.w.renderLibraryActivityTab('reading'),/Opções da leitura/);assert.match(f.w.renderLibraryActivityTab('plans'),/Opções do plano/);f.state.libraryData.readings[0].status='paused';assert.match(f.w.renderLibraryActivityTab('reading'),/Retomar leitura/);
});
