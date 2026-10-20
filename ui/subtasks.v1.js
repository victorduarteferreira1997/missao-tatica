const copy=value=>JSON.parse(JSON.stringify(value));
export function moveSubtask(rows,from,to){if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=rows.length||to>=rows.length)return false;const [item]=rows.splice(from,1);rows.splice(to,0,item);return true;}
export function installSubtasks(window,{document,getState,getUiState,render,save}){
 const e=v=>window.escapeHtml(String(v??'')),arg=v=>e(JSON.stringify(String(v))),button='min-h-11 min-w-11 rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400';
 let nextId=Date.now()*1000;
 const make=text=>({id:++nextId,text,completed:false,createdAt:new Date().toISOString()});
 const active=()=>{const d=getUiState().subtaskEditor;return d&&d.state===getState()?d:null;};
 window.openSubtaskEditor=taskId=>{
  const creating=taskId==null,task=creating?null:getState().tasks.find(t=>String(t.id)===String(taskId));if(!creating&&!task)return;
  const ui=getUiState(),text=document.getElementById('ct-subtasks')?.value||'',lines=text.split('\n').map(s=>s.trim()).filter(Boolean);
  const fromCreate=ui.createTaskSubtasks&&ui.createTaskSubtasks.map(s=>s.text).join('\n')===lines.join('\n')?ui.createTaskSubtasks:lines.map(make);
  const rows=copy(creating?fromCreate:(task.subtasks||[])).map(row=>typeof row==='string'?make(row):row.id==null?{...row,id:++nextId}:row);
  ui.subtaskEditor={state:getState(),taskId:task?.id??null,creating,original:JSON.stringify(task?.subtasks||[]),rows,dragIndex:null};render();
 };
 window.closeSubtaskEditor=()=>{getUiState().subtaskEditor=null;render();};
 window.editSubtaskDraft=(index,value)=>{const d=active();if(d?.rows[index])d.rows[index].text=value;};
 window.toggleSubtaskDraft=index=>{const d=active();if(!d?.rows[index])return;d.rows[index].completed=!d.rows[index].completed;render();};
 window.insertSubtaskDraft=index=>{const d=active();if(!d)return;d.rows.splice(Math.max(0,Math.min(d.rows.length,Number(index)||0)),0,make(''));render();document.getElementById('subtask-draft-'+index)?.focus({preventScroll:true});};
 window.removeSubtaskDraft=index=>{const d=active();if(d?.rows[index]){d.rows.splice(index,1);render();}};
 window.moveSubtaskDraft=(index,direction)=>{const d=active();if(!d||!moveSubtask(d.rows,index,index+direction))return;render();document.getElementById('subtask-draft-'+(index+direction))?.focus({preventScroll:true});};
 window.dragSubtaskDraft=(index,event)=>{const d=active();if(!d)return;d.dragIndex=index;event.dataTransfer?.setData('text/plain',String(index));if(event.dataTransfer)event.dataTransfer.effectAllowed='move';};
 window.dropSubtaskDraft=(index,event)=>{event.preventDefault();event.stopPropagation();const d=active();if(!d||!Number.isInteger(d.dragIndex))return;const from=d.dragIndex;d.dragIndex=null;if(moveSubtask(d.rows,from,index))render();};
 window.saveSubtaskEditor=()=>{
  const d=active();if(!d)return;const rows=copy(d.rows);for(const row of rows){row.text=String(row.text||'').trim();if(!row.text){window.showAlertModal('Preencha o texto de cada subtarefa ou remova as linhas vazias.');return;}}
  if(d.creating){
   getUiState().createTaskSubtasks=rows;const field=document.getElementById('ct-subtasks');if(field)field.value=rows.map(s=>s.text).join('\n');
   // render() captures the creation fields before rebuilding them.
   getUiState().subtaskEditor=null;render();return;
  }
  const task=getState().tasks.find(t=>String(t.id)===String(d.taskId));
  if(!task||JSON.stringify(task.subtasks||[])!==d.original){window.showAlertModal('As subtarefas mudaram. Feche o editor e abra novamente para revisar a versão atual.');return;}
  const newlyDone=rows.some(row=>row.completed&&!(task.subtasks||[]).some(old=>String(old.id)===String(row.id)&&old.completed));
  if(newlyDone&&!task.completed&&window.assertTaskDependencies?.(task)===false)return;
  task.subtasks=rows;if(newlyDone&&!task.completed&&window.getMissionStatus?.(task)==='planned')task.workflowStatus='in_progress';getUiState().subtaskEditor=null;save();
 };
 window.renderTaskSubtaskRows=task=>`<div class="space-y-2">${(task.subtasks||[]).map(st=>`<button type="button" onclick="window.toggleSubtask(${arg(task.id)},${arg(st.id)},event)" aria-pressed="${Boolean(st.completed)}" class="flex min-h-11 w-full items-start gap-2 rounded px-2 py-2 text-left text-sm ${st.completed?'text-slate-400 line-through':'text-slate-200'}"><span aria-hidden="true">${st.completed?'☑':'☐'}</span><span class="break-words">${e(st.text)}</span></button>`).join('')}<button type="button" class="${button}" onclick="event.stopPropagation();window.openSubtaskEditor(${arg(task.id)})">Editar e ordenar subtarefas</button></div>`;
 window.renderSubtaskEditor=()=>{
  const d=active();if(!d)return '';return `<div class="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 p-3"><section id="subtask-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="subtask-editor-heading" class="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-xl border border-slate-700 bg-slate-900 text-slate-200"><header class="flex items-start justify-between gap-3 p-4"><div><h2 id="subtask-editor-heading" class="font-semibold">Editar e ordenar subtarefas</h2><p class="mt-2 text-xs text-slate-400">Arraste pela alça ou use Mover para cima/baixo. As alterações só entram ao salvar.</p></div><button id="subtask-editor-close" type="button" class="${button}" onclick="window.closeSubtaskEditor()" aria-label="Cancelar edição de subtarefas">Fechar</button></header><div id="subtask-editor-body" class="space-y-3 overflow-y-auto p-4"><button type="button" class="${button}" onclick="window.insertSubtaskDraft(0)">Inserir no início</button>${d.rows.map((row,index)=>`<article data-subtask-index="${index}" ondragover="event.preventDefault()" ondrop="window.dropSubtaskDraft(${index},event)" class="rounded-lg border border-slate-700 p-3"><div class="flex items-start gap-2"><button type="button" draggable="true" ondragstart="window.dragSubtaskDraft(${index},event)" aria-label="Arrastar subtarefa ${index+1}" class="${button} cursor-grab">↕</button><label class="min-w-0 flex-1 text-xs text-slate-400">Subtarefa ${index+1}<input id="subtask-draft-${index}" type="text" value="${e(row.text)}" oninput="window.editSubtaskDraft(${index},this.value)" class="mt-1 w-full min-w-0 rounded-lg border border-slate-600 bg-slate-950 p-3 text-sm text-slate-100"></label></div><label class="mt-3 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" onchange="window.toggleSubtaskDraft(${index})" ${row.completed?'checked':''} class="accent-indigo-400">Concluída</label><div class="mt-2 flex flex-wrap gap-2"><button type="button" class="${button}" ${index===0?'disabled':''} onclick="window.moveSubtaskDraft(${index},-1)" aria-label="Mover subtarefa ${index+1} para cima">Mover para cima</button><button type="button" class="${button}" ${index===d.rows.length-1?'disabled':''} onclick="window.moveSubtaskDraft(${index},1)" aria-label="Mover subtarefa ${index+1} para baixo">Mover para baixo</button><button type="button" class="${button}" onclick="window.insertSubtaskDraft(${index+1})">Inserir abaixo</button><button type="button" class="${button}" onclick="window.removeSubtaskDraft(${index})">Excluir</button></div></article>`).join('')||'<p class="text-sm text-slate-400">Nenhuma subtarefa. Adicione a primeira acima.</p>'}</div><footer class="flex flex-wrap justify-end gap-2 border-t border-slate-700 p-4"><button type="button" class="${button}" onclick="window.closeSubtaskEditor()">Cancelar</button><button type="button" class="${button} bg-indigo-700" onclick="window.saveSubtaskEditor()">Salvar subtarefas</button></footer></section></div>`;
 };
 window.bindSubtaskEditor=root=>{if(active())window.bindFormDialog(root,{id:'subtask-editor-dialog',initialFocus:'subtask-editor-close',close:window.closeSubtaskEditor,blocked:getUiState().confirm.show||getUiState().alert.show});};
}
