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

test('data efetiva usa o dia escolhido, incluindo virada de mês/ano, sem alterar a semana-base',async()=>{
 const {missionDateLabel}=await import('../ui/ai_proposal_labels.v1.js');
 const fields={weekStart:'2026-10-19',day:'wednesday'},before=structuredClone(fields);assert.deepEqual(missionDateLabel(fields),{date:'2026-10-21',title:'Quarta-feira, 21/10/2026',week:'Semana de 19/10/2026 a 25/10/2026'});assert.deepEqual(fields,before);assert.equal(missionDateLabel({weekStart:'2026-12-28',day:'sunday'}).date,'2027-01-03');assert.equal(missionDateLabel({weekStart:'2026-10-20',day:'monday'}),null);
});
test('tipo de proposta determina o destino explícito sem conversão entre módulos',async()=>{
 const {proposalDestination,renderProposalDestination}=await import('../ui/ai_proposal_labels.v1.js');for(const [kind,label]of [['mission.create','Missões'],['radar.create','RADAR'],['radar.update','RADAR'],['study.plan.create','Inteligência/Estudos']]){assert.equal(proposalDestination(kind),label);assert.ok(renderProposalDestination(kind).includes('Destino: '+label));}
 const f=review();await f.open();assert.match(f.w.renderAiV2Proposals(),/Destino: Missões/);assert.match(f.w.renderAiV2Proposals(),/Segunda-feira, 19\/10\/2026/);f.w.editAiV2Proposal('day','wednesday');await f.w.confirmAiV2Proposal();assert.equal(f.calls.find(c=>c[0]==='apply')[1].day,'wednesday');
});

test('semana fechada é recusada antes de salvar/reservar a proposta e o rascunho continua editável',async()=>{
 const {installAiV2Proposals}=await import('../ui/ai_proposals.v2.js');
 const {AI_OWNER_UID}=await import('./contract.v1.js');
 const proposal={id:'c'.repeat(64),grantId:'preflight-grant-001',grantVersion:1,version:1,kind:'mission.create',status:'pending',applyEligible:true,fields:{title:'Teste fechado',weekStart:'2026-10-19',day:'monday',category:'life',durationMinutes:30,startTime:'',endTime:'',subtasks:[]}};
 const calls=[];const w={escapeHtml:String};
 installAiV2Proposals(w,{config:{enabled:true,proposalsEnabled:true,applyEnabled:true},getUser:()=>({uid:AI_OWNER_UID}),render(){},getCategories:()=>[{id:'life',label:'Pessoal'}],validateMission:fields=>{if(fields.weekStart==='2026-10-19')throw Error('Esta semana já foi fechada.');},saveConfirmed:async()=>{calls.push('save');return true;},applyMission:async()=>({receipt:{taskId:1}}),store:{list:async()=>({items:[proposal],nextCursor:null}),reserve:async row=>{calls.push('reserve');return {...row,status:'applying'};},acknowledge:async row=>row}});
 await w.openAiV2Proposals();w.reviewAiV2Proposal(proposal.id);await w.confirmAiV2Proposal();assert.deepEqual(calls,[]);assert.match(w.renderAiV2Proposals(),/semana já foi fechada/);assert.doesNotMatch(w.renderAiV2Proposals(),/Cadastro iniciado\. Os campos/);
 w.editAiV2Proposal('weekStart','2026-10-26');await w.confirmAiV2Proposal();assert.deepEqual(calls,['save','reserve']);
});
