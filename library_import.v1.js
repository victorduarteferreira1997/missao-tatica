import {v2Hash} from './ai/v2/contract.js';
import {initializeLibrary,libraryData,libraryKey,saveLibraryBook} from './library.v2.js';
import {libraryImportFields,libraryImportSelection,LIBRARY_IMPORT_KIND} from './ai/v2/library_import.js';
const clone=value=>JSON.parse(JSON.stringify(value));
const fail=message=>{throw Error(message);};
const identity=book=>libraryKey(book.title)+'|'+libraryKey(book.authors);
export function previewLibraryImport(state,input){
 const fields=libraryImportFields(input),data=libraryData(state),seen=new Set(),seenTitles=new Set();
 return fields.books.map(book=>{
  const key=identity(book),duplicate=data.books.find(b=>identity(b)===key),sameTitle=data.books.find(b=>libraryKey(b.title)===libraryKey(book.title));
  let status=duplicate||seen.has(key)?'duplicate':sameTitle||seenTitles.has(libraryKey(book.title))?'possible':'new',message=duplicate?'Já existe na estante'+(duplicate.archived?' (arquivado)':'')+'. Nenhum dado será substituído.':seen.has(key)?'Título e autor repetidos nesta parte. Revise o primeiro registro.':sameTitle||seenTitles.has(libraryKey(book.title))?'Mesmo título com autoria diferente ou incompleta. Confira antes de selecionar.':'Novo livro';seen.add(key);seenTitles.add(libraryKey(book.title));
  const test={libraryData:clone(data)};
  if(status!=='duplicate')try{saveLibraryBook(test,{...book,historyToAdd:book.historyCount});}catch(error){status='invalid';message=error.message;}
  return {sourceKey:book.sourceKey,status,message,selected:status==='new'};
 });
}
export async function applyLibraryImport(state,input,selection,{proposalId,now=new Date().toISOString()}={}){
 const fields=libraryImportFields(input);libraryImportSelection(fields,selection);if(!/^[a-f0-9]{64}$/.test(proposalId||''))fail('Identificação da proposta inválida.');
 const originalSignature=JSON.stringify(state.libraryData),draft=clone(state);initializeLibrary(draft);const data=libraryData(draft),fingerprint=await v2Hash(JSON.stringify({fields,selection:[...selection].sort()})),previous=data.imports.find(r=>r.batchKey===fields.batchKey&&r.partIndex===fields.partIndex);
 if(JSON.stringify(state.libraryData)!==originalSignature)fail('A Biblioteca mudou durante a importação. Reabra a revisão.');
 if(previous){if(previous.fingerprint!==fingerprint)fail('Esta parte do lote já foi revisada com outros valores. Consulte o histórico; não foi criado outro cadastro.');return {taskId:previous.id,kind:LIBRARY_IMPORT_KIND,replayed:true};}
 const parts=data.imports.filter(r=>r.batchKey===fields.batchKey);if(parts.some(r=>r.partCount!==fields.partCount))fail('A divisão deste lote mudou. Retome as partes originais.');
 if(parts.some(part=>part.sourceKeys.some(key=>fields.books.some(b=>b.sourceKey===key))))fail('Uma linha deste lote já pertence a outra parte. Confira a divisão antes de continuar.');
 const createdBookIds=[],skipped=[];
 for(const book of fields.books){if(!selection.includes(book.sourceKey)){skipped.push({sourceKey:book.sourceKey,reason:'not-selected'});continue;}
  if(libraryData(draft).books.some(b=>identity(b)===identity(book))){skipped.push({sourceKey:book.sourceKey,reason:'duplicate'});continue;}
  const saved=saveLibraryBook(draft,{...book,historyToAdd:book.historyCount},{now});createdBookIds.push(saved.id);
 }
 const receipt={id:'catalog-import-'+proposalId,proposalId,batchKey:fields.batchKey,partIndex:fields.partIndex,partCount:fields.partCount,title:fields.title,sourceKeys:fields.books.map(b=>b.sourceKey),createdBookIds,skipped,fingerprint,createdAt:now};libraryData(draft).imports.push(receipt);
 if(new TextEncoder().encode(JSON.stringify(draft)).length>720000)fail('O catálogo excederia o limite seguro desta importação. Nenhum livro foi cadastrado; exporte um backup e revise o volume.');
 state.libraryData=draft.libraryData;return {taskId:receipt.id,kind:LIBRARY_IMPORT_KIND,created:createdBookIds.length,skipped:skipped.length};
}
