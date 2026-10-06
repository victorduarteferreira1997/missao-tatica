import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
const app = await readFile(new URL('./app.html', import.meta.url), 'utf8');
const section = (start,end) => { const a=app.indexOf(start),b=app.indexOf(end,a+start.length); assert.ok(a>=0&&b>a, start); return app.slice(a,b); };
const plain = value => JSON.parse(JSON.stringify(value));
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-06T18:30:00Z'])); } static now() { return Date.parse('2026-10-06T18:30:00Z'); } }
function engine(overrides={}) {
    const elements = {};
    const ctx = {
        state: { xp: 200, energy: 94, coins: 77, tasks: [{ id: 10, text: 'Preservar' }], prestige: { campaign: 3 },
            rechargeData: { actions: [], logs: [] }, routineData: { rituals: [], logs: [] }, ...overrides },
        uiState: { confirm: {}, alert: {} }, document: { getElementById: id => elements[id] || null, activeElement: null },
        Date: FixedDate, render() {},
        window: { showToast() {}, showAlertModal(message) { this.alertMessage = message; },
            showConfirmModal(message, callback) { this.confirmMessage = message; this.confirmCallback = callback; },
            normalizePrestige: () => ctx.state.prestige, checkLevelUp() {}, checkGameTriggers() {},
            saveState() { this.saves = (this.saves || 0) + 1; }, bindFormDialog() {} }
    };
    runInNewContext([
        section('const DEFAULT_RECHARGE_ACTIONS =', '// GESTÃO DE ESTADO & CLOUD SYNC'),
        section('window.getLocalDateKey =', 'window.spawnFloatingText ='),
        section('window.escapeHtml =', '// Ponte temporária'),
        section('window.changeEnergy =', 'window.getMissionStatus ='),
        section('window.formatCampaignDate =', 'window.renderNextCampaignBadge ='),
        section('window.setRecoverySection =', '// MÓDULO: TEMPO OPERACIONAL'),
        'window.defaultRechargesForTest = DEFAULT_RECHARGE_ACTIONS;'
    ].join('\n'),ctx);
    if (!ctx.state.rechargeData.actions.length) ctx.state.rechargeData.actions = plain(ctx.window.defaultRechargesForTest);
    ctx.field = (id,value) => elements[id] = { id,value: String(value), scrollIntoView() {}, focus() {} };
    return ctx;
}

test('abrir as visões preserva todos os dados; cadastros, histórico e gestão começam recolhidos', () => {
    const ctx=engine({ routineData: { rituals: [{ id:1,title:'Meu ritual',period:'morning',xp:0,energyDelta:0 }],logs:[] } });
    const before=JSON.stringify(ctx.state);
    const recharge=ctx.window.renderRechargeModule(), ritual=ctx.window.renderRitualsSection();
    assert.equal(JSON.stringify(ctx.state),before);
    for (const html of [recharge,ritual]) assert.ok(!/<details[^>]*\sopen(?:\s|>)/.test(html));
    assert.match(recharge,/Registrar recarga/); assert.ok(!recharge.includes('Executar recarga'));
    assert.match(recharge,/não inicia um cronômetro/); assert.match(ritual,/Sua rotina de hoje/);
    assert.ok(!ritual.includes('+10 XP'), 'Ritual de 0 XP não pode prometer 10 XP.');
    assert.match(ctx.window.renderRecoveryDialog('ritual'), /role="dialog" aria-modal="true"/);
    assert.match(ctx.window.renderRecoveryDialog('recharge'), /max-h-\[92vh\]/);
});

test('filtro de tempo mostra todas as opções correspondentes, incluindo personalizadas', () => {
    const ctx=engine(); ctx.state.rechargeData.actions.push({ id:'custom',title:'Pausa pessoal',duration:3,energyGain:4,active:true });
    assert.ok(ctx.window.getVisibleRechargeActions().every(a=>a.duration<=5));
    assert.ok(ctx.window.getVisibleRechargeActions().some(a=>a.id==='custom'));
    ctx.window.setRechargeDurationFilter('medium'); assert.ok(ctx.window.getVisibleRechargeActions().every(a=>a.duration<=15));
    ctx.window.setRechargeDurationFilter('all'); assert.equal(ctx.window.getVisibleRechargeActions().length,10);
    ctx.window.setRechargeDurationFilter('invalid'); assert.equal(ctx.uiState.rechargeDurationFilter,'all');
    ctx.state.rechargeData.actions.find(a=>a.id==='custom').active=false;
    assert.equal(ctx.window.getVisibleRechargeActions().some(a=>a.id==='custom'),false);
});

