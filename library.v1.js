// Biblioteca v1: catálogo independente de campanhas, missões e recompensas.
export const LIBRARY_VERSION = 1;
export const LIBRARY_FORMATS = Object.freeze({physical:'Físico',ebook:'E-book',pdf:'PDF',kindle:'Kindle'});
export const LIBRARY_INTENTS = Object.freeze({none:'Sem intenção definida',read:'Quero ler',reread:'Quero reler',revisit:'Quero revisar trechos/anotações'});
const rows=v=>Array.isArray(v)?v:[];
const copy=v=>JSON.parse(JSON.stringify(v));
const assert=(ok,message)=>{if(!ok)throw Error(message);};
export function emptyLibrary(){return {version:1,books:[],editions:[],readings:[],plans:[],sessions:[],imports:[]};}
// Existing unknown/malformed versions are retained intact, never silently reset.
export function initializeLibrary(state){if(state.libraryData===undefined)state.libraryData=emptyLibrary();return state.libraryData;}
export function libraryData(state){
 const data=state.libraryData;
 assert(data&&data.version===1&&['books','editions','readings','plans','sessions','imports'].every(key=>Array.isArray(data[key])),'Não foi possível abrir esta versão da Biblioteca. Exporte um backup antes de atualizar ou restaurar os dados.');
 return data;
}
const text=(value,max,label)=>{assert(typeof value==='string'&&value.length<=max,label+' inválido ou muito longo.');return value.trim();};
export const libraryKey=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLocaleLowerCase('pt-BR');
export function libraryUrl(value){
 const raw=text(value||'',2000,'Link');if(!raw)return '';
 let url;try{url=new URL(raw);}catch{throw Error('Informe um link completo começando com https:// ou http://.');}
 assert(['https:','http:'].includes(url.protocol)&&!url.username&&!url.password,'Use um link http:// ou https:// sem credenciais.');return url.href;
}
function month(value){value=text(value||'',7,'Período');assert(!value||/^20\d\d-(0[1-9]|1[0-2])$/.test(value),'Informe um mês válido para o período planejado.');return value;}
function freshId(data,prefix,idFactory){
 const used=new Set(['books','editions','readings','plans','sessions','imports'].flatMap(key=>data[key].map(row=>String(row.id))));
 for(let i=0;i<10;i++){const id=prefix+'-'+(idFactory?idFactory():globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));if(!used.has(id))return id;}
 throw Error('Não foi possível gerar uma identificação única. Tente novamente.');
}
function commit(state,data){
 const size=new TextEncoder().encode(JSON.stringify({...state,libraryData:data})).length;
 // Conservative application budget leaves room for the cloud envelope and recovery copies.
 assert(size<=750000,'O conjunto de dados está grande demais para esta gravação. Exporte um backup; nenhum registro foi alterado.');
 state.libraryData=data;
}
export function bookEditSignature(state,id){const d=libraryData(state);return JSON.stringify([d.books.find(b=>String(b.id)===String(id)),d.editions.filter(e=>String(e.bookId)===String(id))]);}
export function completedReadings(data,bookId){return data.readings.filter(r=>String(r.bookId)===String(bookId)&&r.status==='completed'&&r.kind!=='revisit');}
export function bookSummary(data,book){
 const count=completedReadings(data,book.id).length;
 const current=data.readings.find(r=>String(r.bookId)===String(book.id)&&['active','paused'].includes(r.status));
 const status=current?(current.status==='paused'?'Leitura pausada':current.kind==='reread'?'Relendo':'Em leitura'):count?`Lido ${count} ${count===1?'vez':'vezes'}`:'Sem leitura registrada';
 return {count,current,status,editions:data.editions.filter(e=>String(e.bookId)===String(book.id))};
}
export function saveLibraryBook(state,input,{bookId=null,expectedSignature=null,now=new Date().toISOString(),idFactory}={}){
 const original=libraryData(state),data=copy(original),existing=bookId?data.books.find(b=>String(b.id)===String(bookId)):null;
 assert(!bookId||existing,'Este livro não está mais disponível. Reabra o catálogo.');
 if(bookId&&expectedSignature!==null)assert(bookEditSignature(state,bookId)===expectedSignature,'O livro mudou enquanto estava sendo editado. Reabra a edição para conferir os dados atuais.');
 const title=text(input.title||'',300,'Título'),authors=text(input.authors||'',500,'Autor'),category=text(input.category||'',120,'Categoria'),notes=text(input.notes||'',4000,'Observações');
 assert(title,'Informe o título do livro.');assert(Object.hasOwn(LIBRARY_INTENTS,input.intent||'none'),'Escolha uma intenção válida.');
 assert(!data.books.some(b=>String(b.id)!==String(bookId)&&libraryKey(b.title)===libraryKey(title)&&libraryKey(b.authors)===libraryKey(authors)),'Este título e autor já estão no catálogo, inclusive entre arquivados. Edite o livro existente para acrescentar formatos ou edições.');
 assert(Array.isArray(input.editions)&&input.editions.length>0&&input.editions.length<=20,'Cadastre entre 1 e 20 formatos/edições.');
 const id=existing?.id||freshId(data,'book',idFactory),editionIds=new Set(),editionKeys=new Set();
 const editions=input.editions.map(raw=>{
  const previous=raw.id?data.editions.find(e=>String(e.id)===String(raw.id)&&String(e.bookId)===String(id)):null;
  assert(!raw.id||previous,'Uma edição mudou ou pertence a outro livro. Reabra a edição.');
  assert(Object.hasOwn(LIBRARY_FORMATS,raw.format),'Escolha um formato válido.');
  const edition=text(raw.edition||'',200,'Edição'),isbn=text(raw.isbn||'',40,'ISBN'),location=text(raw.location||'',200,'Localização');
  const total=raw.pageCount===''||raw.pageCount==null?null:Number(raw.pageCount);
  assert(total===null||Number.isInteger(total)&&total>0&&total<=100000,'O total de páginas deve ser um número inteiro positivo, ou ficar vazio.');
  const related=data.readings.filter(r=>String(r.editionId)===String(previous?.id));
  assert(!previous||!related.length||previous.format===raw.format,'Esta edição possui leituras. Acrescente outro formato em vez de mudar a referência do histórico.');
  assert(total===null||related.every(r=>r.metric!=='pages'||Number(r.position||0)<=total),'O total de páginas não pode ser menor que o progresso já registrado.');
  const key=JSON.stringify([raw.format,libraryKey(edition),libraryKey(isbn)]);assert(!editionKeys.has(key),'Há formatos/edições iguais neste cadastro. Diferencie a edição ou mantenha apenas uma.');editionKeys.add(key);
  const editionId=previous?.id||freshId({...data,editions:[...data.editions,...[...editionIds].map(id=>({id}))]},'edition',idFactory);assert(!editionIds.has(String(editionId)),'Edição repetida.');editionIds.add(String(editionId));
  return {...previous,id:editionId,bookId:id,format:raw.format,edition,isbn,location,pageCount:total,url:libraryUrl(raw.url||''),owned:raw.owned!==false,updatedAt:now};
 });
 const omitted=data.editions.filter(e=>String(e.bookId)===String(id)&&!editionIds.has(String(e.id)));
 assert(omitted.length===0,'Edições existentes não podem ser removidas nesta tela. O histórico será preservado.');
 const history=Number(input.historyToAdd||0);assert(Number.isInteger(history)&&history>=0&&history<=100,'Informe de 0 a 100 leituras anteriores a acrescentar.');
 const book={...existing,id,title,authors,category,notes,intent:input.intent||'none',targetMonth:month(input.targetMonth),createdAt:existing?.createdAt||now,updatedAt:now,archived:Boolean(existing?.archived)};
 if(existing)data.books[data.books.indexOf(existing)]=book;else data.books.push(book);
 data.editions=data.editions.filter(e=>String(e.bookId)!==String(id)).concat(editions);
 for(let i=0;i<history;i++)data.readings.push({id:freshId(data,'reading',idFactory),bookId:id,editionId:null,kind:'read',status:'completed',source:'manual-history',completedOn:null,createdAt:now});
 commit(state,data);return book;
}
export function archiveLibraryBook(state,id,archived,{now=new Date().toISOString()}={}){
 const data=copy(libraryData(state)),book=data.books.find(b=>String(b.id)===String(id));assert(book,'Livro não encontrado.');
 if(archived)assert(!data.readings.some(r=>String(r.bookId)===String(id)&&r.status==='active')&&!data.plans.some(p=>String(p.bookId)===String(id)&&p.status==='active'),'Pause a leitura e o plano antes de arquivar este livro.');
 book.archived=Boolean(archived);book.updatedAt=now;commit(state,data);
}
export function removeLibraryHistory(state,id){
 const data=copy(libraryData(state)),row=data.readings.find(r=>String(r.id)===String(id));assert(row&&row.source==='manual-history','Este registro deve ser corrigido no acompanhamento da leitura.');
 assert(!data.sessions.some(s=>String(s.readingId)===String(id))&&!data.plans.some(p=>String(p.readingId)===String(id)),'Este histórico está vinculado a atividades. Revise seus vínculos primeiro.');
 data.readings=data.readings.filter(r=>String(r.id)!==String(id));commit(state,data);
}
export function deleteLibraryBook(state,id){
 const data=copy(libraryData(state)),book=data.books.find(b=>String(b.id)===String(id));assert(book,'Livro não encontrado.');
 assert(!['readings','plans','sessions'].some(key=>data[key].some(row=>String(row.bookId)===String(id))),'Este livro possui histórico ou planejamento. Arquive para preservar os registros.');
 data.books=data.books.filter(b=>String(b.id)!==String(id));data.editions=data.editions.filter(e=>String(e.bookId)!==String(id));commit(state,data);
}
export function selectLibraryBooks(state,{query='',status='active',intent='all'}={}){
 const data=libraryData(state),key=libraryKey(query);
 return data.books.filter(book=>{
  const meta=bookSummary(data,book);
  return (status==='archived'?book.archived:!book.archived)&&(status!=='read'||meta.count>0)&&(status!=='unrecorded'||meta.count===0)&&(intent==='all'||book.intent===intent)&&(!key||libraryKey([book.title,book.authors,book.category,...meta.editions.map(e=>[e.edition,e.isbn,e.location].join(' '))].join(' ')).includes(key));
 }).sort((a,b)=>a.title.localeCompare(b.title,'pt-BR'));
}
