// Navigation and presentation only. Account, grants, backup ownership checks and
// cleanup confirmation continue to use their existing handlers.
export function installSettingsWorkspace(window,{document,getState,getUiState,getUser,getSyncStatus,calendarSync,render,version}) {
    let view=null,renderedTab=null;
    const tabs=[['account','Conta'],['connections','Conexões'],['backups','Backups']];
    const e=value=>window.escapeHtml(String(value??''));
    const current=()=>view&&view.user===getUser()&&view.ui===getUiState()?view:null;
    const remember=()=>{const v=current(),body=document.getElementById('settings-dialog-scroll');if(v&&body&&renderedTab===v.tab)v.positions[v.tab]=body.scrollTop||0;};
    const restore=()=>{const body=document.getElementById('settings-dialog-scroll');if(body)body.scrollTop=current()?.positions[current().tab]||0;};
    window.resetSettingsWorkspace=()=>{view=null;renderedTab=null;};
    window.captureSettingsWorkspace=remember;
    window.openSettingsWorkspace=()=>{
        if(!getUser())return;
        if(!current())view={user:getUser(),ui:getUiState(),open:false,tab:'account',positions:{},calendarMessage:''};
        view.open=true;render();restore();
    };
    window.closeSettingsWorkspace=()=>{const v=current();if(!v?.open)return;remember();v.open=false;render();};
    window.setSettingsTab=tab=>{
        const v=current();if(!v?.open||!tabs.some(([key])=>key===tab))return;
        remember();v.tab=tab;render();restore();document.getElementById('settings-tab-'+tab)?.focus({preventScroll:true});
    };
    window.runSettingsAction=action=>{
        if(!current()?.open)return;
        const allowed={profile:'openProfileModal',logout:'logout',export:'exportData',import:'triggerImport',cleanup:'openDataManager'};
        if(allowed[action])return window[allowed[action]]();
    };
    const renderCalendar=()=>{
        const c=calendarSync.view(),busy=Boolean(c.busy);
        return `<section id="settings-calendar-connection" class="settings-section" aria-labelledby="settings-calendar-title"><h3 id="settings-calendar-title">Google Agenda</h3><p id="settings-calendar-status" tabindex="-1" role="status" aria-live="polite">${e(busy?'Sincronizando…':c.status||'Não conectada')}</p>${c.error?`<p class="settings-error">${e(c.error)}</p>`:''}${current()?.calendarMessage?`<p class="settings-error" role="status">${e(current().calendarMessage)}</p>`:''}<p>Consulte e classifique os compromissos na visão Semana. Pausar mantém os eventos já enviados.</p><div class="settings-actions">${c.connected?`<button id="settings-calendar-sync" type="button" ${busy?'disabled':''} onclick="window.runSettingsCalendarAction('sync')">Sincronizar tudo</button>`:`<button id="settings-calendar-connect" type="button" ${busy?'disabled':''} onclick="window.runSettingsCalendarAction('connect')">${c.enabled?'Reconectar':'Conectar Google Agenda'}</button>`}${c.enabled?`<button id="settings-calendar-pause" type="button" ${busy?'disabled':''} onclick="window.runSettingsCalendarAction('pause')">Pausar</button>`:''}</div></section>`;
    };
    window.refreshSettingsCalendar=()=>{
        const v=current(),panel=document.getElementById('settings-calendar-connection');if(!v?.open||!panel)return;
        const active=document.activeElement,inside=panel.contains?.(active),id=active?.id;
        panel.outerHTML=renderCalendar();
        if(inside){const target=document.getElementById(id);(target&&!target.disabled?target:document.getElementById('settings-calendar-status'))?.focus({preventScroll:true});}
    };
    window.refreshSettingsSyncStatus=()=>{const field=document.getElementById('settings-save-status');if(field&&current()?.open)field.textContent=getSyncStatus();};
    window.runSettingsCalendarAction=async action=>{
        const v=current();if(!v?.open||calendarSync.view().busy||!['connect','sync','pause'].includes(action))return;
        v.calendarMessage='';
        try{if(action==='connect')await calendarSync.connect();else if(action==='sync')await calendarSync.syncNow({force:true});else await calendarSync.pause();}
        catch{if(current()===v)v.calendarMessage='Não foi possível concluir. Confira a conexão e tente novamente.';}
        finally{if(current()===v)window.refreshSettingsCalendar();}
    };
    const account=()=>`<section class="settings-section" aria-labelledby="settings-account-title"><h3 id="settings-account-title">Sua conta</h3><dl class="settings-account"><div><dt>Nome no aplicativo</dt><dd>${e(window.getUserDisplayName())}</dd></div><div><dt>Conta Google</dt><dd>${e(getUser()?.email||'Conta autenticada')}</dd></div><div><dt>Salvamento</dt><dd id="settings-save-status" role="status" aria-live="polite">${e(getSyncStatus())}</dd></div></dl><div class="settings-actions"><button id="settings-profile-open" type="button" onclick="window.runSettingsAction('profile')">Perfil e campanha</button></div></section><section class="settings-section"><h3>Sessão</h3><p>Para usar outra conta, saia e entre novamente com o Google.</p><div class="settings-actions"><button type="button" onclick="window.runSettingsAction('logout')">Sair da conta</button></div><p class="settings-version">Versão ${e(version)}</p></section>`;
    const connections=()=>{
        const access=window.renderAiAccessButton?.()||'',legacy=window.renderAiInboxButton?.()||'';
        return `<section class="settings-section" aria-labelledby="settings-ai-title"><h3 id="settings-ai-title">Conexão com a IA</h3>${access?`<p>Escolha os dados que a IA pode consultar e quais propostas pode enviar. A autorização dura até 30 dias e pode ser revogada antes.</p><div class="settings-actions">${access}<a href="https://missao-tatica-conexao.victorduarteferreira.chatgpt.site" target="_blank" rel="noopener noreferrer">Abrir conexão privada</a></div><p>Confira a prévia antes de autorizar ou mudar permissões. Reative a conexão privada quando a autorização mudar, vencer ou for revogada.</p><p>Revise as propostas pelo botão IA no topo do aplicativo.</p>${legacy?`<details class="settings-legacy"><summary>Compartilhamento manual da semana</summary><p>Fluxo anterior, opcional. As novas propostas usam o acesso autorizado acima.</p><div class="settings-actions">${legacy}</div></details>`:''}`:'<p>A integração com a IA está disponível somente na conta autorizada.</p>'}</section>${renderCalendar()}`;
    };
    const backups=()=>`<section class="settings-section" aria-labelledby="settings-backups-title"><h3 id="settings-backups-title">Cópias de segurança</h3><p>Exporte uma cópia completa dos dados desta conta. Ao restaurar um backup, os dados atuais serão substituídos após sua confirmação.</p><div class="settings-actions"><button id="settings-export-backup" type="button" onclick="window.runSettingsAction('export')">Exportar backup</button><button id="settings-import-backup" type="button" onclick="window.runSettingsAction('import')">Restaurar backup</button></div>${window.renderLocalConflictBackupButton?.()||''}</section><section class="settings-section settings-maintenance" aria-labelledby="settings-maintenance-title"><h3 id="settings-maintenance-title">Limpeza e reinício</h3><p>Use para apagar áreas selecionadas ou recomeçar. Nada é apagado ao abrir: você escolhe as áreas, revisa o impacto e confirma depois.</p><div class="settings-actions"><button id="open-data-manager" type="button" onclick="window.runSettingsAction('cleanup')">Gerenciar dados</button></div></section>`;
    window.renderSettingsWorkspace=()=>{
        const v=current();if(!v?.open){renderedTab=null;return '';}
        renderedTab=v.tab;
        return `<div class="settings-overlay"><section id="settings-dialog" data-work-tab="${v.tab}" role="dialog" aria-modal="true" aria-labelledby="settings-title"><header class="settings-header"><div><h2 id="settings-title">Configurações</h2><p>Conta, conexões e cópias de segurança.</p></div><button id="settings-close" type="button" onclick="window.closeSettingsWorkspace()" aria-label="Fechar Configurações"><i data-lucide="x" aria-hidden="true"></i></button></header><nav class="settings-tabs" aria-label="Áreas de Configurações">${tabs.map(([key,label])=>`<button id="settings-tab-${key}" type="button" aria-pressed="${v.tab===key}" onclick="window.setSettingsTab('${key}')">${label}</button>`).join('')}</nav><div id="settings-dialog-scroll" class="settings-body">${v.tab==='account'?account():v.tab==='connections'?connections():backups()}</div></section></div>`;
    };
    window.bindSettingsWorkspace=root=>{
        if(!current()?.open)return;
        window.bindFormDialog(root,{id:'settings-dialog',initialFocus:'settings-close',close:window.closeSettingsWorkspace});
    };
}