test('registrar recarga aplica somente HP disponível, preserva moedas e registra campanha', () => {
    const ctx=engine(); ctx.window.useRechargeAction('pausa-consciente');
    assert.equal(ctx.state.energy,100); assert.equal(ctx.state.xp,200); assert.equal(ctx.state.coins,77);
    const log=ctx.state.rechargeData.logs[0];
    assert.equal(log.energyGainPlanned,12); assert.equal(log.energyGainApplied,6); assert.equal(log.beforeEnergy,94); assert.equal(log.afterEnergy,100);
    assert.equal(log.xpAwarded,0); assert.equal(log.xpCampaign,3); assert.equal(log.title,'Pausa consciente');
    ctx.window.useRechargeAction('pausa-consciente'); assert.equal(ctx.state.rechargeData.logs.length,1);
    assert.match(ctx.window.alertMessage,/100%/);
    const html=ctx.window.renderRechargeModule(); assert.match(html,/disabled/); assert.match(html,/Bateria completa/);
});

test('recarga personalizada mantém XP opcional existente e novo cadastro limpa o rascunho', () => {
    const ctx=engine({ energy:50 });
    for (const [id,value] of Object.entries({'recharge-title':'Pausa própria','recharge-desc':'Descrição','recharge-icon':'coffee','recharge-energy':'20','recharge-duration':'8','recharge-xp':'7'})) ctx.field(id,value);
    ctx.uiState.recoveryDrafts={recharge:[{id:'recharge-title',value:'Pausa própria'}]};
    ctx.window.setRecoverySection('recharge-create',true); ctx.window.addRechargeAction();
    const action=ctx.state.rechargeData.actions.at(-1);
    assert.equal(action.title,'Pausa própria'); assert.equal(action.xp,7); assert.equal(action.isDefault,false);
    assert.equal(ctx.uiState.recoveryDrafts.recharge,undefined); assert.equal(ctx.uiState.recoverySections['recharge-create'],false);
    ctx.window.useRechargeAction(action.id); assert.equal(ctx.state.xp,207); assert.equal(ctx.state.energy,70);
});

test('arquivar e restaurar ações padrão ou personalizadas mantém seus registros', () => {
    const ctx=engine(); ctx.window.useRechargeAction('pausa-consciente'); const before=plain(ctx.state.rechargeData.logs);
    ctx.window.deleteRechargeAction('pausa-consciente'); assert.equal(ctx.state.rechargeData.actions[0].active,true);
    ctx.window.confirmCallback(); assert.equal(ctx.window.getRechargeActions().some(a=>a.id==='pausa-consciente'),false);
    assert.deepEqual(plain(ctx.state.rechargeData.logs),before);
    ctx.window.restoreRechargeAction('pausa-consciente'); assert.equal(ctx.window.getRechargeActions().some(a=>a.id==='pausa-consciente'),true);
    assert.deepEqual(plain(ctx.state.rechargeData.logs),before);
    assert.match(ctx.window.confirmMessage,/restaur/);
});

test('ritual de 0 XP conclui uma vez por dia com HP aplicado e título congelado no histórico', () => {
    const ctx=engine({ routineData:{rituals:[{id:8,title:'Ritual zero',period:'morning',xp:0,energyDelta:20}],logs:[]} });
    ctx.window.completeRitual('8'); assert.equal(ctx.state.xp,200); assert.equal(ctx.state.energy,100); assert.equal(ctx.state.coins,77);
    const log=ctx.state.routineData.logs[0]; assert.equal(log.ritualId,8); assert.equal(log.title,'Ritual zero'); assert.equal(log.period,'morning');
    assert.equal(log.xpAwarded,0); assert.equal(log.energyDeltaPlanned,20); assert.equal(log.energyDeltaApplied,6); assert.equal(log.xpCampaign,3);
    ctx.window.completeRitual(8); assert.equal(ctx.state.routineData.logs.length,1); assert.match(ctx.window.alertMessage,/já foi concluído/);
    assert.match(ctx.window.renderRitualsSection(),/Feito hoje/);
    ctx.state.routineData.rituals[0].title='Nome alterado';
    assert.match(ctx.window.renderRecoveryHistory('ritual'),/Ritual zero/);
});

test('ritual que consome HP registra consumo real e respeita o limite inferior da bateria', () => {
    const ctx=engine({energy:4,routineData:{rituals:[{id:'r',title:'Preparação',period:'night',xp:10,energyDelta:-20}],logs:[]}});
    ctx.window.completeRitual('r'); assert.equal(ctx.state.energy,0); assert.equal(ctx.state.xp,210);
    assert.equal(ctx.state.routineData.logs[0].energyDeltaApplied,-4); assert.equal(ctx.state.routineData.logs[0].energyDeltaPlanned,-20);
});

test('limite diário segue o dia local, aceita IDs importados e ignora datas desconhecidas', () => {
    const ctx=engine({routineData:{rituals:[{id:9,title:'Ritual',period:'night',xp:10}],logs:[{ritualId:'9',date:'2026-10-07T00:30:00Z'}]}});
    assert.equal(ctx.window.isRitualCompletedToday(9),true, '21h30 do dia 6 em São Paulo.');
    ctx.state.routineData.logs[0].date='2026-10-07T03:30:00Z'; assert.equal(ctx.window.isRitualCompletedToday(9),false);
    ctx.state.routineData.logs[0].date=null; assert.equal(ctx.window.isRitualCompletedToday(9),false);
    assert.equal(ctx.window.getRecoveryLogDateKey({date:'invalid'}),null);
});

