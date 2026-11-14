import test from 'node:test';
import assert from 'node:assert/strict';
import {installAuxiliaryDialogs} from './ui/auxiliary_dialogs.v1.js';
import {installFormDialogs} from './ui/form_dialogs.v3.js';

// Small DOM adapter exercises the renderer's actual capture/restore contract.
class Node {
 constructor(tag='div',attrs={},label=''){this.tag=tag;this.attrs=attrs;this.id=attrs.id||'';this.textContent=label;this.children=[];this.open=false;this.scrollTop=0;this.scrollLeft=0;this.disabled=false;this.visible=true;this.listeners={};}
 append(...nodes){for(const node of nodes){node.parentElement=this;node.doc=this.doc;this.children.push(node);}return this;}
 getAttribute(name){return this.attrs[name]??null;}
 hasAttribute(name){return Object.hasOwn(this.attrs,name);}
 matches(selector){if(selector==='input[name="profile-gender"]')return this.tag==='input'&&this.attrs.name==='profile-gender';if(selector==='button, input, select, textarea, summary, [tabindex="0"]')return ['button','input','select','textarea','summary'].includes(this.tag)||this.attrs.tabindex==='0';return selector==='details'?this.tag==='details':selector==='[id]'?Boolean(this.id):selector==='[onclick]'?Boolean(this.attrs.onclick):selector==='[role="dialog"]'?this.attrs.role==='dialog':selector.startsWith('#')?this.id===selector.slice(1):false;}
 closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)||null;}
 querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
 querySelector(selector){if(selector===':scope > summary')return this.children.find(child=>child.tag==='summary')||null;return this.querySelectorAll(selector)[0]||null;}
 contains(node){return this===node||this.children.some(child=>child.contains(node));}
 getClientRects(){return this.visible?[{}]:[];}
 focus(){this.doc.activeElement=this;}
 setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}
 addEventListener(name,fn){this.listeners[name]=fn;}
}
function dom(){const root=new Node(),doc={activeElement:null,getElementById:id=>root.querySelector('#'+id)};root.doc=doc;const w={};installFormDialogs(w,doc);return {root,doc,w};}
function detail(key,label,open=false){const node=new Node('details',key?{'data-view-key':key}:{},label);node.open=open;node.append(new Node('summary',{},label));return node;}
function dialog(root,id='study-module-dialog',tab='subjects'){const node=new Node('section',{id,role:'dialog','data-work-tab':tab});root.append(node);return node;}
function rebuilt(root){root.children=[];return dialog(root);}

