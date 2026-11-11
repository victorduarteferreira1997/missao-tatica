// Session-only presentation state. Financial records and calculations stay in app.html.
export function installFinanceWorkspace(window,{document,getState,getUiState}) {
 const store=()=>{const ui=getUiState();if(ui.financeWorkspace?.owner!==getState())ui.financeWorkspace={owner:getState(),positions:{},defaults:{}};return ui.financeWorkspace;};
 const key=dialog=>`${dialog.dataset.workTab}:${dialog.dataset.financePeriod||'all'}`;
 const controls={receitas:{clear:['inc-desc','inc-amount'],keep:['inc-cat']},fixas:{clear:['fix-desc','fix-amount'],keep:['fix-cat']},variaveis:{clear:['var-desc','var-amount'],keep:['var-cat','var-trigger']},diario:{clear:['mj-event','mj-thought'],keep:['mj-mood']}};
 window.captureFinanceWorkspace=dialog=>{
  const s=store(),body=dialog.querySelector('#finance-module-body'),active=document.activeElement;
  s.positions[key(dialog)]={top:body?.scrollTop||0};
  if(dialog.contains(active)&&active?.id)s.focus={key:key(dialog),id:active.id,start:active.selectionStart,end:active.selectionEnd};
 };
 window.clearFinanceWorkspace=()=>{delete getUiState().financeWorkspace;};
 window.resetFinanceSavedFields=tab=>{
  const fields=controls[tab];if(!fields)return;
  const s=store();s.defaults[tab]=fields.keep.map(id=>({id,value:document.getElementById(id)?.value}));
  // Clear submitted content before another click can reuse it; do not clear category/context.
  for(const id of fields.clear){const field=document.getElementById(id);if(field)field.value='';}
 };
 window.restoreFinanceWorkspace=dialog=>{
  const s=store(),k=key(dialog),body=dialog.querySelector('#finance-module-body');
  const defaults=s.defaults[dialog.dataset.workTab];
  if(defaults){for(const saved of defaults){const field=document.getElementById(saved.id);if(field&&saved.value!==undefined&&(!field.options||[...field.options].some(o=>o.value===saved.value)))field.value=saved.value;}delete s.defaults[dialog.dataset.workTab];}
  if(body)body.scrollTop=s.positions[k]?.top||0;
  const saved=s.focus;
  if(saved?.key!==k||getUiState().confirm.show||getUiState().alert.show||getUiState().customPrompt.show||getUiState().dataManager)return;
  const field=document.getElementById(saved.id);
  if(!field||!dialog.contains(field)||field.disabled||!field.getClientRects().length)return;
  field.focus({preventScroll:true});
  if(saved.start!=null)try{field.setSelectionRange(saved.start,saved.end);}catch{}
 };
}
