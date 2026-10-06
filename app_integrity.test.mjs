import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { installFormDialogs as installDialogModule } from './ui/form_dialogs.v1.js';

const app = await readFile(new URL('./app.html', import.meta.url), 'utf8');
const installFormDialogs = target => installDialogModule(target, {});
assert.match(app, /import \{ installFormDialogs \} from '\.\/ui\/form_dialogs\.v1\.js'/);
assert.match(app, /installFormDialogs\(window, document\)/);
assert.ok(!app.includes('window.renderFormDialog ='), 'A estrutura deve existir apenas no módulo compartilhado.');

const moduleMatch = app.match(/<script\s+type="module">([\s\S]*?)<\/script>/i);

assert.ok(moduleMatch, 'O módulo principal do app deve existir.');

const syntaxCheck = spawnSync(process.execPath, ['--check', '--input-type=module'], {
    input: moduleMatch[1],
    encoding: 'utf8'
});

assert.equal(
    syntaxCheck.status,
    0,
    `O módulo principal precisa compilar antes da publicação.\n${syntaxCheck.stderr}`
);

const inlineHandlers = [...app.matchAll(/on(?:click|change|input|keypress|dragstart|dragend|dragover|dragleave|drop)="window\.(?!\$\{)([A-Za-z_$][\w$]*)/g)]
    .map(match => match[1]);
const uniqueHandlers = [...new Set(inlineHandlers)].sort();

assert.ok(uniqueHandlers.length > 0, 'A interface deve expor handlers para os controles renderizados.');

const missingHandlers = uniqueHandlers.filter(name => {
    const declaration = new RegExp(`window\\.${name.replace(/[$]/g, '\\$&')}\\s*=`);
    return !declaration.test(app);
});

assert.deepEqual(
    missingHandlers,
    [],
    `Handlers usados na interface sem implementação: ${missingHandlers.join(', ')}`
);

const closeFocusStart = app.indexOf('window.closeTaskFocus = function()');
const closeFocusEnd = app.indexOf('window.toggleFocusMode = function()', closeFocusStart);
assert.ok(closeFocusStart >= 0 && closeFocusEnd > closeFocusStart, 'O modo foco deve ter uma saída explícita.');

const focusState = { focusMode: true, focusedTaskId: '123.45' };
const timer = { isRunning: true, timeLeft: 420, focusLock: { id: '123.45' } };
let pauses = 0;
let saves = 0;
const focusWindow = {
    togglePomodoro() { pauses++; timer.isRunning = false; },
    saveState() { saves++; }
};
runInNewContext(app.slice(closeFocusStart, closeFocusEnd), {
    window: focusWindow, state: focusState, pomodoro: timer
});
focusWindow.closeTaskFocus();
assert.equal(focusState.focusMode, false, 'Voltar deve restaurar a lista de missões.');
assert.equal(timer.isRunning, false, 'Voltar deve pausar o cronômetro.');
assert.equal(timer.timeLeft, 420, 'Voltar não deve reiniciar o ciclo.');
assert.equal(timer.focusLock.id, '123.45', 'Voltar deve preservar o alvo do ciclo.');
focusWindow.closeTaskFocus();
assert.equal(pauses, 1, 'Fechar novamente não deve iniciar o cronômetro pausado.');
assert.equal(saves, 2);

const focusPanelStart = app.indexOf('if (state.focusMode) {');
const focusPanelEnd = app.indexOf('html += window.renderDailyMissionBoard(filteredTasks)', focusPanelStart);
const focusPanel = app.slice(focusPanelStart, focusPanelEnd);
assert.ok(focusPanel.indexOf('onclick="window.closeTaskFocus()"') >= 0
    && focusPanel.indexOf('onclick="window.closeTaskFocus()"') < focusPanel.indexOf('if (allPending.length > 0)'),
    'O retorno deve aparecer mesmo quando não houver missões pendentes.');

const boardStart = app.indexOf('window.renderDailyMissionBoard = function(');
const createModalStart = app.indexOf('window.renderCreateTaskModal = function(');
const createModalEnd = app.indexOf('window.bindCreateTaskDialog = function(', createModalStart);
const createDays = [{ id: 'mon', label: 'Segunda' }, { id: 'tue', label: 'Terça' }];
const createWindow = {
    getTaskCategories: () => [{ id: 'work', label: 'Trabalho' }],
    escapeHtml: value => String(value)
};
installFormDialogs(createWindow);
runInNewContext(app.slice(createModalStart, createModalEnd), {
    window: createWindow, daysOfWeek: createDays, state: { activeTab: 'mon' }
});
const createMarkup = createWindow.renderCreateTaskModal();
const createIds = [...createMarkup.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(createIds).size, createIds.length, 'O formulário não pode repetir IDs.');
const saveNewStart = app.indexOf('window.saveNewTask = function(');
const saveNewEnd = app.indexOf('window.closeTaskFocus = function(', saveNewStart);
const saveNewSource = app.slice(saveNewStart, saveNewEnd);
for (const match of saveNewSource.matchAll(/getElementById\('(ct-[^']+)'\)/g)) {
    assert.ok(createIds.includes(match[1]), `O formulário precisa preservar o campo ${match[1]} usado no cadastro.`);
}
assert.match(createMarkup, /role="dialog" aria-modal="true"/);
assert.ok(createMarkup.indexOf('<footer') > createMarkup.indexOf('data-create-section="effort"'));
const inboxMarkup = createWindow.renderCreateTaskModal({ id: 'event-1' });
assert.match(inboxMarkup, /data-create-section="schedule" open/);
assert.match(inboxMarkup, /data-create-section="recurrence" class="hidden"/);

const costStart = app.indexOf('window.calculateTaskCost = function(');
const costEnd = app.indexOf('window.updatePreviewCalc = function(', costStart);
let titleFocused = false;
let titleInvalid = false;
const createFields = {
    'ct-text': { value: 'Revisar contrato', setAttribute() { titleInvalid = true; }, focus() { titleFocused = true; } },
    'ct-nature': { value: 'normal' }, 'ct-priority': { value: 'media' },
    'ct-complexity': { value: '2' }, 'ct-time': { value: '30' },
    'ct-impact-type': { value: 'drain' }, 'ct-category': { value: 'work' },
    'ct-day': { value: 'mon' }, 'ct-subtasks': { value: 'Ler\n\nRevisar' },
    'ct-repeat-mon': { checked: false }, 'ct-repeat-tue': { checked: false },
    'ct-title-error': { classList: { remove() {} } }
};
const creationState = { tasks: [] };
const creationUi = { showCreateTaskModal: true, calendarInboxEventId: null, createTaskDraft: { fields: [] } };
let convertedEvent = null;
let recurrenceCalls = 0;
Object.assign(createWindow, {
    readCalendarTimeFields: () => ({ startTime: '10:00', endTime: '10:30' }),
    getNextTaskOrder: () => 1,
    cloneSubtasksForNewTask: subtasks => subtasks.map(st => ({ ...st })),
    upsertRecurringTaskOccurrences() { recurrenceCalls++; },
    getRecurringDaysLabel: () => 'Segunda, terça', showToast() {}, saveState() {}
});
runInNewContext(app.slice(costStart, costEnd) + saveNewSource, {
    window: createWindow, state: creationState, uiState: creationUi, daysOfWeek: createDays,
    TASK_NATURES: { normal: {}, neutral: {}, recharge: {} },
    document: { getElementById: id => createFields[id] },
    calendarSync: { getInbox: () => [{ id: 'event-1' }], markInboxConverted(id) { convertedEvent = id; } }
});
createFields['ct-text'].value = '  ';
createWindow.saveNewTask();
assert.equal(creationState.tasks.length, 0);
assert.equal(titleInvalid && titleFocused, true, 'Título vazio deve ter erro local e foco, sem recriar o formulário.');
assert.equal(createFields['ct-subtasks'].value, 'Ler\n\nRevisar', 'O erro deve preservar os outros campos.');
createFields['ct-text'].value = 'Revisar contrato';
for (const nature of ['normal', 'neutral', 'recharge']) {
    createFields['ct-nature'].value = nature;
    createWindow.saveNewTask();
    const task = creationState.tasks.at(-1);
    assert.equal(task.missionNature, nature);
    assert.equal(task.day, 'mon');
    assert.equal(task.startTime, '10:00');
    assert.equal(task.subtasks.length, 2);
    assert.equal(task.complexity, 2);
    assert.equal(task.time, '30 min');
    if (nature === 'normal') assert.ok(task.xp > 0 && task.energyCost > 0);
    if (nature === 'neutral') assert.equal(task.xp + task.energyCost, 0);
    if (nature === 'recharge') assert.ok(task.xp === 0 && task.energyCost < 0);
}
createFields['ct-repeat-mon'].checked = true;
createFields['ct-repeat-tue'].checked = true;
createWindow.saveNewTask();
assert.equal(recurrenceCalls, 1);
assert.equal(creationState.tasks.at(-1).day, 'tue');
const countBeforeInbox = creationState.tasks.length;
creationUi.calendarInboxEventId = 'event-1';
createWindow.saveNewTask();
assert.equal(creationState.tasks.length, countBeforeInbox + 1, 'Converter evento deve criar uma única missão.');
assert.equal(creationState.tasks.at(-1).isRecurring, false);
assert.equal(convertedEvent, 'event-1');
assert.equal(creationUi.createTaskDraft, null);
const captureDraftStart = app.indexOf('const previousCreateDialog =');
const captureDraftEnd = app.indexOf('// Preservar a expansão', captureDraftStart);
const restoreDraftStart = app.indexOf('if (uiState.showCreateTaskModal && uiState.createTaskDraft)');
const restoreDraftEnd = app.indexOf('lucide.createIcons();', restoreDraftStart);
const draftUi = { showCreateTaskModal: true };
const draftFields = [{ id: 'ct-text', value: 'Título em edição' }, { id: 'ct-repeat-tue', type: 'checkbox', value: 'on', checked: true }];
const draftSections = [{ dataset: { createSection: 'recurrence' }, open: true }];
const draftApp = {
    querySelector: () => ({ querySelectorAll: selector => selector.startsWith('input') ? draftFields : draftSections }),
    querySelectorAll: () => draftSections
};
runInNewContext(app.slice(captureDraftStart, captureDraftEnd), { appDiv: draftApp, uiState: draftUi });
draftFields[0].value = '';
draftFields[1].checked = false;
draftSections[0].open = false;
runInNewContext(app.slice(restoreDraftStart, restoreDraftEnd), {
    appDiv: draftApp, uiState: draftUi,
    document: { getElementById: id => draftFields.find(field => field.id === id) }
});
assert.equal(draftFields[0].value, 'Título em edição');
assert.equal(draftFields[1].checked, true);
assert.equal(draftSections[0].open, true, 'Redesenhar deve preservar valores, recorrência e seções abertas.');
const menuStart = app.indexOf('window.closeMissionMenus = function(');
const menuEvents = {};
let menuFocus = null;
const menus = [0, 1].map(id => ({
    open: false,
    querySelector: () => ({ focus() { menuFocus = id; } })
}));
const menuWindow = {};
runInNewContext(app.slice(menuStart, boardStart), {
    window: menuWindow,
    document: {
        querySelectorAll: () => menus.filter(menu => menu.open),
        querySelector: () => menus.find(menu => menu.open),
        addEventListener(name, handler) { menuEvents[name] = handler; }
    }
});
const menuClick = menu => ({ preventDefault() {}, stopPropagation() {}, currentTarget: { closest: () => menu } });
menuWindow.toggleMissionMenu(menuClick(menus[0]));
assert.equal(menus[0].open, true);
menuWindow.toggleMissionMenu(menuClick(menus[1]));
assert.equal(menus[0].open, false, 'Abrir outro menu deve fechar o anterior.');
assert.equal(menus[1].open, true);
menuEvents.click({ target: { closest: () => menus[1] } });
assert.equal(menus[1].open, true, 'Interagir dentro do painel não deve fechá-lo antes da ação.');
menuEvents.click({ target: { closest: () => null } });
assert.equal(menus[1].open, false, 'Clicar fora deve fechar o painel.');
menuWindow.toggleMissionMenu(menuClick(menus[0]));
menuEvents.keydown({ key: 'Escape', preventDefault() {} });
assert.equal(menus[0].open, false);
assert.equal(menuFocus, 0, 'Esc deve devolver o foco ao botão que abriu o painel.');
const boardEnd = app.indexOf('window.renderQuickCapturePanel = function(', boardStart);
const boardWindow = {
    getTaskCategory: () => ({ label: 'Trabalho', icon: 'briefcase' }),
    getRecurringDaysLabel: () => '',
    hasCalendarTime: () => false,
    getTaskNature: () => 'normal',
    getTaskNatureMeta: () => ({}),
    escapeHtml: value => String(value)
};
const statusStart = app.indexOf('window.getMissionStatus = function(');
const statusEnd = app.indexOf('window.showToast = function(', statusStart);
const statusTask = { id: 123.45, completed: false, xp: 10, energyCost: 0 };
const statusState = { tasks: [statusTask], xp: 0, combo: 0, unlockedBadges: [] };
let statusSaves = 0;
let rewards = 0;
const statusWindow = {
    getTaskNature: () => 'normal', getComboMultiplier: () => 1,
    getTaskCoinReward: () => 2,
    awardTacticalCoins() { rewards++; return 2; },
    revokeTacticalCoins() {}, changeEnergy() {}, checkGameTriggers() {},
    rollbackTaskBadges() {}, spawnFloatingText() {}, checkLevelUp() {},
    saveState() { statusSaves++; }
};
runInNewContext(app.slice(statusStart, statusEnd), { window: statusWindow, state: statusState });
boardWindow.getMissionStatus = statusWindow.getMissionStatus;
assert.equal(statusWindow.getMissionStatus(statusTask), 'planned', 'Missões antigas continuam compatíveis.');
statusWindow.setMissionStatus(123.45, 'in_progress');
statusWindow.setMissionStatus(123.45, 'paused');
assert.equal(statusWindow.getMissionStatus(statusTask), 'paused');
assert.equal(statusState.xp, 0, 'Iniciar e pausar não devem conceder XP.');
statusWindow.setMissionStatus(123.45, 'invalid');
assert.equal(statusWindow.getMissionStatus(statusTask), 'paused');
statusWindow.setMissionStatus(123.45, 'completed');
statusWindow.setMissionStatus(123.45, 'completed');
assert.equal(rewards, 1, 'Concluir pelo status deve premiar uma única vez.');
assert.equal(statusState.xp, 10);
statusWindow.setMissionStatus(123.45, 'planned');
assert.equal(statusState.xp, 0, 'Reabrir pelo status deve reverter o XP existente.');
assert.equal(statusTask.completed, false);
assert.equal(statusWindow.getMissionStatus(statusTask), 'planned');
const boardUi = { expandedSubtasks: {} };
runInNewContext(app.slice(boardStart, boardEnd), { window: boardWindow, daysOfWeek: [], uiState: boardUi });
const board = boardWindow.renderDailyMissionBoard([
    { id: 123.45, text: 'Missão de teste', priority: 'media', subtasks: [{ id: 1, text: 'Etapa' }] }
]);
const completionControls = [...board.matchAll(/<([a-z]+)\b[^>]*onclick="window\.toggleTask\(/g)];
assert.equal(completionControls.length, 1, 'Cada missão deve ter um único controle explícito para concluir.');
assert.equal(completionControls[0][1], 'button', 'A linha e o texto da missão não devem concluir por clique.');
assert.match(board, /role="progressbar"[^>]*aria-valuemax="1" aria-valuenow="0"/);
const partialBoard = boardWindow.renderDailyMissionBoard([
    { id: 2, text: 'Etapas', subtasks: [{ completed: true }, { completed: false }] }
]);
assert.match(partialBoard, /style="width:50%"/);
const simpleBoard = boardWindow.renderDailyMissionBoard([{ id: 3, text: 'Sem etapas' }]);
assert.equal(simpleBoard.includes('role="progressbar"'), false);

const toggleSubtaskStart = app.indexOf('window.toggleSubtask = function(');
const toggleSubtaskEnd = app.indexOf('window.deleteSubtask = function(', toggleSubtaskStart);
statusTask.subtasks = [{ id: 1, completed: false }];
runInNewContext(app.slice(toggleSubtaskStart, toggleSubtaskEnd), { window: statusWindow, state: statusState });
statusWindow.toggleSubtask(123.45, 1);
assert.equal(statusTask.workflowStatus, 'in_progress');
assert.equal(statusTask.completed, false, 'Completar as etapas não conclui a missão automaticamente.');
statusWindow.setMissionStatus(123.45, 'paused');
statusWindow.toggleSubtask(123.45, 1);
statusWindow.toggleSubtask(123.45, 1);
assert.equal(statusWindow.getMissionStatus(statusTask), 'paused', 'Alterar etapas preserva a pausa escolhida.');

const addSubtaskStart = app.indexOf('window.addSubtask = function(');
const addSubtaskEnd = app.indexOf('window.toggleSubtask = function(', addSubtaskStart);
const entryTask = { id: 123.45, text: 'Missão de teste', priority: 'media', subtasks: [] };
let entryFocused = false;
let entryDetails = null;
let entryInput = { value: 'Primeira etapa', closest: () => entryDetails };
let entryBoard = '';
const captureStart = app.indexOf("appDiv.querySelectorAll('details[data-subtasks-task-id]')");
const captureEnd = app.indexOf('const dailyTasks =', captureStart);
assert.ok(captureStart > 0 && captureEnd > captureStart);
const entryWindow = {
    showAlertModal(message) { throw new Error(message); },
    saveState() {
        // Executar a captura real de render(), antes de gerar o novo HTML.
        runInNewContext(app.slice(captureStart, captureEnd), {
            uiState: boardUi,
            appDiv: { querySelectorAll: selector => selector === 'details[data-subtasks-task-id]' && entryDetails ? [entryDetails] : [] }
        });
        entryBoard = boardWindow.renderDailyMissionBoard([entryTask]);
        entryDetails = { dataset: { subtasksTaskId: '123.45' }, open: /<details data-subtasks-task-id="123\.45" open /.test(entryBoard) };
        entryInput = { value: '', closest: () => entryDetails, focus() { entryFocused = true; } };
    }
};
runInNewContext(app.slice(addSubtaskStart, addSubtaskEnd), {
    window: entryWindow, state: { tasks: [entryTask] }, uiState: boardUi,
    document: { getElementById: () => entryInput }
});
entryWindow.addSubtask(123.45);
assert.match(entryBoard, /<details data-subtasks-task-id="123\.45" open /,
    'A primeira subtarefa deve abrir a lista após salvar.');
assert.equal(entryFocused, true, 'O cursor deve voltar ao campo recém-renderizado.');
entryInput.value = 'Segunda etapa';
entryFocused = false;
entryWindow.addSubtask(123.45);
assert.equal(entryTask.subtasks.length, 2);
assert.match(entryBoard, /<details data-subtasks-task-id="123\.45" open /,
    'Cadastros consecutivos devem manter a lista aberta.');
assert.equal(entryFocused, true);
// Mesmo um estado antigo fechado não pode sobrescrever a abertura solicitada pelo cadastro.
entryDetails.open = false;
entryInput.value = 'Terceira etapa';
entryWindow.addSubtask(123.45);
assert.equal(entryTask.subtasks.length, 3);
assert.equal(entryDetails.open, true, 'A captura do DOM antigo não deve fechar a lista ao adicionar.');

// A agenda deve manter os itens, a ordem por horário e as ações existentes após a limpeza visual.
const weeklyStart = app.indexOf('        function renderWeeklyPlanningOverview()');
const weeklyEnd = app.indexOf('        function renderStudyPlanningContent()', weeklyStart);
const weeklyTasks = [
    { id: 'late', day: 'mon', text: 'Missão tarde', startTime: '15:00', category: 'work', priority: 'media', subtasks: [] },
    { id: 'free', day: 'mon', text: '<Missão livre>', category: 'work', priority: 'alta', completed: true, subtasks: [] }
];
const weeklyState = { tasks: weeklyTasks, studyData: { subjects: [], studyPlan: { weeklyBlocks: [
    { day: 'mon', title: 'Estudo cedo', startTime: '09:00', plannedMinutes: 60, status: 'planned' },
    { day: 'mon', title: 'Cancelado', status: 'cancelled' }
] } } };
const weeklyUi = { weeklyExpandedSections: { '2026-10-05:mon': false, '2026-10-05:tue': true } };
const weeklyWindow = {
    getActivePlanningWeekStartDate: () => new Date('2026-10-05T12:00:00'),
    getCurrentCalendarWeekStartKey: () => '2026-10-05',
    getNextCalendarWeekStartKey: () => '2026-10-12',
    sortTasksForDay: day => weeklyState.tasks.filter(task => task.day === day),
    sortStudyBlocksBySchedule: blocks => blocks,
    getTaskCategory: () => ({ label: 'Trabalho', icon: 'briefcase' }),
    getStudyTrack: () => ({ name: 'BACEN', icon: 'book' }),
    getCalendarTimeLabel: item => item.startTime,
    escapeHtml: value => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    renderCalendarSyncPanel: () => '<section id="sync-stub"></section>',
    renderCalendarInboxPanel: () => '<section id="inbox-stub"></section>'
};
const weeklyContext = {
    window: weeklyWindow, state: weeklyState, uiState: weeklyUi, daysOfWeek: createDays,
    calendarSync: { view: () => ({ status: 'Sincronizado', connected: true }), getInbox: () => [{ id: 'pending' }] },
    addDaysToDate: (date, days) => new Date(date.getTime() + days * 86400000),
    dateKeyFromDate: date => date.toISOString().slice(0, 10),
    formatPtShortDate: date => date.toISOString().slice(5, 10),
    extractMinutesFromTask: () => 30
};
runInNewContext(app.slice(weeklyStart, weeklyEnd) + '\nthis.renderWeek = renderWeeklyPlanningOverview;', weeklyContext);
const weeklyMarkup = weeklyContext.renderWeek();
assert.ok(weeklyMarkup.indexOf('Estudo cedo') < weeklyMarkup.indexOf('Missão tarde'));
assert.ok(weeklyMarkup.indexOf('Missão tarde') < weeklyMarkup.indexOf('&lt;Missão livre&gt;'));
assert.doesNotMatch(weeklyMarkup, /Cancelado/);
assert.match(weeklyMarkup, /1 compromisso para revisar/);
assert.match(weeklyMarkup, /data-week-day="mon" data-week-section="2026-10-05:mon"  class=/);
assert.match(weeklyMarkup, /data-week-day="tue" data-week-section="2026-10-05:tue" open /);
for (const action of ['setPlanningCalendarWeek', 'exportVisibleWeekToIcs', 'prepareNextWeekPlanning', 'setMainView']) {
    assert.ok(weeklyMarkup.includes(`window.${action}(`), `A agenda deve preservar ${action}.`);
}
weeklyState.tasks = [];
weeklyState.studyData.studyPlan.weeklyBlocks = [];
assert.match(weeklyContext.renderWeek(), /Nenhum item planejado nesta semana/);
assert.match(weeklyContext.renderWeek(), /window.setPlanningCalendarWeek\('prev'\)/,
    'Sem itens, a navegação ainda deve permitir voltar às outras semanas.');

const radarStart = app.indexOf('        window.renderOperationalControl = function()');
const radarEnd = app.indexOf('        // ==========================================\n        // COCKPIT DIÁRIO', radarStart);
const radarDemands = [
    { id: 'safe', title: 'Rotina controlada', workflowStatus: 'active', attentionLevel: 'controlled', nextAction: 'Planejar' },
    { id: 'urgent', title: '<Prazo urgente>', workflowStatus: 'waiting', attentionLevel: 'controlled', nextAction: 'Cobrar retorno', waitingFor: 'Cliente', dueDate: '2026-10-05', followUpAt: '2026-10-06', owner: 'Victor' },
    { id: 'later', title: 'Assunto futuro', workflowStatus: 'backlog', attentionLevel: 'controlled' },
    { id: 'closed', title: 'Demanda encerrada', workflowStatus: 'closed', attentionLevel: 'controlled', nextAction: 'Finalizado' }
];
const radarOriginal = JSON.stringify(radarDemands);
const radarWindow = {
    getOperationalControl: () => ({ demands: radarDemands, config: { dueSoonDays: 2 } }),
    getOperationalSignalsForDate: () => [{ demand: radarDemands[1], severityRank: 0, signals: [
        { severity: 'attention', label: 'Revisão hoje' },
        { severity: 'critical', label: 'Prazo final hoje' }
    ] }],
    escapeHtml: value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    formatOperationalDate: value => value || '—'
};
const radarUi = { radarExpandedSections: { 'demand:urgent': true, history: true } };
runInNewContext(app.slice(radarStart, radarEnd), { window: radarWindow, uiState: radarUi, dateKeyFromDate: () => '2026-10-05' });
const radarMarkup = radarWindow.renderOperationalControl();
assert.ok(radarMarkup.indexOf('&lt;Prazo urgente&gt;') < radarMarkup.indexOf('Rotina controlada'),
    'Prazos críticos devem aparecer antes dos assuntos sem alertas.');
assert.ok(radarMarkup.indexOf('Prazo final hoje') < radarMarkup.indexOf('Revisão hoje'),
    'O sinal mais urgente deve ocupar o destaque do cartão.');
assert.match(radarMarkup, /aria-expanded="true" aria-controls="radar-details-urgent"/);
assert.match(radarMarkup, /data-radar-section="history" open /);
assert.match(radarMarkup, /Cobrar retorno/);
assert.match(radarMarkup, /Cliente/);
assert.match(radarMarkup, /Para depois/);
assert.match(radarMarkup, /window.closeOperationalDemand\(&quot;urgent&quot;\)/);
assert.match(radarMarkup, /window.reopenOperationalDemand\(&quot;closed&quot;\)/);
assert.equal(JSON.stringify(radarDemands), radarOriginal, 'A nova apresentação não altera demandas ou status.');
assert.equal((radarMarkup.match(/Prazo final hoje/g) || []).length, 1,
    'O alerta principal não deve se repetir na área expandida.');
const radarToggleStart = app.indexOf('        window.toggleRadarDetails = function(');
const radarPanel = { hidden: true };
const radarToggleLabel = { textContent: 'Detalhes' };
const radarChevron = { style: {} };
const radarAttributes = { 'aria-controls': 'radar-details-urgent', 'aria-expanded': 'false' };
const radarButton = {
    getAttribute: name => radarAttributes[name],
    setAttribute: (name, value) => { radarAttributes[name] = value; },
    querySelector: selector => selector === '[data-radar-details-label]' ? radarToggleLabel : radarChevron
};
runInNewContext(app.slice(radarToggleStart, radarStart), {
    window: radarWindow, uiState: radarUi,
    document: { getElementById: id => id === 'radar-details-urgent' ? radarPanel : null }
});
radarWindow.toggleRadarDetails('demand:urgent', { currentTarget: radarButton });
assert.equal(radarPanel.hidden, false);
assert.equal(radarAttributes['aria-expanded'], 'true');
assert.equal(radarToggleLabel.textContent, 'Ocultar detalhes');
assert.equal(radarUi.radarExpandedSections['demand:urgent'], true);
radarWindow.toggleRadarDetails('demand:urgent', { currentTarget: radarButton });
assert.equal(radarPanel.hidden, true);
assert.equal(radarAttributes['aria-expanded'], 'false');
assert.equal(radarToggleLabel.textContent, 'Detalhes');
assert.equal(radarUi.radarExpandedSections['demand:urgent'], false);
assert.doesNotThrow(() => radarWindow.toggleRadarDetails('unknown'));
radarDemands.length = 0;
radarWindow.getOperationalSignalsForDate = () => [];
assert.match(radarWindow.renderOperationalControl(), /Nenhuma demanda em acompanhamento/);
assert.match(radarWindow.renderOperationalControl(), /window.openOperationalDemandModal\(\)/);

// Nova demanda: campos existentes, edição de encerradas e validação local.
const demandDialogStart = app.indexOf('        window.renderOperationalDemandModal = function(');
const demandDialogEnd = app.indexOf('        window.closeOperationalDemand = function(', demandDialogStart);
const demandUi = { editingOperationalDemandId: null, alert: { show: false }, confirm: { show: false } };
const demandRecords = { demands: [{ id: 'done', title: '<Assunto encerrado>', workflowStatus: 'closed', owner: 'Victor', customField: 'preservar' }] };
const demandElements = {};
const demandFieldIds = ['title', 'area', 'project', 'next-action', 'due-date', 'review-date', 'owner', 'requester', 'source', 'status', 'attention', 'waiting-for', 'waiting-since', 'followup'].map(id => 'op-demand-' + id);
for (const id of demandFieldIds) demandElements[id] = { value: '', setAttribute(name, value) { this[name] = value; }, focus() { this.focused = true; } };
const localError = { classList: { remove(value) { this.removed = value; } } };
let persists = 0;
const demandWindow = {
    escapeHtml: radarWindow.escapeHtml, getUserDisplayName: () => 'Victor',
    getOperationalDemand: id => demandRecords.demands.find(d => d.id === id),
    getOperationalControl: () => demandRecords,
    saveState: () => { persists++; }, showToast() {}
};
installFormDialogs(demandWindow);
runInNewContext(app.slice(demandDialogStart, demandDialogEnd), {
    window: demandWindow, uiState: demandUi,
    document: { getElementById: id => id === 'op-demand-title-error' ? localError : demandElements[id] },
    render() {}, setTimeout() {}
});
const newDemandMarkup = demandWindow.renderOperationalDemandModal();
for (const id of demandFieldIds) assert.ok(newDemandMarkup.includes(`id="${id}"`), `Campo ${id} precisa continuar disponível.`);
assert.match(newDemandMarkup, /role="dialog" aria-modal="true"/);
assert.match(newDemandMarkup, /type="submit"/);
assert.match(newDemandMarkup, /id="op-waiting-fields" class="hidden/);
demandUi.editingOperationalDemandId = 'done';
const closedDemandMarkup = demandWindow.renderOperationalDemandModal();
assert.match(closedDemandMarkup, /&lt;Assunto encerrado&gt;/);
assert.match(closedDemandMarkup, /value="closed" selected/);
demandElements['op-demand-title'].value = 'Título revisado';
demandElements['op-demand-status'].value = 'closed';
demandWindow.saveOperationalDemand();
assert.equal(demandRecords.demands[0].workflowStatus, 'closed', 'Editar uma encerrada não deve reabri-la.');
assert.equal(demandRecords.demands[0].customField, 'preservar');
assert.equal(persists, 1);
demandElements['op-demand-title'].value = '   ';
demandWindow.saveOperationalDemand();
assert.equal(persists, 1, 'Título vazio não deve salvar.');
assert.equal(demandElements['op-demand-title']['aria-invalid'], 'true');
assert.equal(demandElements['op-demand-title'].focused, true);
assert.equal(localError.classList.removed, 'hidden');
demandElements['op-demand-title'].value = 'Aguardar fornecedor';
demandElements['op-demand-status'].value = 'waiting';
demandElements['op-demand-waiting-for'].value = 'Fornecedor';
demandElements['op-demand-followup'].value = '2026-10-10';
demandWindow.saveOperationalDemand();
assert.equal(demandRecords.demands[0].waitingFor, 'Fornecedor');
assert.equal(demandRecords.demands[0].followUpAt, '2026-10-10');

const opCaptureStart = app.indexOf('const previousDemandDialog =');
const opCaptureEnd = app.indexOf('const previousCreateDialog =', opCaptureStart);
const opRestoreStart = app.indexOf('if (uiState.showOperationalDemandModal && uiState.operationalDemandDraft)');
const opRestoreEnd = app.indexOf('window.bindOperationalDemandDialog(appDiv);', opRestoreStart);
const opDraftUi = { showOperationalDemandModal: true };
const opDraftFields = [{ id: 'op-demand-title', value: 'Rascunho em andamento' }, { id: 'op-demand-status', value: 'waiting' }];
const opDraftSections = [{ dataset: { demandSection: 'context' }, open: true }];
const opDraftApp = {
    querySelector: () => ({ querySelectorAll: selector => selector.startsWith('input') ? opDraftFields : opDraftSections }),
    querySelectorAll: () => opDraftSections
};
runInNewContext(app.slice(opCaptureStart, opCaptureEnd), { appDiv: opDraftApp, uiState: opDraftUi });
opDraftFields.forEach(field => { field.value = ''; }); opDraftSections[0].open = false;
runInNewContext(app.slice(opRestoreStart, opRestoreEnd), { appDiv: opDraftApp, uiState: opDraftUi, document: { getElementById: id => opDraftFields.find(field => field.id === id) } });
assert.equal(opDraftFields[0].value, 'Rascunho em andamento');
assert.equal(opDraftFields[1].value, 'waiting');
assert.equal(opDraftSections[0].open, true);

// Edição: valores existentes, recorrência e recompensas já recebidas.
const editRendererStart = app.indexOf('        window.renderEditTaskModal = function(');
const editRendererEnd = app.indexOf('        window.bindEditTaskDialog = function(', editRendererStart);
const editable = { id: 91, text: '<Missão recorrente>', day: 'mon', category: 'work', priority: 'alta', complexity: 3, time: '60 min', missionNature: 'normal', startTime: '09:30', endTime: '10:30', recurrenceDays: ['mon', 'tue'], recurrenceGroupId: 'group-91', completed: true, subtasks: [{ id: 1, text: 'Preservar', completed: true }], customField: 'preservar', xp: 100, energyCost: 20 };
const editWindow = { escapeHtml: radarWindow.escapeHtml, getTaskNature: task => task.missionNature, getTaskCategories: () => [{ id: 'work', label: 'Trabalho' }] };
installFormDialogs(editWindow);
runInNewContext(app.slice(editRendererStart, editRendererEnd), { window: editWindow, daysOfWeek: [{ id: 'mon', label: 'Segunda' }, { id: 'tue', label: 'Terça' }] });
const editMarkup = editWindow.renderEditTaskModal(editable);
assert.match(editMarkup, /&lt;Missão recorrente&gt;/);
assert.match(editMarkup, /role="dialog" aria-modal="true"/);
assert.match(editMarkup, /data-edit-section="schedule" open/);
assert.match(editMarkup, /data-edit-section="recurrence" open/);
assert.match(editMarkup, /id="et-start-time" type="time" value="09:30"/);
assert.match(editMarkup, /Editar não recalcula as recompensas/);
const editValues = { 'et-text': 'Título ajustado', 'et-day': 'mon', 'et-category': 'work', 'et-priority': 'alta', 'et-complexity': '3', 'et-time': '60', 'et-impact-type': 'drain', 'et-nature': 'normal' };
const editElements = Object.fromEntries(Object.entries(editValues).map(([id, value]) => [id, { value, setAttribute(name, value) { this[name] = value; }, focus() { this.focused = true; } }]));
editElements['et-repeat-mon'] = { checked: false }; editElements['et-repeat-tue'] = { checked: true };
const editState = { tasks: [editable], activeTab: 'mon', xp: 500, coins: 200 };
const editUi = { editingTaskId: 91, editTaskDraft: { fields: [] }, showEditTaskModal: true };
let recurringUpdate = null, editSaves = 0;
Object.assign(editWindow, {
    calculateTaskCost: () => ({ xp: 104, hp: 20 }), readCalendarTimeFields: () => ({ startTime: '09:30', endTime: '10:30' }),
    upsertRecurringTaskOccurrences: (task, days, options) => { recurringUpdate = { days: [...days], removeUnselected: options.removeUnselected }; },
    reindexTaskOrderForDay() {}, getRecurringDaysLabel: () => 'Terça', showToast() {}, saveState: () => { editSaves++; }, showAlertModal() { throw new Error('Alerta inesperado'); }
});
const saveEditStart = app.indexOf('        window.saveEditedTask = function(');
const saveEditEnd = app.indexOf('        window.calculateTaskCost = function(', saveEditStart);
runInNewContext(app.slice(saveEditStart, saveEditEnd), { window: editWindow, state: editState, uiState: editUi, daysOfWeek: [{ id: 'mon' }, { id: 'tue' }], document: { getElementById: id => id === 'et-title-error' ? localError : editElements[id] } });
editWindow.saveEditedTask();
assert.deepEqual(recurringUpdate, { days: ['tue'], removeUnselected: true });
assert.equal(editable.day, 'tue'); assert.equal(editable.text, 'Título ajustado');
assert.equal(editable.completed, true); assert.equal(editable.subtasks[0].completed, true); assert.equal(editable.customField, 'preservar');
assert.equal(editState.xp, 500); assert.equal(editState.coins, 200); assert.equal(editSaves, 1);
assert.equal(editUi.editTaskDraft, null);
editUi.editingTaskId = 91; editElements['et-text'].value = ' ';
editWindow.saveEditedTask();
assert.equal(editElements['et-text']['aria-invalid'], 'true'); assert.equal(editElements['et-text'].focused, true); assert.equal(editSaves, 1);

const editDraftUi = { showEditTaskModal: true };
const editDraftFields = [{ id: 'et-text', value: 'Edição em andamento' }, { id: 'et-repeat-tue', type: 'checkbox', value: 'on', checked: true }];
const editDraftSections = [{ dataset: { editSection: 'recurrence' }, open: true }];
const editDraftApp = { querySelector: () => ({ querySelectorAll: selector => selector.startsWith('input') ? editDraftFields : editDraftSections }), querySelectorAll: () => editDraftSections };
const editCaptureStart = app.indexOf('const previousEditDialog =');
const editCaptureEnd = app.indexOf('const previousDemandDialog =', editCaptureStart);
runInNewContext(app.slice(editCaptureStart, editCaptureEnd), { appDiv: editDraftApp, uiState: editDraftUi });
editDraftFields[0].value = ''; editDraftFields[1].checked = false; editDraftSections[0].open = false;
const editRestoreStart = app.indexOf('if (uiState.showEditTaskModal && uiState.editTaskDraft)');
const editRestoreEnd = app.indexOf('window.bindEditTaskDialog(appDiv);', editRestoreStart);
runInNewContext(app.slice(editRestoreStart, editRestoreEnd), { appDiv: editDraftApp, uiState: editDraftUi, document: { getElementById: id => editDraftFields.find(field => field.id === id) } });
assert.equal(editDraftFields[0].value, 'Edição em andamento'); assert.equal(editDraftFields[1].checked, true); assert.equal(editDraftSections[0].open, true);

// A estrutura compartilhada mantém as ações reais e a navegação do diálogo.
for (const markup of [createMarkup, inboxMarkup, newDemandMarkup, closedDemandMarkup, editMarkup]) {
    const actions = [...markup.matchAll(/window\.([A-Za-z_$][\w$]*)\(/g)];
    assert.ok(actions.length > 0, 'O diálogo deve renderizar ações verificáveis');
    for (const [, action] of actions) {
        assert.ok(new RegExp(`window\\.${action}\\s*=`).test(app), `Ação renderizada sem implementação: ${action}`);
    }
}
const sharedHandlerWindow = { escapeHtml: value => String(value), closeExample() { this.closed = true; }, saveExample() { this.saved = true; } };
installFormDialogs(sharedHandlerWindow);
const sharedMarkup = sharedHandlerWindow.renderFormDialog({ id: 'example-dialog', titleId: 'example-title', title: 'Exemplo', description: '', closeLabel: 'Fechar', closeHandler: 'closeExample', submitHandler: 'saveExample', body: '', footer: '' });
assert.doesNotMatch(sharedMarkup, /target\./, 'O HTML deve chamar os handlers globais do app.');
const sharedClick = sharedMarkup.match(/onclick="([^"]+)"/)[1];
const sharedSubmit = sharedMarkup.match(/onsubmit="([^"]+)"/)[1];
let submitPrevented = false;
runInNewContext(sharedClick, { window: sharedHandlerWindow });
runInNewContext(sharedSubmit, { window: sharedHandlerWindow, event: { preventDefault() { submitPrevented = true; } } });
assert.equal(sharedHandlerWindow.closed, true); assert.equal(sharedHandlerWindow.saved, true); assert.equal(submitPrevented, true);
let activeControl = null, keyboardCloseCount = 0, prepareCount = 0, bindingCount = 0;
const control = () => ({ disabled: false, getClientRects: () => [1], focus() { activeControl = this; } });
const firstControl = control(), lastControl = control();
const hiddenControl = { ...control(), getClientRects: () => [] };
const keyboardEvents = {};
const keyboardDialog = {
    contains: el => el === firstControl || el === lastControl,
    querySelector: () => firstControl,
    querySelectorAll: () => [hiddenControl, firstControl, lastControl],
    addEventListener: (name, handler) => { keyboardEvents[name] = handler; bindingCount++; }
};
const keyboardDocument = { get activeElement() { return activeControl; } };
const keyboardWindow = {};
installDialogModule(keyboardWindow, keyboardDocument);
const dialogOptions = { id: 'test-dialog', initialFocus: 'test-title', close: () => { keyboardCloseCount++; }, prepare: () => { prepareCount++; } };
const keyboardRoot = { querySelector: () => keyboardDialog };
keyboardWindow.bindFormDialog(keyboardRoot, { ...dialogOptions, blocked: true });
assert.equal(bindingCount, 0); assert.equal(prepareCount, 0);
keyboardWindow.bindFormDialog(keyboardRoot, dialogOptions);
assert.equal(activeControl, firstControl); assert.equal(prepareCount, 1);
let prevented = 0, stopped = 0;
const keyEvent = (key, shiftKey = false) => ({ key, shiftKey, preventDefault() { prevented++; }, stopPropagation() { stopped++; } });
activeControl = lastControl; keyboardEvents.keydown(keyEvent('Tab'));
assert.equal(activeControl, firstControl);
keyboardEvents.keydown(keyEvent('Tab', true)); assert.equal(activeControl, lastControl);
keyboardEvents.keydown(keyEvent('Escape')); assert.equal(keyboardCloseCount, 1); assert.equal(stopped, 1); assert.equal(prevented, 3);
assert.doesNotThrow(() => keyboardWindow.bindFormDialog({ querySelector: () => null }, dialogOptions));

console.log(`Integridade da interface: módulo, ${uniqueHandlers.length} handlers, Pomodoro, missões, semana e Radar conferidos.`);
