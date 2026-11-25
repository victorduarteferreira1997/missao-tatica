import test from 'node:test';
import assert from 'node:assert/strict';
import {boot,plain} from './test-support/app_boot.mjs';

test('abrir Configurações, trocar área e fechar preserva visão, data, filtro e todos os registros sem salvar',()=>{
 const b=boot();b.ui.mainView='week';b.state.activeTab='wednesday';b.state.currentFilter='work';const before=plain(b.state),writes=b.writes.length;
 let saves=0;b.window.saveState=()=>saves++;b.window.saveStateNow=()=>saves++;
 b.window.openSettingsWorkspace();assert.match(b.elements.app.innerHTML,/id="settings-dialog"/);
 for(const tab of ['connections','backups','account'])b.window.setSettingsTab(tab);
 b.window.closeSettingsWorkspace();assert.doesNotMatch(b.window.renderSettingsWorkspace(),/role="dialog"/);
 assert.equal(b.ui.mainView,'week');assert.equal(b.state.currentFilter,'work');assert.deepEqual(plain(b.state),before);assert.equal(b.writes.length,writes);assert.equal(saves,0);
});
test('as três áreas possuem uma identificação clara e o rodapé fica sem controles de IA, backup ou exclusão',()=>{
 const b=boot();b.render();const footer=b.elements.app.innerHTML.match(/<footer data-view-part="app-footer"[\s\S]*?<\/footer>/)[0];
 assert.match(footer,/Configurações/);assert.doesNotMatch(footer,/Assistente de IA|Exportar backup|Gerenciar dados|Propostas da IA/);
 assert.equal((b.elements.app.innerHTML.match(/aria-label="Propostas da IA"/g)||[]).length,1);
 b.window.openSettingsWorkspace();let html=b.window.renderSettingsWorkspace();assert.equal((html.match(/id="settings-tab-/g)||[]).length,3);
 assert.match(html,/Perfil e campanha/);assert.match(html,/Sair da conta/);assert.match(html,/aria-pressed="true"/);
 b.window.setSettingsTab('backups');html=b.window.renderSettingsWorkspace();assert.ok(html.indexOf('Exportar backup')<html.indexOf('Limpeza e reinício'));assert.match(html,/id="open-data-manager"/);assert.doesNotMatch(html,/cleanup-finance|type="checkbox"/);
});
test('configurações da IA respeitam os controles do proprietário e não autorizam nada ao abrir',()=>{
 const b=boot();let calls=0;b.window.openAiAccess=()=>calls++;
 b.window.openSettingsWorkspace();b.window.setSettingsTab('connections');let html=b.window.renderSettingsWorkspace();assert.match(html,/Configurar acesso da IA/);assert.match(html,/Abrir conexão privada/);assert.match(html,/Compartilhamento manual da semana/);assert.equal(calls,0);
 b.window.renderAiAccessButton=()=>'';b.window.renderAiInboxButton=()=>'';html=b.window.renderSettingsWorkspace();assert.doesNotMatch(html,/Configurar acesso da IA|Abrir conexão privada|Compartilhamento manual/);assert.match(html,/somente na conta autorizada/);
});
test('ações de conta e backup usam os handlers existentes, ignorando comandos não permitidos',()=>{
 const b=boot(),calls=[];for(const name of ['openProfileModal','logout','exportData','triggerImport','openDataManager'])b.window[name]=()=>calls.push(name);
 b.window.runSettingsAction('export');assert.deepEqual(calls,[]);
 b.window.openSettingsWorkspace();for(const action of ['profile','export','import','cleanup','logout','saveNewTask'])b.window.runSettingsAction(action);
 assert.deepEqual(calls,['openProfileModal','exportData','triggerImport','openDataManager','logout']);
 b.window.closeSettingsWorkspace();b.window.runSettingsAction('cleanup');assert.equal(calls.length,5);
});
test('posição em cada área e última área sobrevivem à volta e à reabertura',()=>{
 const b=boot();b.window.openSettingsWorkspace();b.elements['settings-dialog-scroll']={scrollTop:175};b.window.setSettingsTab('backups');assert.equal(b.elements['settings-dialog-scroll'].scrollTop,0);
 b.elements['settings-dialog-scroll'].scrollTop=310;b.window.setSettingsTab('account');assert.equal(b.elements['settings-dialog-scroll'].scrollTop,175);
 b.window.setSettingsTab('backups');assert.equal(b.elements['settings-dialog-scroll'].scrollTop,310);b.window.closeSettingsWorkspace();b.window.openSettingsWorkspace();assert.match(b.window.renderSettingsWorkspace(),/data-work-tab="backups"/);assert.equal(b.elements['settings-dialog-scroll'].scrollTop,310);
});
test('estado do salvamento e mudança da Agenda atualizam apenas seus campos',()=>{
 const b=boot();b.window.openSettingsWorkspace();b.elements['settings-save-status']={textContent:''};const html=b.elements.app.innerHTML;
 b.window.updateSyncStatus('Erro ao salvar');assert.equal(b.elements['settings-save-status'].textContent,'Erro ao salvar');assert.equal(b.elements.app.innerHTML,html);
 b.elements['settings-calendar-connection']={outerHTML:''};b.window.calendarSync.view=()=>({enabled:true,connected:false,status:'Reconectar',error:'Falha fictícia'});
 b.c.calendarOnChange();assert.match(b.elements['settings-calendar-connection'].outerHTML,/Falha fictícia/);assert.match(b.elements['settings-calendar-connection'].outerHTML,/Reconectar/);assert.equal(b.elements.app.innerHTML,html);
});
test('Agenda usa conectar, sincronizar e pausar sem escrever ao navegar; estado ocupado bloqueia cliques repetidos',async()=>{
 const b=boot(),calls=[];let busy=false;b.window.calendarSync.view=()=>({busy,connected:true,enabled:true,status:'Sincronizado'});
 b.window.calendarSync.connect=async()=>calls.push('connect');b.window.calendarSync.syncNow=async options=>calls.push(options);b.window.calendarSync.pause=()=>calls.push('pause');
 b.window.openSettingsWorkspace();b.window.setSettingsTab('connections');const before=plain(b.state);
 await b.window.runSettingsCalendarAction('connect');await b.window.runSettingsCalendarAction('sync');await b.window.runSettingsCalendarAction('pause');busy=true;await b.window.runSettingsCalendarAction('sync');await b.window.runSettingsCalendarAction('unknown');
 assert.deepEqual(calls,['connect',{force:true},'pause']);assert.deepEqual(plain(b.state),before);
});
test('falha de conexão deixa uma mensagem e permite nova tentativa',async()=>{
 const b=boot();b.window.calendarSync.view=()=>({enabled:true,connected:false,status:'Reconectar'});let calls=0;b.window.calendarSync.connect=async()=>{calls++;throw Error('Segredo técnico fictício');};
 b.window.openSettingsWorkspace();b.window.setSettingsTab('connections');await b.window.runSettingsCalendarAction('connect');assert.match(b.window.renderSettingsWorkspace(),/Não foi possível concluir/);assert.doesNotMatch(b.window.renderSettingsWorkspace(),/Segredo técnico/);await b.window.runSettingsCalendarAction('connect');assert.equal(calls,2);
});
test('autorização pendente aparece em Conexões sem afirmar sincronização e desabilita os controles',()=>{
 const b=boot();b.window.calendarSync.view=()=>({enabled:true,connected:false,busy:true,connecting:true,status:'Aguardando autorização do Google',notice:'Volte para esta mesma aba.'});
 b.window.openSettingsWorkspace();b.window.setSettingsTab('connections');const html=b.window.renderSettingsWorkspace();
 assert.match(html,/Aguardando autorização do Google/);assert.match(html,/Volte para esta mesma aba/);assert.doesNotMatch(html,/Sincronizando…/);
 assert.match(html,/<button id="settings-calendar-connect" type="button" disabled/);assert.match(html,/<button id="settings-calendar-pause" type="button" disabled/);
});
test('revisar limpeza pelas Configurações não seleciona nem apaga registros e retorna à mesma área',()=>{
 const b=boot();b.window.openSettingsWorkspace();b.window.setSettingsTab('backups');const before=plain(b.state);
 b.window.runSettingsAction('cleanup');assert.deepEqual(plain(b.ui.dataManager.selected),[]);assert.match(b.window.renderSettingsWorkspace(),/data-work-tab="backups"/);b.window.closeDataManager();assert.deepEqual(plain(b.state),before);assert.match(b.window.renderSettingsWorkspace(),/data-work-tab="backups"/);
});
test('cancelar a restauração de backup não altera a conta e preserva Configurações',()=>{
 const b=boot();b.window.openSettingsWorkspace();b.window.setSettingsTab('backups');const before=plain(b.state),candidate={...before,tasks:[{id:'backup',text:'Do arquivo'}]};
 b.c.FileReader=class{readAsText(){this.onload({target:{result:JSON.stringify(candidate)}});}};
 b.window.importData({target:{files:[{}],value:'arquivo.json'}});assert.equal(b.ui.confirm.show,true);assert.match(b.ui.confirm.message,/substituídos/);assert.deepEqual(plain(b.state),before);b.window.handleConfirmResult(false);assert.deepEqual(plain(b.state),before);assert.match(b.window.renderSettingsWorkspace(),/data-work-tab="backups"/);
});
test('backup de outra conta continua rejeitado sem substituir dados',()=>{
 const b=boot();b.window.openSettingsWorkspace();b.window.setSettingsTab('backups');const before=plain(b.state),candidate={...before,ownerUid:'outra-conta'};
 b.c.FileReader=class{readAsText(){this.onload({target:{result:JSON.stringify(candidate)}});}};b.window.importData({target:{files:[{}],value:'arquivo.json'}});assert.equal(b.ui.alert.show,true);assert.deepEqual(plain(b.state),before);
});
test('reset de sessão remove Configurações e descarta retorno tardio da Agenda',async()=>{
 const b=boot();let release;b.window.calendarSync.view=()=>({connected:false,status:'Desconectado'});b.window.calendarSync.connect=()=>new Promise((resolve,reject)=>release=()=>reject(Error('Atrasado')));
 b.window.openSettingsWorkspace();b.window.setSettingsTab('connections');const pending=b.window.runSettingsCalendarAction('connect');b.window.resetSettingsWorkspace();release();await pending;assert.equal(b.window.renderSettingsWorkspace(),'');b.window.openSettingsWorkspace();assert.match(b.window.renderSettingsWorkspace(),/data-work-tab="account"/);assert.doesNotMatch(b.window.renderSettingsWorkspace(),/Atrasado/);
});
test('exportar pelas Configurações gera JSON completo da conta atual sem alterar registros',()=>{
 const b=boot(),attributes={};let downloads=0;b.c.document.createElement=()=>({setAttribute:(key,value)=>attributes[key]=value,click:()=>downloads++});
 b.window.openSettingsWorkspace();b.window.setSettingsTab('backups');const before=plain(b.state);b.window.runSettingsAction('export');
 assert.equal(downloads,1);assert.match(attributes.download,/^missao_tatica_backup_.*\.json$/);assert.deepEqual(JSON.parse(decodeURIComponent(attributes.href.split(',')[1])),before);assert.deepEqual(plain(b.state),before);
});
