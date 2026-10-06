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
        xp: 25100, level: 10, energy: 60, coins: 100, combo: 0, unlockedBadges: ['deep_focus'],
        tasks: [], stats: {}, customRewards: [],
        ...overrides
    };
    const context = {
        state, uiState: { statsTab: 'roadmap' },
        daysOfWeek: [{ id: 'monday' }, { id: 'tuesday' }],
        setTimeout: () => 0, render() {},
        window: {
            getCurrentCalendarWeekStartKey: () => '2026-10-05',
            showToast() {}, showAlertModal(message) { this.alertForTest = message; },
            showConfirmModal(message, callback) { this.confirmMessageForTest = message; this.confirmForTest = callback; },
            saveState() { this.savesForTest = (this.savesForTest || 0) + 1; },
            getTaskNature: () => 'normal', isNormalMission: () => true, spawnFloatingText() {}
        }
    };
    runInNewContext([
        sourceBetween('const RANKS =', 'const TASK_NATURES ='),
        sourceBetween('function getCorrectLevel(', 'function getMondayStartDate('),
        sourceBetween('window.normalizeEconomy =', 'window.getTaskNature ='),
        sourceBetween('window.getTaskCoinReward =', 'window.setRewardTarget ='),
        sourceBetween('window.getComboMultiplier =', 'window.getUserDisplayName ='),
        sourceBetween('window.escapeHtml =', '// Ponte temporária'),
        sourceBetween('window.getCampaignBadgeDefinition =', 'window.getComboMultiplier ='),
        sourceBetween('window.renderProfileModal =', 'window.checkLevelUp = function()'),
        sourceBetween('window.checkLevelUp = function()', 'window.showToast ='),
        sourceBetween('window.toggleQuickTask =', 'window.deleteQuickTask ='),
        sourceBetween('window.recalculateLevelFromXp =', 'window.archiveReview ='),
        sourceBetween('window.formatCampaignDate =', '// --- ESTUDOS ---'),
        'window.renderQGForTest = renderQGContent;',
        'window.rewardsForTest = REWARDS_SHOP;',
        'window.badgesForTest = BADGES_DB;',
        'window.themesForTest = CAMPAIGN_THEMES;'
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

test('QG destaca a patente atual e mantém toda a carreira em seções expansíveis', () => {
    for (const [level, xp] of [[1, 0], [10, 32287], [15, 95000]]) {
        const { window, state } = engine({ level, xp });
        window.normalizeEconomy();
        window.normalizePrestige();
        const before = JSON.stringify(state);
        const html = window.renderQGForTest();
        assert.equal(JSON.stringify(state), before, 'Renderizar não altera o progresso');
        assert.match(html, new RegExp(`Sua patente · Nível ${level}`));
        assert.equal((html.match(/Nível \d+/g) || []).length, 15, 'Cada patente aparece uma vez');
        if (level === 10) {
            assert.match(html, /aria-valuenow="91"/);
            assert.match(html, /faltam 713 XP/);
            assert.ok(html.indexOf('Sua patente') < html.indexOf('Patentes conquistadas'));
            assert.ok(!/<details[^>]*\bopen\b/.test(html));
        }
        if (level === 1) assert.ok(!html.includes('Patentes conquistadas'));
        if (level === 15) assert.ok(!html.includes('Próxima patente'));
    }
});

test('medalhas separa conquistas de desafios sem esconder critérios', () => {
    const ctx = engine();
    ctx.uiState.statsTab = 'badges';
    const html = ctx.window.renderQGForTest();
    assert.match(html, /1 de \d+ medalhas conquistadas/);
    assert.ok(html.indexOf('Foco Absoluto') < html.indexOf('Próximos desafios'));
    for (const badge of ctx.window.badgesForTest.filter(b => !['veterano', 'legado'].includes(b.id))) {
        assert.equal(html.split(`<h4 class="font-bold text-white text-sm">${badge.title}</h4>`).length - 1, 1);
        assert.ok(html.includes(badge.desc));
    }
    ctx.state.prestige.badgeEvents = ctx.window.badgesForTest.map(b => ({ id: b.id, date: null }));
    assert.match(ctx.window.renderQGForTest(), /Coleção completa/);
    ctx.state.prestige.badgeEvents = [];
    assert.match(ctx.window.renderQGForTest(), /Suas primeiras conquistas/);
});

test('recompensa-alvo mostra saldo combinado, falta e disponibilidade sem interpretar o título como HTML', () => {
    const ctx = engine({ coins: 3, economy: { tacticalReserve: 231,
        targetReward: { type: 'custom', id: '22', title: '<img src=x onerror=alert(1)>', cost: 300 } } });
    ctx.uiState.statsTab = 'shop';
    let html = ctx.window.renderQGForTest();
    assert.match(html, /234 MT/);
    assert.match(html, /Faltam 66 MT para seu alvo de 300 MT/);
    assert.match(html, /aria-valuenow="78"/);
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.ok(!html.includes('<img src=x'));
    assert.match(html, /50% do saldo semanal/);
    assert.ok(!html.includes('NaN'));
    ctx.state.coins = 100;
    html = ctx.window.renderQGForTest();
    assert.match(html, /Alvo alcançado/);
    assert.match(html, /aria-valuenow="100"/);
    ctx.state.economy.targetReward = null;
    assert.match(ctx.window.renderQGForTest(), /Escolher recompensa/);
});

test('atalhos do catálogo rolam dentro do QG sem navegar para o endereço base', () => {
    const ctx = engine();
    ctx.uiState.statsTab = 'shop';
    for (const target of [null, { type: 'default', id: 'r5', title: 'Cinema', cost: 600 }]) {
        ctx.window.normalizeEconomy();
        ctx.state.economy.targetReward = target;
        const html = ctx.window.renderQGForTest();
        const label = target ? 'Ver recompensas' : 'Escolher recompensa';
        const match = html.match(new RegExp(`<button([^>]+)>${label}</button>`));
        assert.ok(match, 'Atalho deve ser um botão local');
        assert.match(match[1], /type="button"/);
        assert.ok(!html.includes('href="#qg-rewards"'));
        const action = match[1].match(/onclick="([^"]+)"/)[1];
        const calls = [];
        runInNewContext(action, { document: { getElementById: id => {
            assert.equal(id, 'qg-rewards');
            return { scrollIntoView: options => calls.push(options) };
        } } });
        assert.equal(calls.length, 1);
        assert.equal(calls[0].behavior, 'smooth');
        assert.equal(calls[0].block, 'start');
    }
});

test('migração inicial do Prestígio é idempotente e preserva os dados anteriores', () => {
    const ctx = engine({ coins: 3, economy: { tacticalReserve: 231 }, quickTasks: [{ id: 1, done: true }],
        studyData: { sessions: [{ id: 1, xpAwarded: 100 }], reviews: [] },
        financeData: { incomes: [{ amount: 500 }] }, healthData: { workouts: [{ id: 2 }] } });
    const before = JSON.stringify(ctx.state);
    ctx.window.normalizePrestige();
    assert.equal(ctx.state.prestige.campaign, 1);
    assert.equal(ctx.window.getCareerXp(), 25100);
    const { prestige, ...rest } = ctx.state;
    assert.equal(JSON.stringify(rest), before);
    const migrated = JSON.stringify(ctx.state);
    ctx.window.normalizePrestige();
    assert.equal(JSON.stringify(ctx.state), migrated);
});

test('Prestígio exige 90000 XP e confirmação; cancelar mantém a campanha', () => {
    for (const xp of [0, 89999]) {
        const ctx = engine({ xp, level: 15 });
        ctx.window.startPrestige();
        assert.ok(ctx.window.alertForTest);
        assert.equal(ctx.window.confirmForTest, undefined);
        assert.equal(ctx.state.prestige.campaigns.length, 0);
    }
    const ctx = engine({ xp: 90000, level: 15 });
    ctx.window.normalizePrestige(); ctx.window.initializeCampaignRecordOrigins();
    const before = JSON.stringify(ctx.state);
    ctx.window.startPrestige();
    assert.match(ctx.window.confirmMessageForTest, /0 XP nesta campanha/);
    assert.equal(JSON.stringify(ctx.state), before, 'Abrir/cancelar a confirmação não reinicia');
    ctx.state.xp = 89999;
    ctx.window.confirmForTest();
    assert.equal(ctx.state.prestige.campaign, 1, 'Revalida o requisito ao confirmar');
});

test('iniciar Prestígio arquiva a campanha e preserva moedas, medalhas e todos os registros', () => {
    const ctx = engine({ xp: 92500, level: 15, energy: 42, combo: 3, coins: 3,
        economy: { tacticalReserve: 231, targetReward: { type: 'default', id: 'r7', cost: 1200 } },
        tasks: [{ id: 9, completed: true, rewardedXp: 100, rewardedBadgeIds: ['primeiro_sangue'] }],
        quickTasks: [{ id: 2, done: true }], unlockedBadges: ['primeiro_sangue', 'deep_focus'],
        studyData: { sessions: [{ id: 10, xpAwarded: 100 }], reviews: [{ id: 11, status: 'completed', xpAwarded: 20 }] },
        financeData: { incomes: [{ amount: 500 }] }, healthData: { workouts: [{ id: 12 }] },
        routineData: { logs: [{ ritualId: 4 }] }, rechargeData: { logs: [{ id: 5 }] },
        focusData: { cycles: [{ id: 6 }] }, rewardPurchases: [{ id: 7 }], customRewards: [{ id: 8 }]
    });
    const preservedKeys = ['energy', 'combo', 'coins', 'economy', 'tasks', 'quickTasks', 'studyData',
        'financeData', 'healthData', 'routineData', 'rechargeData', 'focusData', 'rewardPurchases', 'customRewards', 'stats'];
    ctx.window.initializeCampaignRecordOrigins();
    const before = JSON.stringify(preservedKeys.map(key => ctx.state[key]));
    ctx.window.startPrestige();
    const confirm = ctx.window.confirmForTest;
    confirm();
    assert.equal(ctx.state.xp, 0);
    assert.equal(ctx.state.level, 1);
    assert.equal(ctx.state.prestige.campaign, 2);
    assert.equal(ctx.window.getCareerXp(), 92500);
    assert.equal(JSON.stringify(preservedKeys.map(key => ctx.state[key])), before);
    for (const id of ['primeiro_sangue', 'deep_focus', 'campanha_completa', 'veterano']) assert.ok(ctx.state.unlockedBadges.includes(id));
    assert.equal(ctx.state.prestige.campaigns[0].xp, 92500);
    assert.equal(ctx.state.prestige.campaigns[0].rankLevel, 15);
    assert.equal(ctx.window.savesForTest, 1);
    confirm();
    assert.equal(ctx.state.prestige.campaigns.length, 1, 'Confirmar duas vezes não duplica');
    assert.equal(ctx.window.savesForTest, 1);
    const reloaded = engine(JSON.parse(JSON.stringify(ctx.state)));
    reloaded.window.normalizePrestige();
    assert.equal(reloaded.window.getCareerXp(), 92500);
    assert.equal(reloaded.state.prestige.campaign, 2);
    const html = reloaded.window.renderQGForTest();
    assert.match(html, /Campanha 2/);
    assert.match(html, /Prestígio 1/);
    assert.match(html, /Histórico de campanhas/);
});

test('desfazer missões e tarefas rápidas antigas protege XP e medalhas da nova campanha', () => {
    const ctx = engine({ xp: 90000, level: 15,
        tasks: [{ id: 1, completed: true, rewardedXp: 100, rewardedBadgeIds: ['primeiro_sangue'], category: 'life', day: 'monday' }],
        quickTasks: [{ id: 2, done: true }], unlockedBadges: ['primeiro_sangue', 'deep_focus'] });
    ctx.window.startPrestige(); ctx.window.confirmForTest();
    ctx.state.xp = 150;
    ctx.window.toggleTask(1);
    ctx.window.toggleQuickTask(2);
    assert.equal(ctx.state.xp, 150);
    assert.equal(ctx.window.getCareerXp(), 90150);
    assert.ok(ctx.state.unlockedBadges.includes('primeiro_sangue'));
    ctx.window.unlockBadge('primeiro_sangue');
    assert.equal(ctx.state.xp, 150, 'Medalhas antigas não repetem o bônus');
    ctx.window.toggleQuickTask(2);
    assert.equal(ctx.state.quickTasks[0].xpCampaign, 2);
    assert.equal(ctx.state.xp, 160);
    ctx.window.toggleQuickTask(2);
    assert.equal(ctx.state.xp, 150, 'Ganhos novos continuam reversíveis');
});

test('excluir estudo antigo desconta somente revisões feitas na campanha atual', () => {
    const ctx = engine({ xp: 90000, level: 15, studyData: {
        sessions: [{ id: 10, xpAwarded: 100, energyDeltaApplied: 0 }],
        reviews: [{ id: 11, sourceSessionId: 10, xpAwarded: 20 }, { id: 12, sourceSessionId: 10, xpAwarded: 35, xpCampaign: 2 }]
    } });
    ctx.window.startPrestige(); ctx.window.confirmForTest();
    ctx.state.xp = 150;
    ctx.window.deleteStudySession(10); ctx.window.confirmForTest();
    assert.equal(ctx.state.xp, 115);
    assert.equal(ctx.state.studyData.sessions.length, 0);
    assert.equal(ctx.state.studyData.reviews.length, 0);
    assert.equal(ctx.state.prestige.campaigns[0].xp, 90000);
});

test('progressão continua após o Prestígio e marcos de campanha não concedem XP repetido', () => {
    const ctx = engine({ xp: 89999, level: 14 });
    ctx.window.normalizePrestige();
    ctx.state.xp++;
    ctx.window.checkLevelUp();
    assert.equal(ctx.state.level, 15);
    assert.ok(ctx.state.unlockedBadges.includes('campanha_completa'));
    assert.equal(ctx.state.xp, 90000, 'Marco de campanha é simbólico');
    for (let campaign = 1; campaign <= 2; campaign++) {
        ctx.window.startPrestige(); ctx.window.confirmForTest();
        assert.equal(ctx.state.level, 1);
        assert.equal(ctx.state.xp, 0);
        ctx.state.xp = 600; ctx.window.checkLevelUp();
        assert.equal(ctx.state.level, 2);
        ctx.state.xp = 90000; ctx.window.checkLevelUp();
    }
    assert.equal(ctx.state.prestige.campaign, 3);
    assert.ok(ctx.state.unlockedBadges.includes('legado'));
    assert.equal(ctx.window.getCareerXp(), 270000);
    ctx.window.syncPrestigeMilestones();
    assert.equal(ctx.state.unlockedBadges.filter(id => id === 'legado').length, 1);
    assert.equal(ctx.state.xp, 90000);
});

test('missões novas continuam concedendo e revertendo XP e medalhas na campanha correta', () => {
    const ctx = engine({ xp: 90000, level: 15 });
    ctx.window.startPrestige(); ctx.window.confirmForTest();
    ctx.state.tasks.push({ id: 1, completed: false, xp: 100, energyCost: 0, priority: 'media', category: 'life', day: 'monday' });
    ctx.window.toggleTask(1);
    assert.equal(ctx.state.tasks[0].rewardedCampaign, 2);
    assert.equal(ctx.state.xp, 300, 'Missão e duas conquistas novas');
    assert.ok(ctx.state.unlockedBadges.includes('primeiro_sangue'));
    ctx.window.toggleTask(1);
    assert.equal(ctx.state.xp, 0);
    assert.equal(ctx.state.level, 1);
    assert.ok(!ctx.state.unlockedBadges.includes('primeiro_sangue'));
    assert.ok(ctx.state.unlockedBadges.includes('deep_focus'));
    assert.equal(ctx.window.getCareerXp(), 90000);
});

test('catálogo contém 4 categorias e 15 subtemas com os mesmos 15 limites de XP', () => {
    const ctx = engine();
    const original = ctx.window.themesForTest.find(t => t.id === 'original');
    const themes = ctx.window.themesForTest.filter(t => t.id !== 'original');
    assert.equal(themes.length, 15);
    assert.equal(new Set(themes.map(t => t.id)).size, 15);
    assert.deepEqual(Object.fromEntries(['military', 'mythology', 'scifi', 'fantasy'].map(c => [c, themes.filter(t => t.category === c).length])),
        { military: 5, mythology: 4, scifi: 3, fantasy: 3 });
    for (const theme of themes) {
        assert.equal(theme.ranks.length, 15);
        assert.equal(new Set(theme.ranks.map(r => r.name)).size, 15);
        assert.equal(JSON.stringify(theme.ranks.map(r => [r.level, r.max])), JSON.stringify(original.ranks.map(r => [r.level, r.max])));
        assert.match(theme.color, /^#[0-9a-f]{6}$/);
    }
    const avengers = themes.find(t => t.id === 'avengers');
    assert.ok(avengers.ranks.every(r => r.reference));
    assert.equal(avengers.ranks[4].reference, 'Homem de Ferro');
    assert.equal(avengers.ranks[13].reference, 'Doutor Estranho');
});

test('explorar qualquer tema só altera a seleção temporária; início requer revisão e confirmação', () => {
    const ctx = engine({ xp: 32287, level: 10, coins: 3, economy: { tacticalReserve: 231 } });
    ctx.window.normalizePrestige(); ctx.window.initializeCampaignRecordOrigins();
    const before = JSON.stringify(ctx.state);
    ctx.window.openCampaignPicker();
    assert.match(ctx.window.renderQGForTest(), /Escolha sua próxima jornada/);
    assert.match(ctx.window.renderQGForTest(), /Continuar com o tema atual/);
    for (const theme of ctx.window.themesForTest.filter(t => t.id !== 'original')) {
        ctx.window.selectCampaignCategory(theme.category);
        ctx.window.selectCampaignTheme(theme.id);
        const html = ctx.window.renderQGForTest();
        assert.match(html, /Ver os 15 níveis/);
        assert.ok(html.includes(theme.ranks[0].name));
        assert.ok(html.includes(theme.ranks[14].name));
        assert.ok(html.includes('window.confirmCampaignPicker()'));
        assert.ok(html.includes('Arquivar e recomeçar'));
        assert.ok(!html.includes('href='));
        assert.equal(JSON.stringify(ctx.state), before);
    }
    ctx.window.selectCampaignCategory('mythology'); ctx.window.selectCampaignTheme('norse');
    ctx.window.selectCampaignCategory('mythology');
    assert.equal(ctx.uiState.campaignPicker.themeId, 'norse', 'Clicar na categoria ativa mantém o subtema');
    ctx.window.selectCampaignTheme('avengers');
    assert.equal(ctx.uiState.campaignPicker.themeId, 'norse', 'Ignora subtema de outra categoria');
    ctx.window.selectCurrentCampaignTheme();
    assert.equal(ctx.uiState.campaignPicker.themeId, 'original');
    ctx.window.closeCampaignPicker();
    assert.match(ctx.window.renderQGForTest(), /Comandante Supremo/);
    assert.equal(ctx.window.savesForTest, undefined);
});

test('cada subtema inicia somente após confirmar e exibe títulos e promoção corretos', () => {
    for (const theme of engine().window.themesForTest.filter(t => t.id !== 'original')) {
        const ctx = engine({ xp: 90000, level: 15, coins: 234, tasks: [{ id: 1 }] });
        ctx.window.normalizePrestige(); ctx.window.initializeCampaignRecordOrigins();
        const before = JSON.stringify(ctx.state);
        ctx.window.startPrestige(theme.id);
        assert.equal(JSON.stringify(ctx.state), before, 'Cancelar não muda o tema ou XP');
        assert.ok(ctx.window.confirmMessageForTest.includes(theme.name));
        assert.ok(ctx.window.confirmMessageForTest.includes(theme.ranks[0].name));
        ctx.window.confirmForTest();
        assert.equal(ctx.state.prestige.themeId, theme.id);
        assert.equal(ctx.state.prestige.campaigns[0].themeId, 'original');
        assert.equal(ctx.state.prestige.campaigns[0].rankName, 'Deus do Foco');
        assert.equal(ctx.state.coins, 234);
        assert.equal(ctx.state.tasks[0].id, 1);
        assert.equal(ctx.state.xp, 0);
        assert.equal(ctx.window.getRankName(), theme.ranks[0].name);
        for (const [level, xp] of [[1, 0], [5, 4500], [10, 25000], [15, 90000]]) {
            ctx.state.level = level; ctx.state.xp = xp;
            const html = ctx.window.renderQGForTest();
            assert.ok(html.includes(`<h3 class="text-2xl font-black text-white mt-1">${theme.ranks[level - 1].name}</h3>`));
            assert.ok(!html.includes('999999'));
            if (level < 15) assert.match(html, new RegExp(`Próxima promoção: ${theme.ranks[level - 1].max} XP`));
        }
    }
});

test('referências e frase dos Vingadores acompanham o nível ativo', () => {
    const ctx = engine({ level: 5, xp: 5000, prestige: { themeId: 'avengers' } });
    const html = ctx.window.renderQGForTest();
    assert.match(html, /Inventor de Soluções/);
    assert.match(html, /Referência: Homem de Ferro/);
    assert.match(html, /Use criatividade e preparo para construir seu próximo avanço/);
    assert.match(html, /Seu título · Nível 5/);
    assert.match(html, /Títulos conquistados/);
    ctx.window.openCampaignPicker();
    assert.match(ctx.window.renderQGForTest(), /ordem não representa uma escala de poder/);
});

test('emblemas são permanentes e únicos por subtema; histórico guarda a trajetória anterior', () => {
    const ctx = engine({ xp: 90000, level: 15 });
    ctx.window.syncPrestigeMilestones();
    assert.equal(ctx.state.prestige.emblems.length, 1);
    for (const id of ['espionage', 'avengers', 'norse', 'espionage']) {
        ctx.window.startPrestige(id); ctx.window.confirmForTest();
        const xpBefore = ctx.state.xp;
        ctx.window.syncPrestigeMilestones();
        assert.equal(ctx.state.xp, xpBefore);
        ctx.state.xp = 90000; ctx.window.checkLevelUp();
        ctx.window.syncPrestigeMilestones();
        assert.equal(ctx.state.xp, 90000);
    }
    assert.equal(ctx.state.prestige.emblems.length, 4);
    assert.equal(ctx.state.prestige.emblems.filter(e => e.themeId === 'espionage').length, 1);
    assert.equal(ctx.state.prestige.campaigns[1].themeId, 'espionage');
    assert.equal(ctx.state.prestige.campaigns[1].rankName, 'Lenda da Espionagem');
    assert.equal(ctx.state.prestige.campaigns[2].themeId, 'avengers');
    assert.equal(ctx.state.prestige.campaigns[2].rankName, 'Lenda dos Vingadores');
    assert.equal(ctx.window.getCareerXp(), 450000);
    ctx.window.revertCampaignXp(10, 5);
    ctx.window.syncPrestigeMilestones();
    assert.equal(ctx.state.prestige.emblems.length, 4, 'Desfazer XP não retira emblema conquistado');
    const reloaded = engine(JSON.parse(JSON.stringify(ctx.state)));
    reloaded.window.normalizePrestige(); reloaded.window.syncPrestigeMilestones();
    assert.equal(reloaded.state.prestige.themeId, 'espionage');
    assert.equal(reloaded.state.prestige.emblems.length, 4);
    reloaded.window.openCampaignHistory(2);
    assert.match(reloaded.window.renderQGForTest(), /Lenda da Espionagem/);
    reloaded.window.openCampaignHistory(3);
    assert.match(reloaded.window.renderQGForTest(), /Lenda dos Vingadores/);
});

test('campanhas v1.9.49 migram para original e recuperam emblema sem alterar XP ou história', () => {
    const ctx = engine({ xp: 200, level: 1, prestige: { version: 1, campaign: 2,
        campaigns: [{ number: 1, xp: 92500, rankLevel: 15, rankName: 'Deus do Foco', endedAt: '2026-10-06T16:00:00Z' }],
        maxCampaigns: [1], protectedBadgeIds: ['deep_focus'] } });
    ctx.window.normalizePrestige(); ctx.window.syncPrestigeMilestones();
    assert.equal(ctx.state.prestige.themeId, 'original');
    assert.equal(ctx.state.prestige.campaigns[0].themeId, 'original');
    assert.equal(ctx.state.prestige.campaigns[0].rankName, 'Deus do Foco');
    assert.equal(ctx.state.prestige.emblems.length, 1);
    assert.equal(ctx.state.xp, 200);
    assert.equal(ctx.window.getCareerXp(), 92700);
    const before = JSON.stringify(ctx.state);
    ctx.window.normalizePrestige(); ctx.window.syncPrestigeMilestones();
    assert.equal(JSON.stringify(ctx.state), before);
});

test('seleção inválida é rejeitada e confirmação antiga não inicia uma segunda campanha', () => {
    const ctx = engine({ xp: 90000, level: 15 });
    ctx.window.startPrestige('<img src=x>');
    assert.equal(ctx.window.confirmForTest, undefined);
    assert.match(ctx.window.alertForTest, /subtema válido/);
    ctx.window.startPrestige('avengers'); const firstConfirm = ctx.window.confirmForTest;
    ctx.window.startPrestige('norse'); ctx.window.confirmForTest();
    firstConfirm();
    assert.equal(ctx.state.prestige.themeId, 'norse');
    assert.equal(ctx.state.prestige.campaigns.length, 1);
    assert.equal(ctx.window.savesForTest, 1);
});

test('recomeço antecipado arquiva sem conceder Prestígio e registra a nova campanha desde o nível 1', () => {
    const ctx = engine({ xp: 32287, level: 10, coins: 3, economy: { tacticalReserve: 231 } });
    ctx.window.initializeCampaignRecordOrigins();
    const before = JSON.stringify(ctx.state);
    ctx.window.startCampaign('norse');
    assert.equal(JSON.stringify(ctx.state), before);
    assert.match(ctx.window.confirmMessageForTest, /Aprendiz do Norte/);
    ctx.window.confirmForTest();
    assert.equal(ctx.state.prestige.campaigns[0].status, 'ended-early');
    assert.equal(ctx.state.prestige.campaigns[0].xp, 32287);
    assert.equal(ctx.window.getPrestigeCount(), 0);
    assert.equal(ctx.state.prestige.emblems.length, 0);
    assert.equal(ctx.state.xp, 0);
    assert.equal(ctx.state.level, 1);
    assert.equal(ctx.state.coins, 3);
    assert.equal(ctx.state.economy.tacticalReserve, 231);
    assert.equal(ctx.window.getCareerXp(), 32287);
    assert.match(ctx.state.prestige.levelEvents[0].date, /^\d{4}-/);
    assert.equal(ctx.state.prestige.campaigns[0].levelEvents.length, 10);
    assert.ok(ctx.state.prestige.campaigns[0].levelEvents.every(e => e.date === null));
});

test('progresso zerado preserva registros e histórico quando nenhuma exclusão é escolhida', () => {
    const ctx = engine({ xp: 32287, level: 10, coins: 234, combo: 3, energy: 25,
        stats: { pomodorosCompleted: 20, tasksMoved: 5, rewardsBought: 3 },
        economy: { tacticalReserve: 231, weeklyCoinsEarned: 200, targetReward: { id: 'r7', cost: 1200 } },
        tasks: [{ id: 1, completed: true, rewardedXp: 50 }],
        studyData: { sessions: [{ id: 1, xpAwarded: 100 }], reviews: [{ id: 2, status: 'completed' }] },
        financeData: { incomes: [{ id: 3, amount: 14000 }] }, healthData: { workouts: [{ id: 4 }] }
    });
    ctx.window.initializeCampaignRecordOrigins();
    const records = JSON.stringify([ctx.state.tasks, ctx.state.studyData, ctx.state.financeData, ctx.state.healthData]);
    ctx.window.startCampaign('avengers', { mode: 'reset' }); ctx.window.confirmForTest();
    assert.equal(ctx.state.coins, 0); assert.equal(ctx.state.economy.tacticalReserve, 0);
    assert.equal(ctx.state.economy.targetReward, null); assert.equal(ctx.state.economy.weeklyCoinsEarned, 0);
    assert.equal(ctx.state.combo, 0); assert.equal(ctx.state.energy, 100);
    assert.equal(ctx.state.stats.pomodorosCompleted, 0);
    assert.equal(ctx.state.prestige.badgeEvents.length, 0);
    assert.equal(ctx.state.prestige.campaigns.length, 1);
    assert.equal(JSON.stringify([ctx.state.tasks, ctx.state.studyData, ctx.state.financeData, ctx.state.healthData]), records);
    assert.equal(ctx.window.getCurrentlyQualifiedBadgeIds().length, 0, 'Registros antigos não concedem conquistas na campanha nova');
    ctx.uiState.statsTab = 'badges';
    assert.match(ctx.window.renderQGForTest(), /0 de 21 medalhas conquistadas/);
    ctx.window.setCampaignCollectionScope('career');
    assert.match(ctx.window.renderQGForTest(), /Foco Absoluto/);
});

test('reset completo exige escolhas explícitas e não apaga perfil nem configurações', () => {
    const ctx = engine({ xp: 5000, level: 5, coins: 50,
        userProfile: { displayName: 'Ana', gender: 'feminino', configured: true },
        tasks: [{ id: 1, completed: true }], quickTasks: [{ id: 2, done: true }],
        studyData: { subjects: [{ id: 's', name: 'Direito' }], sessions: [{ id: 3 }], reviews: [{ id: 4 }], studyPlan: { weeklyBlocks: [{ id: 5 }] } },
        financeData: { incomes: [{ id: 6, amount: 14000 }], categoryBudgets: [{ category: 'casa', limit: 100 }] },
        healthData: { workouts: [{ id: 7 }] }, routineData: { rituals: [{ id: 'r' }], logs: [{ id: 8 }] }
    });
    ctx.window.initializeCampaignRecordOrigins();
    ctx.window.startCampaign('espionage', { mode: 'reset', keepHistory: false, deleteRecords: true, includeUnknown: true });
    assert.equal(ctx.state.tasks.length, 1, 'Nada é removido antes da confirmação');
    assert.match(ctx.window.confirmMessageForTest, /Esta exclusão é permanente/);
    assert.match(ctx.window.confirmMessageForTest, /1 receitas/);
    ctx.window.confirmForTest();
    assert.equal(ctx.state.tasks.length, 0); assert.equal(ctx.state.quickTasks.length, 0);
    assert.equal(ctx.state.studyData.sessions.length, 0); assert.equal(ctx.state.studyData.reviews.length, 0);
    assert.equal(ctx.state.financeData.incomes.length, 0); assert.equal(ctx.state.healthData.workouts.length, 0);
    assert.equal(ctx.state.routineData.logs.length, 0);
    assert.equal(ctx.state.studyData.subjects[0].name, 'Direito');
    assert.equal(ctx.state.financeData.categoryBudgets[0].limit, 100);
    assert.equal(ctx.state.routineData.rituals[0].id, 'r');
    assert.equal(ctx.state.userProfile.gender, 'feminino');
    assert.equal(ctx.state.prestige.campaigns.length, 0);
    assert.equal(ctx.window.getCareerXp(), 0);
    assert.equal(ctx.state.prestige.campaign, 2);
    assert.ok(ctx.state.prestige.deletedCampaignIds.includes(1));
});

test('excluir só o histórico preserva a campanha atual e IDs não são reutilizados', () => {
    const ctx = engine({ xp: 32287, level: 10, tasks: [{ id: 1 }] });
    ctx.window.startCampaign('avengers'); ctx.window.confirmForTest();
    ctx.state.xp = 123; ctx.state.coins = 456;
    const records = JSON.stringify(ctx.state.tasks);
    ctx.window.deleteCampaign(1);
    assert.equal(ctx.state.prestige.campaigns.length, 1);
    ctx.window.confirmForTest();
    assert.equal(ctx.state.prestige.campaigns.length, 0);
    assert.equal(ctx.state.prestige.campaign, 2);
    assert.equal(ctx.state.xp, 123); assert.equal(ctx.state.coins, 456);
    assert.equal(ctx.window.getCareerXp(), 123);
    assert.equal(JSON.stringify(ctx.state.tasks), records);
    ctx.window.startCampaign('greek'); ctx.window.confirmForTest();
    assert.equal(ctx.state.prestige.campaign, 3);
    assert.equal(ctx.state.prestige.campaigns[0].number, 2);
    const reload = engine(JSON.parse(JSON.stringify(ctx.state)));
    reload.window.normalizePrestige();
    assert.equal(reload.state.prestige.campaign, 3);
});

test('exclusão seletiva respeita origem e mantém revisões de outras campanhas', () => {
    const ctx = engine({ xp: 10000, level: 7,
        tasks: [{ id: 1, campaignId: 1 }, { id: 2, campaignId: null }],
        studyData: { sessions: [{ id: 10, campaignId: 1 }], reviews: [{ id: 11, campaignId: 1 }, { id: 12, campaignId: 2, sourceSessionId: 10, xpCampaign: 2, xpAwarded: 30, status: 'completed' }] },
        financeData: { incomes: [{ id: 3, amount: 100, campaignId: 1 }, { id: 4, amount: 200, campaignId: null }] }
    });
    ctx.window.startCampaign('egyptian'); ctx.window.confirmForTest(); ctx.state.xp = 100;
    ctx.window.deleteCampaign(1, true); ctx.window.confirmForTest();
    assert.equal(ctx.state.tasks.length, 1); assert.equal(ctx.state.tasks[0].id, 2);
    assert.equal(ctx.state.financeData.incomes.length, 1); assert.equal(ctx.state.financeData.incomes[0].id, 4);
    assert.equal(ctx.state.studyData.sessions.length, 0);
    assert.equal(ctx.state.studyData.reviews.length, 1);
    assert.equal(ctx.state.studyData.reviews[0].sourceSessionId, null);
    assert.equal(ctx.state.xp, 100, 'Revisão de outra campanha permanece e não perde XP');
});

test('excluir registro antigo que ganhou XP novamente desconta apenas os ganhos atuais correspondentes', () => {
    const ctx = engine({ xp: 5000, level: 5, tasks: [{ id: 1, campaignId: 1, completed: false, xp: 100, energyCost: 0, day: 'monday', category: 'life' }] });
    ctx.window.startCampaign('norse'); ctx.window.confirmForTest();
    ctx.window.toggleTask(1);
    assert.equal(ctx.state.xp, 300);
    ctx.state.xp += 50;
    ctx.window.deleteCampaign(1, true); ctx.window.confirmForTest();
    assert.equal(ctx.state.tasks.length, 0);
    assert.equal(ctx.state.xp, 50, 'Missão e seus bônus atuais são removidos; os demais ganhos ficam');
    assert.equal(ctx.state.prestige.missionEvents.length, 0);
});

test('excluir uma campanha atualiza emblemas e conserva conquistas obtidas em outras', () => {
    const ctx = engine({ xp: 90000, level: 15 });
    ctx.window.startPrestige('norse'); ctx.window.confirmForTest();
    ctx.state.xp = 90000; ctx.window.checkLevelUp();
    ctx.window.startPrestige('norse'); ctx.window.confirmForTest();
    ctx.state.xp = 90000; ctx.window.checkLevelUp();
    ctx.window.startPrestige('avengers'); ctx.window.confirmForTest();
    assert.equal(ctx.state.prestige.emblems.filter(e => e.themeId === 'norse').length, 1);
    ctx.window.deleteCampaign(2); ctx.window.confirmForTest();
    assert.equal(ctx.state.prestige.emblems.filter(e => e.themeId === 'norse').length, 1);
    assert.equal(ctx.state.prestige.emblems.find(e => e.themeId === 'norse').campaign, 3);
    ctx.window.deleteCampaign(3); ctx.window.confirmForTest();
    assert.equal(ctx.state.prestige.emblems.filter(e => e.themeId === 'norse').length, 0);
    assert.equal(ctx.window.getPrestigeCount(), 1);
    assert.ok(!ctx.state.unlockedBadges.includes('legado'));
    assert.equal(ctx.state.prestige.campaign, 4);
});

test('títulos e medalhas registram datas novas sem inventar datas antigas', () => {
    const ctx = engine({ xp: 32287, level: 10 });
    ctx.window.normalizePrestige();
    assert.ok(ctx.state.prestige.levelEvents.every(e => e.date === null));
    ctx.state.xp = 33000; ctx.window.checkLevelUp();
    assert.match(ctx.state.prestige.levelEvents.find(e => e.level === 11).date, /^\d{4}-/);
    ctx.window.unlockBadge('pomo_master');
    assert.match(ctx.state.prestige.badgeEvents.find(e => e.id === 'pomo_master').date, /^\d{4}-/);
    assert.equal(ctx.state.prestige.badgeEvents.find(e => e.id === 'deep_focus').date, null);
    ctx.window.startCampaign('navy'); ctx.window.confirmForTest();
    ctx.window.openCampaignHistory(1);
    const html = ctx.window.renderQGForTest();
    assert.match(html, /Data não registrada/);
    assert.match(html, /Títulos conquistados/);
    assert.match(html, /Medalhas conquistadas/);
    assert.match(html, /Gerenciar dados desta campanha/);
    assert.ok(!html.includes('Invalid Date'));
});

test('reinício e exclusão não permitem repetir bônus de uma medalha', () => {
    const ctx = engine({ xp: 0, level: 1, unlockedBadges: [] });
    ctx.window.initializeCampaignRecordOrigins();
    ctx.window.unlockBadge('pomo_master'); assert.equal(ctx.state.xp, 100);
    ctx.window.startCampaign('army', { mode: 'reset', keepHistory: false }); ctx.window.confirmForTest();
    assert.equal(ctx.state.xp, 0);
    ctx.window.unlockBadge('pomo_master'); assert.equal(ctx.state.xp, 0);
    assert.equal(ctx.state.prestige.badgeEvents[0].id, 'pomo_master');
    ctx.window.startCampaign('mages'); ctx.window.confirmForTest();
    ctx.window.deleteCampaign(2); ctx.window.confirmForTest();
    ctx.window.unlockBadge('pomo_master'); assert.equal(ctx.state.xp, 0);
});

test('contagem de missões atravessa semanas e medalhas mudam com o subtema', () => {
    const ctx = engine({ xp: 0, level: 1, unlockedBadges: [], prestige: { campaign: 2, themeId: 'avengers', recordOriginsInitialized: true } });
    for (let i = 1; i <= 20; i++) {
        ctx.state.tasks = [{ id: i, day: 'monday', category: 'life', completed: false, xp: 0, energyCost: 0 }];
        ctx.window.toggleTask(i);
    }
    assert.equal(ctx.state.prestige.missionEvents.length, 20);
    assert.ok(ctx.state.prestige.badgeEvents.some(e => e.id === 'campaign_missions20'));
    assert.equal(ctx.window.getCampaignBadgeDefinition('primeiro_sangue').title, 'Iniciativa Ativada');
    assert.equal(ctx.window.getCampaignBadgeDefinition('campaign_missions20').title, 'Vingadores, Avante');
    ctx.state.tasks = [];
    assert.ok(ctx.window.getCurrentlyQualifiedBadgeIds().includes('campaign_missions20'));
    ctx.window.recordCampaignStat('pomodorosCompleted', 10); ctx.window.checkGameTriggers();
    assert.equal(ctx.window.getCampaignBadgeDefinition('campaign_focus10').title, 'Precisão do Gavião');
    assert.ok(ctx.state.prestige.badgeEvents.some(e => e.id === 'campaign_focus10'));
});

test('gerenciamento fica fechado na tela inicial e reinício é acessível antes do máximo', () => {
    const ctx = engine({ xp: 32287, level: 10 });
    const html = ctx.window.renderQGForTest();
    assert.match(html, /Gerenciar campanha/);
    assert.match(html, /Começar nova campanha/);
    assert.match(html, /Próxima conquista/);
    assert.ok(!/<details[^>]*\bopen\b/.test(html));
    assert.ok(!html.includes('Excluir campanha…'));
    ctx.window.openCampaignPicker();
    assert.match(ctx.window.renderQGForTest(), /Revisar e iniciar campanha/);
    ctx.window.setCampaignRestartOption('mode', 'reset');
    assert.match(ctx.window.renderQGForTest(), /Apagar também o histórico/);
    ctx.window.setCampaignRestartOption('deleteRecords', true);
    ctx.window.setCampaignRestartOption('includeUnknown', true);
    ctx.window.setCampaignRestartOption('mode', 'archive');
    assert.equal(ctx.uiState.campaignPicker.deleteRecords, false);
    assert.equal(ctx.uiState.campaignPicker.keepHistory, true);
});

test('ações em andamento e confirmações repetidas não atravessam campanhas', () => {
    const ctx = engine();
    ctx.uiState.pomodoroEvaluationData = { id: 1 };
    ctx.window.startCampaign('norse');
    assert.equal(ctx.window.confirmForTest, undefined);
    assert.match(ctx.window.alertForTest, /Pause o Pomodoro/);
    ctx.uiState.pomodoroEvaluationData = null;
    ctx.window.startCampaign('norse'); const confirm = ctx.window.confirmForTest;
    confirm(); confirm();
    assert.equal(ctx.state.prestige.campaigns.length, 1);
    assert.equal(ctx.window.savesForTest, 1);
});

test('feminino funciona na campanha atual, catálogo, emblemas, histórico e perfil', () => {
    const ctx = engine({ xp: 32287, level: 10, userProfile: { displayName: 'Ana', gender: 'feminino', configured: true } });
    assert.equal(ctx.window.getRankName(), 'Comandante Suprema');
    let html = ctx.window.renderQGForTest();
    assert.match(html, /Comandante Suprema/);
    assert.match(html, /Deusa do Foco/);
    assert.ok(!html.includes('Comandante Supremo'));
    assert.match(ctx.window.renderProfileModal(), /Comandante Suprema/);
    ctx.window.openCampaignPicker(); ctx.window.selectCampaignCategory('mythology'); ctx.window.selectCampaignTheme('greek');
    assert.match(ctx.window.renderQGForTest(), /Discípula/);
    assert.match(ctx.window.renderQGForTest(), /Heroína/);
    ctx.window.startCampaign('greek'); ctx.window.confirmForTest();
    ctx.window.openCampaignHistory(1);
    assert.match(ctx.window.renderQGForTest(), /Comandante Suprema/);
    ctx.window.closeCampaignHistory(); ctx.state.xp = 90000; ctx.window.checkLevelUp();
    ctx.window.startPrestige('army'); ctx.window.confirmForTest();
    ctx.window.openCampaignHistory(2);
    assert.match(ctx.window.renderQGForTest(), /Discípula de Atena/);
    assert.match(ctx.window.renderQGForTest(), /Heroína dos Doze Trabalhos/);
    assert.equal(ctx.window.formatCampaignTitle('General de Brigada'), 'Generala de Brigada');
    assert.equal(ctx.window.formatCampaignTitle('Grão-Mestre'), 'Grã-Mestra');
    assert.equal(ctx.window.formatCampaignTitle('Guardião da Balança'), 'Guardiã da Balança');
});

test('perfil permite prévia sem salvar, preserva preferências e valida nome', () => {
    const ctx = engine({ xp: 32287, level: 10, userProfile: { displayName: 'Victor', gender: 'masculino', configured: true, extraPreference: 'preservar' } });
    const fields = { 'profile-display-name': { value: 'Ana' }, 'profile-preview-title': {}, 'profile-preview-name': {} };
    let selectedGender = 'feminino';
    ctx.document = { getElementById: id => fields[id], querySelector: () => ({ value: selectedGender }) };
    ctx.window.updateProfilePreview();
    assert.equal(fields['profile-preview-title'].textContent, 'Comandante Suprema');
    assert.equal(fields['profile-preview-name'].textContent, 'Ana');
    assert.equal(ctx.state.userProfile.gender, 'masculino');
    ctx.window.saveUserProfile();
    assert.equal(ctx.state.userProfile.gender, 'feminino');
    assert.equal(ctx.state.userProfile.extraPreference, 'preservar');
    assert.equal(ctx.window.getRankName(), 'Comandante Suprema');
    assert.equal(ctx.state.xp, 32287);
    fields['profile-display-name'].value = '   ';
    ctx.window.saveUserProfile();
    assert.equal(ctx.window.savesForTest, 1);
    fields['profile-display-name'].value = 'Ana'; selectedGender = 'neutro';
    ctx.window.saveUserProfile();
    assert.equal(ctx.window.getRankName(), 'Nível 10 · Missão Tática original');
    assert.match(ctx.window.renderProfileModal(), /Sem gênero/);
});

test('metadados importados não injetam ações no histórico', () => {
    const ctx = engine({ prestige: { campaigns: [{ number: '1);alert(1)', xp: '<img src=x>', rankLevel: '10', rankName: '<img src=x onerror=alert(1)>', themeName: '<script>bad</script>', endedAt: 'invalid', badgeIds: [] }] } });
    ctx.window.normalizePrestige();
    const list = ctx.window.renderCampaignHistoryList();
    assert.ok(!list.includes('1);alert'));
    assert.ok(list.includes('&lt;script&gt;bad&lt;/script&gt;'));
    ctx.window.openCampaignHistory(ctx.state.prestige.campaigns[0].number);
    const html = ctx.window.renderQGForTest();
    assert.ok(!html.includes('<img src=x'));
    assert.match(html, /Data não registrada/);
});

test('a mesma missão recorrente conta novamente em outra semana e desfazer remove só a conclusão atual', () => {
    const ctx = engine({ xp: 0, level: 1, prestige: { campaign: 2, themeId: 'army', recordOriginsInitialized: true },
        tasks: [{ id: 1, day: 'monday', category: 'life', completed: false, xp: 0, energyCost: 0 }] });
    runInNewContext(sourceBetween('window.cleanTaskRewardFields =', 'window.upsertRecurringTaskOccurrences ='), ctx);
    ctx.window.toggleTask(1);
    const firstEvent = ctx.state.tasks[0].rewardedMissionEventId;
    ctx.state.tasks[0].completed = false;
    ctx.window.cleanTaskRewardFields(ctx.state.tasks[0]);
    ctx.window.toggleTask(1);
    assert.equal(ctx.state.prestige.missionEvents.length, 2);
    assert.notEqual(ctx.state.tasks[0].rewardedMissionEventId, firstEvent);
    ctx.window.toggleTask(1);
    assert.equal(ctx.state.prestige.missionEvents.length, 1);
    assert.equal(ctx.state.prestige.missionEvents[0].eventId, firstEvent);
});

test('registro com ganhos em duas campanhas só desconta a parcela atual ao ser removido', () => {
    const ctx = engine({ xp: 5000, level: 5, studyData: { errorLog: [{ id: 1, campaignId: 1, status: 'resolved', xpAwards: [{ amount: 10, campaign: 1 }, { amount: 30, campaign: 2 }] }] } });
    ctx.window.startCampaign('greek'); ctx.window.confirmForTest(); ctx.state.xp = 100;
    ctx.window.deleteCampaign(1, true); ctx.window.confirmForTest();
    assert.equal(ctx.state.studyData.errorLog.length, 0);
    assert.equal(ctx.state.xp, 70);
});

test('gravação real registra promoção, origem e metadados na mesma cópia persistida', () => {
    const ctx = engine({ xp: 32287, level: 10, userProfile: { displayName: 'Ana', gender: 'feminino', configured: true } });
    ctx.window.initializeCampaignRecordOrigins();
    let serialized;
    ctx.localStorage = { setItem(key, value) { assert.equal(key, 'planeamento_semanal_v11'); serialized = value; } };
    ctx.calendarSync = { schedule() {} };
    ctx.window.touchState = () => {};
    ctx.window.saveToFirestore = () => {};
    runInNewContext(sourceBetween('window.saveState =', 'window.saveStateNow ='), ctx);
    ctx.state.tasks.push({ id: 8, text: 'Nova missão' });
    ctx.state.xp = 33000;
    ctx.window.saveState(true);
    const persisted = JSON.parse(serialized);
    assert.equal(persisted.level, 11);
    assert.equal(persisted.tasks[0].campaignId, 1);
    assert.match(persisted.prestige.levelEvents.find(e => e.level === 11).date, /^\d{4}-/);
    assert.equal(persisted.userProfile.gender, 'feminino');
    assert.equal(ctx.window.getRankName(), 'Estrategista Mestra');
});
