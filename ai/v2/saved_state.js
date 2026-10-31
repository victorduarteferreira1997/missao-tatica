// Session-local serialization. Background snapshots can replace only a waiting
// background job, never an explicit save or an exclusive AI transaction.
export function createConfirmedStateWriter({getUser,writeAccount,writeSnapshot,onSaved=()=>{},onStatus=()=>{},onError=()=>{}}) {
 let tail=Promise.resolve(),background=null,account=null,accountSignature='',epoch=0;
 function write(user,state,{background:mergeable=false}={}) {
  const generation=epoch,valid=()=>getUser()===user&&epoch===generation;
  if(!user||!valid())return Promise.resolve(false);
  let payload;try{payload=JSON.stringify(state);}catch(error){onStatus('Erro ao salvar');onError(error);return Promise.resolve(false);}
  const savedAt=state.lastSavedAt||state.updatedAt||'';
  if(mergeable&&background&&!background.started&&background.user===user&&background.generation===generation){background.payload=payload;background.savedAt=savedAt;return background.result;}
  const job={user,generation,payload,savedAt,started:false,result:null};
  background=mergeable?job:null;
  const work=async()=>{
   job.started=true;if(background===job)background=null;if(!valid())return false;
   try{
    onStatus('Salvando...');
    const signature=JSON.stringify([user.uid,user.email||'',user.displayName||'']);
    if(account!==user||accountSignature!==signature){await writeAccount(user);if(!valid())return false;account=user;accountSignature=signature;}
    await writeSnapshot(user,job.payload,job.savedAt);if(!valid())return false;
    onStatus('Salvo na nuvem');
    try{Promise.resolve(onSaved(JSON.parse(job.payload),user.uid)).catch(onError);}catch(error){onError(error);}
    return true;
   }catch(error){if(valid()){onStatus('Erro ao salvar');onError(error,user);}return false;}
  };
  job.result=tail.then(work,work);tail=job.result.catch(()=>{});return job.result;
 }
 write.exclusive=function(work){background=null;const generation=epoch;const run=()=>{if(epoch!==generation)throw Error('Sessão alterada. Entre novamente.');return work();};const result=tail.then(run,run);tail=result.catch(()=>{});return result;};
 write.reset=()=>{epoch++;background=null;account=null;accountSignature='';tail=Promise.resolve();};
 return write;
}
