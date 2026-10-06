// Contrato v1: estrutura e teclado das janelas de formulário.
// Publicado com nome versionado para preservar prévias e permitir evolução incremental.
// O estado, os campos e a persistência continuam nos formulários do app.
export function installFormDialogs(target, document) {
    target.formDialogStyles = Object.freeze({
        field: 'w-full mt-1.5 min-h-11 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400',
        fieldMinWidth: 'w-full mt-1.5 min-h-11 min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400',
        label: 'block text-sm font-medium text-slate-300',
        summary: 'list-none flex min-h-11 cursor-pointer items-center justify-between gap-3 py-2 text-sm text-slate-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400',
        footer: 'shrink-0 border-t border-slate-700 bg-slate-900 px-5 py-3',
        compactFooter: 'flex shrink-0 justify-end gap-2 border-t border-slate-800 px-5 py-3'
    });

    target.renderFormDialog = function({ id, titleId, title, description, closeLabel, closeHandler, submitHandler, body, footer, layer = 'z-50', footerClass = target.formDialogStyles.footer }) {
        return `<div class="fixed inset-0 ${layer} flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-sm font-sans">
            <div id="${target.escapeHtml(id)}" role="dialog" aria-modal="true" aria-labelledby="${target.escapeHtml(titleId)}" class="modal-enter flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
                <header class="flex shrink-0 items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
                    <div><h2 id="${target.escapeHtml(titleId)}" class="text-lg font-semibold text-slate-100">${target.escapeHtml(title)}</h2><p class="mt-1 text-sm text-slate-400">${target.escapeHtml(description)}</p></div>
                    <button type="button" onclick="target.${closeHandler}()" aria-label="${target.escapeHtml(closeLabel)}" class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"><i data-lucide="x" class="h-5 w-5"></i></button>
                </header>
                <form novalidate onsubmit="event.preventDefault(); target.${submitHandler}()" class="flex min-h-0 flex-1 flex-col">
                    <div class="min-h-0 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">${body}</div>
                    <footer class="${footerClass}">${footer}</footer>
                </form>
            </div>
        </div>`;
    };

    target.bindFormDialog = function(root, { id, initialFocus, close, blocked = false, prepare }) {
        const dialog = root.querySelector(`#${id}`);
        if (!dialog || blocked) return;
        if (prepare) prepare();
        if (!dialog.contains(document.activeElement)) dialog.querySelector(`#${initialFocus}`)?.focus({ preventScroll: true });
        dialog.addEventListener('keydown', event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
            if (event.key !== 'Tab') return;
            const controls = [...dialog.querySelectorAll('button, input, select, textarea, summary, [tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        });
    };
}
