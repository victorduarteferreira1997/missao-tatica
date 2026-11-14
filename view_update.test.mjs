import test from 'node:test';
import assert from 'node:assert/strict';
import {createViewUpdater} from './ui/view_update.v2.js';

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

// A small DOM stand-in parses only the tags/attributes used by these fixtures.
// Production parsing is exercised separately in the browser.
function islandFixture(){
 const root=n(),icons=[],parsed=[];
 Node.prototype.contains=function(target){return this===target||this.children.some(child=>child.contains(target));};
 Node.prototype.querySelectorAll=function(selector){assert.equal(selector,'template[data-mt-island]');const result=[];const visit=node=>{for(const child of node.children){if(child.tagName==='TEMPLATE'&&child.hasAttribute('data-mt-island'))result.push(child);visit(child);}};visit(this);return result;};
 const parse=html=>{const content=n(),stack=[content];for(const token of html.matchAll(/<\/?([a-z][\w-]*)([^>]*)>/gi)){const [whole,tag,body]=token;if(whole.startsWith('</')){stack.pop();continue;}const attrs={};for(const attr of body.matchAll(/([\w:-]+)(?:="([^"]*)")?/g))attrs[attr[1]]=attr[2]||'';const el=new Node(tag,attrs);stack.at(-1).insertBefore(el,null);if(!['input','br'].includes(tag))stack.push(el);}return content;};
 const document={createElement(){const t={content:n()};Object.defineProperty(t,'innerHTML',{set(html){parsed.push(html);t.content=parse(html);}});return t;}};
 const mount=createViewUpdater(document);
 const chunk=(id,title=String(id),extra='')=>`<article data-daily-mission-row="${id}" title="${title}"><input id="draft-${id}" value="">${extra}</article>`;
 const find=(id,node=root)=>{if(node.getAttribute('data-daily-mission-row')===String(id))return node;for(const child of node.children){const found=find(id,child);if(found)return found;}return null;};
 function run(rows,{owner='a',completed=[],dialog=false,transform=html=>html}={}){
  mount.begin();const slots=rows.map(([id,html])=>mount.island(id,html)),done=completed.map(([id,html])=>mount.island(id,html));
  let html=`<div id="daily-mission-board"><div id="daily-pending-missions">${slots.join('')}</div>${done.length?`<details data-daily-completed=""><div data-view-part="completed-rows">${done.join('')}</div></details>`:''}</div>${dialog?'<div class="fixed"><section role="dialog" id="edit-task-dialog"></section></div>':''}`;
  return mount(root,transform(html),{ownerKey:owner,createIcons:({root})=>icons.push(root)});
 }
 return {root,icons,parsed,mount,chunk,find,run};
}
test('cartões iguais não são analisados novamente nem reinicializam ícones',()=>{
 const f=islandFixture(),rows=[['1',f.chunk(1)],['2',f.chunk(2)]];f.run(rows);const one=f.find(1),two=f.find(2);f.icons.length=0;f.parsed.length=0;const stats=f.run(rows);assert.equal(stats.islandsParsed,0);assert.equal(stats.islandsRetained,2);assert.equal(f.find(1),one);assert.equal(f.find(2),two);assert.equal(f.icons.length,0);assert.equal(f.parsed.length,1);assert.ok(!f.parsed[0].includes('data-daily-mission-row'));
});
test('editar uma missão analisa somente esse cartão e conserva o rascunho de outra',()=>{
 const f=islandFixture();f.run([['1',f.chunk(1)],['2',f.chunk(2)]]);const one=f.find(1),two=f.find(2),input=two.children[0];input.value='Rascunho ainda não salvo';f.icons.length=0;const stats=f.run([['1',f.chunk(1,'Editada')],['2',f.chunk(2)]]);assert.equal(stats.islandsParsed,1);assert.notEqual(f.find(1),one);assert.equal(f.find(2),two);assert.equal(f.find(2).children[0].value,'Rascunho ainda não salvo');assert.deepEqual(f.icons,[f.find(1)]);
});
test('excluir e reordenar missões não analisa os cartões restantes',()=>{
 const f=islandFixture();f.run([['1',f.chunk(1)],['2',f.chunk(2)],['3',f.chunk(3)]]);const one=f.find(1),two=f.find(2),three=f.find(3);const stats=f.run([['3',f.chunk(3)],['1',f.chunk(1)]]);assert.equal(stats.islandsParsed,0);assert.deepEqual(f.root.children[0].children[0].children,[three,one]);assert.equal(two.parentNode,null);
});
test('concluir e reabrir substitui o cartão que muda de seção, mantendo as outras missões',()=>{
 const f=islandFixture();f.run([['1',f.chunk(1)],['2',f.chunk(2)]]);const two=f.find(2),before=f.find(1);let stats=f.run([['2',f.chunk(2)]],{completed:[['1',f.chunk(1,'Concluída')]]});assert.equal(stats.islandsParsed,1);assert.notEqual(f.find(1),before);assert.equal(f.find(2),two);stats=f.run([['1',f.chunk(1)],['2',f.chunk(2)]]);assert.equal(stats.islandsParsed,1);assert.equal(f.find(2),two);assert.equal(f.root.children[0].children.length,1);
});
test('trocar conta e limpar a raiz impedem reutilizar os nós da sessão anterior',()=>{
 const f=islandFixture();f.run([['1',f.chunk(1)]]);const a=f.find(1);f.run([['1',f.chunk(1)]],{owner:'b'});assert.notEqual(f.find(1),a);const b=f.find(1);for(const child of [...f.root.children])child.remove();const stats=f.run([['1',f.chunk(1)]],{owner:'b'});assert.equal(stats.islandsParsed,1);assert.notEqual(f.find(1),b);
});
test('filtrar e voltar não conserva entradas retiradas do DOM como se ainda fossem visíveis',()=>{
 const f=islandFixture();f.run([['1',f.chunk(1)],['2',f.chunk(2)]]);const two=f.find(2);f.run([['1',f.chunk(1)]]);const stats=f.run([['1',f.chunk(1)],['2',f.chunk(2)]]);assert.equal(stats.islandsParsed,1);assert.notEqual(f.find(2),two);
});
test('IDs duplicados nunca compartilham a mesma instância de cartão',()=>{
 const f=islandFixture();f.run([['1',f.chunk(1)]]);const old=f.find(1),stats=f.run([['1',f.chunk(1)],['1',f.chunk(1)]]);const rows=f.root.children[0].children[0].children;assert.equal(rows.length,2);assert.notEqual(rows[0],rows[1]);assert.ok(!rows.includes(old));assert.equal(stats.islandsParsed,2);const next=f.run([['1',f.chunk(1)]]);assert.equal(next.islandsParsed,1);
});
test('placeholder repetido usa o caminho completo e preserva as duas ocorrências',()=>{
 const f=islandFixture();f.run([['1',f.chunk(1)]],{transform:html=>html.replace(/(<template[^>]+><\/template>)/,'$1$1')});const rows=f.root.children[0].children[0].children;assert.equal(rows.length,2);assert.ok(rows.every(row=>row.hasAttribute('data-daily-mission-row')));assert.equal(f.root.querySelectorAll('template[data-mt-island]').length,0);
});
test('fragmento com mais de uma raiz usa montagem completa sem ocultar conteúdo',()=>{
 const f=islandFixture();f.run([['multi',f.chunk(1)+f.chunk(2)]]);assert.ok(f.find(1));assert.ok(f.find(2));assert.equal(f.root.querySelectorAll('template[data-mt-island]').length,0);
});
test('diálogos continuam novos em cada render enquanto cartões permanecem estáveis',()=>{
 const f=islandFixture();f.run([['1',f.chunk(1)]],{dialog:true});const row=f.find(1),dialog=f.root.children[1];f.run([['1',f.chunk(1)]],{dialog:true});assert.equal(f.find(1),row);assert.notEqual(f.root.children[1],dialog);
});
test('fora do ciclo de montagem a interface devolve HTML comum, sem placeholders',()=>{
 const f=islandFixture(),raw=f.chunk(1);assert.equal(f.mount.island('1',raw),raw);f.run([['1',raw]]);assert.equal(f.mount.island('1',raw),raw);
});
