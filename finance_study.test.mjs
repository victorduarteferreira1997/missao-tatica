import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
const app = await readFile(new URL('./app.html', import.meta.url), 'utf8');
const section = (start,end) => { const a=app.indexOf(start),b=app.indexOf(end,a+start.length); assert.ok(a>=0&&b>a,start); return app.slice(a,b); };
const plain = value => JSON.parse(JSON.stringify(value));
class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : ['2026-10-06T18:30:00Z'])); } static now() { return Date.parse('2026-10-06T18:30:00Z'); } }
function engine() {
    const elements = {};
    const ctx = {
        state:{xp:100,coins:83,energy:95,prestige:{campaign:3},financeData:{incomes:[],fixedExpenses:[],variableExpenses:[],moneyJournal:[]},studyData:{subjects:[{id:7,name:'Direito'}],sessions:[],reviews:[],errorLog:[]}},
        uiState:{financeTab:'dashboard',studyTab:'log',confirm:{},alert:{},customPrompt:{}}, Date:FixedDate,
        render(){}, setTimeout(){}, document:{activeElement:null,getElementById:id=>elements[id] || null,querySelectorAll:()=>[]},
        window:{showToast(){},showAlertModal(message){this.alertMessage=message;},showConfirmModal(message,cb){this.confirmCallback=cb;},
            saveState(){this.saves=(this.saves || 0)+1;},checkGameTriggers(){},checkLevelUp(){},changeEnergy(delta){ctx.state.energy+=delta;},
            normalizePrestige:()=>ctx.state.prestige,bindFormDialog(root,options){this.dialogBinding=options;},
            closeCustomPrompt(){ctx.uiState.customPrompt={};},renderStudySubjectOptions:()=>'<option value="7">Direito</option>'}
    };
    runInNewContext([
        section('window.getLocalDateKey =','window.spawnFloatingText ='),
        section('window.escapeHtml =','// Ponte temporária'),
        section('window.recoveryHandlerArgument =','window.getRecoveryIcon ='),
        section('window.renderWorkDialog =','// RADAR DE CONTROLE / SITUAÇÃO OPERACIONAL'),
        section('window.getStudyAreaForTab =','window.addSubject ='),
        section('const SESSION_TYPES =','const WORKOUT_TYPES ='),
        section('window.logStudySession =','window.recalculateLevelFromXp ='),
        section('function renderStudyContent()','// --- SAÚDE/CORPO ---'),
        section('window.renderFinanceForm =','</script>'),
        'window.financeView=renderFinanceContent; window.studyView=renderStudyContent; window.studyNav=renderStudyNavigation;'
    ].join('\n'),ctx);
    ctx.field=(id,value,extra={})=>elements[id]={id,value:String(value),...extra};
    ctx.gasto=(amount='20',trigger='Planejado')=>{ctx.field('var-desc','Livro');ctx.field('var-amount',amount);ctx.field('var-cat','Educação');ctx.field('var-trigger',trigger);};
    ctx.session=()=>{for(const [id,value] of Object.entries({'session-subject':7,'session-type':'leitura','session-duration':60,'session-q-total':10,'session-q-correct':8,'session-topic':'Constituição','session-conf-before':2,'session-conf-after':4}))ctx.field(id,value);};
    return ctx;
}
test('somas trabalham em centavos e preservam valores importados sem alterar registros',()=>{
    const c=engine();c.state.financeData.incomes=[{amount:'0.10'},{amount:0.2},{amount:'inválido'}];c.state.financeData.fixedExpenses=[{amount:'0.05',paid:false}];
    const before=JSON.stringify(c.state);const sum=c.window.getFinanceSummary();assert.equal(sum.incomeTotal,0.3);assert.equal(sum.result,0.25);assert.equal(sum.unpaidTotal,0.05);
    const html=c.window.financeView();assert.match(html,/Resultado estimado/);assert.match(html,/não representa saldo bancário/);assert.ok(!html.includes('Vazamento Emocional'));assert.equal(JSON.stringify(c.state),before);
    assert.ok(!/<details[^>]*\sopen(?:\s|>)/.test(html));
});
test('períodos respeitam o dia local e datas importadas sem horário; contas fixas mantêm status',()=>{
    const c=engine();c.state.financeData.incomes=[{id:1,amount:10,date:'2026-10-01'},{id:2,amount:20,date:'2026-10-01T01:00:00Z'},{id:3,amount:30,date:'2026-09-12'},{id:4,amount:40,date:null},{id:5,amount:50,date:'2026-02-31'}];
    c.state.financeData.fixedExpenses=[{amount:5,paid:false},{amount:6,paid:true}];assert.equal(c.window.getFinanceSummary().incomeTotal,150);
    c.window.setFinancePeriod('current');assert.equal(c.window.getFinanceSummary().incomeTotal,10);assert.equal(c.window.getFinanceSummary().undated,2);
    c.window.setFinancePeriod('previous');assert.equal(c.window.getFinanceSummary().incomeTotal,50);assert.equal(c.window.getFinanceSummary().fixedTotal,11);assert.equal(c.window.getFinanceSummary().unpaid.length,1);
    assert.equal(c.window.formatFinanceDate('2026-10-01'),'01/10/2026');assert.equal(c.window.formatFinanceDate(null),'Data não registrada');
});
test('novos lançamentos exigem descrição e pelo menos um centavo; salvar limpa somente o formulário',()=>{
    const c=engine();c.field('inc-desc','Salário');c.field('inc-cat','Salário');
    for(const amount of ['',0,-1,'NaN','Infinity',1e308,0.001]){c.field('inc-amount',amount);c.window.addIncome();}assert.equal(c.state.financeData.incomes.length,0);
    c.field('inc-amount',10.126);c.uiState.workDrafts={'finance:receitas':{},'finance:diario':{fields:[{value:'Preservar'}]}};c.window.addIncome();
    assert.equal(c.state.financeData.incomes[0].amount,10.13);assert.equal(c.state.xp,100);assert.equal(c.state.coins,83);assert.equal(c.uiState.workDrafts['finance:receitas'],undefined);assert.ok(c.uiState.workDrafts['finance:diario']);
    c.field('fix-desc','Internet');c.field('fix-amount','99.90');c.field('fix-cat','Outro');c.window.addFixedExpense();assert.equal(c.state.financeData.fixedExpenses[0].paid,false);assert.equal(c.state.financeData.fixedExpenses[0].date,undefined);
});
test('revisão da compra só registra após decisão e não duplica confirmações',()=>{
    const c=engine();c.gasto('150');c.window.tryAddVariableExpense();assert.equal(c.state.financeData.variableExpenses.length,0);assert.equal(c.uiState.customPrompt.type,'financeGuardian');
    const row=c.uiState.financeGuardianData;c.window.confirmAddVariable();c.window.confirmAddVariable(row);assert.equal(c.state.financeData.variableExpenses.length,1);assert.equal(c.state.xp,100);
    c.gasto('20');c.window.tryAddVariableExpense();assert.equal(c.state.financeData.variableExpenses.length,2);
});
test('adiar, cancelar e diário guardam os mesmos bônus, com campanha, sem cadastrar despesa',()=>{
    const c=engine();c.gasto('20','Ansiedade');c.window.tryAddVariableExpense();c.window.delayPurchase();c.window.delayPurchase();assert.equal(c.state.xp,150);
    c.gasto('20','Impulso');c.window.tryAddVariableExpense();c.window.cancelPurchase();assert.equal(c.state.xp,230);assert.equal(c.state.financeData.variableExpenses.length,0);
    c.field('mj-event','Organizei as contas');c.field('mj-mood','Calmo');c.field('mj-thought','');c.window.logMoneyJournal();assert.equal(c.state.xp,245);
    assert.deepEqual(plain(c.state.financeData.moneyJournal.map(row=>[row.xpAwarded,row.xpCampaign])),[[50,3],[80,3],[15,3]]);
});
test('exclusão exige confirmação e aceita IDs textuais; pagar não altera cálculo estimado',()=>{
    const c=engine();c.state.financeData.fixedExpenses=[{id:'conta-1',description:'Aluguel',amount:100,paid:false}];
    c.window.toggleFixedPaid('conta-1');assert.equal(c.window.getFinanceSummary().result,-100);assert.equal(c.window.getFinanceSummary().unpaid.length,0);
    c.window.deleteFixed('conta-1');assert.equal(c.state.financeData.fixedExpenses.length,1);c.window.confirmCallback();c.window.confirmCallback();assert.equal(c.state.financeData.fixedExpenses.length,0);
});
test('listas paginam todo o histórico e escapam campos e IDs importados',()=>{
    const c=engine();c.uiState.financeTab='variaveis';c.state.financeData.variableExpenses=Array.from({length:23},(_,i)=>({id:`${i}'\");evil()//`,date:'2026-10-06',description:`<img src=x onerror=evil()> ${i}`,amount:i+1,category:'<script>evil()</script>',trigger:'<b>Impulso</b>'}));
    let html=c.window.renderFinanceRows('variaveis');assert.ok(!html.includes('<img'));assert.ok(!html.includes('<script>'));assert.match(html,/&lt;img/);assert.match(html,/1 de 3/);
    c.window.setFinancePage('variaveis',2);html=c.window.renderFinanceRows('variaveis');assert.match(html,/3 de 3/);assert.equal((html.match(/aria-label="Excluir registro/g)||[]).length,3);
    assert.ok(!/<details[^>]*\sopen(?:\s|>)/.test(c.window.renderFinanceForm('variaveis')));
});
test('navegação oferece todas as oito abas e janelas preservam cabeçalho e rolagem do planejamento',()=>{
    const c=engine();for(const [area,tabs] of Object.entries({today:['plano','log'],planning:['planning','ciclos'],content:['subjects','erros'],progress:['dashboard','reviews']})){
        c.window.setStudyArea(area);const html=c.window.studyNav();for(const tab of tabs)assert.ok(html.includes(`window.setStudyTab('${tab}')`));
    }
    c.window.setStudyTab('log');c.window.setStudyTab('inválido');assert.equal(c.uiState.studyTab,'log');
    const study=c.window.renderWorkDialog('study'),finance=c.window.renderWorkDialog('finance');assert.match(study,/id="study-modal-scroll"/);assert.match(study,/role="dialog" aria-modal="true"/);assert.match(finance,/id="finance-period"/);assert.match(finance,/Todo o histórico/);
    assert.match(study,/data-work-section="questions"/);assert.match(study,/data-work-section="context"/);assert.ok(!/<details[^>]*\sopen(?:\s|>)/.test(study));
    for(const id of ['session-conf-before','session-conf-after','session-q-total','session-q-correct'])assert.ok(study.includes(`id="${id}"`));assert.match(study,/name="session-barriers"/);
});
test('sessões mantêm XP, HP e revisões; entradas inválidas não contaminam progresso',()=>{
    const c=engine();c.session();c.field('session-duration','');c.window.logStudySession();assert.equal(c.state.studyData.sessions.length,0);assert.equal(c.state.xp,100);
    c.field('session-duration',60);c.document.querySelectorAll=()=>[{value:'Celular'}];c.uiState.workDrafts={'study:log':{fields:[{id:'session-topic',value:'Constituição'}]}};
    c.window.logStudySession();assert.equal(c.state.studyData.sessions.length,1);assert.equal(c.state.studyData.reviews.length,3);const session=c.state.studyData.sessions[0];assert.equal(session.xpCampaign,3);assert.equal(c.state.xp,100+session.xpAwarded);assert.equal(c.state.energy,95+session.energyDeltaApplied);assert.deepEqual(plain(session.barriers),['Celular']);assert.equal(c.uiState.workDrafts['study:log'],undefined);
});
test('rascunhos pertencem à aba exibida, restauram seleção e rolagem, e não ressuscitam após salvar',()=>{
    const c=engine();const desc={id:'var-desc',value:'Livro',type:'text'},barrier={id:'',name:'session-barriers',value:'Celular',type:'checkbox',checked:true};
    function dom(kind,tab,fields,scrollTop=125){
        const body={scrollTop,querySelectorAll:selector=>selector.startsWith('details')?[]:fields};
        const dialog={dataset:{workTab:tab},querySelector:()=>body,contains:el=>fields.includes(el)};
        return{querySelector:selector=>selector===`#${kind}-module-dialog`?dialog:null,body};
    }
    const old=dom('finance','variaveis',[desc]);c.uiState.financeTab='receitas';const snapshots=c.window.captureWorkDialogs(old);assert.equal(c.uiState.workDrafts['finance:variaveis'].fields[0].value,'Livro');assert.equal(c.uiState.workDrafts['finance:receitas'],undefined);
    const freshDesc={...desc,value:''};const fresh=dom('finance','variaveis',[freshDesc],0);c.window.bindWorkDialogs(fresh,snapshots);assert.equal(freshDesc.value,'Livro');assert.equal(fresh.body.scrollTop,125);
    const study=dom('study','log',[barrier]);const studySnap=c.window.captureWorkDialogs(study);const newBarrier={...barrier,checked:false};c.window.bindWorkDialogs(dom('study','log',[newBarrier]),studySnap);assert.equal(newBarrier.checked,true);
    c.window.finishFinanceForm('variaveis');c.window.captureWorkDialogs(old);freshDesc.value='';c.window.bindWorkDialogs(fresh,snapshots);assert.equal(freshDesc.value,'');
    c.uiState.customPrompt.show=true;c.window.bindWorkDialogs(fresh);assert.equal(c.window.dialogBinding.blocked,true);
});
