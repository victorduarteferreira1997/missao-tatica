// Transient view state only. It follows uiState, so account/reset boundaries
// discard drafts without touching any study or campaign record.
export function installStudyWorkspace(window,{document,getUiState}) {
 const store=()=>getUiState().studyWorkspace ||= {drafts:{},positions:{},reset:{}};
 const key=dialog=>`${dialog.dataset.workTab}:${dialog.dataset.workTab==='planning'?(dialog.dataset.studyRecord||'new'):''}`;
 const fields=dialog=>[...dialog.querySelectorAll('input[id],select[id],textarea[id],input[name="study-block-days"]')];
 const sections=dialog=>[...dialog.querySelectorAll('details[data-work-section],details[data-view-key]')];
 const sectionKey=el=>el.getAttribute('data-work-section')||el.getAttribute('data-view-key');
 window.resetStudyEditorDraft=id=>{const s=store(),k=`planning:${id}`;delete s.drafts[k];delete s.positions[k];s.reset[k]=true;};
 window.clearStudyWorkspaceDrafts=tab=>{if(!tab){delete getUiState().studyWorkspace;return;}const s=store();for(const collection of [s.drafts,s.positions,s.reset])for(const k of Object.keys(collection))if(k.startsWith(tab+':'))delete collection[k];};
 window.clearStudySavedFields=(...ids)=>{for(const id of ids){const el=document.getElementById(id);if(el)el.value='';}};
 window.captureStudyWorkspace=dialog=>{
  const s=store(),k=key(dialog),body=dialog.querySelector('#study-modal-scroll');
  s.positions[k]={top:body?.scrollTop||0};
  if(!['planning','subjects'].includes(dialog.dataset.workTab)||s.reset[k])return;
  s.drafts[k]={fields:fields(dialog).map(el=>({id:el.id,name:el.name,value:el.value,checked:el.checked})),sections:sections(dialog).map(el=>({key:sectionKey(el),open:el.open}))};
 };
 window.restoreStudyWorkspace=dialog=>{
  const s=store(),k=key(dialog),body=dialog.querySelector('#study-modal-scroll');
  const reset=s.reset[k],draft=reset?null:s.drafts[k];delete s.reset[k];
  if(reset&&dialog.dataset.workTab==='planning'&&dialog.dataset.studyRecord!=='new'){const editor=dialog.querySelector('[data-work-section="plan-editor"]');if(editor)editor.open=true;}
  if(draft){
   if(dialog.dataset.workTab==='planning'){
    const track=draft.fields.find(f=>f.id==='study-block-track'),subject=draft.fields.find(f=>f.id==='study-block-subject');
    if(track)window.setStudyPlanningTrack?.(track.value,subject?.value||'');
   }
   const inputs=fields(dialog);
   for(const saved of draft.fields){
    const el=inputs.find(el=>saved.id?el.id===saved.id:el.name===saved.name&&el.value===saved.value);
    if(!el)continue;
    if(el.tagName==='SELECT'&&el.options&&![...el.options].some(o=>o.value===saved.value))continue;
    el.value=saved.value;if(el.type==='checkbox'||el.type==='radio')el.checked=saved.checked;
   }
   for(const el of sections(dialog)){const saved=draft.sections.find(d=>d.key===sectionKey(el));if(saved)el.open=saved.open;}
  }
  if(body&&s.positions[k])body.scrollTop=s.positions[k].top;
 };
}
