import assert from 'node:assert/strict';
import test from 'node:test';
import {boot} from './test-support/app_boot.mjs';

function fixture() {
    const app = boot();
    const {state, window} = app;
    state.activeTab = 'monday';
    state.currentFilter = 'all';
    state.tasks = ['2026-10-05', '2026-10-12'].map((week, index) => ({
        id: index + 1, text: 'Conferir entrega ' + (index + 1),
        day: 'monday', planningWeekStart: week, category: 'work',
        completed: false, workflowStatus: 'planned', missionNature: 'neutral',
        time: '30 min', subtasks: [{id: index + ':sub:0', text: 'Conferir pauta', completed: false}]
    }));
    window.saveState = () => {};
    return app;
}
function handler(html, name) {
    const source = html.match(new RegExp('onclick="(window.' + name + '\\([^"]+)"'))?.[1];
    assert.ok(source, name);
    return source.replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&');
}
test('avançar a semana e concluir no Foco altera somente a missão exibida', () => {
    const {state, window, elements, render} = fixture();
    window.openTaskFocus(1);
    window.setPlanningCalendarWeek('forward');
    render();
    assert.equal(window.getCurrentFocusTargetTask().id, 2);
    const source = handler(elements.app.innerHTML, 'toggleTask');
    Function('window', 'event', source)(window, {stopPropagation() {}});
    assert.equal(state.tasks[0].completed, false);
    assert.equal(state.tasks[1].completed, true);
});
test('Foco aceita o ID composto da subtarefa e escapa seu texto', () => {
    const {state, window, elements, render} = fixture();
    state.tasks[0].subtasks[0].text = '<etapa>';
    window.openTaskFocus(1);
    render();
    assert.ok(elements.app.innerHTML.includes('&lt;etapa&gt;'));
    const source = handler(elements.app.innerHTML, 'toggleSubtask');
    Function('window', 'event', source)(window, {stopPropagation() {}});
    assert.equal(state.tasks[0].subtasks[0].completed, true);
    assert.equal(state.tasks[1].subtasks[0].completed, false);
});
test('categoria vazia oferece limpar filtro sem declarar o dia concluído', () => {
    const {window, elements, render} = fixture();
    window.openTaskFocus(1);
    window.setCategoryFilter('life');
    render();
    assert.ok(elements.app.innerHTML.includes('Limpar filtro'));
    assert.ok(!elements.app.innerHTML.includes('Dia concluído'));
});
test('dia vazio oferece criar a primeira missão', () => {
    const {state, window} = fixture();
    state.tasks = [];
    const html = window.renderDailyMissionBoard([]);
    assert.ok(html.includes('Nenhuma missão planejada para este dia'));
    assert.ok(html.includes('window.toggleCreateTaskModal()'));
});
test('ciclo iniciado preserva alvo e expõe sua data ao avançar a semana', () => {
    const {state, window, elements, render} = fixture();
    window.openTaskFocus(1);
    window.togglePomodoro(1);
    window.setPlanningCalendarWeek('forward');
    render();
    assert.ok(elements.app.innerHTML.includes('Ciclo vinculado a 05/10/2026'));
    assert.ok(!elements.app.innerHTML.includes('CONCLUIR MISSÃO'));
    window.closeTaskFocus();
    assert.equal(state.tasks[0].completed, false);
});
