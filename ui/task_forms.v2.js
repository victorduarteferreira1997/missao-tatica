// Interface v2 das janelas de missão e demanda.
// Estado consultado por getters: login e importação podem substituir os objetos do app.
// Os handlers globais são mantidos como ponte; gravação e regras permanecem no app.
// Depois de validado, este arquivo é imutável para preservar prévias anteriores.
export function installTaskForms(window, { daysOfWeek, getState, getUiState }) {
        window.renderEditTaskModal = function(task) {
            const rawTime = parseInt(String(task.time || '30').replace(/[^0-9]/g, ''), 10) || 30;
            const nature = window.getTaskNature(task);
            const recurrence = Array.isArray(task.recurrenceDays) ? task.recurrenceDays : [];
            const fieldClass = window.formDialogStyles.fieldMinWidth;
            const labelClass = window.formDialogStyles.label;
            const summaryClass = window.formDialogStyles.summary;
            return window.renderFormDialog({
                id: 'edit-task-dialog', titleId: 'et-dialog-title', title: 'Editar missão',
                description: 'Ajuste o que precisa e salve as alterações.', closeLabel: 'Fechar edição de missão',
                closeHandler: 'closeEditTaskModal', submitHandler: 'saveEditedTask',
                body: `
                            <div><label for="et-text" class="${labelClass}">O que você vai fazer? <span class="ml-2 text-xs font-normal text-slate-400">Obrigatório</span></label><input id="et-text" type="text" value="${window.escapeHtml(task.text || '')}" ${task.sanitizedOrigin === 'coaktion' ? 'readonly' : ''} aria-describedby="et-title-error" oninput="this.removeAttribute('aria-invalid'); document.getElementById('et-title-error').classList.add('hidden')" class="${fieldClass}"><p id="et-title-error" role="alert" class="hidden mt-1.5 text-xs text-red-300">Dê um nome à missão para continuar.</p></div>
                            <div class="grid grid-cols-2 gap-3">
                                <div><label for="et-activity-type" class="${labelClass}">Atividade</label><select id="et-activity-type" data-all-day="${Boolean(task.googleCalendarAllDay)}" ${task.sanitizedOrigin === 'coaktion' ? 'disabled' : ''} onchange="window.handleActivityTypeChange('et')" class="${fieldClass}"><option value="task" ${task.activityType !== 'meeting' ? 'selected' : ''}>Tarefa</option><option value="meeting" ${task.activityType === 'meeting' ? 'selected' : ''}>Reunião</option></select></div>
                                <div><label for="et-day" class="${labelClass}">Dia</label><select id="et-day" ${task.googleCalendarSource === 'primary' ? 'disabled' : ''} class="${fieldClass}">${daysOfWeek.map(d => `<option value="${d.id}" ${d.id === task.day ? 'selected' : ''}>${d.label}</option>`).join('')}</select></div>
                                <div><label for="et-category" class="${labelClass}">Categoria</label><select id="et-category" class="${fieldClass}">${window.getTaskCategories().map(cat => `<option value="${window.escapeHtml(cat.id)}" ${cat.id === task.category ? 'selected' : ''}>${window.escapeHtml(cat.label)}</option>`).join('')}</select></div>
                            </div>
                            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                <div class="col-span-2 sm:col-span-1"><label for="et-nature" class="${labelClass}">Impacto</label><select id="et-nature" onchange="window.handleTaskNatureChange('et')" class="${fieldClass}"><option value="normal" ${nature === 'normal' ? 'selected' : ''}>Normal</option><option value="neutral" ${nature === 'neutral' ? 'selected' : ''}>Logística</option><option value="recharge" ${nature === 'recharge' ? 'selected' : ''}>Recarga</option></select></div>
                                <div><label for="et-priority" class="${labelClass}">Prioridade</label><select id="et-priority" onchange="window.updateEditPreviewCalc()" class="${fieldClass}">${[['essencial', 'Essencial'], ['alta', 'Alta'], ['media', 'Média'], ['baixa', 'Baixa']].map(([value, label]) => `<option value="${value}" ${value === (task.priority || 'media') ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
                                <div><label for="et-time" class="${labelClass}">Duração <span class="text-xs font-normal text-slate-400">(min)</span></label><input id="et-time" type="number" value="${rawTime}" step="15" oninput="window.updateEditPreviewCalc()" class="${fieldClass}"></div>
                            </div>
                            <input type="hidden" id="et-impact-type" value="${nature === 'recharge' ? 'recharge' : 'drain'}">
                            <p id="et-nature-summary" class="text-xs leading-relaxed text-slate-400"></p>
                            <div class="divide-y divide-slate-800 border-t border-slate-800">
                                <details data-edit-section="schedule" ${task.startTime || task.endTime ? 'open' : ''}>
                                    <summary class="${summaryClass}"><span>Definir horário</span><i data-lucide="chevron-down" class="h-4 w-4 text-slate-400"></i></summary>
                                    <div class="grid grid-cols-2 gap-x-3 gap-y-2 pt-2 pb-4"><div><label for="et-start-time" class="${labelClass}">Início</label><input id="et-start-time" type="time" ${task.googleCalendarSource === 'primary' ? 'readonly' : ''} value="${window.escapeHtml(task.startTime || '')}" class="${fieldClass}"></div><div><label for="et-end-time" class="${labelClass}">Fim</label><input id="et-end-time" type="time" ${task.googleCalendarSource === 'primary' ? 'readonly' : ''} value="${window.escapeHtml(task.endTime || '')}" class="${fieldClass}"></div><p class="col-span-2 text-xs leading-relaxed text-slate-400">${task.googleCalendarSource === 'primary' ? 'Horários gerenciados no Google Agenda. Altere o evento lá e sincronize aqui.' : 'Reuniões precisam de início e fim. Tarefas podem ficar sem horário.'}</p></div>
                                </details>
                                <details data-edit-section="recurrence" ${task.googleCalendarSource === 'primary' ? 'class="hidden" ' : ''}${recurrence.length ? 'open' : ''}>
                                    <summary class="${summaryClass}"><span>Repetir durante a semana${recurrence.length ? ` · ${recurrence.length} dias` : ''}</span><i data-lucide="chevron-down" class="h-4 w-4 text-slate-400"></i></summary>
                                    <div class="pt-2 pb-4 space-y-3"><div class="grid grid-cols-2 sm:grid-cols-4 gap-2">${daysOfWeek.map(d => `<label for="et-repeat-${d.id}" class="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-slate-300 hover:border-indigo-400"><input id="et-repeat-${d.id}" type="checkbox" class="accent-indigo-500" ${recurrence.includes(d.id) ? 'checked' : ''}>${d.label}</label>`).join('')}</div><div class="flex gap-4"><button type="button" onclick="window.setEditTaskRecurrence('all')" class="text-xs text-indigo-300 hover:text-indigo-200">Todos os dias</button><button type="button" onclick="window.setEditTaskRecurrence('clear')" class="text-xs text-slate-400 hover:text-slate-200">Limpar seleção</button></div><p class="text-xs leading-relaxed text-slate-400">Ao salvar, as alterações se aplicam aos dias selecionados. Sem seleção, esta missão deixa de se repetir.</p></div>
                                </details>
                                <details data-edit-section="effort" id="et-effort-panel">
                                    <summary class="${summaryClass}"><span>Ajustar dificuldade</span><i data-lucide="chevron-down" class="h-4 w-4 text-slate-400"></i></summary>
                                    <div class="pt-2 pb-4"><label for="et-complexity" class="${labelClass}">Dificuldade de 1 a 5</label><input id="et-complexity" type="number" min="1" max="5" value="${task.complexity || 2}" oninput="window.updateEditPreviewCalc()" class="${fieldClass} max-w-24"><p class="mt-2 text-xs leading-relaxed text-slate-400">1 é simples; 5 exige muito esforço.</p></div>
                                </details>
                            </div>
                            ${task.completed ? `<p class="rounded-lg border border-amber-900/50 bg-amber-950/20 p-3 text-xs leading-relaxed text-amber-200">Esta missão já foi concluída. Editar não recalcula as recompensas já recebidas.</p>` : ''}`,
                footer: `
                            <div class="mb-3 flex flex-wrap items-center gap-2 text-xs"><span class="mr-auto text-slate-400">Impacto estimado</span><span id="et-xp-preview" class="rounded bg-indigo-950 px-2 py-1 text-indigo-200">+${task.xp || 0} XP</span><span id="et-hp-preview" class="rounded bg-slate-800 px-2 py-1 text-slate-300">${task.energyCost < 0 ? '+' : '-'}${Math.abs(task.energyCost || 0)} HP</span></div>
                            <div class="flex justify-end gap-2"><button type="button" onclick="window.closeEditTaskModal()" class="min-h-10 rounded-lg px-4 text-sm font-medium text-slate-300 hover:bg-slate-800">Cancelar</button><button type="submit" class="min-h-10 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">Salvar alterações</button></div>`
            });
        };

        window.bindEditTaskDialog = function(root) {
            const uiState = getUiState();
            window.bindFormDialog(root, {
                id: 'edit-task-dialog', initialFocus: 'et-text', close: () => window.closeEditTaskModal(),
                blocked: uiState.alert.show || uiState.confirm.show,
                prepare: () => { window.updateTaskNatureButtons('et'); window.updateEditPreviewCalc(); window.handleActivityTypeChange('et'); }
            });
        };

        window.renderOperationalDemandModal = function() {
            const uiState = getUiState();
            const demand = uiState.editingOperationalDemandId !== null ? window.getOperationalDemand(uiState.editingOperationalDemandId) : null;
            const status = demand?.workflowStatus || 'active';
            const attention = demand?.attentionLevel || 'controlled';
            const source = demand?.source || 'manual';
            const fieldClass = window.formDialogStyles.fieldMinWidth;
            const input = (id, label, value = '', type = 'text', placeholder = '') => `<div class="min-w-0"><label for="${id}" class="block text-sm font-medium text-slate-300">${label}</label><input id="${id}" type="${type}" value="${window.escapeHtml(value)}" placeholder="${placeholder}" class="${fieldClass}"></div>`;
            const options = (values, selected) => values.map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
            return window.renderFormDialog({
                id: 'operational-demand-dialog', titleId: 'op-demand-dialog-title', title: demand ? 'Editar demanda' : 'Nova demanda',
                description: 'Registre o assunto e o próximo passo para avançar.', closeLabel: 'Fechar demanda',
                closeHandler: 'closeOperationalDemandModal', submitHandler: 'saveOperationalDemand',
                layer: 'z-[80]', footerClass: window.formDialogStyles.compactFooter,
                body: `
                            <div><label for="op-demand-title" class="block text-sm font-medium text-slate-300">Qual assunto precisa de acompanhamento? <span class="ml-2 text-xs font-normal text-slate-400">Obrigatório</span></label><input id="op-demand-title" type="text" value="${window.escapeHtml(demand?.title || '')}" placeholder="Ex.: Avaliação de segurança do cliente" aria-describedby="op-demand-title-error" oninput="this.removeAttribute('aria-invalid'); document.getElementById('op-demand-title-error').classList.add('hidden')" class="${fieldClass}"><p id="op-demand-title-error" role="alert" class="hidden mt-1.5 text-xs text-red-300">Dê um nome à demanda para continuar.</p></div>
                            <div><label for="op-demand-next-action" class="block text-sm font-medium text-slate-300">Próxima ação</label><textarea id="op-demand-next-action" rows="2" placeholder="Ex.: Revisar a documentação recebida" class="${fieldClass} resize-y">${window.escapeHtml(demand?.nextAction || '')}</textarea></div>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div><label for="op-demand-status" class="block text-sm font-medium text-slate-300">Status</label><select id="op-demand-status" onchange="window.syncOperationalWaitingFields()" class="${fieldClass}">${options([['active', 'Ativa'], ['waiting', 'Aguardando retorno'], ['backlog', 'Para depois'], ...(status === 'closed' ? [['closed', 'Encerrada']] : [])], status)}</select></div>
                                <div><label for="op-demand-attention" class="block text-sm font-medium text-slate-300">Atenção</label><select id="op-demand-attention" class="${fieldClass}">${options([['controlled', 'Sob controle'], ['attention', 'Atenção'], ['immediate', 'Ação imediata']], attention)}</select></div>
                            </div>
                            <div id="op-waiting-fields" class="${status === 'waiting' ? '' : 'hidden'} rounded-lg border border-amber-900/50 bg-amber-950/20 p-3 space-y-3">
                                ${input('op-demand-waiting-for', 'De quem você aguarda retorno?', demand?.waitingFor || '', 'text', 'Pessoa, área ou fornecedor')}
                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${input('op-demand-waiting-since', 'Aguardando desde', demand?.waitingSince || '', 'date')}${input('op-demand-followup', 'Quando cobrar retorno?', demand?.followUpAt || '', 'date')}</div>
                            </div>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${input('op-demand-due-date', 'Prazo final', demand?.dueDate || '', 'date')}${input('op-demand-review-date', 'Próxima revisão', demand?.nextReviewAt || '', 'date')}</div>
                            <details data-demand-section="context" class="border-t border-slate-800">
                                <summary class="list-none flex min-h-11 cursor-pointer items-center justify-between gap-3 py-2 text-sm text-slate-300 hover:text-white"><span>Pessoas e contexto</span><i data-lucide="chevron-down" class="h-4 w-4"></i></summary>
                                <div class="pt-2 pb-2 space-y-4">
                                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${input('op-demand-area', 'Área', demand?.area || '', 'text', 'Ex.: Segurança da Informação')}${input('op-demand-project', 'Projeto ou cliente', demand?.project || '', 'text', 'Ex.: Cliente X')}</div>
                                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${input('op-demand-owner', 'Responsável', demand?.owner || window.getUserDisplayName?.() || '')}${input('op-demand-requester', 'Solicitante', demand?.requester || '')}</div>
                                    <div><label for="op-demand-source" class="block text-sm font-medium text-slate-300">Origem</label><select id="op-demand-source" class="${fieldClass}">${options([['manual', 'Registro manual'], ['slack', 'Slack'], ['email', 'E-mail'], ['calendar', 'Calendário'], ['meeting', 'Reunião ou anotação'], ['verbal', 'Compromisso verbal'], ['other', 'Outra']], source)}</select></div>
                                </div>
                            </details>`,
                footer: `
                            <button type="button" onclick="window.closeOperationalDemandModal()" class="min-h-10 rounded-lg px-4 text-sm font-medium text-slate-300 hover:bg-slate-800">Cancelar</button>
                            <button type="submit" class="min-h-10 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">${demand ? 'Salvar alterações' : 'Criar demanda'}</button>`
            });
        };

        window.bindOperationalDemandDialog = function(root) {
            const uiState = getUiState();
            window.bindFormDialog(root, {
                id: 'operational-demand-dialog', initialFocus: 'op-demand-title', close: () => window.closeOperationalDemandModal(),
                blocked: uiState.alert.show || uiState.confirm.show,
                prepare: () => window.syncOperationalWaitingFields()
            });
        };

        window.renderCreateTaskModal = function(calendarInboxSource = null) {
            const state = getState();
            const fieldClass = window.formDialogStyles.field;
            const labelClass = window.formDialogStyles.label;
            const summaryClass = window.formDialogStyles.summary;
            return window.renderFormDialog({
                id: 'create-task-dialog', titleId: 'create-task-title', title: 'Nova missão',
                description: calendarInboxSource ? 'Organize este compromisso do Google Agenda. Remarcações e cancelamentos acompanham o evento original.' : 'Defina a próxima ação. Os detalhes podem ficar para depois.',
                closeLabel: 'Fechar criação de missão', closeHandler: 'toggleCreateTaskModal', submitHandler: 'saveNewTask',
                body: `
                            ${calendarInboxSource ? '<p class="rounded-lg border border-sky-800/60 bg-sky-950/30 p-3 text-xs leading-relaxed text-sky-200">Vinculada ao evento original. A conversão cria uma única atividade e não duplica o compromisso no Google Agenda.</p>' : ''}
                            <div>
                                <label for="ct-text" class="${labelClass}">O que você vai fazer? <span class="ml-2 text-xs font-normal text-slate-400">Obrigatório</span></label>
                                <input id="ct-text" type="text" ${calendarInboxSource?.sanitizedOrigin === 'coaktion' ? 'readonly' : ''} autocomplete="off" aria-describedby="ct-title-error" placeholder="Ex.: Revisar o contrato do cliente" class="${fieldClass}" oninput="this.removeAttribute('aria-invalid'); document.getElementById('ct-title-error').classList.add('hidden')">
                                <p id="ct-title-error" class="hidden mt-1.5 text-xs text-red-300" role="alert">Dê um nome à missão para continuar.</p>
                            </div>
                            <div class="grid grid-cols-2 gap-3">
                                <div><label for="ct-activity-type" class="${labelClass}">Atividade</label><select id="ct-activity-type" data-all-day="${Boolean(calendarInboxSource?.allDay)}" ${calendarInboxSource?.sanitizedOrigin === 'coaktion' ? 'disabled' : ''} onchange="window.handleActivityTypeChange('ct')" class="${fieldClass}"><option value="task" ${calendarInboxSource?.activityType !== 'meeting' ? 'selected' : ''}>Tarefa</option><option value="meeting" ${calendarInboxSource?.activityType === 'meeting' ? 'selected' : ''}>Reunião</option></select></div>
                                <div><label for="ct-day" class="${labelClass}">Dia</label><select id="ct-day" ${calendarInboxSource ? 'disabled' : ''} class="${fieldClass}">${daysOfWeek.map(d => `<option value="${d.id}" ${d.id === state.activeTab ? 'selected' : ''}>${d.label}</option>`).join('')}<option value="next_week">Próxima semana</option></select></div>
                                <div><label for="ct-category" class="${labelClass}">Categoria</label><select id="ct-category" class="${fieldClass}">${window.getTaskCategories().map(cat => `<option value="${window.escapeHtml(cat.id)}">${window.escapeHtml(cat.label)}</option>`).join('')}</select><button type="button" onclick="window.toggleCategoryModal()" class="mt-1.5 text-xs text-slate-400 underline decoration-slate-600 underline-offset-2 hover:text-slate-200">Gerenciar categorias</button></div>
                            </div>
                            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                <div class="col-span-2 sm:col-span-1"><label for="ct-nature" class="${labelClass}">Impacto</label><select id="ct-nature" onchange="window.handleTaskNatureChange('ct')" class="${fieldClass}"><option value="normal" selected>Normal</option><option value="neutral">Logística</option><option value="recharge">Recarga</option></select></div>
                                <div><label for="ct-priority" class="${labelClass}">Prioridade</label><select id="ct-priority" onchange="window.updatePreviewCalc()" class="${fieldClass}"><option value="essencial">Essencial</option><option value="alta">Alta</option><option value="media" selected>Média</option><option value="baixa">Baixa</option></select></div>
                                <div><label for="ct-time" class="${labelClass}">Duração <span class="text-xs font-normal text-slate-400">(min)</span></label><input id="ct-time" type="number" value="30" min="5" max="240" step="5" oninput="window.updatePreviewCalc()" class="${fieldClass}"></div>
                            </div>
                            <input type="hidden" id="ct-impact-type" value="drain">
                            <p id="ct-nature-summary" class="text-xs leading-relaxed text-slate-400">Trabalho, estudo ou treino: rende XP e moedas e consome energia.</p>
                            <div class="divide-y divide-slate-800 border-t border-slate-800">
                                <details data-create-section="subtasks">
                                    <summary class="${summaryClass}"><span>Adicionar subtarefas</span><i data-lucide="chevron-down" class="w-4 h-4 text-slate-400"></i></summary>
                                    <div class="pt-2 pb-4"><label for="ct-subtasks" class="block text-xs text-slate-400">Uma subtarefa por linha</label><textarea id="ct-subtasks" rows="3" placeholder="Separar documentos&#10;Revisar o texto&#10;Enviar para aprovação" class="${fieldClass} resize-y"></textarea></div>
                                </details>
                                <details data-create-section="schedule" ${calendarInboxSource ? 'open' : ''}>
                                    <summary class="${summaryClass}"><span>Definir horário</span><i data-lucide="chevron-down" class="w-4 h-4 text-slate-400"></i></summary>
                                    <div class="grid grid-cols-2 gap-x-3 gap-y-2 pt-2 pb-4"><div><label for="ct-start-time" class="${labelClass}">Início</label><input id="ct-start-time" type="time" ${calendarInboxSource ? 'readonly' : ''} class="${fieldClass}"></div><div><label for="ct-end-time" class="${labelClass}">Fim</label><input id="ct-end-time" type="time" ${calendarInboxSource ? 'readonly' : ''} class="${fieldClass}"></div><p class="col-span-2 text-xs leading-relaxed text-slate-400">${calendarInboxSource ? 'Horários gerenciados no Google Agenda. Altere o evento lá e sincronize aqui.' : 'Reuniões precisam de início e fim. Tarefas podem ficar sem horário.'}</p></div>
                                </details>
                                <details data-create-section="recurrence" ${calendarInboxSource ? 'class="hidden"' : ''}>
                                    <summary class="${summaryClass}"><span>Repetir durante a semana</span><i data-lucide="chevron-down" class="w-4 h-4 text-slate-400"></i></summary>
                                    <div class="pt-2 pb-4 space-y-3"><div class="grid grid-cols-2 sm:grid-cols-4 gap-2">${daysOfWeek.map(d => `<label for="ct-repeat-${d.id}" class="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-slate-300 hover:border-indigo-400"><input id="ct-repeat-${d.id}" type="checkbox" class="accent-indigo-500">${d.label}</label>`).join('')}</div><div class="flex gap-4"><button type="button" onclick="window.setCreateTaskRecurrence('all')" class="text-xs text-indigo-300 hover:text-indigo-200">Todos os dias</button><button type="button" onclick="window.setCreateTaskRecurrence('clear')" class="text-xs text-slate-400 hover:text-slate-200">Limpar seleção</button></div></div>
                                </details>
                                <details data-create-section="effort" id="ct-effort-panel">
                                    <summary class="${summaryClass}"><span>Ajustar dificuldade</span><i data-lucide="chevron-down" class="w-4 h-4 text-slate-400"></i></summary>
                                    <div class="pt-2 pb-4"><label for="ct-complexity" class="${labelClass}">Dificuldade de 1 a 5</label><input id="ct-complexity" type="number" min="1" max="5" value="2" oninput="window.updatePreviewCalc()" class="${fieldClass} max-w-24"><p class="mt-2 text-xs leading-relaxed text-slate-400">1 é simples; 5 exige muito esforço. O padrão é 2.</p></div>
                                </details>
                            </div>`,
                footer: `
                            <div class="mb-3 flex flex-wrap items-center gap-2 text-xs"><span class="mr-auto text-slate-400">Impacto estimado</span><span id="ct-xp-preview" class="rounded bg-indigo-950 px-2 py-1 text-indigo-200">+0 XP</span><span id="ct-hp-preview" class="rounded bg-red-950 px-2 py-1 text-red-200">−0 HP</span></div>
                            <div class="flex justify-end gap-2"><button type="button" onclick="window.toggleCreateTaskModal()" class="min-h-10 rounded-lg px-4 text-sm font-medium text-slate-300 hover:bg-slate-800">Cancelar</button><button type="submit" class="min-h-10 rounded-lg bg-indigo-600 px-5 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300">Criar missão</button></div>`
            });
        };

        window.bindCreateTaskDialog = function(root) {
            const uiState = getUiState();
            window.bindFormDialog(root, {
                id: 'create-task-dialog', initialFocus: 'ct-text', close: () => window.toggleCreateTaskModal(),
                blocked: uiState.showCategoryModal || uiState.alert.show || uiState.confirm.show,
                prepare: () => window.handleActivityTypeChange('ct')
            });
        };
}
