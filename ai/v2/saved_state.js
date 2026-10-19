// Serializes writes within this browser session; does not claim cross-device isolation.
export function createConfirmedStateWriter({getUser,writeAccount,writeSnapshot,onSaved=()=>{},onStatus=()=>{},onError=()=>{}}) {
    let tail=Promise.resolve();
    function write(user,state){
        if(!user || getUser()!==user)return Promise.resolve(false);
        let payload;try{payload=JSON.stringify(state);}catch(error){onStatus('Erro ao salvar');onError(error);return Promise.resolve(false);}
        const savedAt=state.lastSavedAt||state.updatedAt||'';
        const work=async()=>{
            if(getUser()!==user)return false;
            try{
                onStatus('Salvando...');await writeAccount(user);
                if(getUser()!==user)return false;
                await writeSnapshot(user,payload,savedAt);
                if(getUser()!==user)return false;
                onStatus('Salvo na nuvem');
                // A bridge failure must not turn a confirmed Firebase write into a failed write.
                try{Promise.resolve(onSaved(JSON.parse(payload),user.uid)).catch(onError);}catch(error){onError(error);}
                return true;
            }catch(error){if(getUser()===user)onStatus('Erro ao salvar');onError(error,user);return false;}
        };
        const result=tail.then(work,work);tail=result.catch(()=>{});return result;
    }
    write.exclusive=function(work){const result=tail.then(work,work);tail=result.catch(()=>{});return result;};
    // A stalled request from a logged-out session must not block a new account.
    // Existing jobs keep their original user reference and fail their session checks.
    write.reset = () => { tail = Promise.resolve(); };
    return write;
}
