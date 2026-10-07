// Interface v2 do planejamento diário e semanal, incluindo menus de missão.
// Mantém a ordem de registro dos listeners e consulta o estado atual por getters.
// Regras, persistência, calendário e ações dos controles permanecem no app.
// Após validação, preservar este arquivo e usar outro nome para futuras revisões.
export function installPlanningViews(window, {
    document, daysOfWeek, ICONS, calendarSync, getState, getUiState,
    extractMinutesFromTask, addDaysToDate, dateKeyFromDate, formatPtShortDate
}) {
        window.closeMissionMenus = function(except = null, restoreFocus = false) {
            document.querySelectorAll('details[data-mission-menu][open]').forEach(menu => {
                if (menu === except) return;
                menu.open = false;
                if (restoreFocus) menu.querySelector('summary')?.focus({ preventScroll: true });
            });
        };
        window.toggleMissionMenu = function(event) {
            event.preventDefault();
            event.stopPropagation();
            const menu = event.currentTarget.closest('details[data-mission-menu]');
            if (!menu) return;
            const shouldOpen = !menu.open;
            window.closeMissionMenus(menu);
            menu.open = shouldOpen;
        };
        document.addEventListener('click', event => {
            window.closeMissionMenus(event.target.closest?.('details[data-mission-menu]') || null);
        }, true);
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && document.querySelector('details[data-mission-menu][open]')) {
                window.closeMissionMenus(null, true);
                event.preventDefault();
            }
        });

        window.renderDailyMissionBoard = function(filteredTasks) {
            const uiState = getUiState();
            const tasks = Array.isArray(filteredTasks) ? filteredTasks : [];
            if (!tasks.length) {
                return `<div class="rounded-xl border border-dashed border-slate-800 bg-slate-950/35 p-7 text-center font-mono mb-4"><i data-lucide="circle-dashed" class="w-6 h-6 text-slate-700 mx-auto mb-2"></i><div class="text-sm font-bold text-slate-300">Nenhuma missão neste filtro</div><div class="text-[10px] text-slate-600 mt-1">Crie uma missão ou escolha outro filtro.</div></div>`;
            }

            const priorityMeta = {
                essencial: { label: 'Essencial', dot: 'bg-purple-400', text: 'text-purple-300' },
                alta: { label: 'Alta', dot: 'bg-red-400', text: 'text-red-300' },
                media: { label: 'Média', dot: 'bg-amber-400', text: 'text-slate-400' },
                baixa: { label: 'Baixa', dot: 'bg-slate-500', text: 'text-slate-400' }
            };
            const statusMeta = {
                planned: { label: 'Planejada', icon: 'calendar', color: 'text-slate-300', surface: 'border-slate-700 bg-slate-900 hover:border-slate-500' },
                in_progress: { label: 'Em andamento', icon: 'play', color: 'text-sky-200', surface: 'border-sky-800 bg-sky-950/70 hover:border-sky-600' },
                paused: { label: 'Pausada', icon: 'pause', color: 'text-amber-200', surface: 'border-amber-800 bg-amber-950/60 hover:border-amber-600' },
                completed: { label: 'Concluída', icon: 'check', color: 'text-emerald-200', surface: 'border-emerald-800 bg-emerald-950/60 hover:border-emerald-600' }
            };
            let out = `<div class="mb-4 rounded-xl border border-slate-800 bg-slate-950/35 font-sans divide-y divide-slate-800/80">`;

            tasks.forEach(task => {
                const taskCategory = window.getTaskCategory(task.category);
                const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
                const doneSubtasks = subtasks.filter(st => st.completed).length;
                const subtaskPercent = subtasks.length ? Math.round((doneSubtasks / subtasks.length) * 100) : 0;
                const recurrenceDays = Array.isArray(task.recurrenceDays) ? task.recurrenceDays : [];
                const isRecurringTask = task.isRecurring || recurrenceDays.length > 0;
                const recurrenceLabel = window.getRecurringDaysLabel(recurrenceDays);
                const taskScheduleLabel = window.hasCalendarTime(task) ? window.getCalendarTimeLabel(task, extractMinutesFromTask(task)) : '';
                const taskNature = window.getTaskNature(task);
                const taskNatureMeta = window.getTaskNatureMeta(taskNature);
                const daysOptions = daysOfWeek.map(d => `<option value="${d.id}" ${d.id === task.day ? 'disabled' : ''}>${d.label}</option>`).join('') + `<option value="next_week">Próxima Semana</option>`;
                const completed = !!task.completed;
                const meeting = task.activityType === 'meeting';
                const meetingStatuses = {
                    planned: { ...statusMeta.planned, label: 'Agendada' },
                    completed: { ...statusMeta.completed, label: 'Realizada' },
                    not_held: { ...statusMeta.paused, label: 'Não ocorreu', icon: 'calendar-x' }
                };
                const statuses = meeting ? meetingStatuses : statusMeta;
                const missionStatus = meeting ? window.getMeetingStatus(task) : window.getMissionStatus(task);
                const status = statuses[missionStatus];
                const priority = priorityMeta[task.priority] || priorityMeta.media;
                const rowState = completed ? 'bg-slate-950/55' : (taskNature === 'recharge' ? 'bg-emerald-950/5' : 'hover:bg-slate-900/60');

                out += `
                <div draggable="true" ondragstart="window.handleTaskDragStart(${task.id}, event)" ondragend="window.handleTaskDragEnd(event)" ondragover="window.handleTaskDragOver(${task.id}, event)" ondragleave="window.handleTaskDragLeave(event)" ondrop="window.handleTaskDrop(${task.id}, event)" class="${rowState} first:rounded-t-xl last:rounded-b-xl px-3 sm:px-4 py-3 transition-colors group">
                    <div class="flex items-start gap-3">
                        <div class="drag-handle pt-1.5 text-slate-800 group-hover:text-slate-600 shrink-0" title="Arrastar para reorganizar" onclick="event.stopPropagation()"><i data-lucide="grip-vertical" class="w-3.5 h-3.5"></i></div>
                        <button onclick="${meeting ? `window.setMeetingStatus(${task.id}, '${completed ? 'planned' : 'completed'}', event)` : `window.toggleTask(${task.id}, event)`}" ${meeting && missionStatus === 'not_held' ? 'disabled' : ''} aria-label="${meeting ? (completed ? 'Reabrir reunião' : 'Marcar reunião realizada') : completed ? 'Reabrir missão' : 'Concluir missão'}: ${window.escapeHtml(task.text)}" title="${meeting ? (completed ? 'Reabrir reunião' : 'Marcar reunião realizada') : completed ? 'Reabrir missão' : 'Concluir missão'}" class="shrink-0 w-11 h-11 sm:w-8 sm:h-8 -mt-1 inline-flex items-center justify-center rounded-lg hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400">
                            <span class="w-5 h-5 rounded-full border ${completed ? 'border-emerald-600 bg-emerald-600/15 text-emerald-400' : 'border-slate-500 text-slate-500'} inline-flex items-center justify-center">
                                ${completed ? '<i data-lucide="check" class="w-3 h-3"></i>' : ''}
                            </span>
                        </button>

                        <div class="min-w-0 flex-1">
                            <div class="flex items-start justify-between gap-3">
                                <div class="min-w-0 flex-1">
                                    <div class="text-base font-semibold leading-snug ${completed ? 'line-through text-slate-500' : 'text-slate-100'}">${window.escapeHtml(task.text)}</div>
                                    <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                        ${meeting ? '<span class="inline-flex items-center gap-1 text-xs font-medium text-sky-300"><i data-lucide="users" class="w-3 h-3"></i>Reunião</span>' : ''}
                                        ${task.googleCalendarSourceMissing ? `<span class="text-xs text-amber-300">${task.googleCalendarSourceStatus === 'cancelled' ? 'Cancelada na agenda' : 'Evento indisponível na agenda'}</span>` : ''}
                                        ${taskScheduleLabel ? `<span class="text-xs font-medium text-slate-300 tabular-nums">${taskScheduleLabel}</span>` : ''}
                                        <span class="inline-flex items-center gap-1 text-[11px] font-medium ${priority.text}"><span class="w-1.5 h-1.5 rounded-full ${priority.dot}"></span>${priority.label}</span>
                                        ${taskNature !== 'normal' ? `<span class="text-[9px] font-bold ${taskNatureMeta.color}"><i data-lucide="${taskNatureMeta.icon}" class="inline w-3 h-3 mr-0.5"></i>${taskNatureMeta.shortLabel}</span>` : ''}
                                    </div>

                                    <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-slate-400">
                                        <label class="relative inline-flex items-center font-sans">
                                            <i data-lucide="${status.icon}" aria-hidden="true" class="pointer-events-none absolute left-2.5 w-3 h-3 ${status.color}"></i>
                                            <select aria-label="Status ${meeting ? 'da reunião' : 'da tarefa'}: ${window.escapeHtml(task.text)}" title="Alterar status" onchange="${meeting ? 'window.setMeetingStatus' : 'window.setMissionStatus'}(${task.id}, this.value, event)" onclick="event.stopPropagation()" class="appearance-none min-h-[44px] sm:min-h-8 rounded-lg border pl-7 pr-7 text-xs font-medium ${status.color} ${status.surface} cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400">
                                                ${Object.entries(statuses).map(([value, meta]) => `<option class="bg-slate-900 text-slate-100" value="${value}" ${missionStatus === value ? 'selected' : ''}>${meta.label}</option>`).join('')}
                                            </select>
                                            <i data-lucide="chevron-down" aria-hidden="true" class="pointer-events-none absolute right-2 w-3.5 h-3.5 ${status.color}"></i>
                                        </label>
                                        <span class="inline-flex items-center gap-1"><i data-lucide="${taskCategory.icon || ICONS.default}" class="w-3 h-3 ${taskCategory.color || 'text-slate-600'}"></i>${window.escapeHtml(taskCategory.label)}</span>
                                        ${isRecurringTask ? `<span>↻ ${window.escapeHtml(recurrenceLabel || 'Recorrente')}</span>` : ''}
                                    </div>
                                </div>

                                <div class="flex items-center gap-1 shrink-0" onclick="event.stopPropagation()">
                                    ${!completed && !meeting ? `<button onclick="window.openTaskFocus(${task.id}, event)" class="inline-flex min-h-[44px] sm:min-h-8 items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/70 px-2.5 text-xs font-medium text-slate-300 hover:text-indigo-300 hover:border-indigo-900/70" title="Abrir esta missão no modo foco"><i data-lucide="timer" class="w-4 h-4"></i><span class="hidden sm:inline">Foco</span></button>` : ''}
                                    <details data-mission-menu class="relative">
                                        <summary onclick="window.toggleMissionMenu(event)" aria-label="Mais ações: ${window.escapeHtml(task.text)}" class="list-none inline-flex min-h-[44px] min-w-[44px] sm:min-h-8 sm:min-w-8 items-center justify-center cursor-pointer rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400" title="Mais ações"><i data-lucide="ellipsis" class="w-4 h-4"></i></summary>
                                        <div class="absolute right-0 z-30 mt-1 w-44 rounded-lg border border-slate-700 bg-slate-950 p-1 shadow-xl">
                                            <button onclick="window.closeMissionMenus(); window.openEditTaskModal(${task.id}, event)" class="w-full flex min-h-[44px] sm:min-h-8 items-center gap-2 rounded px-2 text-left text-xs text-slate-200 hover:bg-slate-800"><i data-lucide="pencil" class="w-3.5 h-3.5"></i>Editar missão</button>
                                            ${task.googleCalendarSource !== 'primary' ? `<select aria-label="Mover missão para outro dia" onchange="window.moveTaskFromSelect(${task.id}, event, this)" onclick="event.stopPropagation()" class="w-full min-h-[44px] sm:min-h-8 bg-slate-950 text-slate-200 rounded px-2 text-xs hover:bg-slate-800 cursor-pointer"><option value="" disabled selected>Mover para outro dia…</option>${daysOptions}</select>` : '<p class="px-2 py-2 text-xs text-slate-400">Horário gerenciado no Google Agenda</p>'}
                                            <details>
                                                <summary class="list-none flex min-h-[44px] sm:min-h-8 cursor-pointer items-center justify-between gap-2 rounded px-2 text-xs text-slate-200 hover:bg-slate-800"><span>Reordenar</span><i data-lucide="chevron-down" class="w-3.5 h-3.5 text-slate-400"></i></summary>
                                                <div class="grid grid-cols-2 gap-1 pb-1"><button onclick="window.moveTaskOrder(${task.id}, -1, event)" class="min-h-[44px] sm:min-h-8 rounded text-xs text-slate-300 hover:bg-slate-800">↑ Subir</button><button onclick="window.moveTaskOrder(${task.id}, 1, event)" class="min-h-[44px] sm:min-h-8 rounded text-xs text-slate-300 hover:bg-slate-800">↓ Descer</button></div>
                                            </details>
                                            <div class="mt-1 border-t border-slate-800 pt-1">
                                                <button onclick="window.closeMissionMenus(); window.deleteMainTask(${task.id}, event)" class="w-full flex min-h-[44px] sm:min-h-8 items-center gap-2 rounded px-2 text-left text-xs text-red-400 hover:bg-red-950/30"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i>Excluir missão</button>
                                            </div>
                                        </div>
                                    </details>
                                </div>
                            </div>

                            ${subtasks.length ? `
                            <details data-subtasks-task-id="${task.id}" ${uiState.expandedSubtasks[String(task.id)] ? 'open' : ''} onclick="event.stopPropagation()" class="mt-2 group/subtasks">
                                <summary class="cursor-pointer list-none flex w-full max-w-xs min-h-[44px] sm:min-h-8 items-center gap-2 rounded px-1 text-xs font-medium text-slate-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400">
                                    <i data-lucide="chevron-down" class="w-3.5 h-3.5 transition-transform group-open/subtasks:rotate-180"></i>
                                    <span>Subtarefas</span>
                                    <span class="text-slate-400 tabular-nums">${doneSubtasks}/${subtasks.length}</span>
                                    <span class="ml-1 h-1.5 min-w-8 max-w-28 flex-1 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-label="Subtarefas concluídas: ${window.escapeHtml(task.text)}" aria-valuemin="0" aria-valuemax="${subtasks.length}" aria-valuenow="${doneSubtasks}" aria-valuetext="${doneSubtasks} de ${subtasks.length} subtarefas concluídas">
                                        <span class="block h-full rounded-full ${doneSubtasks === subtasks.length ? 'bg-emerald-500' : missionStatus === 'paused' ? 'bg-amber-400' : 'bg-sky-400'} transition-[width] duration-300" style="width:${subtaskPercent}%"></span>
                                    </span>
                                </summary>
                                <div class="mt-2 border-l border-slate-800 pl-3 space-y-1.5">
                                    ${subtasks.map(st => `<div class="flex items-center justify-between gap-2"><button onclick="window.toggleSubtask(${task.id}, ${st.id}, event)" class="flex items-center gap-2 text-left flex-1 text-xs ${st.completed ? 'text-slate-600 line-through' : 'text-slate-300'}"><i data-lucide="${st.completed ? 'check-square' : 'square'}" class="w-3.5 h-3.5"></i>${window.escapeHtml(st.text)}</button><button onclick="window.deleteSubtask(${task.id}, ${st.id}, event)" class="text-slate-800 hover:text-red-400"><i data-lucide="x" class="w-3.5 h-3.5"></i></button></div>`).join('')}
                                    <div class="flex gap-2 pt-1">
                                        <input id="subtask-input-${task.id}" type="text" aria-label="Nome da nova subtarefa" placeholder="Adicionar subtarefa…" class="min-w-0 flex-1 bg-transparent border-b border-slate-700 px-1 py-1.5 text-xs text-slate-200 placeholder:text-slate-400 outline-none focus:border-sky-400" onkeydown="if(event.key === 'Enter' && !event.isComposing) { event.preventDefault(); event.stopPropagation(); window.addSubtask(${task.id}); }">
                                        <button type="button" onclick="event.stopPropagation(); window.addSubtask(${task.id})" aria-label="Adicionar subtarefa" class="min-h-[44px] min-w-[44px] sm:min-h-8 sm:min-w-8 inline-flex items-center justify-center rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"><i data-lucide="plus" class="w-4 h-4"></i></button>
                                    </div>
                                </div>
                            </details>` : `
                            <button onclick="event.stopPropagation(); const el=document.getElementById('subtask-input-${task.id}'); if(el){el.classList.toggle('hidden'); if(!el.classList.contains('hidden')) el.focus();}" class="mt-1 min-h-[44px] sm:min-h-8 rounded px-1 text-[11px] font-medium text-slate-400 hover:text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400">+ subtarefa</button>
                            <div class="mt-1 flex gap-2" onclick="event.stopPropagation()">
                                <input id="subtask-input-${task.id}" type="text" aria-label="Nome da nova subtarefa" placeholder="Adicionar subtarefa…" class="hidden min-w-0 flex-1 bg-transparent border-b border-slate-700 px-1 py-1.5 text-xs text-slate-200 placeholder:text-slate-400 outline-none focus:border-sky-400" onkeydown="if(event.key === 'Enter' && !event.isComposing) { event.preventDefault(); event.stopPropagation(); window.addSubtask(${task.id}); }">
                            </div>`}
                        </div>
                    </div>
                </div>`;
            });
            out += `</div>`;
            return out;
        };

        window.renderWeeklyPlanningOverview = function() {
            const state = getState();
            const uiState = getUiState();
            const studyBlocks = (state.studyData?.studyPlan?.weeklyBlocks || []).filter(b => b.status !== 'cancelled');
            const subjects = state.studyData?.subjects || [];

            const weekStart = window.getActivePlanningWeekStartDate();
            const weekEnd = addDaysToDate(weekStart, 6);
            const currentWeekKey = window.getCurrentCalendarWeekStartKey();
            const nextWeekKey = window.getNextCalendarWeekStartKey();
            const activeWeekKey = dateKeyFromDate(weekStart);
            const todayKey = dateKeyFromDate(new Date());
            const weekLabel = `${formatPtShortDate(weekStart)} a ${formatPtShortDate(weekEnd)}`;
            const isCurrentCalendarWeek = activeWeekKey === currentWeekKey;
            const isNextCalendarWeek = activeWeekKey === nextWeekKey;

            const priorityLabel = { essencial: 'Essencial', alta: 'Alta', media: 'Média', baixa: 'Baixa' };
            const priorityColor = {
                essencial: 'text-purple-200 bg-purple-950/40 border-purple-900/60',
                alta: 'text-red-200 bg-red-950/35 border-red-900/60',
                media: 'text-yellow-200 bg-yellow-950/25 border-yellow-900/60',
                baixa: 'text-slate-300 bg-slate-900 border-slate-800'
            };
            const statusLabel = (status) => window.getStudyBlockStatusLabel ? window.getStudyBlockStatusLabel(status) : (status === 'completed' ? 'Concluído' : status === 'partial' ? 'Parcial' : 'Planejado');
            const safePct = (done, total) => total ? Math.round((done / total) * 100) : 0;
            const plural = (n, singular, pluralText) => `${n} ${n === 1 ? singular : pluralText}`;

            const buildDay = (day, index) => {
                const date = addDaysToDate(weekStart, index);
                const dateKey = dateKeyFromDate(date);
                const dayTasks = window.sortTasksForDay(day.id);
                const dayStudies = window.sortStudyBlocksBySchedule(studyBlocks.filter(b => b.day === day.id));
                const completedTasks = dayTasks.filter(t => t.completed).length;
                const completedStudies = dayStudies.filter(b => b.status === 'completed').length;
                const total = dayTasks.filter(t => !(t.activityType === 'meeting' && window.getMeetingStatus(t) === 'not_held')).length + dayStudies.length;
                const completed = completedTasks + completedStudies;
                const pending = total - completed;
                const minutes = dayStudies.reduce((acc, b) => acc + (parseInt(b.plannedMinutes, 10) || 0), 0);
                return { day, date, dateKey, dayTasks, dayStudies, completedTasks, completedStudies, total, completed, pending, minutes, pct: safePct(completed, total) };
            };

            const rows = daysOfWeek.map(buildDay);
            const totalTasks = rows.reduce((acc, row) => acc + row.dayTasks.length, 0);
            const totalStudies = rows.reduce((acc, row) => acc + row.dayStudies.length, 0);
            const totalItems = rows.reduce((acc, row) => acc + row.total, 0);
            const completedItems = rows.reduce((acc, row) => acc + row.completed, 0);
            const plannedMinutes = rows.reduce((acc, row) => acc + row.minutes, 0);
            const progressPct = safePct(completedItems, totalItems);

            const renderTaskAgendaItem = (task) => {
                const cat = window.getTaskCategory(task.category);
                const done = Boolean(task.completed);
                const meeting = task.activityType === 'meeting';
                const subCount = Array.isArray(task.subtasks) ? task.subtasks.length : 0;
                const doneSubs = subCount ? task.subtasks.filter(st => st.completed).length : 0;
                return `<div class="rounded-lg border ${done ? 'border-emerald-900/30 bg-emerald-950/10 opacity-60' : 'border-slate-800 bg-slate-950/75'} p-3">
                    <div class="flex items-start gap-3">
                        <i data-lucide="${done ? 'check-circle-2' : 'circle'}" class="w-4 h-4 mt-0.5 ${done ? 'text-emerald-400' : 'text-indigo-300'} shrink-0"></i>
                        <div class="min-w-0 flex-1">
                            <div class="text-sm font-semibold leading-snug ${done ? 'text-slate-400 line-through' : 'text-slate-100'} break-words">${window.escapeHtml(task.text || 'Missão sem título')}</div>
                            <div class="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
                                ${meeting ? `<span class="text-sky-300">Reunião · ${window.getMeetingStatus(task) === 'not_held' ? 'Não ocorreu' : done ? 'Realizada' : 'Agendada'}</span>` : ''}
                                <span class="inline-flex items-center gap-1 text-slate-400"><i data-lucide="${cat.icon || 'target'}" class="w-3 h-3 ${cat.color || 'text-slate-400'}"></i>${window.escapeHtml(cat.label || 'Geral')}</span>
                                ${['essencial', 'alta'].includes(task.priority) ? `<span class="inline-flex items-center rounded-full border px-2 py-0.5 ${priorityColor[task.priority]}">${priorityLabel[task.priority]}</span>` : ''}
                                <span class="inline-flex items-center gap-1 ${task.startTime ? 'text-cyan-300' : 'text-slate-500'}"><i data-lucide="calendar-clock" class="w-3 h-3"></i>${task.startTime ? window.getCalendarTimeLabel(task, extractMinutesFromTask(task)) : 'Horário livre'}</span>
                                ${subCount ? `<span class="inline-flex items-center text-cyan-300">${doneSubs}/${subCount} subtarefas</span>` : ''}
                                ${task.googleCalendarSource === 'primary' ? `<span class="inline-flex items-center gap-1 text-sky-300"><i data-lucide="link-2" class="w-3 h-3"></i>Google Agenda</span>` : ''}
                                ${task.googleCalendarSourceMissing ? `<span class="inline-flex items-center gap-1 text-amber-300"><i data-lucide="triangle-alert" class="w-3 h-3"></i>${task.googleCalendarSourceStatus === 'cancelled' ? 'Cancelada na agenda' : 'Evento indisponível na agenda'}</span>` : ''}
                                ${task.googleCalendarColorSyncError ? `<span class="inline-flex items-center gap-1 text-amber-300"><i data-lucide="palette" class="w-3 h-3"></i>Cor pendente</span>` : ''}
                            </div>
                        </div>
                    </div>
                </div>`;
            };

            const renderStudyAgendaItem = (block) => {
                const track = window.getStudyTrack(block.trackId);
                const subject = block.subjectId ? subjects.find(s => String(s.id) === String(block.subjectId)) : null;
                const done = block.status === 'completed';
                const partial = block.status === 'partial';
                const icon = done ? 'check-circle-2' : partial ? 'circle-dot' : 'book-open-check';
                return `<div class="rounded-lg border ${done ? 'border-emerald-900/30 bg-emerald-950/10 opacity-60' : (track.border || 'border-cyan-900/50')} ${done ? '' : (track.bg || 'bg-cyan-950/10')} p-3">
                    <div class="flex items-start gap-3">
                        <i data-lucide="${icon}" class="w-4 h-4 mt-0.5 ${done ? 'text-emerald-400' : (track.color || 'text-cyan-300')} shrink-0"></i>
                        <div class="min-w-0 flex-1">
                            <div class="text-sm font-semibold leading-snug ${done ? 'text-slate-400 line-through' : 'text-slate-100'} break-words">${window.escapeHtml(block.title || 'Estudo sem título')}</div>
                            <div class="text-xs text-slate-400 mt-1 break-words">${subject ? window.escapeHtml(subject.name) : ''}</div>
                            <div class="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
                                <span class="inline-flex items-center gap-1 ${track.color || 'text-cyan-300'}"><i data-lucide="${track.icon || 'route'}" class="w-3 h-3"></i>${window.escapeHtml(track.name || 'Trilha')}</span>
                                <span class="inline-flex items-center text-cyan-300">${parseInt(block.plannedMinutes, 10) || 0} min</span>
                                <span class="inline-flex items-center gap-1 ${block.startTime ? 'text-cyan-200' : 'text-slate-500'}"><i data-lucide="calendar-clock" class="w-3 h-3"></i>${block.startTime ? window.getCalendarTimeLabel(block, block.plannedMinutes) : 'Horário livre'}</span>
                                <span class="inline-flex items-center rounded-full border border-slate-800 bg-slate-900 text-slate-300 px-2 py-0.5">${statusLabel(block.status)}</span>
                            </div>
                        </div>
                    </div>
                </div>`;
            };

            const firstOccupiedDay = rows.find(row => row.total)?.day.id;
            const renderDayAgendaPanel = (row) => {
                const isToday = row.dateKey === todayKey;
                const sectionKey = `${activeWeekKey}:${row.day.id}`;
                const open = uiState.weeklyExpandedSections[sectionKey] ?? (isToday || (!isCurrentCalendarWeek && row.day.id === firstOccupiedDay));
                const dateLabel = `${String(row.date.getDate()).padStart(2, '0')}/${String(row.date.getMonth() + 1).padStart(2, '0')}`;
                const agenda = [
                    ...row.dayTasks.map(item => ({ item, type: 'task' })),
                    ...row.dayStudies.map(item => ({ item, type: 'study' }))
                ].sort((a, b) => (a.item.startTime || '99:99').localeCompare(b.item.startTime || '99:99'));
                return `<details data-week-day="${row.day.id}" data-week-section="${sectionKey}" ${open ? 'open' : ''} class="group rounded-xl border ${isToday ? 'border-indigo-500/60' : 'border-slate-800'} bg-slate-900/70 overflow-hidden">
                    <summary class="list-none cursor-pointer flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-800/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400 focus-visible:outline-offset-[-2px]">
                        <div class="min-w-0">
                            <div class="flex flex-wrap items-center gap-2"><h3 class="text-sm font-semibold text-slate-100">${row.day.label}</h3><span class="text-xs text-slate-400">${dateLabel}</span>${isToday ? '<span class="rounded bg-indigo-950 px-2 py-0.5 text-xs text-indigo-200">Hoje</span>' : ''}</div>
                            <div class="mt-1 text-xs text-slate-400">${row.total ? `${plural(row.dayTasks.length, 'missão', 'missões')}${row.dayStudies.length ? ` · ${plural(row.dayStudies.length, 'estudo', 'estudos')}` : ''} · ${plural(row.pending, 'pendente', 'pendentes')}` : 'Sem itens planejados'}</div>
                        </div>
                        <div class="flex items-center gap-3 shrink-0">
                            ${row.total ? `<span class="text-xs ${row.pending === 0 ? 'text-emerald-300' : 'text-slate-400'}">${row.completed}/${row.total}</span>` : ''}
                            <i data-lucide="chevron-down" class="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180"></i>
                        </div>
                    </summary>
                    <div class="border-t border-slate-800 p-3 space-y-2">
                        ${agenda.length ? agenda.map(entry => entry.type === 'task' ? renderTaskAgendaItem(entry.item) : renderStudyAgendaItem(entry.item)).join('') : '<p class="px-1 py-2 text-sm text-slate-400">Você pode adicionar uma missão neste dia.</p>'}
                        <div class="flex justify-end pt-1"><button type="button" onclick="window.setTab('${row.day.id}'); window.setMainView('day')" class="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-indigo-200 hover:bg-slate-800">Abrir missões de ${row.day.label.toLowerCase()}<i data-lucide="arrow-right" class="w-3.5 h-3.5"></i></button></div>
                    </div>
                </details>`;
            };
            const weekButton = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white';

            return `<div class="space-y-3 font-sans">
                ${window.renderCalendarSyncPanel()}
                ${window.renderCalendarInboxPanel()}
                <section aria-labelledby="weekly-planning-title" class="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <div><h2 id="weekly-planning-title" class="text-lg font-semibold text-white">Semana Geral</h2><p class="mt-1 text-xs text-slate-400">${weekLabel} · ${isCurrentCalendarWeek ? 'Semana atual' : isNextCalendarWeek ? 'Próxima semana' : 'Planejamento semanal'}</p></div>
                        <div class="flex flex-wrap items-center gap-2">
                            <button type="button" onclick="window.setPlanningCalendarWeek('prev')" class="${weekButton}" aria-label="Semana anterior"><i data-lucide="chevron-left" class="w-4 h-4"></i>Anterior</button>
                            <button type="button" onclick="window.setPlanningCalendarWeek('current')" class="${weekButton}">Atual</button>
                            <button type="button" onclick="window.setPlanningCalendarWeek('forward')" class="${weekButton}">Próxima<i data-lucide="chevron-right" class="w-4 h-4"></i></button>
                        </div>
                    </div>
                    <div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3 text-xs text-slate-300">
                        <span>${plural(totalTasks, 'missão', 'missões')} · ${plural(totalStudies, 'estudo', 'estudos')}${plannedMinutes ? ` · ${(plannedMinutes / 60).toFixed(1)}h de estudo` : ''}</span>
                        ${totalItems ? `<span class="inline-flex items-center gap-2"><span>${completedItems}/${totalItems} ${completedItems === 1 ? 'concluído' : 'concluídos'}</span><span class="h-1.5 w-16 overflow-hidden rounded-full bg-slate-800"><span class="block h-full ${progressPct === 100 ? 'bg-emerald-500' : 'bg-indigo-400'}" style="width:${progressPct}%"></span></span></span>` : ''}
                    </div>
                    <details data-week-section="${activeWeekKey}:options" ${uiState.weeklyExpandedSections[`${activeWeekKey}:options`] ? 'open' : ''} class="mt-3 border-t border-slate-800 pt-2">
                        <summary class="inline-flex min-h-9 cursor-pointer list-none items-center gap-2 text-xs text-slate-400 hover:text-white">Opções da semana<i data-lucide="chevron-down" class="w-3.5 h-3.5"></i></summary>
                        <div class="mt-2 flex flex-wrap gap-2">
                            <button type="button" onclick="window.exportVisibleWeekToIcs()" class="${weekButton}"><i data-lucide="download" class="w-4 h-4"></i>Exportar agenda (.ics)</button>
                            <button type="button" onclick="window.prepareNextWeekPlanning()" class="${weekButton}"><i data-lucide="calendar-plus" class="w-4 h-4"></i>Preparar próxima semana</button>
                        </div>
                    </details>
                </section>
                ${!totalItems ? '<p class="px-1 text-sm text-slate-400">Nenhum item planejado nesta semana. Abra um dia para começar.</p>' : ''}
                <section aria-label="Planejamento por dia" class="space-y-2">
                    ${rows.map(renderDayAgendaPanel).join('')}
                </section>

            </div>`;
        };
}

