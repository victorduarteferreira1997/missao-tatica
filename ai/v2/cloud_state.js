import {assertScheduleWeekOpen} from '../../mission_schedule.v1.js';
// All transaction callbacks are pure: UI/state updates happen only after commit.
export function createCloudStateStore({getUser,transact,onAdopt=()=>{}}){
 const bases=new Map();
 const check=user=>{if(!user||getUser()!==user)throw Error('Sessão alterada. Entre novamente.');};
 const conflict=()=>{throw Error('Os dados mudaram em outra aba ou dispositivo. Reabra o app antes de cadastrar.');};
 function parse(row){if(!row||typeof row.data!=='string')throw Error('Salve e sincronize seus dados antes de cadastrar.');const s=JSON.parse(row.data);if(!Array.isArray(s.tasks))throw Error('Planejamento inválido.');return s;}
 return {
 observe(user,row){check(user);bases.set(user.uid,row?.data??null);},
 async write(user,payload,savedAt){check(user);const expected=bases.get(user.uid);if(expected===undefined)throw Error('Conexão ainda não conferida. Reabra o app.');
  await transact(user,async tx=>{check(user);const row=await tx.get();check(user);if((row?.data??null)!==expected)conflict();
   const next=JSON.parse(payload);for(const [id,r] of Object.entries(row?.aiApplications||{})){if(next.aiAppliedProposals?.[id]!==r.taskId)conflict();}
   tx.set({data:payload,updatedAt:savedAt,revision:(row?.revision||0)+1});
  });check(user);bases.set(user.uid,payload);
 },
 async applyMutation(user,proposalId,mutate,savedAt){check(user);const expected=bases.get(user.uid);if(expected===undefined)throw Error('Reabra o app para conferir a conexão.');
  const result=await transact(user,async tx=>{check(user);const row=await tx.get();check(user);const s=parse(row),receipts=row.aiApplications||{},old=receipts[proposalId];
   if(old)return {payload:row.data,receipt:old,replayed:true};
   if(row.data!==expected)conflict();if(Object.keys(receipts).length>=1000)throw Error('Limite de comprovantes atingido.');
   const receipt=await mutate(s);if(!receipt||receipt.taskId===undefined)throw Error('Cadastro inválido.');receipt.createdAt=savedAt;
   s.aiAppliedProposals={...(s.aiAppliedProposals||{}),[proposalId]:receipt.taskId};s.lastSavedAt=savedAt;s.updatedAt=savedAt;s.lastSaveReason='ai-v2-apply';
   const payload=JSON.stringify(s);tx.set({data:payload,updatedAt:savedAt,revision:(row.revision||0)+1,aiApplications:{...receipts,[proposalId]:receipt}});
   return {payload,receipt,replayed:false};
  });check(user);bases.set(user.uid,result.payload);onAdopt(JSON.parse(result.payload),user.uid,{...result.receipt,proposalId});return result;
 },
 apply(user,proposalId,task,savedAt){return this.applyMutation(user,proposalId,s=>{
  if(task.planningWeekStart)assertScheduleWeekOpen(s,task.planningWeekStart);
  if(s.tasks.some(t=>t.aiV2ProposalId===proposalId))throw Error('Vínculo anterior sem comprovante. Confira a missão antes de continuar.');
  if(s.tasks.some(t=>String(t.id)===String(task.id)))throw Error('ID de missão já utilizado. Nenhum cadastro foi feito.');s.tasks.push(task);return {taskId:task.id};
 },savedAt);}
 };
}