test('nested management stays open through confirmation and deletion; other records retain their own expansion',()=>{
 const {root,w}=dom(),panel=dialog(root),manager=detail(null,'Gerenciar trilhas',true),archive=detail('archive','Trilhas arquivadas (3)',true);
 panel.append(manager);manager.append(archive);archive.append(detail('a','Detalhes',true),detail('b','Detalhes',false),detail('c','Detalhes',true));
 const snapshot=w.captureViewState(root);const next=rebuilt(root),nextManager=detail(null,'Gerenciar trilhas'),nextArchive=detail('archive','Trilhas arquivadas (2)');next.append(nextManager);nextManager.append(nextArchive);
 const b=detail('b','Detalhes'),c=detail('c','Detalhes');nextArchive.append(c,b);
 w.restoreViewState(root,snapshot,{blocked:true});assert.equal(nextManager.open,true);assert.equal(nextArchive.open,true);assert.equal(b.open,false);assert.equal(c.open,true);
 const again=w.captureViewState(root);const finalManager=detail(null,'Gerenciar trilhas'),finalArchive=detail('archive','Trilhas arquivadas (1)');rebuilt(root).append(finalManager);finalManager.append(finalArchive);w.restoreViewState(root,again);assert.equal(finalManager.open,true);assert.equal(finalArchive.open,true);
});
test('tabs and modules do not inherit unrelated disclosure state; deliberate form resets remain closed',()=>{
 const {root,w}=dom();const panel=dialog(root);panel.append(detail(null,'Histórico',true));const controlled=detail(null,'Novo registro',true);controlled.attrs.ontoggle='setSection';panel.append(controlled);const snapshot=w.captureViewState(root);
 const changed=rebuilt(root);changed.attrs['data-work-tab']='planning';const history=detail(null,'Histórico');changed.append(history);w.restoreViewState(root,snapshot);assert.equal(history.open,false);
 const original=rebuilt(root),form=detail(null,'Novo registro');form.attrs.ontoggle='setSection';original.append(form);w.restoreViewState(root,snapshot);assert.equal(form.open,false);
});
test('scroll and caret survive a redraw, and confirmation blocks background focus',()=>{
 const {root,w,doc}=dom(),panel=dialog(root),body=new Node('div',{id:'study-modal-scroll'}),field=new Node('input',{id:'study-track-name'});panel.append(body);body.append(field);body.scrollTop=320;field.selectionStart=2;field.selectionEnd=4;field.focus();const snapshot=w.captureViewState(root);
 const next=rebuilt(root),nextBody=new Node('div',{id:'study-modal-scroll'}),nextField=new Node('input',{id:'study-track-name'});next.append(nextBody);nextBody.append(nextField);doc.activeElement=null;
 w.restoreViewState(root,snapshot,{blocked:true});assert.equal(nextBody.scrollTop,320);assert.equal(doc.activeElement,null);
 w.restoreViewState(root,snapshot);assert.equal(doc.activeElement,nextField);assert.equal(nextField.selectionStart,2);assert.equal(nextField.selectionEnd,4);
 nextField.disabled=true;doc.activeElement=null;w.restoreViewState(root,snapshot);assert.equal(doc.activeElement,null);
});
test('ambiguous anonymous rows never transfer expansion to the next item',()=>{
 const {root,w}=dom(),panel=dialog(root);panel.append(detail(null,'Gerenciar',true),detail(null,'Gerenciar',false));const snapshot=w.captureViewState(root);const survivor=detail(null,'Gerenciar');rebuilt(root).append(survivor);w.restoreViewState(root,snapshot);assert.equal(survivor.open,false);
});
test('Escape cancels only the active confirmation and stops propagation to its parent',()=>{
 const {root,w}=dom(),parent=dialog(root),child=new Node('section',{id:'confirmation-dialog',role:'dialog'}),button=new Node('button',{id:'confirmation-cancel'});root.append(child);child.append(button);let parentClosed=0,cancelled=0;
 w.bindFormDialog(root,{id:parent.id,initialFocus:'missing',close:()=>parentClosed++,blocked:true});w.bindFormDialog(root,{id:child.id,initialFocus:button.id,close:()=>cancelled++});
 let stopped=false;child.listeners.keydown({key:'Escape',preventDefault(){},stopPropagation(){stopped=true;}});assert.equal(cancelled,1);assert.equal(parentClosed,0);assert.equal(stopped,true);
});

test('changing the main day or view does not reuse expansion from the previous page',()=>{
 const {root,w}=dom();root.append(detail(null,'Histórico',true));const snapshot=w.captureViewState(root,{pageKey:'day:monday'});
 root.children=[];const next=detail(null,'Histórico');root.append(next);w.restoreViewState(root,snapshot,{pageKey:'week:monday'});assert.equal(next.open,false);
 w.restoreViewState(root,snapshot,{pageKey:'day:tuesday'});assert.equal(next.open,false);
 w.restoreViewState(root,snapshot,{pageKey:'day:monday'});assert.equal(next.open,true);
});


test('fechar formulário devolve foco ao botão de origem e preserva a rolagem da página',()=>{
 const {root,w,doc}=dom();doc.scrollingElement={scrollTop:480,scrollLeft:0};doc.documentElement={style:{overflow:'auto'}};
 const opener=new Node('button',{id:'new-mission'});root.append(opener);opener.focus();const before=w.captureViewState(root,{pageKey:'day:week1'});
 const panel=dialog(root,'create-task-dialog'),field=new Node('input',{id:'title'});panel.append(field);field.focus();w.finishViewUpdate(root,before,{pageKey:'day:week1'});assert.equal(doc.documentElement.style.overflow,'hidden');
 const opened=w.captureViewState(root,{pageKey:'day:week1'});root.children=[opener];doc.activeElement=null;doc.scrollingElement.scrollTop=0;w.finishViewUpdate(root,opened,{pageKey:'day:week1'});
 assert.equal(doc.activeElement,opener);assert.equal(doc.scrollingElement.scrollTop,480);assert.equal(doc.documentElement.style.overflow,'auto');
});
test('uma semana diferente não recebe a posição de rolagem da anterior',()=>{
 const {root,w,doc}=dom();doc.scrollingElement={scrollTop:600,scrollLeft:0};const snapshot=w.captureViewState(root,{pageKey:'day:week1:monday'});doc.scrollingElement.scrollTop=30;w.finishViewUpdate(root,snapshot,{pageKey:'day:week2:monday'});assert.equal(doc.scrollingElement.scrollTop,30);
});
test('cancelar descarte mantém edição; confirmar permite fechar sem loop',()=>{
 const {root,w}=dom(),panel=dialog(root,'create-task-dialog');let discard,closed=0;
 w.showConfirmModal=(message,callback)=>{assert.match(message,/não salvas/);discard=callback;};
 w.bindFormDialog(root,{id:panel.id,initialFocus:'missing',close:()=>{}});panel.listeners.input();
 assert.equal(w.confirmFormClose(panel.id,()=>closed++),false);assert.equal(closed,0);
 assert.equal(w.confirmFormClose(panel.id,()=>closed++),false);discard();assert.equal(closed,1);assert.equal(w.confirmFormClose(panel.id,()=>closed++),true);
});
test('botão sem ID recupera foco pelo comando sem escolher controles ambíguos',()=>{
 const {root,w,doc}=dom();const button=new Node('button',{onclick:'window.setTab("monday")'});root.append(button);button.focus();const snapshot=w.captureViewState(root);
 root.children=[];const next=new Node('button',{onclick:'window.setTab("monday")'});root.append(next);doc.activeElement=null;w.restoreViewState(root,snapshot);assert.equal(doc.activeElement,next);
 root.append(new Node('button',{onclick:'window.setTab("monday")'}));doc.activeElement=null;w.restoreViewState(root,snapshot);assert.equal(doc.activeElement,null);
});


