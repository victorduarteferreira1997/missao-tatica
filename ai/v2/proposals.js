import {validateProposal,DAYS} from '../contract.v1.js';
import {v2Assert,v2Exact,v2GrantId,v2Integer,v2Ref,v2Text,v2Date} from './contract.js';
export const V2_PROPOSAL_SCOPE='proposals:create';
export const V2_ENTITY_KINDS=['radar.create','radar.update','study.plan.create'];
export const v2ProposalModule=kind=>kind==='mission.create'?'missions':kind.startsWith('radar.')?'radar':kind==='study.plan.create'?'studies':'';
export const v2ProposalAllowed=(choices,kind)=>choices.modules[v2ProposalModule(kind)]===true&&choices[kind==='mission.create'?'allowProposals':kind.startsWith('radar.')?'allowRadarProposals':'allowStudyProposals']===true;
export const V2_PROPOSAL_TTL=90*86400000;
export const V2_PROPOSAL_TOOLS=[
 {name:'listProposals',title:'Consultar propostas novas para revisão',description:'Lista propostas v2 da autorização atual, incluindo avisos de horários não conferidos. Propostas antigas ficam disponíveis ao proprietário no app. Não cria missões.',inputSchema:{type:'object',additionalProperties:false,required:[],properties:{status:{type:'string',enum:['pending','applying','accepted','rejected','expired']},pageSize:{type:'integer',minimum:1,maximum:50,default:25},cursor:{type:'string',maxLength:4096}}},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:false},securitySchemes:[{type:'oauth2',scopes:['planning:read']}]},
 {name:'createProposal',title:'Enviar proposta sem seleção semanal',description:'Após confirmação explícita do título, semana, dia, duração, horários, categoria e subtarefas pelo usuário, envia mission.create para revisão. Também aceita radar.create, radar.update e study.plan.create, com permissão específica por módulo no app. Para RADAR envie título, área/projeto, próxima ação, estado, atenção, prazo/revisão e espera. radar.update exige targetRef/targetVersion reais consultados. Para estudos envie título/meta semanal, subjects (nomes) e blocks (título, subjectIndex, dia, plannedMinutes, horários e studyType). Confirme todos os campos antes do envio. Funciona sem cópia recente; conflitos e duplicidades não estão verificados. O proprietário revisa e confirma o cadastro no app quando a etapa estiver habilitada.',inputSchema:{type:'object',additionalProperties:false,required:['idempotencyKey','kind','fields'],properties:{idempotencyKey:{type:'string',minLength:8,maxLength:80,pattern:'^[A-Za-z0-9_-]+$'},kind:{type:'string',enum:['mission.create',...V2_ENTITY_KINDS]},fields:{type:'object',additionalProperties:false,required:['title'],properties:{title:{type:'string',minLength:1,maxLength:200},weekStart:{type:'string',pattern:'^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'},day:{type:'string',enum:DAYS},durationMinutes:{type:'integer',minimum:5,maximum:240},startTime:{type:'string',pattern:'^$|^([01][0-9]|2[0-3]):[0-5][0-9]$'},endTime:{type:'string',pattern:'^$|^([01][0-9]|2[0-3]):[0-5][0-9]$'},subtasks:{type:'array',maxItems:12,items:{type:'string',minLength:1,maxLength:200}},category:{type:'string',maxLength:200},area:{type:'string',maxLength:200},project:{type:'string',maxLength:200},nextAction:{type:'string',maxLength:1000},status:{type:'string',enum:['active','waiting','backlog','closed']},attentionLevel:{type:'string',enum:['controlled','attention','immediate']},dueDate:{type:'string',maxLength:10},nextReviewAt:{type:'string',maxLength:10},waitingFor:{type:'string',maxLength:200},waitingSince:{type:'string',maxLength:10},followUpAt:{type:'string',maxLength:10},targetRef:{type:'string',pattern:'^[a-f0-9]{64}$'},targetVersion:{type:'string',pattern:'^[a-f0-9]{64}$'},weeklyGoalMinutes:{type:'integer',minimum:0,maximum:3000},subjects:{type:'array',minItems:1,maxItems:12,items:{type:'object',additionalProperties:false,required:['name'],properties:{name:{type:'string',minLength:1,maxLength:200}}}},blocks:{type:'array',minItems:1,maxItems:21,items:{type:'object',additionalProperties:false,required:['title','subjectIndex','day','plannedMinutes','startTime','endTime','studyType'],properties:{title:{type:'string',minLength:1,maxLength:200},subjectIndex:{type:'integer',minimum:0,maximum:11},day:{type:'string',enum:DAYS},plannedMinutes:{type:'integer',minimum:5,maximum:480},startTime:{type:'string'},endTime:{type:'string'},studyType:{type:'string',enum:['teoria','revisao','questoes','pratica']}}}}}},basis:{type:'object',additionalProperties:false,required:['projectionVersion'],properties:{projectionVersion:{type:'integer',minimum:0}}}}},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},securitySchemes:[{type:'oauth2',scopes:[V2_PROPOSAL_SCOPE]}]}
];
export function v2ProposalRequest(value,grant){
 v2Assert(value&&typeof value==='object'&&!Array.isArray(value));v2Exact(value,Object.hasOwn(value,'basis')?['idempotencyKey','kind','fields','basis']:['idempotencyKey','kind','fields']);
 v2Assert(['mission.create',...V2_ENTITY_KINDS].includes(value.kind)&&typeof value.idempotencyKey==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(value.idempotencyKey));
 const f=value.fields;let fields;
 if(value.kind==='mission.create'){
v2Exact(f,Object.hasOwn(f||{},'category')?['title','weekStart','day','durationMinutes','startTime','endTime','subtasks','category']:['title','weekStart','day','durationMinutes','startTime','endTime','subtasks']);
 const validated=validateProposal({idempotencyKey:value.idempotencyKey,contextRevision:'v2-independent',...Object.fromEntries(Object.entries(f).filter(([k])=>k!=='category'))});
 if(validated.startTime){const minutes=s=>{const [h,m]=s.split(':').map(Number);return h*60+m;};v2Assert(minutes(validated.endTime)-minutes(validated.startTime)===validated.durationMinutes);}
 fields={title:validated.title,weekStart:validated.weekStart,day:validated.day,durationMinutes:validated.durationMinutes,startTime:validated.startTime,endTime:validated.endTime,subtasks:validated.subtasks,category:v2Text(f.category??'')};

 }else fields=v2EntityFields(value.kind,f);
 let basis=null;if(Object.hasOwn(value,'basis')){v2Exact(value.basis,['projectionVersion']);v2Integer(value.basis.projectionVersion);basis={projectionVersion:value.basis.projectionVersion};}
 v2GrantId(grant.grantId);v2Integer(grant.grantVersion);
 const result={idempotencyKey:value.idempotencyKey,grantId:grant.grantId,grantVersion:grant.grantVersion,kind:value.kind,fields,basis};
 v2Assert(new TextEncoder().encode(JSON.stringify(result)).byteLength<=12000);return result;
}
export function v2ProposalRow(row){
 v2Exact(row,[...(Object.hasOwn(row,'applicationId')?['applicationId']:[]),'id','grantId','grantVersion','version','kind','status','createdAt','expiresAt','reviewedAt','fields','basis','conflictCheck','applyEligible']);
 v2Ref(row.id);if(Object.hasOwn(row,'applicationId'))v2Ref(row.applicationId);v2GrantId(row.grantId);v2Integer(row.grantVersion);v2Integer(row.version);v2Assert(['mission.create',...V2_ENTITY_KINDS].includes(row.kind)&&['pending','applying','accepted','rejected','expired'].includes(row.status)&&row.conflictCheck==='unverified'&&typeof row.applyEligible==='boolean');
 for(const k of ['createdAt','expiresAt']){v2Date(row[k]);v2Assert(row[k]!=='');}if(row.reviewedAt!==null){v2Date(row.reviewedAt);v2Assert(row.reviewedAt!=='');}
 if(row.fields!==null)v2ProposalRequest({idempotencyKey:'validation-only',kind:row.kind,fields:row.fields,...(row.basis!==null?{basis:row.basis}:{})},row);else v2Assert(['expired','accepted'].includes(row.status)&&row.basis===null);return row;
}

