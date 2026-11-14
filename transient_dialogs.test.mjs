import test from 'node:test';
import assert from 'node:assert/strict';
import {installTransientDialogs} from './ui/transient_dialogs.v2.js';
function fixture(){let user={uid:'a'},state={tasks:[]},ui={confirm:{show:false},alert:{show:false}},full=0,icons=0,finishes=0,contentRevision=0;const bindings=[];const host={innerHTML:'',querySelector:s=>s.startsWith('#')?host.innerHTML.includes('id="'+s.slice(1)+'"')?{}:null:host.innerHTML.includes('role="dialog"')?{}:null},root={__viewPageKey:'test',querySelector:s=>s==='#transient-dialogs'?host:null},document={getElementById:id=>id==='app'?root:null};const w={escapeHtml:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),captureViewState:()=>({focus:{id:'original'},dialogs:[]}),finishViewUpdate:()=>finishes++,bindFormDialog:(_,binding)=>bindings.push(binding),cancelDeleteTaskPrompt(){},handleConfirmResult(){},closeAlertModal(){}};const render=()=>{full++;host.innerHTML=w.renderTransientDialogs().replace('<div id="transient-dialogs">','').replace(/<\/div>$/,'');w.noteTransientFullRender();};installTransientDialogs(w,{document,getState:()=>state,getUiState:()=>ui,getUser:()=>user,getRevision:()=>contentRevision,render,daysOfWeek:[{id:'monday',label:'Segunda'}],hasRecurrence:t=>Boolean(t.isRecurring),createIcons:()=>icons++});render();return {w,host,root,document,bindings,get ui(){return ui;},get state(){return state;},get full(){return full;},get finishes(){return finishes;},get icons(){return icons;},markMutation(){contentRevision++;},render,switchAccount(){user={uid:'b'};state={tasks:[]};ui={confirm:{},alert:{}};}};}
test('abrir e cancelar confirmação atualiza só a camada, sem reconstruir painel ou dados',()=>{
 const f=fixture(),before=JSON.stringify(f.state);f.ui.confirm={show:true,message:'Confirmar <teste>'};f.w.refreshTransientDialogs();assert.equal(f.full,1);assert.match(f.host.innerHTML,/&lt;teste>/);assert.equal(f.bindings.at(-1).id,'confirmation-dialog');f.ui.confirm.show=false;f.w.refreshTransientDialogs();assert.equal(f.host.innerHTML,'');assert.equal(f.full,1);assert.equal(f.finishes,2);assert.equal(JSON.stringify(f.state),before);
});
test('alerta sobre confirmação bloqueia foco da confirmação e preserva a camada ao fechar',()=>{
 const f=fixture();f.ui.confirm={show:true,message:'A'};f.w.refreshTransientDialogs();f.ui.alert={show:true,message:'<erro>'};f.w.refreshTransientDialogs();assert.equal(f.bindings.at(-2).blocked,true);assert.equal(f.bindings.at(-1).id,'alert-dialog');assert.match(f.host.innerHTML,/&lt;erro>/);f.ui.alert.show=false;f.w.refreshTransientDialogs();assert.match(f.host.innerHTML,/confirmation-dialog/);assert.ok(!f.host.innerHTML.includes('id="alert-dialog"'));assert.equal(f.full,1);
});
test('se ocorreu redesenho completo enquanto a janela cobria um formulário, fechar reconstrói os bindings uma vez',()=>{
 const f=fixture();f.ui.confirm={show:true,message:'A'};f.w.refreshTransientDialogs();f.render();f.ui.confirm.show=false;f.w.refreshTransientDialogs();assert.equal(f.full,3);assert.equal(f.host.innerHTML,'');
});
test('camada de outra conta nunca é atualizada usando os nós da sessão anterior',()=>{
 const f=fixture();f.switchAccount();f.ui.alert={show:true,message:'Nova conta'};assert.equal(f.w.patchTransientDialogs(),false);f.w.refreshTransientDialogs();assert.equal(f.full,2);assert.match(f.host.innerHTML,/Nova conta/);
});
test('excluir missão mostra recorrência, dependências e RADAR sem alterar os registros',()=>{
 const f=fixture();f.state.tasks=[{id:1,text:'<Missão>',day:'monday',isRecurring:true,completed:true,radarDemandId:'radar'},{id:2,text:'Próxima',dependsOnTaskIds:[1]}];f.ui.deleteTaskPrompt={show:true,taskId:1};const before=JSON.stringify(f.state);f.w.refreshTransientDialogs();assert.match(f.host.innerHTML,/&lt;Missão>/);assert.match(f.host.innerHTML,/Uma missão depende/);assert.match(f.host.innerHTML,/Segunda/);assert.match(f.host.innerHTML,/O status do RADAR/);assert.match(f.host.innerHTML,/recompensas já registradas/);assert.equal(f.bindings.at(-1).initialFocus,'delete-mission-cancel');assert.equal(JSON.stringify(f.state),before);assert.equal(f.full,1);
});
test('perda do contêiner usa o render completo em vez de deixar a aplicação sem confirmação',()=>{
 const f=fixture();f.root.querySelector=()=>null;f.ui.confirm={show:true,message:'Fallback'};f.w.refreshTransientDialogs();assert.equal(f.full,2);assert.match(f.host.innerHTML,/Fallback/);
});

test('cancelar exclusão devolve foco ao menu visível da missão, mesmo quando o botão de excluir foi escondido',()=>{
 const f=fixture();let focused=0;const summary={isConnected:true,getClientRects:()=>[{}],focus:options=>{assert.equal(options.preventScroll,true);focused++;}};f.root.contains=()=>true;f.document.activeElement={closest:()=>({querySelector:()=>summary})};f.state.tasks=[{id:1,text:'Teste'}];f.ui.deleteTaskPrompt={show:true,taskId:1};f.w.refreshTransientDialogs();f.document.activeElement=null;f.ui.deleteTaskPrompt.show=false;f.w.refreshTransientDialogs();assert.equal(focused,1);assert.equal(f.full,1);
});

test('fechar alerta devolve foco ao botão do formulário, inclusive sem ID ou onclick',()=>{
 const f=fixture();let focused=0;const button={isConnected:true,getClientRects:()=>[{}],focus:()=>focused++,closest:s=>s.includes('data-mission-menu')?null:{}};f.root.contains=()=>true;f.document.activeElement=button;f.ui.alert={show:true,message:'Preencha o campo'};f.w.refreshTransientDialogs();f.ui.alert.show=false;f.w.refreshTransientDialogs();assert.equal(focused,1);assert.equal(f.full,1);
});

test('salvamento que mudou dados desde o último render impede reutilizar painel antigo',()=>{
 const f=fixture();f.markMutation();f.ui.alert={show:true,message:'Falha local'};assert.equal(f.w.patchTransientDialogs(),false);f.w.refreshTransientDialogs();assert.equal(f.full,2);assert.match(f.host.innerHTML,/Falha local/);
});