test('a camada visual prevalece sobre a ordem do HTML; somente a janela da frente recebe Escape e Tab',()=>{
 const {root,w,doc}=dom();const categories=dialog(root,'categories'),mission=dialog(root,'mission');categories.attrs.class='z-[70]';mission.attrs.class='z-50';
 const first=new Node('input',{id:'category-name'}),last=new Node('button',{id:'category-close'}),title=new Node('input',{id:'mission-title'});categories.append(first,last);mission.append(title);
 let catClosed=0,missionClosed=0;w.bindFormDialog(root,{id:mission.id,initialFocus:title.id,close:()=>missionClosed++});assert.equal(doc.activeElement,null);
 w.bindFormDialog(root,{id:categories.id,initialFocus:first.id,close:()=>catClosed++});assert.equal(doc.activeElement,first);
 const key=value=>({key:value,preventDefault(){},stopPropagation(){}});mission.listeners.keydown(key('Escape'));assert.equal(missionClosed,0);
 last.focus();categories.listeners.keydown(key('Tab'));assert.equal(doc.activeElement,first);
 first.focus();categories.listeners.keydown({...key('Tab'),shiftKey:true});assert.equal(doc.activeElement,last);
 categories.listeners.keydown(key('Escape'));assert.equal(catClosed,1);assert.equal(missionClosed,0);
});
test('restaurar posição não devolve foco para trás de uma janela filha; camadas ocultas são ignoradas',()=>{
 const {root,w,doc}=dom(),parent=dialog(root,'mission'),field=new Node('input',{id:'title'});parent.attrs.class='z-50';parent.append(field);field.focus();const snapshot=w.captureViewState(root);
 const child=dialog(root,'subtasks');child.attrs.class='z-[95]';doc.activeElement=null;w.restoreViewState(root,snapshot);assert.equal(doc.activeElement,null);
 child.visible=false;w.restoreViewState(root,snapshot);assert.equal(doc.activeElement,field);
});
test('camada de confirmação e alerta permanece à frente de exclusão e respeita o z-index do contêiner',()=>{
 const {root,w}=dom(),host=new Node('div');root.append(host);const confirmation=dialog(host,'confirmation'),alert=dialog(host,'alert');confirmation.attrs.class='z-[1100]';alert.attrs.class='z-[1200]';
 const overlay=new Node('div',{class:'z-[1000]'});root.append(overlay);dialog(overlay,'delete');assert.equal(w.getTopFormDialog(root),alert);
 alert.visible=false;assert.equal(w.getTopFormDialog(root),confirmation);
});
function auxiliary(){
 const f=dom();let owner='a',state={userProfile:{configured:false}},ui={showProfileModal:true,showCategoryModal:true,confirm:{},alert:{}};let previews=0;
 f.w.updateProfilePreview=()=>previews++;
 installAuxiliaryDialogs(f.w,{document:f.doc,getState:()=>state,getUiState:()=>ui,getUser:()=>owner});
 const make=()=>{f.root.children=[];const profile=dialog(f.root,'profile-dialog'),name=new Node('input',{id:'profile-display-name'}),theme=new Node('select',{id:'profile-campaign-theme'});name.value='';theme.value='default';profile.append(name,theme);
 const radios=['feminino','masculino','neutro'].map(value=>{const node=new Node('input',{name:'profile-gender'});node.value=value;node.checked=false;profile.append(node);return node;});
 const categories=dialog(f.root,'task-categories-dialog'),fields={};for(const id of ['name','icon','color']){const node=new Node('input',{id:'task-category-'+id});node.value='default';categories.append(node);fields[id]=node;}
 return {profile,name,theme,radios,categories,fields};};
 return {...f,make,get state(){return state;},get ui(){return ui;},switchOwner(){owner='b';},replaceState(){state={userProfile:{configured:false}};},get previews(){return previews;}};
}
test('perfil e categoria conservam campos, rádio e seleção durante reconstrução sem salvar dados',()=>{
 const f=auxiliary(),old=f.make();f.w.bindAuxiliaryDialogs(f.root);old.name.value='Nome revisado';old.theme.value='tema';old.radios[0].checked=true;old.fields.name.value='Família';old.fields.icon.value='heart';old.fields.color.value='green';
 const before=JSON.stringify(f.state),snapshot=f.w.captureAuxiliaryDialogs(f.root),next=f.make();f.w.restoreAuxiliaryDialogs(f.root,snapshot);
 assert.equal(next.name.value,'Nome revisado');assert.equal(next.theme.value,'tema');assert.equal(next.radios[0].checked,true);assert.equal(next.radios[1].checked,false);assert.equal(next.fields.name.value,'Família');assert.equal(next.fields.icon.value,'heart');assert.equal(next.fields.color.value,'green');assert.equal(f.previews,1);assert.equal(JSON.stringify(f.state),before);
});
test('rascunho de outra conta ou objeto de estado não é capturado nem restaurado',()=>{
 for(const change of ['switchOwner','replaceState']){const f=auxiliary(),old=f.make();f.w.bindAuxiliaryDialogs(f.root);old.name.value='Privado';const snapshot=f.w.captureAuxiliaryDialogs(f.root);f[change]();assert.equal(f.w.captureAuxiliaryDialogs(f.root).snapshots.length,0);const next=f.make();f.w.restoreAuxiliaryDialogs(f.root,snapshot);assert.equal(next.name.value,'');}
});
test('fechar formulário descarta sua captura e perfil configurado não recebe campos do primeiro acesso',()=>{
 const f=auxiliary(),old=f.make();f.w.bindAuxiliaryDialogs(f.root);old.name.value='Rascunho';f.ui.showCategoryModal=false;f.ui.showProfileModal=false;f.state.userProfile.configured=true;
 const snapshot=f.w.captureAuxiliaryDialogs(f.root);assert.equal(snapshot.snapshots.length,0);const next=f.make();f.ui.showProfileModal=true;f.w.restoreAuxiliaryDialogs(f.root,snapshot);assert.equal(next.name.value,'');
});
test('redesenho sem montagem vinculada nunca recupera valores do DOM de um contexto anterior',()=>{
 const f=auxiliary(),old=f.make();old.name.value='Antigo';assert.equal(f.w.captureAuxiliaryDialogs(f.root).snapshots.length,0);
});
test('campos auxiliares pedem descarte somente quando modificados e bloqueiam foco durante confirmação',()=>{
 const f=auxiliary(),fields=f.make();f.ui.alert.show=true;f.w.bindAuxiliaryDialogs(f.root);assert.equal(fields.profile.listeners.input,undefined);assert.equal(f.doc.activeElement,null);
 f.ui.alert.show=false;f.w.bindAuxiliaryDialogs(f.root);fields.profile.listeners.input();let discard,closed=0;f.w.showConfirmModal=(message,callback)=>{discard=callback;};assert.equal(f.w.confirmFormClose('profile-dialog',()=>closed++),false);discard();assert.equal(closed,1);assert.equal(f.w.confirmFormClose('profile-dialog',()=>closed++),true);
});


test('retorno ao botão certo distingue ações iguais na página e no formulário',()=>{
 const {root,w,doc}=dom(),pageButton=new Node('button',{onclick:'window.toggleCategoryModal()'});root.append(pageButton);const parent=dialog(root,'create-task-dialog'),opener=new Node('button',{onclick:'window.toggleCategoryModal()'});parent.append(opener);opener.focus();const snapshot=w.captureViewState(root);doc.activeElement=null;w.restoreViewState(root,snapshot);assert.equal(doc.activeElement,opener);
});