export function v2EntityFields(kind,f){
 const title=v2Text(f?.title).trim();v2Assert(title.length>0);
 const date=value=>{v2Text(value,10);v2Assert(value===''||/^20\d\d-\d\d-\d\d$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value);return value;};
 if(kind.startsWith('radar.')){
  const keys=['title','area','project','nextAction','status','attentionLevel','dueDate','nextReviewAt','waitingFor','waitingSince','followUpAt'];v2Exact(f,[...keys,...(kind==='radar.update'?['targetRef','targetVersion']:[])]);
  v2Assert(['active','waiting','backlog','closed'].includes(f.status)&&['controlled','attention','immediate'].includes(f.attentionLevel));
  const result={title,area:v2Text(f.area),project:v2Text(f.project),nextAction:v2Text(f.nextAction,1000),status:f.status,attentionLevel:f.attentionLevel,dueDate:date(f.dueDate),nextReviewAt:date(f.nextReviewAt),waitingFor:v2Text(f.waitingFor),waitingSince:date(f.waitingSince),followUpAt:date(f.followUpAt)};
  if(f.status==='waiting')v2Assert(result.waitingFor.trim().length>0);else v2Assert(!result.waitingFor&&!result.waitingSince&&!result.followUpAt);
  if(kind==='radar.update'){v2Ref(f.targetRef);v2Ref(f.targetVersion);Object.assign(result,{targetRef:f.targetRef,targetVersion:f.targetVersion});}return result;
 }
 v2Assert(kind==='study.plan.create');v2Exact(f,['title','weeklyGoalMinutes','subjects','blocks']);v2Integer(f.weeklyGoalMinutes,3000);
 v2Assert(Array.isArray(f.subjects)&&f.subjects.length>0&&f.subjects.length<=12&&Array.isArray(f.blocks)&&f.blocks.length>0&&f.blocks.length<=21);
 const subjects=f.subjects.map(s=>{v2Exact(s,['name']);const name=v2Text(s.name).trim();v2Assert(name.length>0);return {name};});v2Assert(new Set(subjects.map(s=>s.name.toLocaleLowerCase('pt-BR'))).size===subjects.length);
 const blocks=f.blocks.map(b=>{v2Exact(b,['title','subjectIndex','day','plannedMinutes','startTime','endTime','studyType']);v2Integer(b.subjectIndex,subjects.length-1);v2Integer(b.plannedMinutes,480);v2Assert(b.plannedMinutes>=5&&DAYS.includes(b.day)&&['teoria','revisao','questoes','pratica'].includes(b.studyType));
  const blockTitle=v2Text(b.title).trim();v2Assert(blockTitle.length>0);for(const k of ['startTime','endTime'])v2Assert(typeof b[k]==='string'&&(b[k]===''||/^([01]\d|2[0-3]):[0-5]\d$/.test(b[k])));
  v2Assert(Boolean(b.startTime)===Boolean(b.endTime));if(b.startTime){const minutes=s=>{const [h,m]=s.split(':').map(Number);return h*60+m;};v2Assert(minutes(b.endTime)-minutes(b.startTime)===b.plannedMinutes);}
  return {title:blockTitle,subjectIndex:b.subjectIndex,day:b.day,plannedMinutes:b.plannedMinutes,startTime:b.startTime,endTime:b.endTime,studyType:b.studyType};});v2Assert(blocks.reduce((n,b)=>n+b.plannedMinutes,0)<=3000);
 return {title,weeklyGoalMinutes:f.weeklyGoalMinutes,subjects,blocks};
}
