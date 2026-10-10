import { buildContext,validateProposal,proposalFormFields,isShareableMission,DAYS,AI_OWNER_UID } from '../ai/contract.v1.js';

// Opt-in UI: state/main is never sent to the bridge. Accepting opens the existing form.
export function installAiInbox(window,{document,config,getState,getUser,getWeek,store,render,now = Date.now,newRevision = () => crypto.randomUUID()}) {
    let open = false, selected = new Set(), preview = null, inbox = [], draft = null;
    let busy = false, message = '', generation = 0, contextOpen = false, showCompleted = false;
    const enabled = () => config.enabled === true;
    const owner = () => enabled() && getUser()?.uid === AI_OWNER_UID;
    const tasks = () => Array.isArray(getState()?.tasks) ? getState().tasks : [];
    const duplicate = id => tasks().some(t => t.aiProposalId === id);
    const candidates = () => tasks().filter(t => isShareableMission(t,getWeek()));
    const e = value => window.escapeHtml(value);
    function requireOwner() { if (!owner()) throw new Error('Entre com a conta autorizada.'); }
    function alert(error) { window.showAlertModal(error.message || 'Não foi possível concluir a ação.'); }
    async function action(work) {
        if (busy) return;
        const current = generation;
        try { requireOwner(); busy = true; message = ''; render(); await work(current); }
        catch (error) { if (current === generation) message = error.message; }
        finally { if (current === generation) { busy = false; render(); } }
    }
    window.resetAiInbox = function() {
        generation++; if (draft) { window.__aiCloseCreate?.(); }
        open = false; selected.clear(); preview = null; inbox = []; draft = null; busy = false; message = ''; contextOpen = false; showCompleted = false;
    };
    window.openAiInbox = async function() {
        if (!enabled()) return;
        try { requireOwner(); } catch (error) { alert(error); return; }
        open = true; selected.clear(); preview = null; message = ''; contextOpen = false; showCompleted = false; render();
        await window.refreshAiInbox();
    };
    window.closeAiInbox = function() { open = false; render(); };
    window.toggleAiContext = function() { if (busy) return; contextOpen = !contextOpen; render(); };
    window.setAiShowCompleted = function(checked) {
        if (busy) return;
        showCompleted = Boolean(checked);
        if (!showCompleted) {
            for (const task of candidates()) if (task.completed) selected.delete(String(task.id));
            preview = null;
        }
        render();
    };
    window.selectAiMission = function(index,checked) {
        if (busy) return;
        const task = candidates()[index]; if (!task || (task.completed && !showCompleted)) return;
        if (checked) selected.add(String(task.id)); else selected.delete(String(task.id));
        preview = null; message = ''; render();
    };
    window.previewAiContext = function() {
        try {
            requireOwner();
            if (!showCompleted) for (const task of candidates()) if (task.completed) selected.delete(String(task.id));
            preview = buildContext(getState(),[...selected],{weekStart:getWeek(),revision:newRevision(),now:now()}); message = ''; render();
        }
        catch (error) { alert(error); }
    };
    window.publishAiContext = async function() {
        await action(async current => {
            if (!preview || preview.weekStart !== getWeek()) throw new Error('Revise a prévia da semana antes de compartilhar.');
            // Freeze precisely the reviewed data, even if another tab subsequently changes state.
            await store.publish(preview);
            if (current === generation) message = 'Contexto compartilhado por até 24 horas. Atualizações exigem uma nova publicação.';
        });
    };
    window.revokeAiContext = async function() {
        await action(async current => { await store.revoke(getWeek()); if (current === generation) { preview = null; message = 'Contexto desta semana removido. Propostas já recebidas continuam para revisão.'; } });
    };
    window.refreshAiInbox = async function() {
        await action(async current => { const items = await store.pending(); if (current === generation) inbox = items; });
    };
    window.rejectAiProposal = async function(index) {
        await action(async current => {
            const item = inbox[index]; if (!item) throw new Error('Atualize a caixa de entrada.');
            await store.review(item.id,'rejected');
            if (current === generation) { inbox = inbox.filter(i => i.id !== item.id); message = 'Proposta recusada.'; }
        });
    };
    window.reviewAiProposal = async function(index) {
        await action(async current => {
            const selectedItem = inbox[index]; if (!selectedItem) throw new Error('Atualize a caixa de entrada.');
            const items = await store.pending(); if (current !== generation) return;
            inbox = items;
            const item = items.find(i => i.id === selectedItem.id);
            if (!item) throw new Error('Essa proposta já foi revisada.');
            const p = validateProposal(item.proposal);
            if (p.weekStart !== getWeek()) throw new Error('Abra no planejamento a semana '+p.weekStart+' antes de revisar.');
            if (duplicate(item.id)) throw new Error('Essa proposta já tem uma missão no app. Ela não será criada novamente.');
            draft = {...item,proposal:p}; open = false;
            window.__aiOpenCreate({...proposalFormFields(p), 'ct-category': ''});
            message = '';
        });
    };
    window.hasAiDraft = () => Boolean(draft);
    window.clearAiDraft = function({returnToInbox = false} = {}) {
        const hadDraft = Boolean(draft); draft = null;
        if (hadDraft && returnToInbox && owner()) { open = true; contextOpen = false; message = 'Proposta ainda pendente. Nenhuma missão foi criada.'; }
    };
    window.aiDraftBeforeSave = function() {
        if (!draft) return true;
        try {
            requireOwner();
            if (draft.proposal.weekStart !== getWeek()) throw new Error('A semana mudou. Cancele e reabra a proposta.');
            if (duplicate(draft.id)) throw new Error('Essa proposta já foi incorporada.');
            const category = document.getElementById('ct-category');
            if (!window.getTaskCategories().some(c => c.id === category?.value)) {
                category?.focus?.();
                throw new Error('Escolha a categoria desta missão antes de cadastrar.');
            }
            if (DAYS.some(day => document.getElementById('ct-repeat-'+day)?.checked)) throw new Error('Nesta etapa, cada proposta cria uma única missão.');
            return true;
        } catch (error) { alert(error); return false; }
    };
    window.aiDraftMetadata = function() { return draft ? {aiProposalId:draft.id} : {}; };
    window.aiDraftAfterSave = async function() {
        const item = draft; draft = null;
        if (!item || !owner()) return;
        open = true; contextOpen = false; preview = null;
        await action(async current => {
            try {
                await store.review(item.id,'accepted');
                if (current === generation) { inbox = inbox.filter(i => i.id !== item.id); message = 'Missão cadastrada. Revise a próxima proposta.'; }
            } catch {
                if (current === generation) message = 'A missão foi cadastrada, mas a confirmação na integração falhou. Use “Atualizar confirmação”; não cadastre novamente.';
            }
        });
    };
    window.retryAiProposalConfirmation = async function(index) {
        await action(async current => {
            const item = inbox[index];
            if (!item || !duplicate(item.id)) throw new Error('Atualize a caixa de entrada.');
            await store.review(item.id,'accepted');
            if (current === generation) { inbox = inbox.filter(i => i.id !== item.id); message = 'Cadastro confirmado na integração.'; }
        });
    };
    window.renderAiInboxButton = function() {
        return enabled() ? '<button type="button" onclick="window.openAiInbox()" class="text-xs text-slate-500 hover:text-indigo-300 font-bold uppercase tracking-widest transition-colors font-mono flex items-center gap-1">Integração com IA</button>' : '';
    };
    window.renderAiDraftNotice = function() {
        return draft ? '<p class="rounded-lg border border-indigo-800 bg-indigo-950/40 p-3 text-xs text-indigo-200">Proposta da IA. Revise os campos e o impacto calculado pelo app antes de criar a missão.</p>' : '';
    };
    window.renderAiInbox = function() {
        if (!enabled() || !open || !owner()) return '';
        const disabled = busy ? 'disabled' : '';
        const shareable = candidates();
        const pendingCount = inbox.filter(item => !duplicate(item.id)).length;
        const missionRows = shareable.map((t,i) => ({t,i})).filter(({t}) => showCompleted || !t.completed);
        return `<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm font-sans"><div id="ai-inbox-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-inbox-title" class="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <header class="flex items-start justify-between gap-4 border-b border-slate-800 p-5"><div><h2 id="ai-inbox-title" class="text-lg font-semibold text-slate-100">Integração com IA</h2><p class="mt-1 text-sm text-slate-400">Revise propostas da IA. Compartilhar missões é uma ação separada.</p></div><button id="ai-inbox-close" type="button" aria-label="Fechar integração com IA" onclick="window.closeAiInbox()" class="p-2 text-slate-300">×</button></header>
            <div class="overflow-y-auto p-5 space-y-5">
            <section id="ai-proposals-panel" class="space-y-3"><div class="flex items-center justify-between gap-3"><h3 class="text-sm font-semibold text-slate-100">Propostas pendentes · ${pendingCount}</h3><button type="button" ${disabled} onclick="window.refreshAiInbox()" class="min-h-10 px-2 text-sm text-indigo-300">Atualizar</button></div>
            <p class="text-xs text-slate-400">Entradas da IA que ainda precisam da sua aprovação. Depois do cadastro, a missão fica no planejamento do aplicativo.</p>
            ${inbox.map((item,i) => `<article class="rounded-xl border border-slate-700 p-4"><h4 class="text-sm text-slate-100">${e(item.proposal.title)}</h4><p class="mt-1 text-xs text-slate-400">${e(item.proposal.weekStart)} · ${e(item.proposal.day)} · ${item.proposal.durationMinutes} min · ${e(item.proposal.startTime || 'Sem horário')}</p><ul class="mt-2 text-xs text-slate-400">${item.proposal.subtasks.map(s => '<li>'+e(s)+'</li>').join('')}</ul>
            ${duplicate(item.id) ? `<p class="mt-3 text-xs text-amber-200">Já cadastrada no aplicativo. Falta confirmar o recebimento na integração; nenhuma nova missão será criada.</p><button type="button" ${disabled} onclick="window.retryAiProposalConfirmation(${i})" class="mt-2 min-h-10 text-sm text-indigo-300">Atualizar confirmação</button>` : `<div class="mt-3 flex gap-3"><button type="button" ${disabled} onclick="window.reviewAiProposal(${i})" class="min-h-10 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white">Revisar no formulário</button><button type="button" ${disabled} onclick="window.rejectAiProposal(${i})" class="min-h-10 text-sm text-slate-400">Recusar</button></div>`}</article>`).join('') || '<p class="text-sm text-slate-500">Nenhuma proposta pendente.</p>'}</section>
            <section class="space-y-3 border-t border-slate-800 pt-4"><button type="button" ${disabled} aria-expanded="${contextOpen}" aria-controls="ai-context-panel" onclick="window.toggleAiContext()" class="flex min-h-10 w-full items-center justify-between gap-3 text-left text-sm font-semibold text-slate-100"><span>Compartilhar missões com a IA · ${e(getWeek())}</span><span aria-hidden="true">${contextOpen ? '−' : '+'}</span></button>
            <p class="text-xs text-slate-400">Opcional: escolher o que a IA pode consultar. Esta lista não é uma fila de cadastro.</p>
            ${contextOpen ? `<div id="ai-context-panel" class="space-y-3"><p class="text-xs text-slate-400">As missões abaixo já estão no aplicativo. As caixas selecionam o contexto a compartilhar, não criam missões. Nada é enviado até você revisar a prévia e confirmar.</p>
            <p class="text-xs text-slate-400">Você escolhe os títulos, dias, horários, durações e status compartilhados. Estudos e compromissos externos não entram; a seleção não representa sua disponibilidade completa.</p>
            <label class="flex min-h-10 items-center gap-2 text-xs text-slate-300"><input type="checkbox" ${disabled} ${showCompleted ? 'checked' : ''} onchange="window.setAiShowCompleted(this.checked)" class="accent-indigo-500">Mostrar missões concluídas (${shareable.filter(t => t.completed).length})</label>
            ${missionRows.map(({t,i}) => `<label class="flex items-start gap-3 rounded-lg border border-slate-800 p-3 text-sm text-slate-300"><input type="checkbox" ${disabled} ${selected.has(String(t.id)) ? 'checked' : ''} onchange="window.selectAiMission(${i},this.checked)" class="mt-1 accent-indigo-500"><span>${e(t.text)}<span class="block text-xs text-slate-500">${e(t.day)} · ${e(t.time || '30 min')} · ${e(t.startTime || 'Sem horário')} · ${t.completed ? 'Concluída' : 'Não concluída'}</span></span></label>`).join('') || '<p class="text-sm text-slate-500">Nenhuma missão não concluída para compartilhar.</p>'}
            <button type="button" ${disabled} onclick="window.previewAiContext()" class="min-h-10 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300">Ver exatamente o que será compartilhado</button>
            ${preview ? `<pre class="max-h-56 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300 whitespace-pre-wrap">${e(JSON.stringify(preview,null,2))}</pre><button type="button" ${disabled} onclick="window.publishAiContext()" class="min-h-10 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white">Compartilhar esta prévia</button>` : ''}
            <button type="button" ${disabled} onclick="window.revokeAiContext()" class="min-h-10 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-400">Remover contexto desta semana</button></div>` : ''}</section>
            </div>${busy || message ? `<p role="status" aria-live="polite" class="shrink-0 border-t border-slate-800 px-5 py-3 text-sm text-indigo-200">${e(busy ? 'Aguarde…' : message)}</p>` : ''}</div></div>`;
    };
    window.bindAiInbox = function(root) {
        if (open && enabled()) window.bindFormDialog(root,{id:'ai-inbox-dialog',initialFocus:'ai-inbox-close',close:window.closeAiInbox,blocked:false});
    };
    return { reset:window.resetAiInbox };
}

