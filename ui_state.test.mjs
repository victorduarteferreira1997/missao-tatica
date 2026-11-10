import test from 'node:test';
import assert from 'node:assert/strict';
import {installFormDialogs} from './ui/form_dialogs.v2.js';

// Small DOM adapter exercises the renderer's actual capture/restore contract.
class Node {
 constructor(tag='div',attrs={},label=''){this.tag=tag;this.attrs=attrs;this.id=attrs.id||'';this.textContent=label;this.children=[];this.open=false;this.scrollTop=0;this.scrollLeft=0;this.disabled=false;this.visible=true;this.listeners={};}
 append(...nodes){for(const node of nodes){node.parentElement=this;node.doc=this.doc;this.children.push(node);}return this;}
 getAttribute(name){return this.attrs[name]??null;}
 hasAttribute(name){return Object.hasOwn(this.attrs,name);}
 matches(selector){return selector==='details'?this.tag==='details':selector==='[id]'?Boolean(this.id):selector==='[onclick]'?Boolean(this.attrs.onclick):selector==='[role="dialog"]'?this.attrs.role==='dialog':selector.startsWith('#')?this.id===selector.slice(1):false;}
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
