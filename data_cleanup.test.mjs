import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
const app = await readFile(new URL('./app.html', import.meta.url), 'utf8');
const section = (start, end) => {
    const from = app.indexOf(start); const to = app.indexOf(end, from + start.length);
    assert.ok(from >= 0 && to > from, `Trecho ausente: ${start}`);
    return app.slice(from, to);
};
const plain = value => JSON.parse(JSON.stringify(value));
function engine() {
    let persisted;
    const arrays = keys => Object.fromEntries(keys.map(key => [key, [{ id: key, amount: 20, campaignId: 1 }]]));
    const ctx = {
        state: {
            activeTab: 'monday', currentFilter: 'all', currentPlanningWeekStart: '2026-10-05',
            ownerUid: 'test-owner', xp: 25100, level: 10, coins: 90, combo: 3, energy: 61,
            userProfile: { displayName: 'Perfil teste', gender: 'feminino', configured: true, preference: 'keep' },
            tasks: [{ id: 't1', text: 'Missão teste', day: 'monday', category: 'work', xp: 100, completed: true, rewardedXp: 100, rewardedCoins: 10, rewardedCampaign: 1, campaignId: 1 }],
            quickTasks: [{ id: 'q1', text: 'Captura', done: true, campaignId: 1 }], taskDeletionLog: [{ id: 'd1', campaignId: 1 }],
            studyData: { subjects: [{ id: 's1', name: 'Matéria' }], sessions: [{ id: 'ss', subjectId: 's1', xp: 100, campaignId: 1 }], reviews: [{ id: 'sr', sourceSessionId: 'ss', subjectId: 's1', campaignId: 1 }], errorLog: [{ id: 'se', campaignId: 1 }], cycles: [{ id: 'sc' }], studyPlan: { tracks: [{ id: 'custom', name: 'Trilha própria' }], weeklyBlocks: [{ id: 'sb', trackId: 'custom', subjectId: 's1', day: 'monday', title: 'Bloco teste', campaignId: 1 }] } },
            financeData: arrays(['incomes', 'fixedExpenses', 'variableExpenses', 'debts', 'goals', 'categoryBudgets', 'moneyJournal']),
            healthData: arrays(['workouts', 'bodyMetrics', 'habits', 'goals']),
            focusData: { cycles: [{ id: 'f1', taskId: 't1', taskText: 'Missão teste', campaignId: 1 }] },
            pomodoroSettings: { focus: 45, shortBreak: 7, longBreak: 20, cycles: 3 },
            routineData: { rituals: [{ id: 'ritual' }], logs: [{ id: 'rl', campaignId: 1 }] },
            rechargeData: { actions: [{ id: 'custom-recharge', title: 'Pausa teste' }], logs: [{ id: 'rcl', campaignId: 1 }] },
            operationalControl: { demands: [{ id: 'radar', title: 'Demanda teste' }], scans: [{ id: 'scan' }], shutdowns: [{ id: 'shutdown' }], config: { wipLimit: 2 } },
            customRewards: [{ id: 'reward1', title: 'Meta teste', cost: 100 }], rewardPurchases: [{ id: 'rp1', campaignId: 1 }],
            economy: { weekStartKey: '2026-10-05', tacticalReserve: 200, weeklyCoinsEarned: 40, targetReward: { type: 'custom', id: 'reward1', cost: 100 }, history: [{ id: 'economic', campaignId: 1 }], resetLog: [{ id: 'old-reset' }] },
            unlockedBadges: ['primeiro_sangue'], stats: { pomodorosCompleted: 1, rewardsBought: 1 },
            prestige: { campaign: 3, nextCampaignNumber: 7, themeId: 'norse', campaigns: [{ number: 2, themeId: 'greek', xp: 90000, rankLevel: 15, status: 'completed', badgeIds: ['primeiro_sangue'] }], protectedBadgeIds: ['primeiro_sangue'], bonusClaimedBadgeIds: ['primeiro_sangue'], badgeEvents: [], missionEvents: [], currentStats: {}, recordOriginsInitialized: true },
            calendarSync: { enabled: true, calendarId: 'managed-test-calendar' },
            calendarInboxItems: [{ id: 'external1', status: 'converted', linkedTaskId: 't1', weekStart: '2026-10-05' }, { id: 'external2', status: 'ignored' }]
        },
        pomodoro: { isRunning: false, timeLeft: 900, mode: 'shortBreak', cycle: 2, intervalId: null, focusLock: { id: 't1' } },
        uiState: { confirm: {}, alert: {}, dataManager: null }, currentSyncStatus: 'Conectado',
        calendarSync: { view: () => ({ busy: false }), schedule() {} },
        document: { getElementById: () => null }, localStorage: { setItem(key, value) { persisted = value; } },
        render() {}, clearInterval() {}, setTimeout() {},
        window: { showToast() {}, showAlertModal(message) { this.alertMessage = message; },
            showConfirmModal(message, callback) { this.confirmMessage = message; this.confirmCallback = callback; },
            touchState(reason) { ctx.state.lastSaveReason = reason; }, saveToFirestore() {} }
    };
    runInNewContext([
        section('const ICONS =', 'const RANKS ='),
        section('const RANKS =', '// GESTÃO DE ESTADO & CLOUD SYNC'),
        section('function getCorrectLevel(', 'function getMondayStartDate('),
        section('function getMondayStartDate(', 'window.normalizeEconomy ='),
        section('window.normalizeEconomy =', 'window.getTaskNature ='),
        section('window.validateState =', '// Guarda extra de inicialização'),
        section('window.escapeHtml =', '// Ponte temporária'),
        section('const DATA_CLEANUP_MODULES =', '// EXPORTAÇÃO PARA GOOGLE AGENDA (.ICS)'),
        section('window.checkLevelUp = function()', 'window.showToast ='),
        section('window.getComboMultiplier =', 'window.getUserDisplayName ='),
        section('window.saveState =', 'window.saveStateNow ='),
        'window.cleanupModulesForTest = DATA_CLEANUP_MODULES;'
    ].join('\n'), ctx);
    ctx.window.getCurrentCalendarWeekStartKey = () => '2026-10-05';
    ctx.window.validateState(); ctx.pomodoro.timeLeft = 900;
    ctx.window.openDataManager(); ctx.persisted = () => JSON.parse(persisted);
    return ctx;
}
function clean(ctx, ids) {
    ctx.uiState.dataManager.selected = ids; ctx.window.reviewDataCleanup();
    assert.equal(typeof ctx.window.confirmCallback, 'function'); ctx.window.confirmCallback();
}

