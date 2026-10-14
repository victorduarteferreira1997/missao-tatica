import {validateProposal,DAYS} from '../contract.v1.js';
import {v2Assert,v2Exact,v2GrantId,v2Integer,v2Ref,v2Text,v2Date} from './contract.js';
export const V2_PROPOSAL_SCOPE='proposals:create';
export const V2_PROPOSAL_TTL=90*86400000;
export const V2_PROPOSAL_TOOLS=[
 {name:'listProposals',title:'Consultar propostas novas para revisão',description:'Lista propostas v2 da autorização atual, incluindo avisos de horários não conferidos. Propostas antigas ficam disponíveis ao proprietário no app. Não cria missões.',inputSchema:{type:'object',additionalProperties:false,required:[],properties:{status:{type:'string',enum:['pending','applying','accepted','rejected','expired']},pageSize:{type:'integer',minimum:1,maximum:50,default:25},cursor:{type:'string',maxLength:4096}}},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},securitySchemes:[{type:'oauth2',scopes:['planning:read']}]},
 {name:'createProposal',title:'Enviar proposta sem seleção semanal',description:'Após confirmação explícita do título, semana, dia, duração, horários, categoria e subtarefas pelo usuário, envia mission.create para revisão. Requer permissão específica no app. Funciona sem cópia recente; conflitos e duplicidades não estão verificados. O proprietário revisa e confirma o cadastro no app quando a etapa estiver habilitada.',inputSchema:{type:'object',additionalProperties:false,required:['idempotencyKey','kind','fields'],properties:{idempotencyKey:{type:'string',minLength:8,maxLength:80,pattern:'^[A-Za-z0-9_-]+$'},kind:{type:'string',enum:['mission.create']},fields:{type:'object',additionalProperties:false,required:['title','weekStart','day','durationMinutes','startTime','endTime','subtasks'],properties:{title:{type:'string',minLength:1,maxLength:200},weekStart:{type:'string',pattern:'^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'},day:{type:'string',enum:DAYS},durationMinutes:{type:'integer',minimum:5,maximum:240},startTime:{type:'string',pattern:'^$|^([01][0-9]|2[0-3]):[0-5][0-9]$'},endTime:{type:'string',pattern:'^$|^([01][0-9]|2[0-3]):[0-5][0-9]$'},subtasks:{type:'array',maxItems:12,items:{type:'string',minLength:1,maxLength:200}},category:{type:'string',maxLength:200}}},basis:{type:'object',additionalProperties:false,required:['projectionVersion'],properties:{projectionVersion:{type:'integer',minimum:0}}}}},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},securitySchemes:[{type:'oauth2',scopes:[V2_PROPOSAL_SCOPE]}]}
];
export function v2ProposalRequest(value,grant){
 v2Assert(value&&typeof value==='object'&&!Array.isArray(value));v2Exact(value,Object.hasOwn(value,'basis')?['idempotencyKey','kind','fields','basis']:['idempotencyKey','kind','fields']);
 v2Assert(value.kind==='mission.create'&&typeof value.idempotencyKey==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(value.idempotencyKey));
 const f=value.fields;v2Exact(f,Object.hasOwn(f||{},'category')?['title','weekStart','day','durationMinutes','startTime','endTime','subtasks','category']:['title','weekStart','day','durationMinutes','startTime','endTime','subtasks']);
 const validated=validateProposal({idempotencyKey:value.idempotencyKey,contextRevision:'v2-independent',...Object.fromEntries(Object.entries(f).filter(([k])=>k!=='category'))});
 if(validated.startTime){const minutes=s=>{const [h,m]=s.split(':').map(Number);return h*60+m;};v2Assert(minutes(validated.endTime)-minutes(validated.startTime)===validated.durationMinutes);}
 const fields={title:validated.title,weekStart:validated.weekStart,day:validated.day,durationMinutes:validated.durationMinutes,startTime:validated.startTime,endTime:validated.endTime,subtasks:validated.subtasks,category:v2Text(f.category??'')};
 let basis=null;if(Object.hasOwn(value,'basis')){v2Exact(value.basis,['projectionVersion']);v2Integer(value.basis.projectionVersion);basis={projectionVersion:value.basis.projectionVersion};}
 v2GrantId(grant.grantId);v2Integer(grant.grantVersion);
 const result={idempotencyKey:value.idempotencyKey,grantId:grant.grantId,grantVersion:grant.grantVersion,kind:'mission.create',fields,basis};
 v2Assert(new TextEncoder().encode(JSON.stringify(result)).byteLength<=12000);return result;
}
export function v2ProposalRow(row){
 v2Exact(row,[...(Object.hasOwn(row,'applicationId')?['applicationId']:[]),'id','grantId','grantVersion','version','kind','status','createdAt','expiresAt','reviewedAt','fields','basis','conflictCheck','applyEligible']);
 v2Ref(row.id);if(Object.hasOwn(row,'applicationId'))v2Ref(row.applicationId);v2GrantId(row.grantId);v2Integer(row.grantVersion);v2Integer(row.version);v2Assert(row.kind==='mission.create'&&['pending','applying','accepted','rejected','expired'].includes(row.status)&&row.conflictCheck==='unverified'&&typeof row.applyEligible==='boolean');
 for(const k of ['createdAt','expiresAt']){v2Date(row[k]);v2Assert(row[k]!=='');}if(row.reviewedAt!==null){v2Date(row.reviewedAt);v2Assert(row.reviewedAt!=='');}
 if(row.fields!==null)v2ProposalRequest({idempotencyKey:'validation-only',kind:row.kind,fields:row.fields,...(row.basis!==null?{basis:row.basis}:{})},row);else v2Assert(['expired','accepted'].includes(row.status)&&row.basis===null);return row;
}
