import test from 'node:test';
import assert from 'node:assert/strict';
import {createViewUpdater} from './ui/view_update.v1.js';

class Node {
 constructor(tag='div',attrs={},children=[]) {this.nodeType=1;this.tagName=tag.toUpperCase();this.attrs={...attrs};this.childNodes=[];for(const child of children)this.insertBefore(child,null);}
 get children(){return this.childNodes;}
 get id(){return this.attrs.id||'';}
 get firstChild(){return this.childNodes[0]||null;}
 get nextSibling(){const list=this.parentNode?.childNodes||[];return list[list.indexOf(this)+1]||null;}
 get attributes(){return Object.entries(this.attrs).map(([name,value])=>({name,value}));}
 get outerHTML(){return JSON.stringify([this.tagName,this.attrs,this.children.map(n=>n.outerHTML)]);}
 hasAttribute(k){return Object.hasOwn(this.attrs,k);}
 getAttribute(k){return this.attrs[k]??null;}
 setAttribute(k,v){this.attrs[k]=v;}
 removeAttribute(k){delete this.attrs[k];}
 matches(s){return s.startsWith('.')?(this.attrs.class||'').split(' ').includes(s.slice(1)):s.startsWith('#')?this.id===s.slice(1):s==='[data-view-part]'&&this.hasAttribute('data-view-part');}
 insertBefore(n,cursor){n.remove();const at=cursor?this.childNodes.indexOf(cursor):this.childNodes.length;assert.ok(at>=0);this.childNodes.splice(at,0,n);n.parentNode=this;}
 remove(){if(this.parentNode){const list=this.parentNode.childNodes;list.splice(list.indexOf(this),1);this.parentNode=null;}}
 clone(){return new Node(this.tagName,this.attrs,this.children.map(n=>n.clone()));}
}
const n=(attrs={},children=[])=>new Node('div',attrs,children),header=()=>n({class:'app-header'}),row=(id,title=id)=>n({'data-daily-mission-row':id,title}),board=rows=>n({id:'daily-mission-board'},[n({id:'daily-pending-missions'},rows)]);
function fixture(){const pages=new Map(),root=n(),icons=[];const document={createElement:()=>{const t={content:n()};Object.defineProperty(t,'innerHTML',{set(value){t.content=pages.get(value).clone();}});return t;}};const mount=createViewUpdater(document);return {root,icons,run(nodes,ownerKey='a'){const html=String(pages.size);pages.set(html,n({},nodes));return mount(root,html,{ownerKey,createIcons:({root})=>icons.push(root)});}};}
test('modal abre e fecha mantendo navegação e cartão com os mesmos nós',()=>{
 const f=fixture();f.run([header(),board([row('1')])]);const [h,b]=f.root.children,mission=b.children[0].children[0];f.icons.length=0;
 const modal=n({class:'fixed'},[n({role:'dialog'})]);f.run([modal,header(),board([row('1')])]);assert.equal(f.root.children[1],h);assert.equal(f.root.children[2],b);assert.equal(b.children[0].children[0],mission);assert.equal(f.icons.length,1);
 f.run([header(),board([row('1')])]);assert.equal(f.root.children[0],h);assert.equal(f.root.children[1],b);
});
test('editar um cartão substitui só ele e inicializa ícones só no ramo novo',()=>{
 const f=fixture();f.run([header(),board([row('1'),row('2')])]);const b=f.root.children[1],list=b.children[0],[one,two]=list.children;f.icons.length=0;
 f.run([header(),board([row('1','Editada'),row('2')])]);assert.equal(f.root.children[1],b);assert.equal(b.children[0],list);assert.notEqual(list.children[0],one);assert.equal(list.children[1],two);assert.deepEqual(f.icons,[list.children[0]]);
});
test('excluir e reordenar usa identidade da missão, nunca posição da lista',()=>{
 const f=fixture();f.run([board([row('1'),row('2'),row('3')])]);const b=f.root.children[0],list=b.children[0],[one,two,three]=list.children;
 f.run([board([row('3'),row('1')])]);assert.deepEqual(list.children,[three,one]);assert.equal(two.parentNode,null);
});
test('mudança de conta descarta todos os nós da conta anterior mesmo com mesmo ID',()=>{
 const f=fixture();f.run([header(),board([row('1')])]);const old=[...f.root.children];f.run([header(),board([row('1')])],'b');assert.ok(f.root.children.every(el=>!old.includes(el)));
});
test('diálogos sempre recebem nós novos, evitando acumular listeners dos binders legados',()=>{
 const f=fixture(),dialog=()=>n({class:'fixed'},[n({role:'dialog',id:'edit-task-dialog'})]);f.run([dialog(),header()]);const old=f.root.children[0];f.run([dialog(),header()]);assert.notEqual(f.root.children[0],old);
});
test('chaves duplicadas não reutilizam o cartão incorreto',()=>{
 const f=fixture();f.run([board([row('1'),row('1')])]);const list=f.root.children[0].children[0],old=[...list.children];f.run([board([row('1')])]);assert.ok(!old.includes(list.children[0]));
});
test('alterações visuais externas não invalidam a assinatura da origem renderizada',()=>{
 const f=fixture();f.run([header()]);const h=f.root.children[0];h.setAttribute('data-icon-ready','true');f.run([header()]);assert.equal(f.root.children[0],h);
});
test('cabeçalho diário e rodapé possuem identidades separadas',()=>{
 const f=fixture(),parts=()=>[n({'data-view-part':'day-heading'}),n({'data-view-part':'app-footer'})];f.run(parts());const old=[...f.root.children];f.run(parts());assert.deepEqual(f.root.children,old);
});