test('arquivar e restaurar ritual conserva a conclusão de hoje sem repetir XP', () => {
    const ctx=engine({routineData:{rituals:[{id:'r',title:'Rotina',period:'morning',xp:10}],logs:[]}});
    ctx.window.completeRitual('r'); ctx.window.deleteRitual('r'); ctx.window.confirmCallback();
    assert.equal(ctx.state.routineData.rituals[0].active,false); assert.equal(ctx.state.routineData.logs.length,1);
    ctx.window.restoreRitual('r'); ctx.window.completeRitual('r'); assert.equal(ctx.state.xp,210); assert.equal(ctx.state.routineData.logs.length,1);
});

test('sugestões preenchem o formulário sem cadastrar automaticamente; valores novos têm limites', () => {
    const ctx=engine(); for (const [id,value] of Object.entries({'ritual-title':'','ritual-period':'morning','ritual-xp':'10','ritual-energy':'0'})) ctx.field(id,value);
    ctx.window.chooseRitualSuggestion(1); assert.equal(ctx.state.routineData.rituals.length,0);
    assert.equal(ctx.document.getElementById('ritual-title').value,'Planejar 3 prioridades');
    ctx.document.getElementById('ritual-xp').value='500'; ctx.document.getElementById('ritual-energy').value='-200';
    ctx.window.addRitual(); const ritual=ctx.state.routineData.rituals[0]; assert.equal(ritual.xp,100); assert.equal(ritual.energyDelta,-100);
    assert.equal(ctx.uiState.recoverySections['ritual-create'],false);
});

test('histórico completo pagina todos os registros e mantém datas antigas desconhecidas', () => {
    const ctx=engine(); ctx.state.rechargeData.logs=Array.from({length:23},(_,i)=>({id:i,title:`Pausa ${i}`,date:'2026-10-05T12:00:00Z',energyGainApplied:10,duration:5}));
    assert.equal(ctx.window.getRecoveryHistory('recharge').total,0);
    ctx.window.setRecoveryHistoryFilter('recharge','all'); let h=ctx.window.getRecoveryHistory('recharge');
    assert.equal(h.total,23); assert.equal(h.rows.length,10); assert.equal(h.pages,3);
    ctx.window.setRecoveryHistoryPage('recharge',2); assert.equal(ctx.window.getRecoveryHistory('recharge').rows.length,3);
    ctx.window.setRecoveryHistoryPage('recharge',999); assert.equal(ctx.window.getRecoveryHistory('recharge').page,2);
    ctx.state.rechargeData.logs=[{id:'old',title:'Importada',duration:5}];
    assert.match(ctx.window.renderRecoveryHistory('recharge'),/Data não registrada/);
    assert.equal(ctx.state.rechargeData.logs[0].date,undefined);
});

test('títulos, descrições e IDs importados não viram HTML ou código executável', () => {
    const ctx=engine({routineData:{rituals:[{id:'x\"\'><img onerror=bad>',title:'<script>bad()</script>',period:'morning',xp:0}],logs:[]}});
    ctx.state.rechargeData.actions=[{id:'x\"\'>',title:'<img src=x onerror=bad>',description:'<script>bad()</script>',icon:'x\" onclick=bad',duration:3,energyGain:10}];
    for (const html of [ctx.window.renderRitualsSection(),ctx.window.renderRechargeModule()]) {
        assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img'));
        assert.ok(html.includes('&lt;')); assert.ok(!html.includes('data-lucide="x" onclick=bad'));
    }
    assert.match(ctx.window.renderRechargeModule(),/window.useRechargeAction\(&quot;/);
});

test('reconstruir a tela mantém campos, rolagem e foco; salvar não ressuscita um rascunho', () => {
    const ctx=engine(); const input=ctx.field('recharge-title','Em edição'); ctx.document.activeElement=input;
    const body={scrollTop:420};
    const dialog={querySelector:()=>body,querySelectorAll:()=>[input],contains:()=>true};
    const root={querySelector:selector=>selector==='#recharge-module-dialog'?dialog:null};
    const snapshots=ctx.window.captureRecoveryDialogs(root); assert.equal(snapshots.recharge.scrollTop,420);
    assert.equal(ctx.uiState.recoveryDrafts.recharge[0].value,'Em edição');
    input.value=''; body.scrollTop=0; let binding;
    ctx.window.bindFormDialog=(root,options)=>{binding=options;};
    ctx.window.bindRecoveryDialogs(root,snapshots); assert.equal(input.value,'Em edição'); assert.equal(body.scrollTop,420); assert.equal(binding.initialFocus,'recharge-title');
    ctx.window.clearRecoveryDraft('recharge'); ctx.window.captureRecoveryDialogs(root);
    assert.equal(ctx.uiState.recoveryDrafts.recharge,undefined);
    input.value=''; ctx.window.bindRecoveryDialogs(root,snapshots); assert.equal(input.value,'');
});
