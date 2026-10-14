import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudStateStore} from './v2/cloud_state.js';
import {installAiV2Proposals} from '../ui/ai_proposals.v2.js';
import {AI_OWNER_UID} from './contract.v1.js';
import {createConfirmedStateWriter} from './v2/saved_state.js';
function fixture(){let user={uid:'synthetic-owner'},row={data:JSON.stringify({tasks:[],xp:7,financeData:{incomes:[{id:'keep'}]}})},adopted=[];let tail=Promise.resolve(),failAfterCommit=false;
 const transact=(u,work)=>{const run=tail.then(async()=>{let next;const r=await work({get:async()=>structuredClone(row),set:v=>next={...row,...structuredClone(v)}});if(next)row=next;if(failAfterCommit){failAfterCommit=false;throw Error('Resposta perdida');}return r;});tail=run.catch(()=>{});return run;};
 const create=()=>createCloudStateStore({getUser:()=>user,transact,onAdopt:s=>adopted.push(s)}),a=create(),b=create();a.observe(user,row);b.observe(user,row);
 return {a,b,get user(){return user;},get row(){return row;},adopted,setUser:u=>user=u,fail:()=>failAfterCommit=true};
}
const id='a'.repeat(64),task={id:'ai-v2-'+id,aiV2ProposalId:id,text:'Teste sintético',xp:2,completed:false};
test('transação cria tarefa e comprovante juntos, preserva dados e repete sem duplicar entre dispositivos',async()=>{
 const f=fixture(),r=await f.a.apply(f.user,id,task,'2026-10-14T12:00:00Z');assert.equal(r.replayed,false);assert.equal(JSON.parse(f.row.data).tasks.length,1);assert.equal(f.row.aiApplications[id].taskId,task.id);assert.equal(JSON.parse(f.row.data).xp,7);assert.equal(JSON.parse(f.row.data).financeData.incomes[0].id,'keep');
 const second=await f.b.apply(f.user,id,{...task,text:'Outro texto'},'2026-10-14T12:01:00Z');assert.equal(second.replayed,true);assert.equal(JSON.parse(f.row.data).tasks.length,1);assert.equal(JSON.parse(f.row.data).tasks[0].text,task.text);
});
test('resposta perdida após commit é recuperável; confirmação só ocorre após commit',async()=>{
 const f=fixture();f.fail();await assert.rejects(f.a.apply(f.user,id,task,'now'));assert.equal(f.adopted.length,0);assert.equal(JSON.parse(f.row.data).tasks.length,1);const resumed=await f.a.apply(f.user,id,task,'later');assert.equal(resumed.replayed,true);assert.equal(f.adopted.length,1);
});
test('gravação de outra aba não sobrescreve missão; snapshot enfileirado antigo sem marcador é recusado',async()=>{
 const f=fixture(),old=f.row.data;await f.a.apply(f.user,id,task,'now');await assert.rejects(f.b.write(f.user,old,'later'),/outra aba/);await assert.rejects(f.a.write(f.user,old,'later'),/outra aba/);assert.equal(JSON.parse(f.row.data).tasks.length,1);
});
test('comprovante permanece após excluir missão e impede recriação; sessão alterada não adota',async()=>{
 const f=fixture();await f.a.apply(f.user,id,task,'now');const next=JSON.parse(f.row.data);next.tasks=[];await f.a.write(f.user,JSON.stringify(next),'later');await f.a.apply(f.user,id,task,'later');assert.equal(JSON.parse(f.row.data).tasks.length,0);const old=f.user;f.setUser(null);await assert.rejects(f.a.apply(old,id,task,'later'),/Sessão/);
});
test('fila exclusiva espera gravações anteriores e impede sobreposição com cadastro',async()=>{
 const calls=[],user={uid:'x'},w=createConfirmedStateWriter({getUser:()=>user,writeAccount:async()=>{},writeSnapshot:async()=>calls.push('write')});await Promise.all([w(user,{tasks:[]}),w.exclusive(async()=>calls.push('apply')),w(user,{tasks:[]})]);assert.deepEqual(calls,['write','apply','write']);
});

test('revisão mantém fila aberta e recupera confirmação perdida sem repetir a missão',async()=>{
 let row={id:'a'.repeat(64),grantId:'review-grant-001',grantVersion:1,version:1,status:'pending',applyEligible:true,createdAt:'2026-10-14T12:00:00Z',fields:{title:'Original',weekStart:'2026-10-12',day:'wednesday',durationMinutes:5,startTime:'',endTime:'',subtasks:[],category:'Pessoal'}},commits=0,acknowledgments=0;const order=[];
 const w={escapeHtml:s=>String(s).replaceAll('<','&lt;'),bindFormDialog(){}};
 installAiV2Proposals(w,{config:{enabled:true,proposalsEnabled:true,applyEnabled:true},getUser:()=>({uid:AI_OWNER_UID}),render(){},getCategories:()=>[{id:'life',label:'Pessoal'}],saveConfirmed:async()=>{order.push('save');return true;},applyMission:async()=>{order.push('apply');const replayed=commits>0;if(!replayed)commits++;return {receipt:{taskId:'test-task'},replayed};},store:{list:async()=>({items:[row],nextCursor:null}),reserve:async(r,fields)=>{order.push('reserve');row={...r,fields,status:'applying',applicationId:r.id};return row;},acknowledge:async()=>{order.push('ack');if(++acknowledgments===1)throw Error('Falha sintética de confirmação');return {...row,status:'accepted'};}}});
 await w.openAiV2Proposals();w.reviewAiV2Proposal(row.id);w.editAiV2Proposal('title','<Título revisado>');await w.confirmAiV2Proposal();assert.equal(commits,1);assert.match(w.renderAiV2Proposals(),/Retomar cadastro/);assert.match(w.renderAiV2Proposals(),/&lt;Título revisado>/);assert.match(w.renderAiV2Proposals(),/Falha sintética/);
 await w.confirmAiV2Proposal();assert.equal(commits,1);assert.equal(acknowledgments,2);assert.match(w.renderAiV2Proposals(),/Nenhuma missão duplicada/);assert.match(w.renderAiV2Proposals(),/ai-v2-proposals-dialog/);assert.deepEqual(order,['save','reserve','apply','ack','save','reserve','apply','ack']);
});
