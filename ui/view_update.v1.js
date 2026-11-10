// Incremental mounting of opt-in display regions. Dialogs still receive fresh
// nodes because their existing binders attach listeners on every render.
export function createViewUpdater(document) {
    const sources = new WeakMap();
    const owners = new WeakMap();
    const topRegions = ['.app-header','#daily-overview','.main-view-nav','#planning-day-tabs','.category-toolbar','#daily-mission-board','[data-view-part]'];
    const key = (node, top) => {
        if (node.nodeType !== 1) return null;
        if (top) { const region=topRegions.find(selector=>node.matches(selector)); return region==='[data-view-part]' ? 'part:'+node.getAttribute('data-view-part') : region || null; }
        if (node.hasAttribute('data-daily-mission-row')) return 'mission:' + node.getAttribute('data-daily-mission-row');
        if (node.hasAttribute('data-daily-completed')) return 'completed';
        return node.id || node.getAttribute('data-view-part') || null;
    };
    const container = node => node.nodeType === 1 && (['daily-mission-board','daily-pending-missions'].includes(node.id) || node.hasAttribute('data-daily-completed') || node.getAttribute('data-view-part') === 'completed-rows');
    const remember = node => {
        if (node.nodeType !== 1) return;
        sources.set(node,node.outerHTML);
        if (container(node)) for (const child of node.children) remember(child);
    };
    const unique = (nodes, top) => {
        const map = new Map();
        for (const node of nodes) { const id=key(node,top); if(id) map.set(id,map.has(id)?null:node); }
        return map;
    };
    const attributes = (old, next) => {
        for (const attr of [...old.attributes]) if(!next.hasAttribute(attr.name)) old.removeAttribute(attr.name);
        for (const attr of next.attributes) if(old.getAttribute(attr.name)!==attr.value) old.setAttribute(attr.name,attr.value);
    };
    return function update(root,html,{ownerKey='',createIcons=()=>{}}={}) {
        // The test harness and older embedded hosts can retain the established path.
        if (!document.createElement) { root.innerHTML=html;createIcons({root});return {retained:0,inserted:1}; }
        const template=document.createElement('template');
        if (!template.content) {root.innerHTML=html;createIcons({root});return {retained:0,inserted:1};}
        template.innerHTML=html;
        const stats={retained:0,inserted:0};
        const fresh=[];
        const sameOwner=owners.get(root)===ownerKey;
        const reconcile = (parent,nextParent,top=false) => {
            const oldNodes=[...parent.childNodes], nextNodes=[...nextParent.childNodes];
            const oldMap=unique(oldNodes,top),nextMap=unique(nextNodes,top);
            const wanted=nextNodes.map(next=>{
                const id=key(next,top),old=sameOwner && id && nextMap.get(id)===next ? oldMap.get(id) : null;
                const source=next.nodeType===1?next.outerHTML:null;
                if(old && old.tagName===next.tagName && sources.get(old)===source) {stats.retained++;return old;}
                if(old && old.tagName===next.tagName && container(old) && container(next)) {
                    attributes(old,next);reconcile(old,next);sources.set(old,source);return old;
                }
                remember(next);if(next.nodeType===1)fresh.push(next);stats.inserted++;return next;
            });
            const keep=new Set(wanted);
            for(const node of oldNodes) if(!keep.has(node)) node.remove();
            let cursor=parent.firstChild;
            for(const node of wanted) {
                if(node===cursor) cursor=cursor.nextSibling;
                else parent.insertBefore(node,cursor);
            }
        };
        reconcile(root,template.content,true);
        owners.set(root,ownerKey);
        for(const node of fresh) createIcons({root:node});
        return stats;
    };
}
