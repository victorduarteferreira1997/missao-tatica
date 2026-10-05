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

console.log(`Integridade da interface: módulo, ${uniqueHandlers.length} handlers e saída do Pomodoro conferidos.`);
