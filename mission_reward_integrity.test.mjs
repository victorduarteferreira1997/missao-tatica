import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from './test-support/app_boot.mjs';

for (const [label, costs, xp, energy] of [
    ['custos ausentes', {}, 0, 0],
    ['custos inválidos', {xp: 'inválido', energyCost: Infinity}, 0, 0],
    ['custos numéricos em texto', {xp: '30', energyCost: '7'}, 30, 7],
    ['custos zerados', {xp: 0, energyCost: 0}, 0, 0],
]) {
    test(`concluir e reabrir missão com ${label} mantém XP e bateria finitos`, () => {
        const b = boot(), messages = [];
        b.state.currentPlanningWeekStart = '2026-10-19';
        b.state.energy = 50;
        b.state.tasks = [{id: 1, text: 'Missão antiga', day: 'monday',
            planningWeekStart: '2026-10-19', category: 'work', priority: 'media',
            missionNature: 'normal', completed: false, subtasks: [], ...costs}];
        b.window.spawnFloatingText = (_, text) => messages.push(text);
        b.window.playMissionCompleteSound = () => {};
        b.window.validateState();
        b.window.toggleTask(1);
        assert.equal(b.state.tasks[0].rewardedXp, xp);
        assert.equal(b.state.tasks[0].rewardedEnergyCost, energy);
        assert.equal(b.state.energy, 50 - energy);
        assert.ok(Number.isFinite(b.state.xp));
        assert.ok(messages.every(text => !/NaN|Infinity/.test(text)));
        b.window.toggleTask(1);
        assert.equal(b.state.tasks[0].completed, false);
        assert.equal(b.state.energy, 50);
        assert.ok(Number.isFinite(b.state.xp));
    });
}