test('abrir, selecionar, revisar e cancelar não alteram os dados', () => {
    const ctx = engine(); const before = JSON.stringify(ctx.state);
    ctx.window.setDataCleanupSelection('study', true); ctx.window.setDataCleanupSelection('invalid', true);
    assert.deepEqual(plain(ctx.uiState.dataManager.selected), ['study']);
    ctx.window.reviewDataCleanup(); assert.equal(JSON.stringify(ctx.state), before);
    ctx.window.closeDataManager(); ctx.window.confirmCallback(); assert.equal(JSON.stringify(ctx.state), before);
    ctx.window.openDataManager(); assert.deepEqual(plain(ctx.uiState.dataManager.selected), []);
    ctx.window.reviewDataCleanup(); assert.match(ctx.window.alertMessage, /Selecione ao menos/);
});

test('cada módulo apaga cadastro e histórico preservando os demais módulos e o jogo', () => {
    for (const id of ['missions', 'study', 'finance', 'health', 'focus', 'rituals', 'recharge', 'radar', 'rewards', 'profile']) {
        const ctx = engine(); const before = plain(ctx.state);
        ctx.uiState.rewardDraft = {title:'Rascunho'}; ctx.uiState.rewardSections = {create:true};
        const module = ctx.window.cleanupModulesForTest.find(m => m.id === id);
        clean(ctx, [id]); const saved = ctx.persisted();
        for (const other of ctx.window.cleanupModulesForTest.filter(m => m.id !== id)) {
            for (const key of other.keys) assert.deepEqual(saved[key], before[key], `${id} não pode alterar ${key}`);
        }
        for (const key of ['xp', 'coins', 'combo', 'energy', 'unlockedBadges', 'stats', 'prestige']) assert.deepEqual(saved[key], before[key], `${id} não deve zerar ${key}`);
        for (const path of module.paths) assert.equal(path.split('.').reduce((value, key) => value?.[key], saved)?.length || 0, 0, `${id}: ${path}`);
        assert.equal(saved.lastSaveReason, 'data-cleanup-modules'); assert.deepEqual(saved.calendarSync, before.calendarSync);
        if (id === 'rewards') { assert.deepEqual(plain(ctx.uiState.rewardDraft),{}); assert.deepEqual(plain(ctx.uiState.rewardSections),{}); }
        else assert.equal(ctx.uiState.rewardDraft.title,'Rascunho');
        if (!['missions', 'focus'].includes(id)) assert.equal(ctx.pomodoro.timeLeft, 900, `${id} preserva cronômetro pausado`);
    }
});

