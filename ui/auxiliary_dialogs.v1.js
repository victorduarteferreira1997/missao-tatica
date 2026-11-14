// One-render snapshots only. These drafts never enter saved state or survive
// closing, replacing the account/state, or changing profile setup context.
export function installAuxiliaryDialogs(window,{document,getState,getUiState,getUser}) {
 const bound=new WeakMap();
 const forms=()=>[
  {id:'task-categories-dialog',open:getUiState().showCategoryModal,scope:'categories',fields:['task-category-name','task-category-icon','task-category-color'],focus:'task-category-name',close:window.toggleCategoryModal},
  {id:'profile-dialog',open:getUiState().showProfileModal||!getState().userProfile?.configured,scope:getState().userProfile?.configured?'edit':'setup',fields:['profile-display-name','profile-campaign-theme'],radios:'input[name="profile-gender"]',focus:'profile-display-name',close:window.closeProfileModal}
 ];
 const valid=(record,form)=>record?.owner===getUser()&&record?.state===getState()&&record?.scope===form.scope;
 window.captureAuxiliaryDialogs=root=>{
  const snapshots=[];
  for(const form of forms()){
   const dialog=root.querySelector('#'+form.id);
   if(!form.open||!dialog||!valid(bound.get(dialog),form))continue;
   snapshots.push({id:form.id,scope:form.scope,
    fields:form.fields.flatMap(id=>{const field=dialog.querySelector('#'+id);return field?[{id,value:field.value}]:[];}),
    radios:form.radios?[...dialog.querySelectorAll(form.radios)].map(field=>({value:field.value,checked:field.checked})):[]});
  }
  return {owner:getUser(),state:getState(),snapshots};
 };
 window.restoreAuxiliaryDialogs=(root,snapshot)=>{
  if(snapshot?.owner!==getUser()||snapshot?.state!==getState())return;
  for(const form of forms()){
   const saved=snapshot.snapshots.find(item=>item.id===form.id&&item.scope===form.scope),dialog=root.querySelector('#'+form.id);
   if(!form.open||!saved||!dialog)continue;
   for(const {id,value} of saved.fields){const field=dialog.querySelector('#'+id);if(field)field.value=value;}
   if(form.radios)for(const field of dialog.querySelectorAll(form.radios)){const old=saved.radios.find(item=>item.value===field.value);if(old)field.checked=old.checked;}
  }
  if(root.querySelector('#profile-dialog'))window.updateProfilePreview();
 };
 window.bindAuxiliaryDialogs=root=>{
  const blocked=Boolean(getUiState().confirm.show||getUiState().alert.show);
  for(const form of forms()){
   const dialog=root.querySelector('#'+form.id);if(!form.open||!dialog)continue;
   bound.set(dialog,{owner:getUser(),state:getState(),scope:form.scope});
   window.bindFormDialog(root,{id:form.id,initialFocus:form.focus,close:form.close,blocked,trackChanges:true});
  }
  for(const [id,initialFocus,close] of [
   ['review-difficulty-dialog','review-difficulty-close',window.closeCustomPrompt],
   ['pomodoro-evaluation-dialog','pomo-eval-focus',window.skipPomodoroEvaluation]
  ])if(root.querySelector('#'+id))window.bindFormDialog(root,{id,initialFocus,close,blocked});
 };
}
