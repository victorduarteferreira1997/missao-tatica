import test from 'node:test';
import assert from 'node:assert/strict';
import {installSubtasks,moveSubtask} from './ui/subtasks.v1.js';
function fixture(){let state={tasks:[{id:'missão-teste',subtasks:[{id:1,text:'Primeiro',completed:true,extra:{manter:true}},{id:2,text:'Segundo',completed:false},{id:3,text:'Terceiro',completed:false}],xp:100}],userProfile:{displayName:'Perfil'},prestige:{campaign:4},other:{keep:1}},ui={confirm:{show:false},alert:{show:false}},writes=[],field={value:'A\nB'};
 const w={escapeHtml:value=>String(value).replaceAll('"','&quot;').replaceAll('<','&lt;'),showAlertModal:message=>w.error=message};
 installSubtasks(w,{document:{getElementById:id=>id==='ct-subtasks'?field:null},getState:()=>state,getUiState:()=>ui,render(){},save(){writes.push(structuredClone(state));}});
 return {w,ui,writes,field,get state(){return state;},replace:()=>{state=structuredClone(state);}};
}
test('editar e reordenar preserva IDs, conclusão, campos extras e array ao salvar/reabrir',()=>{
 const f=fixture(),before=structuredClone(f.state);f.w.openSubtaskEditor('missão-teste');f.w.editSubtaskDraft(0,'Primeiro revisado');f.w.moveSubtaskDraft(0,1);assert.deepEqual(f.state,before);f.w.saveSubtaskEditor();const saved=f.writes[0];assert.deepEqual(saved.tasks[0].subtasks.map(r=>r.id),[2,1,3]);assert.equal(saved.tasks[0].subtasks[1].completed,true);assert.deepEqual(saved.tasks[0].subtasks[1].extra,{manter:true});assert.equal(saved.tasks[0].subtasks[1].text,'Primeiro revisado');assert.deepEqual(saved.other,before.other);assert.deepEqual(saved.prestige,before.prestige);assert.deepEqual(saved.userProfile,before.userProfile);f.w.openSubtaskEditor('missão-teste');assert.deepEqual(f.ui.subtaskEditor.rows,saved.tasks[0].subtasks);
});
test('inserir no meio, excluir e cancelar não altera a missão antes de salvar',()=>{
 const f=fixture(),before=structuredClone(f.state);f.w.openSubtaskEditor('missão-teste');f.w.insertSubtaskDraft(1);f.w.editSubtaskDraft(1,'Intermediária');f.w.removeSubtaskDraft(3);assert.equal(f.ui.subtaskEditor.rows[1].text,'Intermediária');f.w.closeSubtaskEditor();assert.deepEqual(f.state,before);assert.equal(f.writes.length,0);
 f.w.openSubtaskEditor('missão-teste');f.w.insertSubtaskDraft(1);f.w.editSubtaskDraft(1,'Intermediária');f.w.saveSubtaskEditor();assert.deepEqual(f.state.tasks[0].subtasks.map(s=>s.text),['Primeiro','Intermediária','Segundo','Terceiro']);assert.equal(f.state.tasks[0].subtasks[0].completed,true);
});
test('arrastar e botões usam a mesma ordem persistente, sem copiar subtarefas',()=>{
 const f=fixture();f.w.openSubtaskEditor('missão-teste');f.w.dragSubtaskDraft(2,{dataTransfer:{setData(){}}});f.w.dropSubtaskDraft(0,{preventDefault(){},stopPropagation(){}});f.w.saveSubtaskEditor();assert.deepEqual(f.state.tasks[0].subtasks.map(s=>s.id),[3,1,2]);assert.equal(new Set(f.state.tasks[0].subtasks.map(s=>s.id)).size,3);const rows=f.state.tasks[0].subtasks;assert.equal(moveSubtask(rows,-1,0),false);assert.equal(moveSubtask(rows,1,4),false);
});
test('rascunho de criação mantém textos, ordem e conclusões sem cadastrar missão antes da confirmação',()=>{
 const f=fixture(),before=structuredClone(f.state);f.w.openSubtaskEditor(null);f.w.moveSubtaskDraft(1,-1);f.w.toggleSubtaskDraft(0);f.w.saveSubtaskEditor();assert.equal(f.field.value,'B\nA');assert.equal(f.ui.createTaskSubtasks[0].completed,true);assert.equal(f.writes.length,0);assert.deepEqual(f.state,before);
});
test('confirmação velha e mudança de conta não substituem subtarefas atuais',()=>{
 const f=fixture();f.w.openSubtaskEditor('missão-teste');f.state.tasks[0].subtasks[0].text='Mudou externamente';f.w.saveSubtaskEditor();assert.match(f.w.error,/mudaram/);assert.equal(f.writes.length,0);f.replace();f.w.saveSubtaskEditor();assert.equal(f.writes.length,0);
});
test('legado sem ID recebe ID somente no editor salvo; registros com ID e campos extras permanecem',()=>{
 const f=fixture();f.state.tasks[0].subtasks.push({text:'Legado',completed:true,legacy:'preservar'});f.w.openSubtaskEditor('missão-teste');assert.equal(f.state.tasks[0].subtasks[3].id,undefined);f.w.saveSubtaskEditor();assert.ok(f.state.tasks[0].subtasks[3].id);assert.equal(f.state.tasks[0].subtasks[3].completed,true);assert.equal(f.state.tasks[0].subtasks[3].legacy,'preservar');assert.equal(f.state.tasks[0].subtasks[0].id,1);
});
test('linhas vazias não são salvas silenciosamente e editor oferece alça e alternativas acessíveis',()=>{
 const f=fixture();f.w.openSubtaskEditor('missão-teste');f.w.insertSubtaskDraft(1);f.w.saveSubtaskEditor();assert.match(f.w.error,/Preencha o texto/);assert.equal(f.writes.length,0);const html=f.w.renderSubtaskEditor();assert.match(html,/draggable="true"/);assert.match(html,/Mover para cima/);assert.match(html,/Mover para baixo/);assert.match(html,/role="dialog"/);assert.match(html,/aria-label="Mover subtarefa/);
});
