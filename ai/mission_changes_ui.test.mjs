import test from 'node:test';
import assert from 'node:assert/strict';
import {installMissionChanges} from '../ui/mission_changes.v1.js';
import {v2Project} from './v2/contract.js';
import {applyMissionChange} from './v2/mission_change_apply.js';
import {AI_OWNER_UID} from './contract.v1.js';
async function fixture(){
 let user={uid:AI_OWNER_UID},row;const state={currentPlanningWeekStart:'2026-10-26',planning:{history:[]},tasks:[{id:1,text:'Original',category:'life',day:'friday',planningWeekStart:'2026-10-26',time:'30 min',priority:'media',subtasks:[{id:'sub',text:'Preservada',completed:true}]}],xp:100,combo:4};
 const grantId='mission-ui-grant-0001',[entity]=await v2Project(state,{grantId,choices:{modules:{missions:true,radar:false,studies:false},includeFuture:true}});
 row={id:'b'.repeat(64),grantId,grantVersion:1,version:1,kind:'mission.update',status:'pending',fields:{targetRef:entity.ref,targetVersion:entity.entityVersion,reason:'Organizar',patch:{title:'Sugerido',date:'2026-11-02',durationMinutes:45}},expectedTaskVersion:null,receiptRef:null};
 let entered;const reservedStarted=new Promise(resolve=>entered=resolve);const calls={save:0,reserve:0,apply:0,ack:0};let failAck=false,save=true,hold=null,modal=null;const window={escapeHtml:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),canSwitchAiV2Proposals:()=>true,closeAiV2Proposals(){},showConfirmModal:(message,callback)=>modal={message,callback}};
 installMissionChanges(window,{document:{getElementById:()=>null},getState:()=>state,getUser:()=>user,render(){},saveConfirmed:async()=>{calls.save++;return save;},store:{list:async()=>({items:[row],nextCursor:null}),reserve:async(_,fields,expectedTaskVersion)=>{calls.reserve++;entered();if(hold)await hold;row={...row,status:'applying',fields:structuredClone(fields),expectedTaskVersion};return row;},acknowledge:async()=>{calls.ack++;if(failAck){failAck=false;throw Error('Synthetic acknowledgment lost');}row={...row,status:'accepted'};},reject:async()=>{row={...row,status:'rejected'};}},applyChange:async part=>{calls.apply++;if(Object.hasOwn(state.aiAppliedProposals||{},part.id))return {receipt:{taskId:1},replayed:true};const receipt=await applyMissionChange(state,part);state.aiAppliedProposals={[part.id]:receipt.taskId};return {receipt};}});
 return {window,state,calls,reservedStarted,review:async()=>{await window.openMissionChanges();await window.reviewMissionChange(row.id);},failAck:()=>failAck=true,saveFails:()=>save=false,hold:p=>hold=p,switchUser:()=>user={uid:'member'},modal:()=>modal,row:()=>row};
}
test('review compares final edits, requires recheck and preserves the existing mission and completed subtasks',async()=>{
 const a=await fixture();await a.review();assert.match(a.window.renderMissionChanges(),/30 min/);assert.match(a.window.renderMissionChanges(),/02\/11\/2026/);a.window.editMissionChange('title','Final <script>');await a.window.confirmMissionChange();assert.equal(a.calls.reserve,0);assert.equal(a.state.tasks[0].text,'Original');await a.window.checkMissionChange();assert.match(a.window.renderMissionChanges(),/Final &lt;script>/);await a.window.confirmMissionChange();assert.equal(a.state.tasks[0].text,'Final <script>');assert.deepEqual(a.state.tasks[0].subtasks,[{id:'sub',text:'Preservada',completed:true}]);assert.equal(a.state.tasks.length,1);assert.equal(a.state.combo,4);assert.equal(a.state.xp,100);assert.equal(a.window.isMissionChangesOpen(),true);
});
test('a failed save or a hidden task edit blocks reservation without discarding the review',async()=>{
 const a=await fixture();await a.review();a.saveFails();await a.window.confirmMissionChange();assert.equal(a.calls.reserve,0);assert.match(a.window.renderMissionChanges(),/Sugerido/);
 const b=await fixture();await b.review();b.state.tasks[0].priority='alta';await b.window.confirmMissionChange();assert.equal(b.calls.reserve,0);assert.equal(b.state.tasks[0].text,'Original');assert.match(b.window.renderMissionChanges(),/mudou durante a revisão/);
});
test('double clicks are blocked; a lost acknowledgment resumes without a second edit, including after reopening',async()=>{
 const a=await fixture();await a.review();a.failAck();await a.window.confirmMissionChange();assert.equal(a.state.tasks[0].text,'Sugerido');assert.match(a.window.renderMissionChanges(),/Retomar alteração/);a.window.closeMissionChanges();await a.window.openMissionChanges();await a.window.reviewMissionChange(a.row().id);assert.match(a.window.renderMissionChanges(),/Alteração já salva/);await a.window.confirmMissionChange();assert.equal(a.calls.ack,2);assert.equal(a.state.tasks.length,1);assert.equal(a.window.isMissionChangesOpen(),true);
 const b=await fixture();await b.review();let release;b.hold(new Promise(resolve=>release=resolve));const first=b.window.confirmMissionChange();await b.reservedStarted;await b.window.confirmMissionChange();assert.equal(b.calls.reserve,1);release();await first;assert.equal(b.calls.apply,1);
});
test('drafts require explicit discard, and account changes invalidate pending work',async()=>{
 const a=await fixture();await a.review();a.window.editMissionChange('title','Unsaved');a.window.closeMissionChanges();assert.equal(a.window.isMissionChangesOpen(),true);assert.match(a.modal().message,/Descartar/);a.modal().callback();assert.equal(a.window.isMissionChangesOpen(),false);
 const b=await fixture();await b.review();let release;b.hold(new Promise(resolve=>release=resolve));const pending=b.window.confirmMissionChange();await b.reservedStarted;b.switchUser();b.window.resetMissionChanges();release();await pending;assert.equal(b.calls.apply,0);assert.equal(b.window.renderMissionChanges(),'');
});
