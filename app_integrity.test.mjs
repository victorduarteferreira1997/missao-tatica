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
