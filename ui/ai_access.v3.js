import {AI_OWNER_UID} from '../ai/contract.v1.js';
import {V2_MODULES,v2BuildSnapshot,v2Project,v2ValidateChoices} from '../ai/v2/contract.js?v=1.9.75';
export function installAiAccess(window,{document,config,getState,getUser,store,saveConfirmed,render,now=Date.now,newId=()=>crypto.randomUUID()}) {
    let open=false,busy=false,grant=null,preview=null,message='',generation=0,queue=Promise.resolve(),lastContent='',blocked=false;
    let choices={modules:{missions:false,radar:false,studies:false},includeFuture:false};
    const owner=()=>config.enabled===true && getUser()?.uid===AI_OWNER_UID;
    const e=window.escapeHtml;
    async function action(work){if(busy||!owner())return;const gen=generation;busy=true;message='';render();try{await work(gen);}catch(error){if(gen===generation)message=error.message;}finally{if(gen===generation){busy=false;render();}}}
    const isActive=()=>grant?.status==='active' && Date.parse(grant.expiresAt)>now();
    window.resetAiAccess=()=>{generation++;open=false;busy=false;grant=null;preview=null;message='';lastContent='';blocked=false;choices={modules:{missions:false,radar:false,studies:false},includeFuture:false};window.resetAiV2Proposals?.();window.resetLibraryImports?.();window.resetMissionChanges?.();};
    window.refreshAiAccess=async(autoSync=false)=>{if(!owner())return;const gen=generation;try{const g=await store.get();if(gen===generation){grant=g;lastContent='';if(open)render();if(autoSync&&isActive()&&!blocked)await saveConfirmed();}}catch(error){if(gen===generation){message=error.message;if(open)render();}}};
    window.openAiAccess=async()=>{if(!owner())return;open=true;render();await action(async gen=>{const g=await store.get();if(gen===generation){grant=g;preview=null;if(g?.status==='active')choices=structuredClone(g.choices);}});};
    window.closeAiAccess=()=>{open=false;render();};
    window.setAiAccessChoice=(key,checked)=>{if(busy)return;if(V2_MODULES.includes(key)){choices.modules[key]=Boolean(checked);if(!checked){const permission={missions:'allowProposals',radar:'allowRadarProposals',studies:'allowStudyProposals'}[key];if(Object.hasOwn(choices,permission))choices[permission]=false;if(key==='missions'&&Object.hasOwn(choices,'allowMissionChanges'))choices.allowMissionChanges=false;}}else if(key==='includeFuture')choices.includeFuture=Boolean(checked);else if(key==='allowMissionChanges'&&window.missionChangesReady===true)choices[key]=Boolean(checked);else if(key==='allowLibraryProposals'&&window.libraryImportsReady===true)choices[key]=Boolean(checked);else if((key==='allowProposals'&&config.proposalsEnabled===true||['allowRadarProposals','allowStudyProposals'].includes(key)&&config.entitiesEnabled===true))choices[key]=Boolean(checked);preview=null;render();};
    window.previewAiAccess=async()=>action(async gen=>{
        if(config.proposalsEnabled===true&&!Object.hasOwn(choices,'allowProposals'))choices.allowProposals=false;
        if(config.entitiesEnabled===true)for(const key of ['allowRadarProposals','allowStudyProposals'])if(!Object.hasOwn(choices,key))choices[key]=false;
        v2ValidateChoices(choices);
        const state=structuredClone(getState()),draft={grantId:newId(),version:(grant?.version||0)+1,choices:structuredClone(choices),frozenRefs:[]};
        const all=await v2Project(state,{...draft,choices:{...draft.choices,includeFuture:true}});
        if(!draft.choices.includeFuture)draft.frozenRefs=all.map(x=>x.ref);
        await v2BuildSnapshot({...state,lastSavedAt:new Date(now()).toISOString()},draft);
        if(gen===generation)preview={draft,entities:all};
    });
    window.authorizeAiAccess=async()=>action(async gen=>{
        if(!preview)throw Error('Escolha os módulos e confira a prévia primeiro.');
        const draft=preview.draft,g=await store.authorize({grantId:draft.grantId,expectedVersion:grant?.version||0,choices:draft.choices,frozenRefs:draft.frozenRefs});
        if(gen!==generation)return;grant=g;preview=null;lastContent='';blocked=false;
        const saved=await saveConfirmed();if(gen!==generation)return;
        if(!saved)throw Error('Autorização registrada, mas o salvamento na nuvem falhou. Os dados ainda não foram compartilhados.');
        await queue;if(gen===generation&&!blocked)message='Autorização registrada por 30 dias. Confira abaixo a última sincronização.';
    });
    window.revokeAiAccess=async()=>action(async gen=>{if(!grant)return;const g=await store.revoke({grantId:grant.grantId,expectedVersion:grant.version});if(gen===generation){grant=g;preview=null;lastContent='';blocked=true;message='Acesso revogado e cópia compartilhada removida.';}});
    window.syncAiAccess=async()=>action(async gen=>{if(!isActive())throw Error('Autorize o compartilhamento primeiro.');blocked=false;lastContent='';const saved=await saveConfirmed();if(gen!==generation)return;if(!saved)throw Error('Não foi possível confirmar o salvamento na nuvem.');await queue;});
    window.onAiV2Saved=(state,uid)=>{
        if(!owner()||uid!==getUser()?.uid||!isActive()||blocked)return Promise.resolve();
        const gen=generation,authorization=grant.grantId,version=grant.version,snapshot=structuredClone(state);
        queue=queue.catch(()=>{}).then(async()=>{
            if(gen!==generation||!owner()||!isActive()||blocked||grant.grantId!==authorization||grant.version!==version)return;
            try{
                const body=await v2BuildSnapshot(snapshot,grant,grant.projectionVersion||0),content=JSON.stringify(body.entities);
                if(content===lastContent)return;
                const g=await store.publish(body);
                if(gen===generation && grant.grantId===authorization && grant.version===version){grant=g;lastContent=content;message='Dados autorizados sincronizados.';if(open)render();}
            }catch(error){if(gen===generation&&grant?.grantId===authorization&&grant.version===version){message=error.message;blocked=true;if(open)render();}}
        });return queue;
    };
    window.renderAiAccessButton=()=>owner()?'<button type="button" onclick="window.openAiAccess()" class="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800">Configurar acesso da IA</button>':'';
    window.renderAiAccess=()=>{
        if(!open||!owner())return '';const disabled=busy?'disabled':'';
        const status=!grant?'Sem autorização':grant.status==='expired'||Date.parse(grant.expiresAt)<=now()?'Autorização expirada':grant.status==='revoked'?'Acesso revogado':'Acesso autorizado';
        return `<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3"><div id="ai-access-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-access-title" class="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 text-slate-200"><header class="flex justify-between gap-4"><h2 id="ai-access-title" class="text-lg font-semibold">Compartilhamento com a IA</h2><button id="ai-access-close" type="button" onclick="window.closeAiAccess()" aria-label="Fechar compartilhamento">×</button></header>
        <p class="my-3 text-xs text-indigo-200">Consultas de missões, RADAR e estudos disponíveis na <a href="https://missao-tatica-conexao.victorduarteferreira.chatgpt.site" target="_blank" rel="noopener noreferrer" class="underline">conexão privada do ChatGPT</a>. Propostas de novas missões disponíveis com permissão específica abaixo. ${config.applyEnabled===true?config.entitiesEnabled===true?'Revise propostas de missões, RADAR e planos de estudo na fila do app.':'Revise e cadastre as propostas na fila do app. Criação de planos de estudos fica para a próxima entrega.':'O cadastro definitivo e a criação de planos de estudos serão liberados nas próximas entregas.'}</p><p class="my-3 text-sm">Escolha os dados que a IA poderá consultar por 30 dias. Você pode revogar antes. Novos planos e alterações propostas continuarão passando pela sua revisão.</p>
        <p class="text-sm">${e(status)}${grant?' · Prazo: '+e(grant.expiresAt):''}</p><p class="mb-4 text-xs text-slate-400">Última sincronização: ${e(grant?.syncedAt||'Nenhuma')}. Com o app fechado, a IA consulta a última cópia. Campos ausentes não significam tempo livre.</p>
        <div class="space-y-3">${[['missions','Todas as missões, de todas as categorias'],['radar','Todas as demandas do RADAR'],['studies','Estudos do módulo Inteligência: planos e progresso']].map(([k,label])=>`<label class="flex min-h-10 gap-2 items-center"><input type="checkbox" ${disabled} ${choices.modules[k]?'checked':''} onchange="window.setAiAccessChoice('${k}',this.checked)">${label}</label>`).join('')}
        <label class="flex min-h-10 gap-2 items-center"><input type="checkbox" ${disabled} ${choices.includeFuture?'checked':''} onchange="window.setAiAccessChoice('includeFuture',this.checked)">Incluir novos registros dos módulos escolhidos</label></div>
        ${config.proposalsEnabled===true?`<label class="my-3 flex min-h-10 gap-2 items-center"><input type="checkbox" ${busy||!choices.modules.missions?'disabled':''} ${choices.allowProposals?'checked':''} onchange="window.setAiAccessChoice('allowProposals',this.checked)">Permitir propostas de novas missões para revisão</label><p class="text-xs text-slate-400">Recebe propostas sem publicar a semana. Cada envio precisa da sua confirmação no chat. Horários e duplicidades ainda precisam ser conferidos; ${config.applyEnabled===true?'o cadastro é confirmado pelo aplicativo após salvar na nuvem.':'o cadastro definitivo será liberado na próxima etapa.'} Alterar a autorização exige reativar a conexão privada.</p>`:''}
        <p class="my-3 text-xs text-slate-400">Compartilha títulos, estados, horários e informações de planejamento. Estudos incluem metas e progresso agregado. Finanças, saúde, notas livres, anexos e eventos externos não convertidos ficam fora.</p>
        ${config.entitiesEnabled===true?[['allowRadarProposals','radar','Permitir propostas de criação e alteração no RADAR'],['allowStudyProposals','studies','Permitir propostas de planos semanais de estudo']].map(([key,module,label])=>`<label class="my-3 flex min-h-10 gap-2 items-center"><input type="checkbox" ${busy||!choices.modules[module]?'disabled':''} ${choices[key]?'checked':''} onchange="window.setAiAccessChoice('${key}',this.checked)">${label}</label>`).join('')+'<p class="text-xs text-slate-400">Cada operação será revisada no app antes de salvar. Finanças e Corpo permanecem manuais.</p>':''}
        ${window.missionChangesReady===true||Object.hasOwn(choices,'allowMissionChanges')?`<label class="my-3 flex min-h-11 items-center gap-2"><input id="ai-mission-change-permission" type="checkbox" ${busy||!choices.modules.missions?'disabled':''} ${choices.allowMissionChanges?'checked':''} onchange="window.setAiAccessChoice('allowMissionChanges',this.checked)">Permitir propostas de alteração em missões existentes</label><p class="text-xs text-slate-400">Reagendamento, título, duração, horário, prioridade e subtarefas. Cada mudança exige revisão no app. Não conclui nem exclui missões. Ao alterar a autorização, reative consultas e envio na conexão privada.</p>`:''}
        ${window.libraryImportsReady===true||Object.hasOwn(choices,'allowLibraryProposals')?`<label class="my-3 flex min-h-11 items-center gap-2"><input id="ai-library-permission" type="checkbox" ${disabled} ${choices.allowLibraryProposals?'checked':''} onchange="window.setAiAccessChoice('allowLibraryProposals',this.checked)">Permitir propostas de catálogo para a Biblioteca</label><p class="text-xs text-slate-400">Permite receber livros da planilha para revisão. Sua estante, anotações e histórico não serão compartilhados por esta autorização. Revise em Biblioteca → Importar com IA. Uma nova autorização exige reativar consultas e envio na conexão privada.</p>`:''}
        <button type="button" ${disabled} onclick="window.previewAiAccess()" class="my-3 rounded-lg border border-slate-600 px-3 py-2">Conferir prévia</button>
        ${preview?`<div class="rounded-lg border border-slate-700 p-3"><p class="text-sm">${preview.entities.length} registros · ${preview.draft.choices.includeFuture?'Inclui novos registros':'Somente registros selecionados agora'}</p><pre class="my-3 max-h-60 overflow-auto whitespace-pre-wrap text-xs">${e(JSON.stringify(preview.entities,null,2))}</pre><button type="button" ${disabled} onclick="window.authorizeAiAccess()" class="rounded-lg bg-indigo-600 px-3 py-2">Autorizar por 30 dias</button></div>`:''}
        ${isActive()?`<button type="button" ${disabled} onclick="window.syncAiAccess()" class="my-3 rounded-lg border border-slate-600 px-3 py-2">Salvar e sincronizar agora</button>`:''}
        ${grant?.status==='active'?`<button type="button" ${disabled} onclick="window.revokeAiAccess()" class="m-3 text-rose-300">Revogar acesso</button>`:''}
        ${busy||message?`<p role="status" aria-live="polite" class="mt-3 text-sm text-indigo-200">${e(busy?'Aguarde…':message)}</p>`:''}</div></div>`;
    };
    window.bindAiAccess=root=>{if(open&&owner())window.bindFormDialog(root,{id:'ai-access-dialog',initialFocus:'ai-access-close',close:window.closeAiAccess,blocked:false});};
}
