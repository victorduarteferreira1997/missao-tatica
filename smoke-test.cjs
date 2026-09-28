// Exercita as transições do app sem autenticação real nem alterar dados do usuário.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('teste_novos_modulos.html', 'utf8');
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
  .replace(/^\s*import .*firebase.*$/gm, '');
const storage = new Map();
const inputs = {};
const appElement = { innerHTML: '', querySelectorAll: () => [] };
const context = {
  console,
  Date,
  Math,
  JSON,
  setTimeout: () => 0,
  clearTimeout() {},
  setInterval: () => 0,
  clearInterval() {},
  localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
  document: { getElementById: id => id === 'app' ? appElement : inputs[id] || null, querySelectorAll: () => [] },
  lucide: { createIcons() {} },
  initializeApp: () => ({}), getAuth: () => ({}), getFirestore: () => ({}),
  onAuthStateChanged() {}, doc: () => ({}), setDoc: async () => {}, getDoc: async () => ({ exists: () => false }),
  GoogleAuthProvider: class {}, signInWithPopup: async () => {}, signInWithRedirect: async () => {}, signOut: async () => {}
};
context.window = context;
vm.createContext(context);
vm.runInContext(script + '\nwindow.__test = { state: () => state, uiState, week: renderWeeklyPlanningOverview, renderFull: render }; render = () => {};', context);
const s = context.__test.state();
s.userProfile = { displayName: 'Teste', gender: 'masculino', configured: true };
s.activeTab = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][new Date().getDay()];
s.currentPlanningWeekStart = context.getCurrentCalendarWeekStartKey();
s.combo = 4;
s.energy = 65;
s.tasks = [
  { id: 101, text: 'Revisar assessment', day: s.activeTab, category: 'work', priority: 'essencial', completed: false, xp: 30, energyCost: 5, time: '30 min', missionNature: 'normal', subtasks: [], order: 1 },
  { id: 102, text: 'Consulta marcada', day: s.activeTab, category: 'life', priority: 'media', completed: false, xp: 0, energyCost: 0, time: '60 min', missionNature: 'neutral', subtasks: [], order: 2 },
  { id: 103, text: 'Ler material', day: s.activeTab, category: 'study', priority: 'media', completed: false, xp: 20, energyCost: 3, time: '25 min', missionNature: 'normal', subtasks: [], order: 3 },
  { id: 104, text: 'Rotina recorrente', day: s.activeTab, category: 'life', priority: 'baixa', completed: false, xp: 10, energyCost: 2, time: '15 min', missionNature: 'normal', subtasks: [], order: 4, isRecurring: true, recurrenceDays: [s.activeTab], recurrenceGroupId: 'rec-test', progressStatus: 'partial', progressNotes: [{ at: '2026-09-28', text: 'Semana anterior' }] }
];
s.quickTasks = [{ id: 201, text: 'Lembrar documento', done: false }];
context.showToast = () => {};
context.spawnFloatingText = () => {};
assert.match(context.renderDailyFocusPanel(), /Revisar assessment/);
context.__test.renderFull();
assert(appElement.innerHTML.indexOf('Descarga Cognitiva') < appElement.innerHTML.indexOf('Missões de'));
assert(appElement.innerHTML.indexOf('Sem ação operacional urgente') < appElement.innerHTML.indexOf('Concluir missão Revisar assessment'));
assert.match(context.renderDailyMissionBoard(s.tasks), /Concluir missão Revisar assessment/);
assert.doesNotMatch(context.renderDailyMissionBoard(s.tasks), /<div onclick="window.toggleTask/);

context.openTaskProgress(101);
inputs['task-progress-note'] = { value: 'Revisei anexos' };
inputs['task-progress-next'] = { value: 'Redigir resposta' };
context.saveTaskProgress();
assert.equal(s.tasks[0].progressStatus, 'partial');
assert.equal(s.tasks[0].nextAction, 'Redigir resposta');
assert.equal(s.tasks[0].progressNotes.length, 1);
assert.match(context.renderDailyMissionBoard(s.tasks), /Retomar:/);
context.toggleTask(101);
assert.equal(s.tasks[0].completed, true);
assert.equal(s.tasks[0].progressStatus, 'completed');
context.toggleTask(101);
assert.equal(s.tasks[0].progressStatus, 'partial');
context.toggleTask(101);

const combo = s.combo, hp = s.energy;
context.moveTaskFromSelect(103, null, { value: 'next_week' });
assert.equal(s.combo, combo);
assert.equal(s.energy, hp);
assert.match(context.__test.week(), /A definir · 1 missão/);
context.prepareNextWeekPlanning();
context.handleConfirmResult(true);
assert(s.tasks.some(t => t.text === 'Ler material' && t.day === 'next_week'));
assert.equal(s.quickTasks.length, 1);
assert(s.weeklyMissionArchive.at(-1).tasks.some(t => t.text === 'Revisar assessment'));
assert.equal(s.combo, combo);
const renewed = s.tasks.find(t => t.text === 'Rotina recorrente');
assert.equal(renewed.progressStatus, 'planned');
assert.equal(renewed.progressNotes.length, 0);
context.__test.uiState.mainView = 'week';
context.__test.renderFull();
assert.match(appElement.innerHTML, /A definir · 2 missão/);
assert.match(appElement.innerHTML, /Última semana revisada/);

const now = new Date();
const dateKey = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
s.operationalControl = { config: { dueSoonDays: 2 }, demands: [{ id: 'radar-1', title: 'Assessment', workflowStatus: 'waiting', attentionLevel: 'controlled', followUpAt: dateKey, dueDate: dateKey, waitingFor: 'área técnica', nextReviewAt: '' }] };
const signals = context.getOperationalSignalsForDate(dateKey);
assert(signals[0].signals.some(x => x.kind === 'due'));
assert(signals[0].signals.some(x => x.kind === 'followup'));
assert.equal(signals[0].signals[0].severity, 'critical');
context.__test.uiState.mainView = 'control';
context.__test.renderFull();
assert.match(appElement.innerHTML, /Ações próximas/);

console.log('Smoke test OK: progresso, conclusão/reabertura, replanejamento, semana e Radar.');
