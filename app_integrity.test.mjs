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
const boardEnd = app.indexOf('window.renderQuickCapturePanel = function(', boardStart);
const boardWindow = {
    getTaskCategory: () => ({ label: 'Trabalho', icon: 'briefcase' }),
    getRecurringDaysLabel: () => '',
    hasCalendarTime: () => false,
    getTaskNature: () => 'normal',
    getTaskNatureMeta: () => ({}),
    escapeHtml: value => String(value)
};
const boardUi = { expandedSubtasks: {} };
runInNewContext(app.slice(boardStart, boardEnd), { window: boardWindow, daysOfWeek: [], uiState: boardUi });
const board = boardWindow.renderDailyMissionBoard([
    { id: 123.45, text: 'Missão de teste', priority: 'media', subtasks: [{ id: 1, text: 'Etapa' }] }
]);
const completionControls = [...board.matchAll(/<([a-z]+)\b[^>]*onclick="window\.toggleTask\(/g)];
assert.equal(completionControls.length, 1, 'Cada missão deve ter um único controle explícito para concluir.');
assert.equal(completionControls[0][1], 'button', 'A linha e o texto da missão não devem concluir por clique.');

const addSubtaskStart = app.indexOf('window.addSubtask = function(');
const addSubtaskEnd = app.indexOf('window.toggleSubtask = function(', addSubtaskStart);
const entryTask = { id: 123.45, text: 'Missão de teste', priority: 'media', subtasks: [] };
let entryFocused = false;
let entryInput = { value: 'Primeira etapa' };
let entryBoard = '';
const entryWindow = {
    showAlertModal(message) { throw new Error(message); },
    saveState() {
        entryBoard = boardWindow.renderDailyMissionBoard([entryTask]);
        entryInput = { value: '', focus() { entryFocused = true; } };
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

console.log(`Integridade da interface: módulo, ${uniqueHandlers.length} handlers, saída do Pomodoro e conclusão explícita conferidos.`);
