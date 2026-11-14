// Reconcile opt-in regions. Mission islands keep their source strings separately,
// so unchanged cards never enter an intermediate HTML tree or reinitialize icons.
// Dialogs are not islands: existing binders still receive fresh dialog nodes.
export function createViewUpdater(document) {
 const sources=new WeakMap(),owners=new WeakMap(),islandCaches=new WeakMap();
 const topRegions=['.app-header','#daily-overview','.main-view-nav','#planning-day-tabs','.category-toolbar','#daily-mission-board','[data-view-part]'];
 let collecting=false,sequence=0,pending=[];
 const key=(node,top)=>{
  if(node.nodeType!==1)return null;
  if(top){const region=topRegions.find(selector=>node.matches(selector));return region==='[data-view-part]'?'part:'+node.getAttribute('data-view-part'):region||null;}
  if(node.hasAttribute('data-daily-mission-row'))return 'mission:'+node.getAttribute('data-daily-mission-row');
  if(node.hasAttribute('data-daily-completed'))return 'completed';
  return node.id||node.getAttribute('data-view-part')||null;
 };
 const container=node=>node.nodeType===1&&(['daily-mission-board','daily-pending-missions'].includes(node.id)||node.hasAttribute('data-daily-completed')||node.getAttribute('data-view-part')==='completed-rows');
 const unique=(nodes,top)=>{const map=new Map();for(const node of nodes){const id=key(node,top);if(id)map.set(id,map.has(id)?null:node);}return map;};
 const attributes=(old,next)=>{for(const attr of [...old.attributes])if(!next.hasAttribute(attr.name))old.removeAttribute(attr.name);for(const attr of next.attributes)if(old.getAttribute(attr.name)!==attr.value)old.setAttribute(attr.name,attr.value);};
 function update(root,html,{ownerKey='',createIcons=()=>{}}={}) {
  const requested=pending;pending=[];collecting=false;
  const expand=()=>{let result=html;for(const entry of requested)result=result.replaceAll(entry.marker,entry.html);return result;};
  const stats={retained:0,inserted:0,islandsRetained:0,islandsParsed:0};
  if(!document.createElement){root.innerHTML=expand();createIcons({root});return {...stats,inserted:1};}
  const template=document.createElement('template');
  if(!template.content){root.innerHTML=expand();createIcons({root});return {...stats,inserted:1};}
  const sameOwner=owners.get(root)===ownerKey,previous=sameOwner?islandCaches.get(root):null;
  const counts=new Map();for(const entry of requested)counts.set(entry.key,(counts.get(entry.key)||0)+1);
  const resolved=new Map(),nextCache=new Map();let valid=true;
  for(const entry of requested){
   const old=counts.get(entry.key)===1?previous?.get(entry.key):null;
   if(old&&old.html===entry.html&&root.contains(old.node))resolved.set(entry.token,{...entry,node:old.node,reused:true});
   else{
    const part=document.createElement('template');part.innerHTML=entry.html;stats.islandsParsed++;
    // A mission card is one element with optional surrounding whitespace. Future
    // multi-root markup takes the established full-tree path rather than vanish.
    const elements=part.content.children;
    if(elements?.length!==1||[...part.content.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())){valid=false;break;}
    resolved.set(entry.token,{...entry,node:elements[0],reused:false});
   }
  }
  template.innerHTML=valid?html:expand();
  if(valid&&requested.length){
   if(!template.content.querySelectorAll)valid=false;
   else{const occurrences=new Map();for(const node of template.content.querySelectorAll('template[data-mt-island]')){const token=node.getAttribute('data-mt-island');occurrences.set(token,(occurrences.get(token)||0)+1);}for(const [token,count] of occurrences)if(resolved.has(token)&&count!==1)valid=false;}
   if(!valid)template.innerHTML=expand();
  }
  if(!valid)resolved.clear();
  const fresh=[];
  const remember=node=>{if(node.nodeType!==1)return;sources.set(node,node.outerHTML);if(container(node))for(const child of node.children)remember(child);};
  const island=node=>node.nodeType===1&&node.tagName==='TEMPLATE'?resolved.get(node.getAttribute('data-mt-island')):null;
  const take=entry=>{
   if(counts.get(entry.key)===1)nextCache.set(entry.key,{html:entry.html,node:entry.node});
   if(entry.reused){stats.retained++;stats.islandsRetained++;}
   else{remember(entry.node);fresh.push(entry.node);stats.inserted++;}
   return entry.node;
  };
  const hydrate=node=>{
   // Fresh containers (initial load, empty -> populated, structural changes)
   // also need their slots resolved. No cached node is moved before validation.
   for(const child of [...(node.childNodes||[])]){const entry=island(child);if(entry){node.insertBefore(take(entry),child);child.remove();}else hydrate(child);}
  };
  const reconcile=(parent,nextParent,top=false)=>{
   const oldNodes=[...parent.childNodes],nextNodes=[...nextParent.childNodes],oldMap=unique(oldNodes,top),nextMap=unique(nextNodes,top);
   const wanted=nextNodes.map(next=>{
    const entry=island(next);if(entry)return take(entry);
    const id=key(next,top),old=sameOwner&&id&&nextMap.get(id)===next?oldMap.get(id):null,source=next.nodeType===1?next.outerHTML:null;
    if(old&&old.tagName===next.tagName&&sources.get(old)===source){stats.retained++;return old;}
    if(old&&old.tagName===next.tagName&&container(old)&&container(next)){attributes(old,next);reconcile(old,next);sources.set(old,source);return old;}
    hydrate(next);remember(next);if(next.nodeType===1)fresh.push(next);stats.inserted++;return next;
   });
   const keep=new Set(wanted);for(const node of oldNodes)if(!keep.has(node))node.remove();
   let cursor=parent.firstChild;for(const node of wanted){if(node===cursor)cursor=cursor.nextSibling;else parent.insertBefore(node,cursor);}
  };
  reconcile(root,template.content,true);owners.set(root,ownerKey);islandCaches.set(root,nextCache);
  // Hydrated new cards are already covered by their fresh parent. Retained cards
  // contain initialized SVGs; avoid scanning/reinitializing them individually.
  const freshSet=new Set(fresh);
  for(const node of fresh){let ancestor=node.parentNode,covered=false;while(ancestor&&ancestor!==root){if(freshSet.has(ancestor)){covered=true;break;}ancestor=ancestor.parentNode;}if(!covered)createIcons({root:node});}
  return stats;
 }
 update.begin=()=>{sequence++;pending=[];collecting=Boolean(document.createElement);};
 update.island=(id,html)=>{
  if(!collecting)return html;
  const token=sequence+'-'+pending.length,marker=`<template data-mt-island="${token}"></template>`;
  pending.push({key:String(id),html,token,marker});return marker;
 };
 return update;
}
