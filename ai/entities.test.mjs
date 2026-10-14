import test from 'node:test';
import assert from 'node:assert/strict';
import {applyEntity,radarTarget} from './v2/entity_apply.js';
import {createCloudStateStore} from './v2/cloud_state.js';
import {v2Project} from './v2/contract.js';
import {createV2ProposalsBrowserStore} from './v2/proposals_browser.js';
import {installAiV2Proposals} from '../ui/ai_proposals.v2.js';
import {AI_OWNER_UID} from './contract.v1.js';
const grantId='entity-test-grant-0001',row={id:'a'.repeat(64),grantId,grantVersion:1,kind:'radar.create',version:1,status:'pending',applyEligible:true};
const radar={title:'Teste',area:'Pessoal',project:'',nextAction:'Conferir',status:'active',attentionLevel:'controlled',dueDate:'',nextReviewAt:'',waitingFor:'',waitingSince:'',followUpAt:''};
const plan={title:'Plano semanal',weeklyGoalMinutes:120,subjects:[{name:'Inglês'},{name:'Direito'}],blocks:[{title:'Vocabulário',subjectIndex:0,day:'monday',plannedMinutes:30,startTime:'',endTime:'',studyType:'teoria'},{title:'Questões',subjectIndex:1,day:'tuesday',plannedMinutes:30,startTime:'',endTime:'',studyType:'questoes'}]};
function fixture(){const user={uid:AI_OWNER_UID};let state={tasks:[],xp:17,coins:8,financeData:{incomes:[{id:'unchanged'}]},healthData:{logs:['unchanged']},operationalControl:{demands:[]},studyData:{subjects:[],sessions:[{id:'history'}],studyPlan:{tracks:[],weeklyBlocks:[]}}},stored={data:JSON.stringify(state)};const cloud=createCloudStateStore({getUser:()=>user,onAdopt:s=>state=s,transact:async(u,work)=>{let next;const r=await work({get:async()=>structuredClone(stored),set:v=>next={...stored,...structuredClone(v)}});if(next)stored=next;return r;}});cloud.observe(user,stored);return {cloud,user,get state(){return state;},get stored(){return stored;}};}
test('RADAR cria/edita com comprovantes, preserva campos privados e recusa alvo alterado sem recompensas',async()=>{
 const f=fixture();await f.cloud.applyMutation(f.user,row.id,s=>applyEntity(s,row,radar,{createdAt:'2026-10-14T14:00:00Z',campaign:2}),'now');const d=f.state.operationalControl.demands[0];d.owner='Proprietário';d.requester='Privado';await f.cloud.write(f.user,JSON.stringify(f.state),'later');
 const [entity]=await v2Project(f.state,{grantId,choices:{modules:{missions:false,radar:true,studies:false},includeFuture:true}}),update={...row,id:'b'.repeat(64),kind:'radar.update'},fields={...radar,title:'Título atualizado',targetRef:entity.ref,targetVersion:entity.entityVersion};
 await f.cloud.applyMutation(f.user,update.id,s=>applyEntity(s,update,fields,{createdAt:'2026-10-14T14:01:00Z',campaign:2}),'later');assert.equal(f.state.operationalControl.demands.length,1);assert.equal(f.state.operationalControl.demands[0].owner,'Proprietário');assert.equal(f.state.operationalControl.demands[0].requester,'Privado');assert.equal(f.state.xp,17);assert.equal(f.state.coins,8);
 await assert.rejects(radarTarget(f.state,update,fields),/mudou/);await assert.rejects(f.cloud.applyMutation(f.user,'c'.repeat(64),s=>applyEntity(s,{...update,id:'c'.repeat(64)},fields,{createdAt:'later',campaign:2}),'later'),/mudou/);assert.equal(f.state.operationalControl.demands[0].title,fields.title);
});
test('estudo cria trilha, disciplinas e blocos na mesma transação e repetir não duplica nem registra sessões',async()=>{
 const f=fixture(),p={...row,kind:'study.plan.create'};const create=s=>applyEntity(s,p,plan,{createdAt:'2026-10-14T14:00:00Z',campaign:2});await f.cloud.applyMutation(f.user,p.id,create,'now');await f.cloud.applyMutation(f.user,p.id,create,'later');
 assert.equal(f.state.studyData.studyPlan.tracks.length,1);assert.equal(f.state.studyData.subjects.length,2);assert.equal(f.state.studyData.studyPlan.weeklyBlocks.length,2);assert.equal(f.state.studyData.sessions.length,1);assert.equal(f.state.studyData.studyPlan.weeklyBlocks[1].subjectId,f.state.studyData.subjects[1].id);assert.ok(Number.isSafeInteger(f.state.studyData.subjects[0].id));assert.equal(f.state.xp,17);assert.equal(f.state.financeData.incomes[0].id,'unchanged');assert.equal(f.state.healthData.logs[0],'unchanged');
});
test('plano inválido não deixa trilha parcial nem comprovante',async()=>{
 const f=fixture(),p={...row,kind:'study.plan.create'};await assert.rejects(f.cloud.applyMutation(f.user,p.id,s=>applyEntity(s,p,{...plan,blocks:[{...plan.blocks[0],subjectIndex:99}]},{createdAt:'now',campaign:1}),'now'));assert.equal(f.state.studyData.studyPlan.tracks.length,0);assert.equal(f.stored.aiApplications,undefined);
});
test('revisão apresenta comparação RADAR, plano estruturado e edição de blocos sem JSON',async()=>{
 const f={...radar,targetRef:'b'.repeat(64),targetVersion:'c'.repeat(64)},r={...row,kind:'radar.update',fields:f,createdAt:'2026-10-14T14:00:00Z'},p={...row,id:'d'.repeat(64),kind:'study.plan.create',fields:plan,createdAt:r.createdAt};let sent;
 const w={escapeHtml:s=>String(s).replaceAll('<','&lt;'),bindFormDialog(){}};
 installAiV2Proposals(w,{config:{enabled:true,proposalsEnabled:true,applyEnabled:true,entitiesEnabled:true},getUser:()=>({uid:AI_OWNER_UID}),render(){},previewEntity:async()=>({...radar,title:'Título atual'}),getCategories:()=>[],saveConfirmed:async()=>true,applyMission:async()=>({receipt:{taskId:'test'},replayed:false}),store:{list:async()=>({items:[r,p],nextCursor:null}),reserve:async(row,fields)=>{sent=fields;return {...row,fields,status:'applying',applicationId:row.id};},acknowledge:async row=>({...row,status:'accepted'})}});
 await w.openAiV2Proposals();await w.reviewAiV2Proposal(r.id);assert.match(w.renderAiV2Proposals(),/Comparar com a demanda atual/);assert.match(w.renderAiV2Proposals(),/Título atual/);w.cancelAiV2Review();w.reviewAiV2Proposal(p.id);w.editAiStudyBlock(0,'plannedMinutes','45');w.editAiStudySubject(0,'Inglês revisado');assert.match(w.renderAiV2Proposals(),/Revisar plano de estudos/);assert.doesNotMatch(w.renderAiV2Proposals(),/\"subjectIndex\"/);await w.confirmAiV2Proposal();assert.equal(sent.blocks[0].plannedMinutes,45);assert.equal(sent.subjects[0].name,'Inglês revisado');assert.match(w.renderAiV2Proposals(),/Plano de estudos criado e salvo na nuvem/);
});

test('app recusa confirmação com kind ou estado divergente antes de anunciar aplicação',async()=>{
 const user={uid:AI_OWNER_UID,getIdToken:async()=> 'synthetic-token'},response={...row,kind:'radar.create',status:'applying',applicationId:row.id,fields:radar,createdAt:'2026-10-14T14:00:00Z',expiresAt:'2027-01-12T14:00:00Z',reviewedAt:null,basis:null,conflictCheck:'unverified'};
 const store=createV2ProposalsBrowserStore({getUser:()=>user,getAppCheckToken:async()=> 'synthetic-check',fetchImpl:async()=>Response.json({schemaVersion:2,proposal:response})});
 await assert.rejects(store.reserve({...row,kind:'mission.create'},radar));
 assert.equal((await store.reserve(row,radar)).kind,'radar.create');await assert.rejects(store.acknowledge(response,'b'.repeat(64)));
 response.status='accepted';response.applyEligible=false;assert.equal((await store.acknowledge(response,'b'.repeat(64))).status,'accepted');
});
