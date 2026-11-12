// Confirmations, alerts and mission deletion change only their own layer.
// Full renders still own all data changes and all parent-dialog bindings.
export function installTransientDialogs(window,{document,getState,getUiState,getUser,getRevision=()=>0,render,daysOfWeek,hasRecurrence,createIcons=()=>{}}) {
 let revision=0,contentRevision=0,owner=null,source=null,rootSeen=null,openRevision=null;const origins=new Map();
 const body=()=>{const state=getState(),uiState=getUiState();let html='';const Recurrence={hasRecurrence};
            if (uiState.confirm.show) {
                html += `
                <div class="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-[999] backdrop-blur-sm font-mono">
                    <div id="confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="confirmation-title" class="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-sm w-full shadow-2xl modal-enter">
                        <h3 id="confirmation-title" class="text-lg font-bold text-white mb-2 flex items-center gap-2"><i data-lucide="help-circle" class="text-indigo-400"></i> Confirmação Tática</h3>
                        <p class="text-slate-300 text-sm mb-6 leading-relaxed whitespace-pre-line">${window.escapeHtml(uiState.confirm.message)}</p>
                        <div class="flex gap-3">
                            <button id="confirmation-cancel" type="button" onclick="window.handleConfirmResult(false)" class="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-lg text-sm font-bold transition-colors">Cancelar</button>
                            <button id="confirmation-accept" type="button" onclick="window.handleConfirmResult(true)" class="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-lg text-sm font-bold transition-colors">Confirmar</button>
                        </div>
                    </div>
                </div>`;
            }

            if (uiState.alert.show) {
                html += `
                <div class="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-[999] backdrop-blur-sm font-mono">
                    <div id="alert-dialog" role="dialog" aria-modal="true" aria-labelledby="alert-title" class="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-sm w-full shadow-2xl modal-enter">
                        <h3 id="alert-title" class="text-lg font-bold text-white mb-2 flex items-center gap-2"><i data-lucide="alert-circle" class="text-yellow-500"></i> Alerta</h3>
                        <p class="text-slate-300 text-sm mb-6 leading-relaxed whitespace-pre-line">${window.escapeHtml(uiState.alert.message)}</p>
                        <button id="alert-close" type="button" onclick="window.closeAlertModal()" class="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-lg text-sm font-bold transition-colors">OK</button>
                    </div>
                </div>`;
            }


            if (uiState.deleteTaskPrompt?.show) {
                const delTask = state.tasks.find(t => String(t.id) === String(uiState.deleteTaskPrompt.taskId));
                if (delTask) {
                    const dependents = [...new Map([...state.tasks, ...(state.planning?.history || []).flatMap(week => week.tasks || [])]
                        .filter(task => (task.dependsOnTaskIds || []).some(id => String(id) === String(delTask.id)))
                        .map(task => [String(task.id), task])).values()];
                    const recurring = Recurrence.hasRecurrence(delTask);
                    const repeatDay = daysOfWeek.find(day => day.id === delTask.day)?.label || delTask.day;
                    html += `
                    <div class="fixed inset-0 bg-black/80 flex items-center justify-center p-3 sm:p-4 z-[1000] backdrop-blur-sm font-sans">
                        <section id="delete-mission-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-mission-heading" aria-describedby="delete-mission-description" class="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl modal-enter">
                            <header class="border-b border-slate-800 px-5 py-4"><h3 id="delete-mission-heading" class="text-lg font-semibold text-slate-100">Excluir missão?</h3><p id="delete-mission-description" class="mt-2 text-sm text-slate-300">Seu Frenesi será preservado. Excluir não conta como conclusão e não gera recompensa.</p></header>
                            <div class="min-h-0 overflow-y-auto space-y-3 px-5 py-4">
                                <p class="break-words rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 text-sm font-medium text-slate-100">${window.escapeHtml(delTask.text)}</p>
                                ${delTask.completed ? '<p class="text-sm text-slate-400">As recompensas já registradas pela conclusão serão mantidas.</p>' : ''}
                                ${recurring ? `<p class="rounded-lg border border-amber-900/60 bg-amber-950/20 p-3 text-sm text-amber-200">Esta missão se repete. Excluir também retira ${window.escapeHtml(repeatDay)} das próximas repetições desta série. Os outros dias da repetição permanecem. Para encerrar a série, use Editar missão → Repetição.</p>` : ''}
                                ${dependents.length ? `<div class="rounded-lg border border-amber-900/60 bg-amber-950/20 p-3 text-sm text-amber-200"><p>${dependents.length === 1 ? 'Uma missão depende desta.' : `${dependents.length} missões dependem desta.`} A exclusão não remove essas dependências nem libera missões automaticamente. Revise os pré-requisitos depois.</p><ul class="mt-2 list-disc space-y-1 pl-5">${dependents.slice(0, 3).map(task => `<li>${window.escapeHtml(task.text)}</li>`).join('')}</ul></div>` : ''}
                                ${delTask.radarDemandId ? '<p class="text-sm text-slate-400">O status do RADAR e suas outras missões serão mantidos.</p>' : ''}
                            </div>
                            <footer class="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-800 px-5 py-3">
                                <button id="delete-mission-cancel" type="button" onclick="window.cancelDeleteTaskPrompt()" class="min-h-11 rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800">Manter missão</button>
                                <button id="delete-mission-confirm" type="button" onclick="window.confirmDeleteMainTask('excluida', event)" class="min-h-11 rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-600">Excluir missão</button>
                            </footer>
                        </section>
                    </div>`;
                }
            }

 return html;
 };
 window.renderTransientDialogs=()=>`<div id="transient-dialogs">${body()}</div>`;
 window.transientFullRevision=()=>revision;
 window.noteTransientFullRender=()=>{revision++;contentRevision=getRevision();origins.clear();owner=getUser();source=getState();rootSeen=document.getElementById('app');const ui=getUiState();if(!ui.confirm.show&&!ui.alert.show&&!ui.deleteTaskPrompt?.show)openRevision=null;};
 window.patchTransientDialogs=()=>{
  const root=document.getElementById('app'),host=root?.querySelector('#transient-dialogs');
  if(!host||!owner||owner!==getUser()||source!==getState()||contentRevision!==getRevision()||root!==rootSeen)return false;
  const markup=body(),active=Boolean(markup),wasActive=Boolean(host.querySelector('[role="dialog"]'));
  const ui=getUiState(),layers=[['confirmation-dialog',ui.confirm.show],['alert-dialog',ui.alert.show],['delete-mission-dialog',ui.deleteTaskPrompt?.show]],closed=[];
  for(const [id,shown] of layers){const previous=host.querySelector('#'+id);if(shown&&!previous){const activeElement=document.activeElement;origins.set(id,activeElement?.closest?.('details[data-mission-menu]')?.querySelector('summary')||activeElement);}else if(!shown&&previous)closed.push(id);}
  // A full render while covered deliberately skipped parent bindings. Rebuild
  // once when uncovering that parent, rather than attach duplicate listeners.
  if(!active&&wasActive&&openRevision!==revision)return false;
  if(active&&!wasActive)openRevision=revision;
  const pageKey=root.__viewPageKey||'main',snapshot=window.captureViewState?.(root,{pageKey});
  host.innerHTML=markup;createIcons({root:host});
  if(ui.deleteTaskPrompt?.show)window.bindFormDialog(root,{id:'delete-mission-dialog',initialFocus:'delete-mission-cancel',close:window.cancelDeleteTaskPrompt,blocked:ui.confirm.show||ui.alert.show});
  if(ui.confirm.show)window.bindFormDialog(root,{id:'confirmation-dialog',initialFocus:'confirmation-cancel',close:()=>window.handleConfirmResult(false),blocked:ui.alert.show});
  if(ui.alert.show)window.bindFormDialog(root,{id:'alert-dialog',initialFocus:'alert-close',close:window.closeAlertModal});
  window.finishViewUpdate?.(root,snapshot,{pageKey});
  for(const id of closed){const origin=origins.get(id);origins.delete(id);if(!host.querySelector('[role="dialog"]')&&origin?.isConnected&&root.contains(origin)&&origin.getClientRects().length&&(!root.querySelector('[role="dialog"]')||origin.closest?.('[role="dialog"]')))origin.focus({preventScroll:true});}
  if(!active)openRevision=null;return true;
 };
 window.refreshTransientDialogs=()=>{if(!window.patchTransientDialogs())render();};
}
