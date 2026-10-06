import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const app = await readFile(new URL('./app.html', import.meta.url), 'utf8');
function sourceBetween(start, end) {
    const from = app.indexOf(start);
    const to = app.indexOf(end, from + start.length);
    assert.ok(from >= 0 && to > from, `Trecho ausente: ${start}`);
    return app.slice(from, to);
}
function engine(overrides = {}) {
    const state = {
        xp: 25100, level: 10, energy: 60, coins: 100, unlockedBadges: ['deep_focus'],
        tasks: [], stats: {}, customRewards: [],
        ...overrides
    };
    const context = {
        state, uiState: { statsTab: 'roadmap' },
        daysOfWeek: [{ id: 'monday' }, { id: 'tuesday' }],
        window: { getCurrentCalendarWeekStartKey: () => '2026-10-05' }
    };
    runInNewContext([
        sourceBetween('const RANKS =', 'const TASK_NATURES ='),
        sourceBetween('window.normalizeEconomy =', 'window.getTaskNature ='),
        sourceBetween('window.getRankProgress =', 'window.getRankName ='),
        sourceBetween('window.getCurrentlyQualifiedBadgeIds =', 'window.rollbackTaskBadges ='),
        sourceBetween('function renderQGContent()', '// --- ESTUDOS ---'),
        'window.renderQGForTest = renderQGContent;',
        'window.rewardsForTest = REWARDS_SHOP;',
        'window.badgesForTest = BADGES_DB;'
    ].join('\n'), context);
    return context;
}

test('patentes exibem o limiar de entrada e o restante da promoção correta', () => {
    const { window } = engine();
    assert.equal(window.getRankProgress(1, 0).entryXp, 0);
    assert.equal(window.getRankProgress(2, 600).entryXp, 600);
    const progress = window.getRankProgress(10, 25100);
    assert.equal(progress.entryXp, 25000);
    assert.equal(progress.nextXp, 33000);
    assert.equal(progress.remainingXp, 7900);
    assert.match(window.renderQGForTest(), /Disponível a partir de 25000 XP/);
    assert.match(window.renderQGForTest(), /Próxima promoção: 33000 XP · faltam 7900 XP/);
});

test('a patente máxima não promete uma promoção em 999999 XP', () => {
    const { window } = engine({ level: 15, xp: 90000 });
    const progress = window.getRankProgress();
    assert.equal(progress.entryXp, 90000);
    assert.equal(progress.nextXp, null);
    assert.equal(progress.percent, 100);
    const html = window.renderQGForTest();
    assert.match(html, /Patente máxima conquistada/);
    assert.ok(!html.includes('999999'));
});

test('a recompensa grande é acumulável e resgatável pelas regras padrão', () => {
    const { window, state } = engine({ coins: 0 });
    window.normalizeEconomy();
    // Oito semanas com 250 MT não gastos transferem 125 MT por semana à reserva.
    for (let week = 0; week < 8; week++) {
        window.awardTacticalCoins(250);
        state.economy.weekStartKey = 'semana-anterior';
        window.rollOverEconomyWeekIfNeeded();
    }
    window.awardTacticalCoins(250);
    assert.equal(state.economy.tacticalReserve, 1000);
    assert.equal(window.getTotalTacticalCoins(), 1250);
    const reward = window.rewardsForTest.find(r => r.id === 'r7');
    assert.equal(reward.cost, 1200);
    assert.equal(window.spendTacticalCoins(reward.cost), true);
    assert.equal(window.getTotalTacticalCoins(), 50);
});

test('atualizar alvo oficial preserva XP, patentes, moedas e medalhas', () => {
    const { window, state } = engine({
        economy: { tacticalReserve: 231, targetReward: { type: 'default', id: 'r7', cost: 1800 } }
    });
    const before = JSON.stringify([state.xp, state.level, state.coins, state.unlockedBadges]);
    window.normalizeEconomy();
    assert.equal(state.economy.targetReward.cost, 1200);
    assert.equal(state.economy.tacticalReserve, 231);
    assert.equal(JSON.stringify([state.xp, state.level, state.coins, state.unlockedBadges]), before);
    window.normalizeEconomy();
    assert.equal(state.economy.targetReward.cost, 1200);
});

test('preço de alvo personalizado permanece intacto', () => {
    const { window, state } = engine({
        economy: { targetReward: { type: 'custom', id: 'r7', cost: 1800 } }
    });
    window.normalizeEconomy();
    assert.equal(state.economy.targetReward.cost, 1800);
});

test('loja calcula o valor faltante com reserva e bloqueia só resgate insuficiente', () => {
    const context = engine({ coins: 100, economy: { tacticalReserve: 231 } });
    context.uiState.statsTab = 'shop';
    const html = context.window.renderQGForTest();
    assert.match(html, /Faltam 869 MT/);
    assert.match(html, /buyReward\('r7'\)" disabled/);
    assert.match(html, /buyReward\('r1'\)"\s+class=/);
    context.state.customRewards = [{ id: 22, title: 'Passeio', cost: 400 }];
    assert.match(context.window.renderQGForTest(), /Faltam 69 MT/);
});

test('descrições de medalhas correspondem aos critérios existentes', () => {
    const { window } = engine({
        tasks: [1, 2, 3].map(id => ({ id, day: 'monday', category: 'law', priority: 'baixa', completed: true })),
        stats: { pomodorosCompleted: 4 }, studyData: { reviews: [{}, {}, {}] }
    });
    const qualified = window.getCurrentlyQualifiedBadgeIds();
    assert.ok(qualified.includes('legal_eagle'));
    assert.ok(qualified.includes('deep_focus'));
    assert.ok(qualified.includes('operador_1_7_30'));
    const description = id => window.badgesForTest.find(b => b.id === id).desc;
    assert.equal(description('legal_eagle'), 'Concluiu 3 missões da categoria Advocacia.');
    assert.match(description('deep_focus'), /qualquer categoria/);
    assert.match(description('operador_1_7_30'), /pelo menos 3 revisões/);
});