test('gamificação zerada não reaproveita IDs nem ganhos de registros mantidos', () => {
    const ctx = engine(); const before = plain(ctx.state); clean(ctx, ['game']); const saved = ctx.persisted();
    assert.equal(saved.xp, 0); assert.equal(saved.level, 1); assert.equal(saved.coins, 0); assert.equal(saved.energy, 100);
    assert.equal(saved.economy.tacticalReserve, 0); assert.deepEqual(saved.economy.history, []); assert.deepEqual(saved.economy.resetLog, []);
    for (const key of ['campaigns', 'badgeEvents', 'bonusClaimedBadgeIds']) assert.deepEqual(saved.prestige[key], []);
    assert.deepEqual(saved.unlockedBadges, []); assert.equal(saved.prestige.campaign, 7); assert.equal(saved.prestige.nextCampaignNumber, 8);
    assert.equal(saved.prestige.themeId, 'norse'); assert.deepEqual(saved.tasks, before.tasks);
    assert.deepEqual(saved.rewardPurchases, before.rewardPurchases); assert.deepEqual(saved.economy.targetReward, before.economy.targetReward);
    assert.equal(ctx.window.revertCampaignXp(100, saved.tasks[0].rewardedCampaign), 0); assert.equal(ctx.pomodoro.focusLock, null);
});

test('todos os módulos mais gamificação mantêm perfil e identidade de sincronização', () => {
    const ctx = engine(); const before = plain(ctx.state);
    clean(ctx, ctx.window.cleanupModulesForTest.filter(m => m.id !== 'profile').map(m => m.id)); const saved = ctx.persisted();
    assert.deepEqual(saved.userProfile, before.userProfile); assert.deepEqual(saved.calendarSync, before.calendarSync);
    assert.equal(saved.xp, 0); assert.equal(saved.prestige.campaigns.length, 0);
    assert.equal(saved.studyData.subjects.length, 0); assert.equal(saved.financeData.debts.length, 0);
});

test('selecionar tudo reinicia perfil, jogo e módulos com padrões novos', () => {
    const ctx = engine(); const before = plain(ctx.state); ctx.window.selectAllDataCleanup(true);
    assert.equal(ctx.uiState.dataManager.selected.length, 11); assert.match(ctx.window.renderDataManager(), /Reinício completo/);
    ctx.window.reviewDataCleanup(); assert.match(ctx.window.confirmMessage, /Reiniciar todo/); ctx.window.confirmCallback();
    const saved = ctx.persisted();
    assert.equal(saved.userProfile.configured, false); assert.equal(saved.userProfile.displayName, '');
    assert.equal(saved.xp, 0); assert.equal(saved.level, 1); assert.equal(saved.coins, 0); assert.equal(saved.combo, 0);
    assert.equal(saved.prestige.campaign, 1); assert.equal(saved.prestige.themeId, 'original');
    assert.equal(saved.prestige.campaigns.length, 0); assert.equal(saved.prestige.bonusClaimedBadgeIds.length, 0);
    for (const key of ['tasks', 'quickTasks', 'taskDeletionLog', 'customRewards', 'rewardPurchases', 'calendarInboxItems']) assert.deepEqual(saved[key], []);
    for (const key of ['financeData', 'healthData']) for (const records of Object.values(saved[key])) assert.deepEqual(records, []);
    assert.equal(saved.studyData.sessions.length, 0); assert.equal(saved.studyData.studyPlan.weeklyBlocks.length, 0);
    assert.equal(saved.studyData.studyPlan.tracks.some(t => t.id === 'custom'), false); assert.equal(saved.studyData.studyPlan.tracks.length, 3);
    assert.equal(saved.rechargeData.actions.some(a => a.id === 'custom-recharge'), false);
    assert.equal(saved.routineData.rituals.length, 0); assert.equal(saved.operationalControl.demands.length, 0); assert.equal(saved.economy.targetReward, null);
    assert.deepEqual(saved.pomodoroSettings, { focus: 25, shortBreak: 5, longBreak: 15, cycles: 4 });
    assert.deepEqual(saved.calendarSync, before.calendarSync); assert.equal(saved.ownerUid, before.ownerUid); assert.equal(saved.lastSaveReason, 'data-reset-all');
    assert.equal(ctx.window.buildDataCleanupState(['invalid']), null);
});

test('limpeza de missões libera vínculos locais com a agenda preservando compromissos externos', () => {
    const ctx = engine(); clean(ctx, ['missions']); const saved = ctx.persisted();
    assert.equal(saved.calendarInboxItems[0].status, 'pending'); assert.equal(saved.calendarInboxItems[0].linkedTaskId, null);
    assert.equal(saved.calendarInboxItems[1].status, 'ignored'); assert.match(ctx.window.confirmMessage, /agenda principal permanecem/);
    assert.equal(ctx.pomodoro.focusLock, null); assert.equal(ctx.pomodoro.timeLeft, 45 * 60);
});

