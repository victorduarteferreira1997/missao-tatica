import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
const app=await readFile(new URL('./app.html',import.meta.url),'utf8');
const section=(start,end)=>{const a=app.indexOf(start),b=app.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,start);return app.slice(a,b);};
const plain=v=>JSON.parse(JSON.stringify(v));
function engine(overrides={}) {
 const elements={},c={state:{coins:100,energy:60,xp:12345,stats:{},customRewards:[],rewardPurchases:[],unlockedBadges:[],prestige:{campaign:3},economy:{tacticalReserve:250,weeklyCoinsEarned:240},...overrides},uiState:{statsTab:'shop',confirm:{},alert:{},customPrompt:{}},
 document:{activeElement:null,getElementById:id=>elements[id]||null},render(){c.renders=(c.renders||0)+1;},
 window:{getCurrentCalendarWeekStartKey:()=> '2026-10-05',normalizePrestige:()=>c.state.prestige,changeEnergy:n=>c.state.energy=Math.min(100,c.state.energy+n),recordCampaignStat:()=>c.campaignStats=(c.campaignStats||0)+1,checkGameTriggers(){},unlockBadge:id=>{if(!c.state.unlockedBadges.includes(id))c.state.unlockedBadges.push(id);},showAlertModal:message=>c.alert=message,showToast(){},saveState:()=>c.saves=(c.saves||0)+1,showConfirmModal:(message,callback)=>{c.confirm=callback;c.message=message;},toggleStatsModal(){},bindFormDialog:(root,options)=>c.binding=options}};
 runInNewContext([
 section('const REWARDS_SHOP =','const TASK_NATURES ='),section('window.normalizeEconomy =','window.getTaskNature ='),section('window.setRewardTarget =','window.resetTacticalCoins ='),
 section('window.getRewardSource =','window.endDay ='),section('window.escapeHtml =','// Ponte temporária'),section('window.formatCampaignDate =','window.renderNextCampaignBadge ='),section('window.captureQGDialog =','function renderQGContent()'),
 'window.catalogForTest = REWARDS_SHOP;'
 ].join('\n'),c);
 c.field=(id,value)=>elements[id]={value:String(value)};
 c.window.normalizeEconomy();return c;
}
test('catálogo preserva IDs/preços anteriores, inclui cinco opções e abre nas pequenas',()=>{
 const c=engine();assert.deepEqual(plain(c.window.catalogForTest.slice(0,7).map(r=>[r.id,r.cost])),[['r1',180],['r2',220],['r3',120],['r4',100],['r5',600],['r6',900],['r7',1200]]);
 assert.equal(new Set(c.window.catalogForTest.map(r=>r.id)).size,12);
 const html=c.window.renderRewardCatalog(),main=html.slice(0,html.indexOf('<details'));
 assert.equal((main.match(/<article/g)||[]).length,5);assert.ok(!main.includes('Recompensa Grande'));assert.ok(!main.includes('Pausa Total'));assert.ok(!html.includes('<details open'));
 c.window.setRewardGroup('medium');const medium=c.window.renderRewardCatalog().split('<details')[0];assert.equal((medium.match(/<article/g)||[]).length,4);
 c.window.setRewardGroup('large');assert.match(c.window.renderRewardCatalog().split('<details')[0],/Recompensa Grande/);
});
test('trocar filtros/rascunhos/alvo não gasta moedas nem altera carreira e resgates',()=>{
 const record={id:'old',rewardId:'r7',title:'Título antigo',cost:1800,type:'default',date:'2020-01-01',campaignId:1};
 const c=engine({rewardPurchases:[record],customRewards:[{id:'personal',title:'Minha meta',cost:800}]});const before=plain(c.state);
 c.window.setRewardDraft('title','Viagem <sonho>');c.window.setRewardDraft('cost','999');c.window.setRewardSection('create',true);
 for(const group of ['custom','all','small']){c.window.setRewardGroup(group);const html=c.window.renderRewardCatalog();assert.match(html,/value="Viagem &lt;sonho&gt;"/);assert.match(html,/<details open/);}
 assert.deepEqual(plain(c.state),before);
 c.window.setRewardTarget('custom','personal');assert.equal(c.state.economy.targetReward.cost,800);assert.equal(c.state.coins,before.coins);assert.deepEqual(plain(c.state.rewardPurchases),before.rewardPurchases);
 let scrolled=0;c.document.getElementById=()=>({scrollIntoView(){scrolled++;}});c.window.openRewardCatalog();assert.equal(c.uiState.rewardGroup,'custom');assert.equal(scrolled,1);
 c.window.setRewardTarget('default','r3');c.window.openRewardCatalog();assert.equal(c.uiState.rewardSections.legacy,true);assert.equal(c.state.economy.targetReward.cost,120);
});
test('resgate confirmado usa semana antes da reserva, mantém limite e registra campanha exata uma vez',()=>{
 const c=engine(),before=plain(c.state);c.window.reviewRewardRedemption('default','r9');assert.match(c.message,/180 MT/);assert.deepEqual(plain(c.state),before); // cancelar = não executar callback
 c.confirm();assert.equal(c.state.coins,0);assert.equal(c.state.economy.tacticalReserve,170);assert.equal(c.state.economy.weeklyCoinsEarned,240);assert.equal(c.state.energy,80);assert.equal(c.state.xp,12345);assert.equal(c.state.stats.rewardsBought,1);assert.equal(c.campaignStats,1);
 assert.deepEqual(plain(c.state.economy.history[0]).fromWeek,100);assert.equal(c.state.economy.history[0].fromReserve,80);
 const purchase=c.state.rewardPurchases[0];assert.equal(purchase.cost,180);assert.equal(purchase.title,'Jogo em dupla');assert.equal(purchase.campaignId,3);
 c.confirm();assert.equal(c.state.rewardPurchases.length,1);assert.equal(c.state.economy.tacticalReserve,170);
});
test('confirmações antigas verificam saldo, preço, arquivo, campanha e substituição de estado',()=>{
 for(const change of ['funds','price','archive','campaign','replace']){
  const c=engine({customRewards:[{id:'old-id',title:'Personalizada',cost:'200'}]});c.window.reviewRewardRedemption('custom','old-id');
  if(change==='funds'){c.state.coins=0;c.state.economy.tacticalReserve=0;}
  if(change==='price')c.state.customRewards[0].cost=250;
  if(change==='archive')c.state.customRewards[0].active=false;
  if(change==='campaign')c.state.prestige.campaign=4;
  if(change==='replace')c.state=plain(c.state);
  const before=plain(c.state);c.confirm();assert.deepEqual(plain(c.state),before,change);assert.ok(c.alert);
 }
 const c=engine();for(const id of ['missing',null])c.window.buyReward(id);assert.equal(c.state.rewardPurchases.length,0);assert.equal(c.state.coins,100);
 for(const cost of [0,-50,100.5,'NaN',Infinity,{},[100]]){c.state.customRewards=[{id:'bad',cost}];c.window.buyCustomReward('bad');}assert.equal(c.state.rewardPurchases.length,0);
});
test('personalizadas importadas sem active e com IDs de texto podem ser resgatadas e arquivadas',()=>{
 const c=engine({customRewards:[{id:'a.b-22',title:'Passeio antigo',cost:200}],rewardPurchases:[{id:'previous',rewardId:'a.b-22',title:'Snapshot',cost:111}]});
 c.window.setRewardTarget('custom','a.b-22');c.window.reviewRewardRedemption('custom','a.b-22');c.confirm();assert.equal(c.state.rewardPurchases.length,2);
 const snapshots=plain(c.state.rewardPurchases);c.window.deleteCustomReward('a.b-22');c.confirm();assert.equal(c.state.customRewards[0].active,false);assert.equal(c.state.economy.targetReward,null);assert.deepEqual(plain(c.state.rewardPurchases),snapshots);
 c.window.restoreCustomReward('a.b-22');assert.equal(c.state.customRewards[0].active,true);assert.deepEqual(plain(c.state.rewardPurchases),snapshots);
 c.window.setRewardTarget('default','r1');c.window.deleteCustomReward('a.b-22');c.confirm();assert.equal(c.state.economy.targetReward.id,'r1');
});
test('cadastro exige inteiro mínimo, não trunca valores e limpa só o rascunho ao salvar',()=>{
 const c=engine();c.field('custom-reward-title','Nova opção');c.field('custom-reward-desc','Texto opcional');
 for(const cost of ['',49,50.5,'100abc','Infinity']){c.field('custom-reward-cost',cost);c.window.addCustomReward();}assert.equal(c.state.customRewards.length,0);
 c.uiState.rewardDraft={title:'Nova opção'};c.uiState.rewardSections={create:true,history:true};c.field('custom-reward-cost',50);c.window.addCustomReward();
 assert.equal(c.state.customRewards.length,1);assert.equal(c.state.customRewards[0].cost,50);assert.equal(c.state.customRewards[0].active,true);assert.equal(c.state.coins,100);assert.deepEqual(plain(c.uiState.rewardDraft),{});assert.equal(c.uiState.rewardSections.create,false);assert.equal(c.uiState.rewardSections.history,true);assert.equal(c.uiState.rewardGroup,'custom');
});
test('histórico mostra todos os registros em páginas e escapa textos e argumentos importados',()=>{
 const dangerous=`a'\");alert(1);//<img>`,records=Array.from({length:23},(_,i)=>({title:`Registro ${i}`,cost:100,date:new Date(2026,9,i+1).toISOString(),campaignId:1}));records[0].date='invalid';records[0].title='<img src=x onerror=alert(1)>';
 const c=engine({rewardPurchases:records,customRewards:[{id:dangerous,title:'<script>bad</script>',desc:'<img>',icon:'x" onerror="boom',cost:100}]});c.uiState.rewardGroup='custom';
 let html=c.window.renderRewardCatalog();assert.match(html,/1 de 3/);assert.ok(!html.includes('onerror="boom'));assert.ok(!html.includes('<script>bad'));
 const argument=c.window.rewardArgument(dangerous).replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
 assert.equal(runInNewContext(argument),dangerous);
 c.window.setRewardHistoryPage(2);html=c.window.renderRewardCatalog();assert.match(html,/3 de 3/);assert.match(html,/Data não registrada/);assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.ok(!html.includes('<img src=x'));
 c.window.setRewardHistoryPage(999);assert.match(c.window.renderRewardCatalog(),/3 de 3/);assert.equal(c.state.rewardPurchases.length,23);
});
test('QG conserva rolagem e edição e bloqueia foco quando a confirmação está aberta',()=>{
 const c=engine(),field={id:'custom-reward-title',selectionStart:2,selectionEnd:5,setSelectionRange(a,b){this.selection=[a,b];}},dialog={contains:el=>el===field},scroller={scrollTop:240},root={querySelector:id=>id==='#qg-dialog'?dialog:id==='#qg-scroll'?scroller:null};
 c.document.activeElement=field;c.document.getElementById=()=>field;const snapshot=c.window.captureQGDialog(root);scroller.scrollTop=0;c.window.bindQGDialog(root,snapshot);
 assert.equal(scroller.scrollTop,240);assert.equal(c.binding.initialFocus,field.id);assert.deepEqual(field.selection,[2,5]);assert.equal(c.binding.blocked,false);
 c.uiState.confirm.show=true;c.window.bindQGDialog(root,snapshot);assert.equal(c.binding.blocked,true);
});
