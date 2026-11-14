// Contrato v3: continuidade de foco, rolagem e formulários responsivos.
// Publicado com nome versionado para preservar prévias e permitir evolução incremental.
// O estado, os campos e a persistência continuam nos formulários do app.
export function installFormDialogs(target, document) {
    target.formDialogStyles = Object.freeze({
        field: 'w-full mt-1.5 min-h-11 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-base sm:text-sm text-slate-100 placeholder:text-slate-400 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400',
        fieldMinWidth: 'w-full mt-1.5 min-h-11 min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-base sm:text-sm text-slate-100 placeholder:text-slate-400 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400',
        label: 'block text-sm font-medium text-slate-300',
        summary: 'list-none flex min-h-11 cursor-pointer items-center justify-between gap-3 py-2 text-sm text-slate-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400',
        footer: 'shrink-0 border-t border-slate-700 bg-slate-900 px-5 py-3',
        compactFooter: 'flex shrink-0 justify-end gap-2 border-t border-slate-800 px-5 py-3'
    });

    target.renderFormDialog = function({ id, titleId, title, description, closeLabel, closeHandler, submitHandler, body, footer, layer = 'z-50', footerClass = target.formDialogStyles.footer }) {
        return `<div class="form-dialog-overlay fixed inset-0 ${layer} flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-sm font-sans">
            <div id="${target.escapeHtml(id)}" role="dialog" aria-modal="true" aria-labelledby="${target.escapeHtml(titleId)}" class="modal-enter flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
                <header class="flex shrink-0 items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
                    <div><h2 id="${target.escapeHtml(titleId)}" class="text-lg font-semibold text-slate-100">${target.escapeHtml(title)}</h2><p class="mt-1 text-sm text-slate-400">${target.escapeHtml(description)}</p></div>
                    <button type="button" onclick="window.${closeHandler}()" aria-label="${target.escapeHtml(closeLabel)}" class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white"><i data-lucide="x" class="h-5 w-5"></i></button>
                </header>
                <form novalidate onsubmit="event.preventDefault(); window.${submitHandler}()" class="flex min-h-0 flex-1 flex-col">
                    <div id="${target.escapeHtml(id)}-scroll" class="min-h-0 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">${body}</div>
                    <footer class="${footerClass}">${footer}</footer>
                </form>
            </div>
        </div>`;
    };

    // Preserve uncontrolled disclosures by identity, never by their list position.
    const detailToken = element => element.id ? ['id',element.id] : element.getAttribute('data-view-key') ? ['key',element.getAttribute('data-view-key')] : ['label',element.querySelector(':scope > summary')?.textContent.trim().replace(/\s+/g,' ') || ''];
    const viewScope = (element, pageKey) => {
        const dialog = element.closest('[role="dialog"]');
        return dialog ? ['dialog',dialog.id || dialog.getAttribute('aria-labelledby'),dialog.getAttribute('data-work-tab') || dialog.getAttribute('data-view-scope') || ''] : ['page',pageKey];
    };
    const detailKey = (element, pageKey) => {
        const parents=[];
        for(let parent=element.parentElement?.closest('details');parent;parent=parent.parentElement?.closest('details')) parents.unshift(detailToken(parent));
        return JSON.stringify([viewScope(element,pageKey),parents,detailToken(element)]);
    };
    const uniqueDetails = (root, pageKey) => {
        const entries=new Map();
        for(const element of root.querySelectorAll('details')) {
            // These sections already have explicit state and intentional reset handlers.
            if(element.hasAttribute('ontoggle')) continue;
            const key=detailKey(element,pageKey);
            entries.set(key,entries.has(key)?null:element);
        }
        return entries;
    };
    // Buttons without IDs still have a stable action. Never choose an ambiguous match.
    const focusToken = element => element?.id ? {id:element.id} : element?.getAttribute?.('onclick') ? {action:element.getAttribute('onclick')} : null;
    const findFocus = (root, token, pageKey) => {
        if (!token) return null;
        if (token.id) { const element=document.getElementById(token.id); return element && root.contains(element) ? element : null; }
        const matches=[...root.querySelectorAll('[onclick]')].filter(el=>el.getAttribute('onclick')===token.action && el.getClientRects().length && token.scope===JSON.stringify(viewScope(el,pageKey)));
        return matches.length===1 ? matches[0] : null;
    };
    // Sibling overlays are rendered in different regions. DOM order alone is
    // insufficient: compare their actual stacking layers, then use paint order.
    target.getTopFormDialog = root => {
        let top=null,topLayer=-Infinity;
        for(const dialog of root.querySelectorAll('[role="dialog"]')) {
            if(!dialog.getClientRects().length) continue;
            let layer=0;
            for(let node=dialog;node&&node!==root;node=node.parentElement) {
                const computed=target.getComputedStyle?.(node)?.zIndex;
                const tokens=[...(node.getAttribute('class') || '').matchAll(/(?:^|\s)z-(?:\[(\d+)\]|(\d+))(?=\s|$)/g)];
                const value=computed && computed!=='auto' ? Number(computed) : Number(tokens.at(-1)?.[1] || tokens.at(-1)?.[2] || 0);
                if(Number.isFinite(value))layer=Math.max(layer,value);
            }
            if(layer>=topLayer){top=dialog;topLayer=layer;}
        }
        return top;
    };
    const focusSaved = (root, saved, pageKey) => {
        const element=findFocus(root,saved,pageKey);
        if (!element || element.disabled || !element.getClientRects().length || saved.scope!==JSON.stringify(viewScope(element,pageKey))) return;
        // Do not return focus behind a dialog that is still open.
        const top=target.getTopFormDialog(root);
        if (top && !top.contains(element)) return;
        element.focus({preventScroll:true});
        if(saved.start!=null)try{element.setSelectionRange(saved.start,saved.end);}catch{}
    };
    const returnFocus=new Map();
    const dirtyForms=new Set();
    let overflowBeforeDialog=null;
    target.confirmFormClose = function(id,close) {
        if(!dirtyForms.has(id) || !target.showConfirmModal) return true;
        target.showConfirmModal('Descartar as alterações não salvas deste formulário?',()=>{dirtyForms.delete(id);close();});
        return false;
    };
    target.resetFormChanges = id => dirtyForms.delete(id);
    target.captureViewState = function(root,{pageKey='main'}={}) {
        const details=[...uniqueDetails(root,pageKey)].filter(([,element])=>element).map(([key,element])=>({key,open:element.open}));
        const scroll=[...root.querySelectorAll('[id]')].filter(element=>element.scrollTop || element.scrollLeft).map(element=>({id:element.id,scope:JSON.stringify(viewScope(element,pageKey)),top:element.scrollTop,left:element.scrollLeft}));
        const active=document.activeElement;
        const token=focusToken(active);
        const focus=token && root.contains(active) ? {...token,scope:JSON.stringify(viewScope(active,pageKey)),start:active.selectionStart,end:active.selectionEnd} : null;
        const viewport=document.scrollingElement;
        return {details,scroll,focus,pageKey,viewport:viewport?{top:viewport.scrollTop,left:viewport.scrollLeft}:null,dialogs:[...root.querySelectorAll('[role="dialog"]')].map(el=>el.id).filter(Boolean)};
    };
    target.restoreViewState = function(root,snapshot,{pageKey='main',blocked=false}={}) {
        if(!snapshot) return;
        const entries=uniqueDetails(root,pageKey);
        for(const saved of snapshot.details) {const element=entries.get(saved.key);if(element)element.open=saved.open;}
        for(const saved of snapshot.scroll) {const element=document.getElementById(saved.id);if(element && root.contains(element) && saved.scope===JSON.stringify(viewScope(element,pageKey))) {element.scrollTop=saved.top;element.scrollLeft=saved.left;}}
        if(!blocked && snapshot.focus) {
            focusSaved(root,snapshot.focus,pageKey);
        }
    };

    // Run after all form binders, so returning to a parent wins over initial focus.
    target.finishViewUpdate = function(root,snapshot,{pageKey='main'}={}) {
        const dialogs=[...root.querySelectorAll('[role="dialog"]')].filter(el=>el.id);
        const previous=new Set(snapshot?.dialogs||[]),current=new Set(dialogs.map(el=>el.id));
        for(const dialog of dialogs) {
            if(!previous.has(dialog.id)) returnFocus.set(dialog.id,snapshot?.focus);
            else if(dialog.style) dialog.style.animation='none';
        }
        const added=dialogs.some(el=>!previous.has(el.id));
        for(const id of previous) if(!current.has(id)) {
            if(!added) focusSaved(root,returnFocus.get(id),pageKey);
            returnFocus.delete(id);
            dirtyForms.delete(id);
        }
        if(!snapshot) {returnFocus.clear();dirtyForms.clear();}
        const style=document.documentElement?.style;
        if(style) {
            if(dialogs.length && overflowBeforeDialog===null) {overflowBeforeDialog=style.overflow;style.overflow='hidden';}
            else if(!dialogs.length && overflowBeforeDialog!==null) {style.overflow=overflowBeforeDialog;overflowBeforeDialog=null;}
        }
        if(snapshot?.pageKey===pageKey && snapshot.viewport && document.scrollingElement) {
            document.scrollingElement.scrollTop=snapshot.viewport.top;
            document.scrollingElement.scrollLeft=snapshot.viewport.left;
        }
    };

    target.bindFormDialog = function(root, { id, initialFocus, close, blocked = false, prepare, trackChanges = false }) {
        const dialog = root.querySelector(`#${id}`);
        if (!dialog || blocked) return;
        if (prepare) prepare();
        if(trackChanges || ['create-task-dialog','edit-task-dialog','operational-demand-dialog'].includes(id)) {
            dialog.addEventListener('input',()=>dirtyForms.add(id));
            dialog.addEventListener('change',()=>dirtyForms.add(id));
        }
        if (target.getTopFormDialog(root)===dialog && !dialog.contains(document.activeElement)) dialog.querySelector(`#${initialFocus}`)?.focus({ preventScroll: true });
        dialog.addEventListener('keydown', event => {
            if(target.getTopFormDialog(root)!==dialog) return;
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
            if (event.key !== 'Tab') return;
            const controls = [...dialog.querySelectorAll('button, input, select, textarea, summary, [tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        });
    };
}
