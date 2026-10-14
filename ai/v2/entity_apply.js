import {v2Hash,v2Project} from './contract.js';
import {v2ProposalRequest} from './proposals.js';
export async function radarTarget(state,row,fields){
 for(const d of state.operationalControl?.demands||[]){if(await v2Hash(row.grantId+':radar:'+String(d.id))!==fields.targetRef)continue;
  const [e]=await v2Project({operationalControl:{demands:[d]}},{grantId:row.grantId,choices:{modules:{missions:false,radar:true,studies:false},includeFuture:true}});
  if(e.entityVersion!==fields.targetVersion)throw Error('Esta demanda mudou depois da consulta da IA. Atualize os dados e prepare uma nova proposta.');return {demand:d,entity:e};
 }throw Error('A demanda original não existe mais. Nenhum registro foi alterado.');
}
export async function applyEntity(state,row,fields,{createdAt,campaign}){
 const f=v2ProposalRequest({kind:row.kind,idempotencyKey:'apply-validation',fields},{grantId:row.grantId,grantVersion:row.grantVersion}).fields;
 const id=Number.parseInt(row.id.slice(0,13),16);
 if(row.kind.startsWith('radar.')){
  const existing=row.kind==='radar.update'?(await radarTarget(state,row,f)).demand:null;
  state.operationalControl=state.operationalControl||{};const demands=state.operationalControl.demands=state.operationalControl.demands||[];
  const recordId=existing?.id||'ai-radar-'+row.id;if(!existing&&demands.some(d=>String(d.id)===recordId))throw Error('Demanda já existente sem comprovante.');
  const updated={...(existing||{}),id:recordId,title:f.title,area:f.area,project:f.project,nextAction:f.nextAction,workflowStatus:f.status,attentionLevel:f.attentionLevel,dueDate:f.dueDate,nextReviewAt:f.nextReviewAt,waitingFor:f.waitingFor,waitingSince:f.waitingSince,followUpAt:f.followUpAt,createdAt:existing?.createdAt||createdAt,updatedAt:createdAt,lastReviewedAt:createdAt,lastProgressAt:existing?.lastProgressAt||createdAt,...(!existing?{source:'manual',owner:'',requester:'',campaignId:campaign,aiV2ProposalId:row.id}:{}),aiV2LastProposalId:row.id};
  if(f.status==='closed')updated.closedAt=existing?.closedAt||createdAt;else delete updated.closedAt;
  if(existing)demands[demands.indexOf(existing)]=updated;else demands.unshift(updated);return {taskId:recordId,kind:row.kind};
 }
 if(row.kind!=='study.plan.create')throw Error('Tipo de proposta não permitido.');
 state.studyData=state.studyData||{};const study=state.studyData,plan=study.studyPlan=study.studyPlan||{},tracks=plan.tracks=plan.tracks||[],subjects=study.subjects=study.subjects||[],blocks=plan.weeklyBlocks=plan.weeklyBlocks||[];
 const trackId='ai-plan-'+row.id;if(tracks.some(t=>t.id===trackId))throw Error('Plano já existente sem comprovante.');
 const newSubjects=f.subjects.map((s,i)=>({id:id+i+1,name:s.name,trackId,color:'bg-cyan-500',createdAt,campaignId:campaign,aiV2ProposalId:row.id}));
 const newBlocks=f.blocks.map((b,i)=>({id:id+100+i,seriesId:trackId+'-'+i,trackId,subjectId:newSubjects[b.subjectIndex].id,title:b.title,day:b.day,studyType:b.studyType,plannedMinutes:b.plannedMinutes,startTime:b.startTime,endTime:b.endTime,priority:'media',energyLevel:'media',notes:'',status:'planned',order:blocks.filter(x=>x.day===b.day).length+i+1,linkedSessionId:null,createdAt,campaignId:campaign,aiV2ProposalId:row.id}));
 if(newSubjects.some(n=>subjects.some(s=>String(s.id)===String(n.id)))||newBlocks.some(n=>blocks.some(b=>String(b.id)===String(n.id))))throw Error('IDs de estudo já utilizados. Nenhum plano foi criado.');
 tracks.push({id:trackId,name:f.title,weeklyGoalMinutes:f.weeklyGoalMinutes,priority:'media',active:true,system:false,icon:'book-open',color:'text-cyan-400',bg:'bg-cyan-950/30',border:'border-cyan-900/50',createdAt,campaignId:campaign,aiV2ProposalId:row.id});subjects.push(...newSubjects);blocks.push(...newBlocks);return {taskId:trackId,kind:row.kind};
}
