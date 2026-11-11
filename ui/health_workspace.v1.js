// Visual context belongs to this app session, never to health records or rewards.
export function installHealthWorkspace(window,{document,getState,getUiState}) {
 const store=()=>{const ui=getUiState();if(ui.healthWorkspace?.owner!==getState())ui.healthWorkspace={owner:getState(),positions:{},defaults:{}};return ui.healthWorkspace;};
 const controls={treinos:{clear:['wo-duration','wo-notes'],keep:['wo-type','wo-intensity']},metricas:{clear:['metric-weight','metric-waist'],keep:[]},habitos:{clear:['habit-sleep','habit-water','habit-mood','habit-fatigue'],keep:[]}};
 window.clearHealthWorkspace=()=>{delete getUiState().healthWorkspace;};
 window.captureHealthWorkspace=dialog=>{
  const s=store(),tab=dialog.dataset.workTab,body=dialog.querySelector('#health-module-body'),active=document.activeElement;
  s.positions[tab]=body?.scrollTop||0;
  if(active?.id&&dialog.contains(active))s.focus={tab,id:active.id,start:active.selectionStart,end:active.selectionEnd};
 };
 window.resetHealthSavedFields=tab=>{
  const config=controls[tab];if(!config)return;
  const s=store();s.defaults[tab]=config.keep.map(id=>({id,value:document.getElementById(id)?.value}));
  for(const id of config.clear){const field=document.getElementById(id);if(field)field.value='';s.defaults[tab].push({id,value:''});}
 };
 window.restoreHealthWorkspace=dialog=>{
  const s=store(),tab=dialog.dataset.workTab,body=dialog.querySelector('#health-module-body');
  const defaults=s.defaults[tab];
  if(defaults){for(const saved of defaults){const field=document.getElementById(saved.id);if(field&&saved.value!==undefined&&(!field.options||[...field.options].some(o=>o.value===saved.value)))field.value=saved.value;}delete s.defaults[tab];}
  if(body)body.scrollTop=s.positions[tab]||0;
  const saved=s.focus,ui=getUiState();if(saved?.tab!==tab||ui.confirm.show||ui.alert.show||ui.customPrompt.show||ui.dataManager)return;
  const field=document.getElementById(saved.id);if(!field||!dialog.contains(field)||field.disabled||!field.getClientRects().length)return;
  field.focus({preventScroll:true});if(saved.start!=null)try{field.setSelectionRange(saved.start,saved.end);}catch{}
 };
}
