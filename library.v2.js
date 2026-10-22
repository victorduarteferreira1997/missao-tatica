// Biblioteca v2: catálogo, leituras e planos independentes de campanhas e recompensas.
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
 const status=current?(current.status==='paused'?'Leitura pausada':current.kind==='reread'?'Relendo':current.kind==='revisit'?'Revisando trechos':'Em leitura'):count?`Lido ${count} ${count===1?'vez':'vezes'}`:'Sem leitura registrada';
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
  assert(total===null||related.every(r=>r.metric!=='pages'||[r.position,r.initialPosition,...data.sessions.filter(s=>String(s.readingId)===String(r.id)).map(s=>s.position)].every(value=>Number(value||0)<=total)),'O total de páginas não pode ser menor que o progresso já registrado.');
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

// Leituras e planejamento v2. A versão do estado continua 1: novos campos são aditivos.
export const LIBRARY_DAYS=Object.freeze(['monday','tuesday','wednesday','thursday','friday','saturday','sunday']);
export const READING_KINDS=Object.freeze({read:'Ler',reread:'Reler',revisit:'Revisar trechos/anotações'});
export function libraryToday(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function readingDate(value){if(!/^20\d\d-\d\d-\d\d$/.test(value||''))return false;const date=new Date(value+'T12:00:00Z');return Number.isFinite(+date)&&date.toISOString().slice(0,10)===value;}
export function addReadingDays(value,n){assert(readingDate(value),'Data inválida.');const date=new Date(value+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+n);return date.toISOString().slice(0,10);}
const weekday=value=>LIBRARY_DAYS[(new Date(value+'T12:00:00Z').getUTCDay()+6)%7];
export const readingActionSignature=state=>JSON.stringify(libraryData(state));
const changeLibrary=(state,work,{expectedSignature}={})=>{if(expectedSignature!==undefined)assert(readingActionSignature(state)===expectedSignature,'A Biblioteca mudou. Reabra esta ação para conferir os dados atuais.');const data=copy(libraryData(state)),result=work(data);commit(state,data);return result;};
const needReading=(data,id)=>{const row=data.readings.find(r=>String(r.id)===String(id));assert(row&&row.source!=='manual-history','Acompanhamento de leitura não encontrado.');return row;};
const needBook=(data,id)=>{const row=data.books.find(b=>String(b.id)===String(id));assert(row&&!row.archived,'Livro indisponível ou arquivado. Restaure-o para continuar.');return row;};
function readingPosition(value,metric,edition){
 const number=Number(value);assert(Number.isFinite(number)&&number>=0&&(metric==='percent'?number<=100&&Math.abs(number*100-Math.round(number*100))<0.000001:Number.isInteger(number)&&number<=(edition?.pageCount||100000)),metric==='percent'?'Informe um percentual de 0 a 100, com até duas casas decimais.':'Informe uma página válida para esta edição.');return number;
}
export function readingProgress(data,reading){const edition=data.editions.find(e=>String(e.id)===String(reading.editionId));return {position:reading.position??reading.initialPosition??0,metric:reading.metric,percent:reading.metric==='percent'?(reading.position||0):edition?.pageCount?Math.min(100,(reading.position||0)/edition.pageCount*100):null,total:reading.metric==='percent'?100:edition?.pageCount||null};}
export function startLibraryReading(state,input,options={}){
 const {today=libraryToday(),now=new Date().toISOString(),idFactory}=options;
 return changeLibrary(state,data=>{
  const book=needBook(data,input.bookId),edition=data.editions.find(e=>String(e.id)===String(input.editionId)&&String(e.bookId)===String(book.id));assert(edition,'Escolha um formato/edição deste livro.');
  assert(!data.readings.some(r=>String(r.bookId)===String(book.id)&&['active','paused'].includes(r.status)),'Este livro já tem um acompanhamento aberto. Retome ou conclua a leitura atual.');
  assert(Object.hasOwn(READING_KINDS,input.kind),'Escolha leitura, releitura ou revisão.');assert(['pages','percent'].includes(input.metric),'Escolha páginas ou percentual.');
  const startedOn=input.startedOn||today;assert(readingDate(startedOn)&&startedOn<=today,'A data inicial deve ser válida e não estar no futuro.');
  const position=readingPosition(input.position===''||input.position==null?0:input.position,input.metric,edition);
  const reading={id:freshId(data,'reading',idFactory),bookId:book.id,editionId:edition.id,kind:input.kind,metric:input.metric,initialPosition:position,position,startedOn,status:'active',source:'manual-reading',createdAt:now,completedOn:null};data.readings.push(reading);return reading;
 },options);
}
export function setLibraryReadingStatus(state,id,status,options={}){
 const {today=libraryToday()}=options;assert(['active','paused'].includes(status),'Estado de leitura inválido.');
 return changeLibrary(state,data=>{const reading=needReading(data,id);needBook(data,reading.bookId);assert(['active','paused'].includes(reading.status),'Esta leitura já foi concluída. Inicie outro acompanhamento para reler.');reading.status=status;
  for(const plan of data.plans.filter(p=>String(p.readingId)===String(id))){if(status==='paused'&&plan.status==='active'){plan.status='paused';plan.pausedByReading=true;plan.pausedOn=today;}else if(status==='active'&&plan.status==='paused'&&plan.pausedByReading){plan.status='active';plan.pausedByReading=false;plan.resumedOn=today;}}
 },options);
}
export function finishLibraryReading(state,id,options={}){
 const {today=libraryToday(),completedOn=today}=options;assert(readingDate(completedOn)&&completedOn<=today,'Informe uma data de conclusão válida, até hoje.');
 return changeLibrary(state,data=>{const reading=needReading(data,id);assert(['active','paused'].includes(reading.status),'Esta leitura já foi concluída.');assert(completedOn>=reading.startedOn,'A conclusão não pode ser anterior ao início.');assert(data.sessions.filter(s=>String(s.readingId)===String(id)).every(s=>s.date<=completedOn),'Há um registro posterior à data de conclusão. Revise a data ou corrija o registro.');
  reading.status='completed';reading.completedOn=completedOn;
  for(const plan of data.plans.filter(p=>String(p.readingId)===String(id)&&p.status!=='ended')){plan.status='ended';plan.endedOn=completedOn;plan.pausedByReading=false;}
 },options);
}
function orderedReadingSessions(data,id){return data.sessions.filter(s=>String(s.readingId)===String(id)).sort((a,b)=>a.date.localeCompare(b.date)||String(a.createdAt).localeCompare(String(b.createdAt))||String(a.id).localeCompare(String(b.id)));}
function recomputeReadingPosition(data,reading){
 const edition=data.editions.find(e=>String(e.id)===String(reading.editionId));let position=reading.initialPosition||0;
 for(const session of orderedReadingSessions(data,reading.id)){if(session.position===null||session.position===undefined)continue;const next=readingPosition(session.position,reading.metric,edition);assert(reading.kind==='revisit'||next>=position,'O progresso ficaria menor que um registro anterior. Corrija as posições ou datas dos registros.');position=next;}
 reading.position=position;
}
export function saveReadingSession(state,input,options={}){
 const {today=libraryToday(),now=new Date().toISOString(),idFactory,sessionId=null}=options;
 return changeLibrary(state,data=>{
  const reading=needReading(data,input.readingId),old=sessionId?data.sessions.find(s=>String(s.id)===String(sessionId)):null;assert(!sessionId||old&&String(old.readingId)===String(reading.id),'Registro de leitura indisponível.');
  needBook(data,reading.bookId);assert(old||reading.status==='active','Retome a leitura antes de registrar uma sessão.');
  assert(readingDate(input.date)&&input.date<=today&&input.date>=reading.startedOn,'A data da leitura deve ficar entre o início do acompanhamento e hoje.');if(reading.status==='completed')assert(input.date<=reading.completedOn,'A data não pode ultrapassar a conclusão deste acompanhamento.');
  const edition=data.editions.find(e=>String(e.id)===String(reading.editionId));const position=input.position===''||input.position==null?null:readingPosition(input.position,reading.metric,edition);
  const minutes=input.minutes===''||input.minutes==null?null:Number(input.minutes);assert(minutes===null||Number.isInteger(minutes)&&minutes>0&&minutes<=1440,'Informe minutos reais de 1 a 1440, ou deixe vazio.');assert(position!==null||minutes!==null,'Informe a posição em que parou ou o tempo real de leitura.');
  const notes=text(input.notes||'',2000,'Anotação');const planId=old?.planId||input.planId||null,planDate=old?.planDate||input.planDate||null;
  let plan=null;if(planId){plan=data.plans.find(p=>String(p.id)===String(planId));assert(plan&&String(plan.readingId)===String(reading.id)&&readingDate(planDate),'Plano de leitura incompatível.');assert(old||plan.status==='active','Retome o plano antes de registrar esta sessão.');
   assert(!data.sessions.some(s=>String(s.id)!==String(sessionId)&&String(s.planId)===String(planId)&&s.planDate===planDate),'Esta sessão planejada já tem um registro. Edite o registro existente.');
   assert(old||scheduledReadingDates(plan,planDate,planDate).some(x=>x.sourceDate===planDate)||rows(plan.exceptions).some(x=>x.sourceDate===planDate&&x.targetDate),'Esta sessão foi cancelada ou o plano mudou. Reabra o planejamento.');
  }
  const planStatus=planId?(input.planCompleted===true?'completed':'partial'):null;
  const fingerprint=JSON.stringify({readingId:reading.id,date:input.date,position,minutes,notes,planId,planDate,planStatus});
  const requestKey=old?.requestKey||text(input.requestKey||'',100,'Identificação do registro');assert(requestKey.length>=8,'Reabra o formulário para gerar uma identificação de registro.');
  if(!old){const duplicate=data.sessions.find(s=>s.requestKey===requestKey);if(duplicate){assert(duplicate.fingerprint===fingerprint,'Esta identificação já foi usada com outros valores. Reabra o formulário.');return duplicate;}}
  const session={...old,id:old?.id||freshId(data,'session',idFactory),bookId:reading.bookId,editionId:reading.editionId,readingId:reading.id,date:input.date,position,minutes,notes,planId,planDate,planStatus,requestKey,fingerprint,createdAt:old?.createdAt||now,updatedAt:now};
  if(old)data.sessions[data.sessions.indexOf(old)]=session;else data.sessions.push(session);recomputeReadingPosition(data,reading);return session;
 },options);
}
export function removeReadingSession(state,id,options={}){return changeLibrary(state,data=>{const session=data.sessions.find(s=>String(s.id)===String(id));assert(session,'Registro não encontrado.');const reading=needReading(data,session.readingId);data.sessions=data.sessions.filter(s=>String(s.id)!==String(id));recomputeReadingPosition(data,reading);},options);}
function scheduledReadingDates(plan,from,to){
 const result=[];for(let date=from;date<=to;date=addReadingDays(date,1)){
  if(date<plan.startDate||plan.endDate&&date>plan.endDate||!rows(plan.days).includes(weekday(date)))continue;
  const exception=rows(plan.exceptions).find(x=>x.sourceDate===date);if(!exception)result.push({sourceDate:date,date});
 }
 for(const exception of rows(plan.exceptions))if(exception.targetDate&&exception.targetDate>=plan.startDate&&(!plan.endDate||exception.targetDate<=plan.endDate)&&exception.targetDate>=from&&exception.targetDate<=to)result.push({sourceDate:exception.sourceDate,date:exception.targetDate});
 return result;
}
export function saveReadingPlan(state,input,options={}){
 const {today=libraryToday(),now=new Date().toISOString(),idFactory,planId=null}=options;
 return changeLibrary(state,data=>{
  const reading=needReading(data,input.readingId),book=needBook(data,reading.bookId);assert(reading.status==='active','Retome a leitura para planejar novas sessões.');
  const old=planId?data.plans.find(p=>String(p.id)===String(planId)):null;assert(!planId||old&&String(old.readingId)===String(reading.id),'Plano indisponível ou de outra leitura.');assert(!old||old.status!=='ended','Este plano foi encerrado. Crie outro plano.');
  assert(!data.plans.some(p=>String(p.id)!==String(planId)&&String(p.readingId)===String(reading.id)&&['active','paused'].includes(p.status)),'Esta leitura já possui um plano aberto. Edite ou encerre o plano atual.');
  const days=LIBRARY_DAYS.filter(day=>rows(input.days).includes(day));assert(days.length,'Selecione ao menos um dia da semana.');
  assert(readingDate(input.startDate)&&input.startDate>=reading.startedOn,'A data inicial do plano deve ser válida e igual ou posterior ao início da leitura.');const endDate=input.endDate||null;assert(!endDate||readingDate(endDate)&&endDate>=input.startDate,'A data final deve ser válida e igual ou posterior à inicial.');
  assert(!endDate||Array.from({length:7},(_,i)=>addReadingDays(input.startDate,i)).some(date=>date<=endDate&&days.includes(weekday(date))),'Nenhum dia selecionado ocorre até o término do plano.');
  const minutes=Number(input.minutes);assert(Number.isInteger(minutes)&&minutes>=1&&minutes<=480,'Planeje de 1 a 480 minutos por sessão.');const startTime=input.startTime||'';assert(!startTime||/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime),'Horário inválido.');if(startTime){const [h,m]=startTime.split(':').map(Number);assert(h*60+m+minutes<=1440,'A sessão deve terminar no mesmo dia.');}
  const plan={...old,id:old?.id||freshId(data,'plan',idFactory),readingId:reading.id,bookId:book.id,editionId:reading.editionId,days,startDate:input.startDate,endDate,minutes,startTime,status:'active',pausedByReading:false,...(old?.status==='paused'?{resumedOn:today}:{}),exceptions:old?.exceptions||[],createdAt:old?.createdAt||now,updatedAt:now};
  if(old)data.plans[data.plans.indexOf(old)]=plan;else data.plans.push(plan);return plan;
 },options);
}
export function setReadingPlanStatus(state,id,status,options={}){
 const {today=libraryToday()}=options;assert(['active','paused','ended'].includes(status),'Estado de plano inválido.');return changeLibrary(state,data=>{const plan=data.plans.find(p=>String(p.id)===String(id));assert(plan,'Plano não encontrado.');assert(plan.status!=='ended','Um plano encerrado não é reativado. Crie outro plano.');const reading=needReading(data,plan.readingId);if(status==='active'){needBook(data,plan.bookId);assert(reading.status==='active','Retome o acompanhamento de leitura primeiro.');plan.resumedOn=today;}plan.status=status;plan.pausedByReading=false;if(status==='paused')plan.pausedOn=today;if(status==='ended')plan.endedOn=today;},options);
}
export function moveReadingOccurrence(state,planId,sourceDate,targetDate,options={}){
 const {today=libraryToday()}=options;return changeLibrary(state,data=>{const plan=data.plans.find(p=>String(p.id)===String(planId));assert(plan&&plan.status==='active','Plano indisponível.');assert(readingDate(sourceDate)&&(targetDate===null||readingDate(targetDate)&&targetDate>=today&&targetDate>=plan.startDate&&(!plan.endDate||targetDate<=plan.endDate)),'Escolha uma data válida, a partir de hoje e dentro do período do plano. Para cancelar, use Cancelar sessão.');assert(!data.sessions.some(s=>String(s.planId)===String(planId)&&s.planDate===sourceDate),'Esta sessão já possui registro. Corrija o registro realizado.');assert(scheduledReadingDates(plan,sourceDate,sourceDate).some(x=>x.sourceDate===sourceDate)||rows(plan.exceptions).some(x=>x.sourceDate===sourceDate),'Sessão não encontrada no plano.');
  if(targetDate)assert(!readingOccurrences({...state,libraryData:data},targetDate,targetDate).some(o=>String(o.planId)===String(planId)&&o.sourceDate!==sourceDate),'Já há uma sessão deste plano nessa data. Edite a existente.');
  plan.exceptions=rows(plan.exceptions).filter(x=>x.sourceDate!==sourceDate).concat({sourceDate,targetDate:targetDate||null});
 },options);
}
export function readingOccurrences(state,from,to){
 assert(readingDate(from)&&readingDate(to)&&to>=from&&to<=addReadingDays(from,31),'Consulte um período de até 32 dias.');const data=libraryData(state),result=new Map();
 for(const plan of data.plans){const book=data.books.find(b=>String(b.id)===String(plan.bookId)),reading=data.readings.find(r=>String(r.id)===String(plan.readingId));if(!book||!reading)continue;
  const actual=data.sessions.filter(s=>String(s.planId)===String(plan.id));
  const put=(sourceDate,date,session=null)=>{const key=String(plan.id)+':'+sourceDate;if(date<from||date>to)return;result.set(key,{key,planId:plan.id,sourceDate,date,bookId:book.id,readingId:reading.id,title:book.title,kind:reading.kind,startTime:plan.startTime||'',minutes:plan.minutes,actualMinutes:session?.minutes??null,status:session?.planStatus||'planned',sessionId:session?.id||null});};
  if(!book.archived)for(const occurrence of scheduledReadingDates(plan,from,to)){
   const session=actual.find(s=>s.planDate===occurrence.sourceDate);
   if(session){put(occurrence.sourceDate,session.date,session);continue;}
   if(plan.status!=='active'||reading.status!=='active'||plan.resumedOn&&occurrence.date<plan.resumedOn)continue;
   put(occurrence.sourceDate,occurrence.date);
  }
  for(const session of actual)if(session.planDate)put(session.planDate,session.date,session);
 }
 return [...result.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime)||a.title.localeCompare(b.title,'pt-BR'));
}