test('ações pendentes, sincronização e confirmações antigas bloqueiam exclusões', () => {
    for (const block of ['running', 'evaluation', 'finance', 'calendar', 'loading']) {
        const ctx = engine(); ctx.uiState.dataManager.selected = ['finance'];
        if (block === 'running') ctx.pomodoro.isRunning = true;
        if (block === 'evaluation') ctx.uiState.pomodoroEvaluationData = { id: 1 };
        if (block === 'finance') ctx.uiState.financeGuardianData = { amount: 100 };
        if (block === 'calendar') ctx.calendarSync.view = () => ({ busy: true });
        if (block === 'loading') ctx.currentSyncStatus = 'Carregando...';
        const before = JSON.stringify(ctx.state); ctx.window.reviewDataCleanup();
        assert.equal(ctx.window.confirmCallback, undefined); assert.equal(JSON.stringify(ctx.state), before);
    }
    const ctx = engine(); ctx.uiState.dataManager.selected = ['study']; ctx.window.reviewDataCleanup();
    ctx.calendarSync.view = () => ({ busy: true }); ctx.window.confirmCallback(); assert.equal(ctx.state.studyData.subjects.length, 1);
    ctx.calendarSync.view = () => ({ busy: false }); ctx.window.reviewDataCleanup(); ctx.window.confirmCallback();
    const saved = JSON.stringify(ctx.state); ctx.window.confirmCallback(); assert.equal(JSON.stringify(ctx.state), saved);
});

test('painel oferece revisão, backup e seleções acessíveis; rodapé inicial permanece recolhido', () => {
    const ctx = engine(); let html = ctx.window.renderDataManager();
    assert.match(html, /role="dialog" aria-modal="true"/); assert.match(html, /disabled/); assert.ok(!/<input[^>]*\schecked(?:\s|>)/.test(html));
    assert.match(html, /Exportar backup completo/); assert.match(html, /importação substitui todos os dados/);
    ctx.window.selectAllDataCleanup(true); ctx.window.selectAllDataCleanup(false); assert.equal(ctx.uiState.dataManager.selected.length, 0);
    ctx.window.setDataCleanupSelection('finance', true); html = ctx.window.renderDataManager();
    assert.match(html, /XP, moedas, medalhas e histórico de campanhas serão preservados/);
    const footer = section('// RODAPÉ: BACKUP E REINICIAR', 'appDiv.innerHTML = html');
    assert.match(footer, /<details[^>]*>[\s\S]*Dados e reinício/); assert.ok(!/<details[^>]*\bopen\b/.test(footer));
    assert.ok(!footer.includes('cleanup-finance')); assert.match(footer, /window.openDataManager/);
});

test('seleção combinada limpa somente Estudos, Finanças e Corpo; dados novos fora dela continuam', () => {
    const ctx = engine(); const before = plain(ctx.state);
    ctx.uiState.dataManager.selected = ['study', 'finance', 'health']; ctx.window.reviewDataCleanup();
    ctx.state.tasks.push({ id: 't2', text: 'Criada após revisar', day: 'monday', category: 'work', campaignId: 3 });
    ctx.window.confirmCallback(); const saved = ctx.persisted();
    assert.equal(saved.studyData.subjects.length, 0); assert.equal(saved.financeData.incomes.length, 0); assert.equal(saved.healthData.workouts.length, 0);
    assert.equal(saved.tasks.length, 2); assert.equal(saved.tasks[1].text, 'Criada após revisar');
    assert.deepEqual(saved.routineData, before.routineData); assert.deepEqual(saved.userProfile, before.userProfile);
    assert.equal(saved.xp, before.xp); assert.deepEqual(saved.prestige, before.prestige);
});

test('backup JSON real inclui o aplicativo inteiro e restaura os dados após reinício', () => {
    const ctx = engine(); let exported;
    ctx.document.createElement = () => ({ attrs: {}, setAttribute(key, value) { this.attrs[key] = value; }, click() { exported = this.attrs; } });
    ctx.FileReader = class { readAsText(file) { this.onload({ target: { result: file.text } }); } };
    runInNewContext(section('window.exportData =', '// GERENCIAMENTO DE DADOS POR MÓDULO'), ctx);
    ctx.window.exportData();
    assert.match(exported.download, /missao_tatica_backup_.*\.json/);
    const backup = decodeURIComponent(exported.href.split(',')[1]);
    const before = JSON.parse(backup);
    clean(ctx, ctx.window.cleanupModulesForTest.map(m => m.id)); assert.equal(ctx.state.xp, 0);
    const event = { target: { files: [{ text: backup }], value: 'backup.json' } };
    ctx.window.importData(event);
    const restored = ctx.persisted();
    assert.equal(restored.xp, before.xp); assert.deepEqual(restored.financeData, before.financeData);
    assert.deepEqual(restored.healthData, before.healthData); assert.deepEqual(restored.userProfile, before.userProfile);
    assert.deepEqual(restored.prestige, before.prestige); assert.equal(event.target.value, '');
});
