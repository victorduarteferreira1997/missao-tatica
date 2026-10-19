import test from 'node:test';
import assert from 'node:assert/strict';
import {installAiV2Proposals} from '../ui/ai_proposals.v2.js';
import {AI_OWNER_UID} from './contract.v1.js';
function review(extra={}){
 const proposal={id:'e'.repeat(64),grantId:'review-fields-grant-001',grantVersion:1,version:1,kind:'mission.create',status:'pending',applyEligible:true,fields:{title:'Missão sugerida',weekStart:'2026-10-19',day:'monday',category:'life',durationMinutes:30,startTime:'09:00',endTime:'09:30',subtasks:['Conferir'],...extra}};
 const calls=[],w={escapeHtml:value=>String(value??''),bindFormDialog(){}};
 installAiV2Proposals(w,{config:{enabled:true,proposalsEnabled:true,applyEnabled:true},getUser:()=>({uid:AI_OWNER_UID}),getCategories:()=>[{id:'life',label:'Pessoal'},{id:'work',label:'Trabalho'}],render(){},saveConfirmed:async()=>{calls.push('save');return true;},store:{list:async()=>({items:[proposal],nextCursor:null}),reserve:async(row,fields)=>{calls.push(['reserve',structuredClone(fields)]);return {...row,status:'applying',applicationId:row.id,fields};},acknowledge:async row=>({...row,status:'accepted'})},applyMission:async(row,fields)=>{calls.push(['apply',structuredClone(fields)]);return {receipt:{taskId:1}};}});
 return {w,calls,async open(){await w.openAiV2Proposals();w.reviewAiV2Proposal(proposal.id);}};
}
test('edited title, category and subtasks are normalized and applied, leaving the queue open',async()=>{
 const f=review();await f.open();f.w.editAiV2Proposal('title','  Título revisado  ');f.w.editAiV2Proposal('category','work');f.w.editAiV2Proposal('subtasks',' Passo revisado \n\n Segundo passo ');await f.w.confirmAiV2Proposal();
 const saved=f.calls.find(c=>c[0]==='apply')?.[1];assert.ok(saved,'A missão editada deve ser cadastrada');assert.equal(saved.title,'Título revisado');assert.equal(saved.category,'work');assert.deepEqual(saved.subtasks,['Passo revisado','Segundo passo']);assert.match(f.w.renderAiV2Proposals(),/Missão cadastrada e salva/);
});
test('changing duration or start keeps the end consistent, and changing end updates duration',async()=>{
 for(const [edits,expected] of [[[['durationMinutes','60']],{startTime:'09:00',endTime:'10:00',durationMinutes:60}],[[['startTime','10:00']],{startTime:'10:00',endTime:'10:30',durationMinutes:30}],[[['endTime','10:00']],{startTime:'09:00',endTime:'10:00',durationMinutes:60}],[[['startTime','']],{startTime:'',endTime:'',durationMinutes:30}]]){
  const f=review();await f.open();for(const [key,value] of edits)f.w.editAiV2Proposal(key,value);await f.w.confirmAiV2Proposal();const saved=f.calls.find(c=>c[0]==='apply')?.[1];assert.ok(saved,JSON.stringify(edits));for(const [key,value]of Object.entries(expected))assert.equal(saved[key],value);
 }
});
test('invalid edits show a specific error beside submit and preserve the draft without network writes',async()=>{
 for(const [key,value,pattern] of [['durationMinutes','0',/5.*240/],['title',' ',/título/i],['weekStart','2026-10-20',/segunda-feira/],['endTime','08:00',/posterior ao início/]]){
  const f=review();await f.open();f.w.editAiV2Proposal(key,value);await f.w.confirmAiV2Proposal();const html=f.w.renderAiV2Proposals();assert.match(html,pattern);assert.match(html,/role="alert"/);assert.match(html,/id="ai-v2-review-feedback"/);assert.match(html,/Revisar e cadastrar missão/);assert.equal(f.calls.length,0);
 }
});
