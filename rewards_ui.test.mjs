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

test('configurar videogame altera próximos resgates e alvo sem mudar preços base ou registros antigos',()=>{
 const previous={id:'old-vg',rewardId:'r2',title:'30 min de Videogame',cost:220,type:'default',date:'2026-10-01',campaignId:1};
 const c=engine({rewardPurchases:[previous]});c.window.setRewardTarget('default','r2');const before=plain(c.state);
 c.window.openRewardEditor('default','r2');assert.equal(c.uiState.rewardEditor.draft.name,'Videogame');assert.equal(c.uiState.rewardEditor.draft.duration,'30');
 c.window.setRewardEditDraft('duration','120');c.window.setRewardEditDraft('cost','300');c.window.setRewardEditDraft('desc','Sessão escolhida por mim');c.window.saveRewardConfiguration();
 assert.equal(c.uiState.rewardEditor,null);assert.equal(c.uiState.rewardGroup,'medium');assert.equal(c.state.economy.targetReward.title,'Videogame · 2 h');assert.equal(c.state.economy.targetReward.cost,300);assert.equal(c.state.economy.targetReward.durationMinutes,120);
 for(const key of ['coins','xp','energy','stats','unlockedBadges','rewardPurchases'])assert.deepEqual(plain(c.state[key]),before[key],key);
 assert.equal(c.state.economy.tacticalReserve,250);assert.equal(c.window.catalogForTest.find(r=>r.id==='r2').cost,220);
 const html=c.window.renderRewardCatalog();assert.match(html,/Videogame/);assert.match(html,/2 h/);assert.match(html,/300 MT/);
 c.window.reviewRewardRedemption('default','r2');assert.match(c.message,/300 MT/);c.confirm();assert.equal(c.state.rewardPurchases[1].title,'Videogame · 2 h');assert.equal(c.state.rewardPurchases[1].durationMinutes,120);assert.equal(c.state.rewardPurchases[1].cost,300);assert.deepEqual(plain(c.state.rewardPurchases[0]),previous);
});
test('cancelar configuração e recusar restauração não altera dados; padrão restaura só a opção e seu alvo',()=>{
 const c=engine();c.window.openRewardEditor('default','r2');c.window.setRewardEditDraft('duration','180');const before=plain(c.state);c.window.closeRewardEditor();assert.deepEqual(plain(c.state),before);
 c.window.openRewardEditor('default','r2');c.window.setRewardEditDraft('duration','180');c.window.setRewardEditDraft('cost','600');c.window.saveRewardConfiguration();c.window.setRewardTarget('default','r2');
 c.window.openRewardEditor('default','r2');const configured=plain(c.state);c.window.restoreOfficialRewardDefaults();assert.deepEqual(plain(c.state),configured); // cancelamento preserva tudo
 c.confirm();assert.equal(c.state.rewardOverrides.r2,undefined);assert.equal(c.state.economy.targetReward.cost,220);assert.equal(c.state.economy.targetReward.title,'30 min de Videogame');assert.equal(c.state.economy.targetReward.durationMinutes,30);assert.equal(c.state.coins,100);assert.equal(c.state.economy.tacticalReserve,250);
});
test('duração é opcional e independente do custo; validação não trunca valores e mantém rascunhos',()=>{
 const c=engine();c.window.openRewardEditor('default','r1');const before=plain(c.state);
 for(const value of ['0','-1','1.5','NaN','Infinity']){c.window.setRewardEditDraft('duration',value);c.window.saveRewardConfiguration();assert.deepEqual(plain(c.state),before);assert.equal(c.uiState.rewardEditor.draft.duration,value);}
 c.window.setRewardEditDraft('duration','');for(const value of ['49','50.5','','NaN','Infinity']){c.window.setRewardEditDraft('cost',value);c.window.saveRewardConfiguration();assert.deepEqual(plain(c.state),before);}
 c.window.setRewardEditDraft('cost','180');c.window.setRewardEditDraft('name','');c.window.saveRewardConfiguration();assert.deepEqual(plain(c.state),before);
 c.window.setRewardEditDraft('name','Filme <favorito>');c.window.setRewardEditDraft('duration','135');assert.match(c.window.renderRewardEditor(),/Filme &lt;favorito&gt;/);c.window.saveRewardConfiguration();
 assert.equal(c.window.getOfficialReward('r1').cost,180);assert.equal(c.window.getOfficialReward('r1').title,'Filme <favorito> · 2 h 15 min');assert.equal(c.state.coins,100);
 c.window.openRewardEditor('default','r1');c.window.setRewardEditDraft('duration','');c.window.saveRewardConfiguration();assert.equal(c.window.getOfficialReward('r1').durationMinutes,null);assert.equal(c.window.getOfficialReward('r1').title,'Filme <favorito>');
});
test('editar personalizada preserva ID, arquivo e snapshots; cadastrar aceita duração opcional',()=>{
 const c=engine({customRewards:[{id:'imported-id',title:'Jogo',cost:100}],rewardPurchases:[{title:'Jogo antigo',cost:100, rewardId:'imported-id'}]});
 c.window.setRewardTarget('custom','imported-id');c.window.openRewardEditor('custom','imported-id');assert.ok(!c.window.renderRewardEditor().includes('Restaurar padrão'));c.window.setRewardEditDraft('duration','90');c.window.setRewardEditDraft('cost','200');c.window.setRewardEditDraft('name','Jogo em família');c.window.saveRewardConfiguration();
 const reward=c.state.customRewards[0];assert.equal(reward.id,'imported-id');assert.equal(reward.title,'Jogo em família · 1 h 30 min');assert.equal(reward.active,undefined);assert.equal(c.state.economy.targetReward.cost,200);assert.equal(c.state.rewardPurchases[0].title,'Jogo antigo');assert.equal(c.state.rewardPurchases[0].cost,100);
 c.field('custom-reward-title','Outra sessão');c.field('custom-reward-cost',100);c.field('custom-reward-duration',0);c.window.addCustomReward();assert.equal(c.state.customRewards.length,1);
 c.field('custom-reward-duration',240);c.window.addCustomReward();assert.equal(c.state.customRewards.length,2);assert.equal(c.state.customRewards[1].title,'Outra sessão · 4 h');assert.equal(c.state.customRewards[1].durationMinutes,240);
});
test('alterar configurações invalida resgate pendente e editores antigos não sobrescrevem mudanças',()=>{
 const c=engine();c.window.reviewRewardRedemption('default','r2');const pending=c.confirm;c.window.openRewardEditor('default','r2');c.window.setRewardEditDraft('duration','120');c.window.saveRewardConfiguration();const before=plain(c.state);pending();assert.deepEqual(plain(c.state),before);assert.match(c.alert,/mudou/);
 for(const change of ['settings','campaign','state']){const x=engine();x.window.openRewardEditor('default','r2');x.window.setRewardEditDraft('duration','120');
  if(change==='settings')x.state.rewardOverrides={r2:{name:'Novo nome',cost:300,durationMinutes:180,version:'remote'}};
  if(change==='campaign')x.state.prestige.campaign++;
  if(change==='state')x.state=plain(x.state);
  const snapshot=plain(x.state);x.window.saveRewardConfiguration();assert.deepEqual(plain(x.state),snapshot,change);assert.match(x.alert,/mudou/);
 }
 const x=engine();x.window.openRewardEditor('default','r1');x.window.setRewardEditDraft('name','Em edição');x.window.openRewardEditor('default','r2');assert.equal(x.uiState.rewardEditor.id,'r1');assert.equal(x.uiState.rewardEditor.draft.name,'Em edição');x.confirm();assert.equal(x.uiState.rewardEditor.id,'r2');
});
test('configurações persistidas são aplicadas na inicialização, antes dos handlers visuais, e exportam em JSON',()=>{
 const c=engine();c.window.setRewardTarget('default','r2');c.window.openRewardEditor('default','r2');c.window.setRewardEditDraft('duration','120');c.window.setRewardEditDraft('cost','450');c.window.saveRewardConfiguration();const exported=JSON.stringify(c.state);
 const early={state:JSON.parse(exported),window:{getCurrentCalendarWeekStartKey:()=> '2026-10-05'}};
 runInNewContext(section('const REWARDS_SHOP =','const TASK_NATURES =')+section('window.normalizeEconomy =','window.getTaskNature ='),early);
 assert.equal(early.window.getRewardSource,undefined);assert.ok(app.indexOf('window.getOfficialReward =')<app.indexOf('window.validateState();'));
 early.window.normalizeEconomy();assert.equal(early.state.economy.targetReward.cost,450);assert.equal(early.state.economy.targetReward.title,'Videogame · 2 h');assert.equal(early.window.getOfficialReward('r2').durationMinutes,120);
 const reloaded=engine(JSON.parse(exported));assert.match(reloaded.window.renderRewardCatalog().split('<details')[0],/Pequenas/);reloaded.window.setRewardGroup('medium');assert.match(reloaded.window.renderRewardCatalog(),/450 MT/);assert.match(reloaded.window.renderRewardCatalog(),/2 h/);
 early.state.rewardOverrides.r2={cost:0,durationMinutes:-1,name:'',icon:'<img>'};const fallback=early.window.getOfficialReward('r2');assert.equal(fallback.cost,220);assert.equal(fallback.durationMinutes,30);assert.equal(fallback.name,'Videogame');assert.equal(fallback.icon,'gamepad-2');
});
