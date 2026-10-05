import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

const app = await readFile(new URL('./app.html', import.meta.url), 'utf8');
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

const inlineHandlers = [...app.matchAll(/on(?:click|change|input|keypress|dragstart|dragend|dragover|dragleave|drop)="window\.([A-Za-z_$][\w$]*)/g)]
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
            appDiv: { querySelectorAll: () => entryDetails ? [entryDetails] : [] }
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

console.log(`Integridade da interface: módulo, ${uniqueHandlers.length} handlers, saída do Pomodoro e conclusão explícita conferidos.`);
