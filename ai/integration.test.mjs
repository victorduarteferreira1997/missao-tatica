import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';
import {buildContext,validateContext,validateProposal,validateWeek,AI_OWNER_UID} from './contract.v1.js';
import {createActionServer} from './server/server.mjs';
import {createFirestoreStore} from './server/firestore.mjs';
import {createAiBrowserStore} from './firestore_rest.v1.js';
import {installAiInbox} from '../ui/ai_inbox.v1.js';
const now = Date.parse('2026-10-07T00:00:00Z');
const state = () => ({tasks:[{id:123,text:'Revisar relatório',day:'tuesday',time:'30 min',startTime:'09:00',endTime:'09:30',completed:false,subtasks:[{text:'PRIVATE_SUBTASK'}],notes:'PRIVATE_NOTES',xp:900},
    {id:456,text:'PRIVATE_UNSELECTED',day:'wednesday',time:'60 min'}],financeData:{secret:'PRIVATE_FINANCE'},healthData:{secret:'PRIVATE_HEALTH'},coins:500,ownerUid:'PRIVATE_OWNER'});
const context = () => buildContext(state(),['123'],{weekStart:'2026-10-05',revision:'revision-1',now});
const proposal = () => ({idempotencyKey:'request-001',weekStart:'2026-10-05',contextRevision:'revision-1',title:'Preparar report',day:'wednesday',durationMinutes:30,startTime:'10:00',endTime:'10:30',subtasks:['Revisar evidências','Enviar']});
const hash = p => createHash('sha256').update(p.idempotencyKey).digest('hex');
test('publicação projeta somente missões escolhidas e não altera o estado',() => {
    const s=state(),before=JSON.stringify(s),c=buildContext(s,['123'],{weekStart:'2026-10-05',revision:'r1',now});
    assert.equal(JSON.stringify(s),before);assert.equal(c.missions.length,1);assert.equal(c.partial,true);
    assert.doesNotMatch(JSON.stringify(c),/PRIVATE_|"xp"|"coins"|"ownerUid"|123/);
    assert.equal(buildContext(s,[],{weekStart:'2026-10-05',revision:'r2',now}).missions.length,0);
    assert.throws(()=>buildContext(s,['missing'],{weekStart:'2026-10-05',revision:'r3',now}));
    s.tasks.push(
        {id:'agenda',text:'Compromisso externo',day:'tuesday',time:'30 min',googleCalendarSource:'primary',googleCalendarWeekStart:'2026-10-05'},
        {id:'other-week',text:'Outra semana',day:'tuesday',time:'30 min',googleCalendarWeekStart:'2026-10-12'}
    );
    assert.throws(()=>buildContext(s,['agenda'],{weekStart:'2026-10-05',revision:'r4',now}));
    assert.throws(()=>buildContext(s,['other-week'],{weekStart:'2026-10-05',revision:'r5',now}));
});
test('contrato rejeita estado completo, campos arbitrários, semanas/datas/horários inválidos e expiração',() => {
    for(const w of ['2026-02-30','2026-10-06','../state/main','2026-10-05/extra'])assert.throws(()=>validateWeek(w));
    assert.equal(validateWeek('2026-10-05'),'2026-10-05');
    assert.throws(()=>validateContext({...context(),financeData:{}},now));
    assert.throws(()=>validateContext(context(),now+24*60*60*1000));
    assert.throws(()=>validateContext({...context(),publishedAt:new Date(now+3600000).toISOString()},now));
    for(const extra of [{xp:1000},{ownerUid:'other'},{database:'(default)'},{path:'users/other/state/main'},{priority:'essencial'}])assert.throws(()=>validateProposal({...proposal(),...extra}));
    for(const fields of [{durationMinutes:0},{durationMinutes:'30'},{startTime:'25:00'},{startTime:'',endTime:'10:30'},{endTime:'09:00'},{subtasks:Array(13).fill('a')},{title:'x'.repeat(201)},{day:'next_week'}])assert.throws(()=>validateProposal({...proposal(),...fields}));
});
function memoryStore() {
    const map=new Map(),calls=[];let c=context();
    return {map,calls,setContext:value=>c=value,
        context:async w=>{calls.push(['context',w]);return c;},
        proposal:async id=>{calls.push(['proposal',id]);return map.get(id)||null;},
        createProposal:async(id,p)=>{calls.push(['create',id]);if(map.has(id))return false;map.set(id,{payload:p,status:'pending'});return true;}};
}
async function api(t,store=memoryStore(),options={}) {
    const secret='test-only-'.padEnd(40,'x'),server=createActionServer({secret,store,now:()=>now,...options});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
    const url='http://127.0.0.1:'+server.address().port;
    return {store,call:(path,method='GET',body,auth=true,headers={})=>fetch(url+path,{method,headers:{...(auth?{Authorization:'Bearer '+secret}:{}),'Content-Type':'application/json',...headers},...(body!==undefined?{body:typeof body==='string'?body:JSON.stringify(body)}:{})})};
}
test('API exige Bearer antes de qualquer acesso e não aceita paths, outros usuários ou parâmetros extras',async t=>{
    const a=await api(t);
    assert.equal((await a.call('/v1/week?weekStart=2026-10-05','GET',undefined,false)).status,401);assert.equal(a.store.calls.length,0);
    assert.equal((await a.call('/v1/week?weekStart=2026-10-05&owner=other')).status,422);
    assert.equal((await a.call('/v1/week?weekStart=2026-10-05&weekStart=2026-10-12')).status,422);
    assert.equal((await a.call('/users/other/state/main')).status,404);
    assert.equal((await a.call('/v1/proposals?database=default','POST',proposal())).status,404);
    const r=await a.call('/v1/week?weekStart=2026-10-05');assert.equal(r.status,200);assert.deepEqual(await r.json(),context());
});
test('API recusa contexto ausente, expirado ou contaminado e propostas baseadas em outra revisão',async t=>{
    const a=await api(t);a.store.setContext(null);assert.equal((await a.call('/v1/week?weekStart=2026-10-05')).status,404);
    assert.equal((await a.call('/v1/proposals','POST',proposal())).status,409);
    a.store.setContext({...context(),revision:'new'});assert.equal((await a.call('/v1/proposals','POST',proposal())).status,409);
    a.store.setContext({...context(),expiresAt:new Date(now).toISOString()});assert.equal((await a.call('/v1/proposals','POST',proposal())).status,422);
    a.store.setContext({...context(),secret:'DO_NOT_LEAK'});const r=await a.call('/v1/week?weekStart=2026-10-05');assert.equal(r.status,422);assert.doesNotMatch(await r.text(),/DO_NOT_LEAK/);assert.equal(a.store.map.size,0);
});
test('propostas só criam inbox: repetição preserva ID, conflito não sobrescreve e concorrência cria uma vez',async t=>{
    const a=await api(t),p=proposal();
    const results=await Promise.all([a.call('/v1/proposals','POST',p),a.call('/v1/proposals','POST',p)]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,201]);assert.equal(a.store.map.size,1);
    const expected=hash(p);for(const r of results)assert.equal((await r.json()).proposalId,expected);
    assert.equal((await a.call('/v1/proposals','POST',{...p,title:'Different'})).status,409);
    a.store.map.get(expected).status='accepted';a.store.setContext(null);
    assert.equal((await (await a.call('/v1/proposals','POST',p)).json()).status,'accepted');
    assert.ok(a.store.calls.every(([op,id])=>op==='context'?id==='2026-10-05':/^[a-f0-9]{64}$/.test(id)));
});
test('API limita tamanho, tipo JSON, requisições e não expõe falhas internas',async t=>{
    const a=await api(t);
    assert.equal((await a.call('/v1/proposals','POST','not-json')).status,422);
    assert.equal((await a.call('/v1/proposals','POST',proposal(),true,{'Content-Type':'text/plain'})).status,415);
    assert.equal((await a.call('/v1/proposals','POST',JSON.stringify({title:'x'.repeat(13000)}))).status,413);
    const b=await api(t,memoryStore(),{requestsPerMinute:1});await b.call('/v1/week?weekStart=2026-10-05');assert.equal((await b.call('/v1/week?weekStart=2026-10-05')).status,429);
    const c=await api(t,{context:async()=>{throw new Error('SECRET_DETAIL');}});const r=await c.call('/v1/week?weekStart=2026-10-05');assert.equal(r.status,503);assert.doesNotMatch(await r.text(),/SECRET_DETAIL/);
});
test('adaptador do serviço usa identidade de execução e apenas GET e createDocument no banco isolado',async()=>{
    for(const config of [{database:'(default)'},{database:'another'},{project:'other'},{owner:'other'}])assert.throws(()=>createFirestoreStore(config));
    const calls=[];const fetchImpl=async(url,options)=>{
        calls.push([url,options]);if(url.startsWith('http://metadata.'))return {ok:true,json:async()=>({access_token:'workload-token',expires_in:3600})};
        if(options.method==='GET')return {ok:false,status:404};return {ok:true,status:200,json:async()=>({name:'created'})};
    };
    const s=createFirestoreStore({fetchImpl,now:()=>now});await s.context('2026-10-05');await s.proposal(hash(proposal()));await s.createProposal(hash(proposal()),proposal(),new Date(now).toISOString());
    assert.equal(calls.length,4);assert.equal(calls[0][1].headers['Metadata-Flavor'],'Google');
    for(const [url,o]of calls.slice(1)){assert.match(url,/databases\/missao-tatica-ai\/documents\/users\//);assert.doesNotMatch(url,/\(default\)|state\/main/);assert.equal(o.headers.Authorization,'Bearer workload-token');assert.ok(['GET','POST'].includes(o.method));}
    assert.match(calls[3][0],/\/inbox\?documentId=[a-f0-9]{64}$/);
    await assert.rejects(()=>s.proposal('../state/main'));
});
test('navegador usa Firebase ID + App Check, não contém segredo da Action e exige proprietário',async()=>{
    const user={uid:AI_OWNER_UID,getIdToken:async()=>'firebase-token'},calls=[];
    const s=createAiBrowserStore({getUser:()=>user,getAppCheckToken:async()=>'appcheck-token',fetchImpl:async(url,o)=>{calls.push([url,o]);return {ok:true,json:async()=>url.endsWith(':runQuery')?[]:{}};}});
    // Use current timestamps: browser store deliberately checks expiration at request time.
    const c=buildContext(state(),['123'],{weekStart:'2026-10-05',revision:'current',now:Date.now()});
    await s.publish(c);await s.pending();await s.review(hash(proposal()),'accepted');await s.revoke('2026-10-05');
    for(const [url,o]of calls){assert.match(url,/databases\/missao-tatica-ai/);assert.doesNotMatch(url,/state\/main|\(default\)/);assert.equal(o.headers.Authorization,'Bearer firebase-token');assert.equal(o.headers['X-Firebase-AppCheck'],'appcheck-token');}
    assert.deepEqual(JSON.parse(calls[0][1].body).fields,{payload:{stringValue:JSON.stringify(c)}});
    assert.match(calls[2][0],/currentDocument.exists=true/);
    const bad=createAiBrowserStore({getUser:()=>({uid:'other'}),getAppCheckToken:async()=>'',fetchImpl:()=>{throw Error('must not fetch');}});await assert.rejects(()=>bad.pending());
});
function ui({enabled=true}={}) {
    const s=state(),events=[],fields={};let user={uid:AI_OWNER_UID},week='2026-10-05',items=[{id:hash(proposal()),status:'pending',proposal:proposal()}],failReview=false;
    const window={escapeHtml:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),showAlertModal:m=>events.push(['alert',m]),bindFormDialog(){},__aiOpenCreate:f=>events.push(['form',f]),__aiCloseCreate:()=>events.push(['close'])};
    const store={pending:async()=>items,publish:async c=>events.push(['publish',c]),revoke:async()=>{},review:async(id,status)=>{if(failReview)throw Error('offline');events.push(['review',id,status]);}};
    installAiInbox(window,{document:{getElementById:id=>fields[id]},config:{enabled},getState:()=>s,getUser:()=>user,getWeek:()=>week,store,render(){},now:()=>now,newRevision:()=> 'revision-preview'});
    return {window,s,events,fields,setUser:u=>user=u,setWeek:w=>week=w,setItems:v=>items=v,setFailReview:v=>failReview=v};
}
test('UI desligada não consulta nuvem; publicação requer prévia explícita e seleção começa vazia',async()=>{
    const off=ui({enabled:false});await off.window.openAiInbox();assert.equal(off.window.renderAiInboxButton(),'');assert.equal(off.window.renderAiInbox(),'');assert.equal(off.events.length,0);
    const b=ui();await b.window.openAiInbox();assert.doesNotMatch(b.window.renderAiInbox(),/type="checkbox"[^>]*\schecked(?:\s|>)/);
    await b.window.publishAiContext();assert.equal(b.events.length,0);
    b.window.selectAiMission(0,true);b.window.previewAiContext();assert.equal(b.events.length,0);await b.window.publishAiContext();
    assert.equal(b.events[0][0],'publish');assert.equal(b.events[0][1].missions.length,1);assert.doesNotMatch(JSON.stringify(b.events[0]),/PRIVATE_/);
});
test('integração validada está ativa no oficial e a prévia continua isolada',async()=>{
    const [official,previewConfig,loader]=await Promise.all([
        readFile(new URL('./config.v1.js',import.meta.url),'utf8'),
        readFile(new URL('./config.preview.js',import.meta.url),'utf8'),
        readFile(new URL('../preview_ai.html',import.meta.url),'utf8')
    ]);
    assert.match(official,/enabled:\s*true/);
    assert.match(previewConfig,/enabled:\s*true/);
    assert.match(loader,/config\.v1\.js/);
    assert.match(loader,/config\.preview\.js/);
    assert.match(loader,/PRÉVIA PRIVADA/);
    assert.match(loader,/replace\(\/<body\(\[\^>\]\*\)>\//);
});
test('UI da IA omite agenda externa e vínculos de outra semana',async()=>{
    const b=ui();
    b.s.tasks.push(
        {id:'agenda',text:'Título externo privado',day:'monday',time:'30 min',googleCalendarSource:'primary',googleCalendarWeekStart:'2026-10-05'},
        {id:'other-week',text:'Título de outra semana',day:'monday',time:'30 min',googleCalendarWeekStart:'2026-10-12'}
    );
    await b.window.openAiInbox();
    const html=b.window.renderAiInbox();
    assert.doesNotMatch(html,/Título externo privado|Título de outra semana/);
    assert.match(html,/Revisar relatório/);
});
test('revisar só preenche formulário; cancelar não cria/revisa, semana errada e proposta retirada são bloqueadas',async()=>{
    const b=ui(),before=JSON.stringify(b.s);await b.window.openAiInbox();await b.window.reviewAiProposal(0);
    assert.equal(JSON.stringify(b.s),before);assert.deepEqual(b.events.map(e=>e[0]),['form']);assert.equal(b.events[0][1]['ct-subtasks'],'Revisar evidências\nEnviar');
    b.window.clearAiDraft();assert.deepEqual(b.window.aiDraftMetadata(),{});await b.window.aiDraftAfterSave();assert.equal(b.events.length,1);
    await b.window.openAiInbox();b.setWeek('2026-10-12');await b.window.reviewAiProposal(0);assert.equal(b.events.length,1);
    b.setWeek('2026-10-05');b.setItems([]);await b.window.reviewAiProposal(0);assert.equal(b.events.length,1);
});
test('revisão evita duplicação local, bloqueia recorrência e semana/sessão alteradas, preserva ID se inbox falhar',async()=>{
    const b=ui();await b.window.openAiInbox();await b.window.reviewAiProposal(0);const id=b.window.aiDraftMetadata().aiProposalId;
    b.fields['ct-repeat-monday']={checked:true};assert.equal(b.window.aiDraftBeforeSave(),false);b.fields['ct-repeat-monday'].checked=false;
    b.setWeek('2026-10-12');assert.equal(b.window.aiDraftBeforeSave(),false);b.setWeek('2026-10-05');assert.equal(b.window.aiDraftBeforeSave(),true);
    b.s.tasks.push({id:789,aiProposalId:id});b.setFailReview(true);await b.window.aiDraftAfterSave();await b.window.openAiInbox();await b.window.reviewAiProposal(0);
    assert.equal(b.events.filter(e=>e[0]==='form').length,1);assert.equal(b.s.tasks.length,3);
    b.setUser(null);b.window.resetAiInbox();assert.equal(b.window.renderAiInbox(),'');assert.deepEqual(b.window.aiDraftMetadata(),{});
});
test('resposta tardia de outra sessão é descartada e HTML da IA é escapado',async()=>{
    const b=ui();b.setItems([{id:hash(proposal()),proposal:{...proposal(),title:'<img src=x onerror=evil()>',subtasks:['<script>evil()</script>']}}]);await b.window.openAiInbox();
    const html=b.window.renderAiInbox();assert.doesNotMatch(html,/<img|<script>/);assert.match(html,/&lt;img/);
    let resolve;const events=[],window={escapeHtml:String,showAlertModal(){},bindFormDialog(){}};
    installAiInbox(window,{document:{},config:{enabled:true},getState:state,getUser:()=>({uid:AI_OWNER_UID}),getWeek:()=> '2026-10-05',store:{pending:()=>new Promise(r=>resolve=r)},render:()=>events.push('render')});
    const opening=window.openAiInbox();window.resetAiInbox();resolve([{id:hash(proposal()),proposal:proposal()}]);await opening;assert.equal(window.renderAiInbox(),'');assert.equal(events.length,2);
});
test('o formulário existente calcula a missão e só após salvar marca a proposta, sem alterar XP/finanças',async()=>{
    const app=await readFile(new URL('../app.html',import.meta.url),'utf8');
    const start=app.indexOf('window.saveNewTask = function()'),end=app.indexOf('window.setCategoryFilter',start);
    const b=ui();await b.window.openAiInbox();await b.window.reviewAiProposal(0);
    const input={'ct-text':{value:'Título revisado'},'ct-nature':{value:'normal'},'ct-priority':{value:'media'},'ct-complexity':{value:'2'},'ct-time':{value:'30'},'ct-impact-type':{value:'drain'},'ct-subtasks':{value:'Passo revisado'},'ct-category':{value:'work'},'ct-day':{value:'wednesday'}};
    const uiState={},existing=JSON.stringify(b.s.financeData);b.s.xp=200;b.s.energy=80;
    Object.assign(b.window,{calculateTaskCost:()=>({xp:82,hp:6}),getTaskCategories:()=>[{id:'work'}],readCalendarTimeFields:()=>({startTime:'10:00',endTime:'10:30'}),getNextTaskOrder:()=>0,cloneSubtasksForNewTask:a=>structuredClone(a),showToast(){},saveState:()=>b.events.push(['save',structuredClone(b.s)])});
    runInNewContext(app.slice(start,end),{window:b.window,document:{getElementById:id=>input[id]},state:b.s,uiState,calendarSync:{},daysOfWeek:[{id:'monday'},{id:'wednesday'}],Date,Math});
    b.window.saveNewTask();await new Promise(r=>setImmediate(r));
    const created=b.s.tasks.at(-1);assert.equal(created.text,'Título revisado');assert.equal(created.xp,82);assert.equal(created.energyCost,6);assert.equal(created.aiProposalId,hash(proposal()));assert.equal(created.completed,false);
    assert.equal(b.s.xp,200);assert.equal(b.s.energy,80);assert.equal(JSON.stringify(b.s.financeData),existing);
    assert.deepEqual(b.events.filter(e=>['save','review'].includes(e[0])).map(e=>e[0]),['save','review']);
});
test('schema da Action exige confirmação e não aceita campos que controlem o estado principal',async()=>{
    const spec=JSON.parse(await readFile(new URL('./openapi.json',import.meta.url),'utf8'));
    assert.equal(spec.paths['/v1/proposals'].post['x-openai-isConsequential'],true);
    const schema=spec.paths['/v1/proposals'].post.requestBody.content['application/json'].schema;
    assert.equal(schema.additionalProperties,false);assert.deepEqual(Object.keys(schema.properties),Object.keys(proposal()));
    assert.equal(spec.paths['/v1/week'].get.operationId,'getSharedWeek');
});
