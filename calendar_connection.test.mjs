import test from 'node:test';
import assert from 'node:assert/strict';
import {createCalendarSync} from './calendar_sync.v3.js';

function setup(t, {enabled=true}={}) {
    const previous={window:globalThis.window,fetch:globalThis.fetch};
    t.after(()=>Object.assign(globalThis,previous));
    const state={currentPlanningWeekStart:'2026-11-23',tasks:[],calendarSync:{enabled,calendarId:'fictional-calendar'}};
    const user={uid:'owner',email:'owner@example.test'},oauth=[],requests=[],saved=[];
    globalThis.window={google:{accounts:{oauth2:{initTokenClient:options=>{
        oauth.push(options);return {requestAccessToken(){}};
    }}}}};
    globalThis.fetch=async(url,options={})=>{
        requests.push({url,method:options.method||'GET'});
        return {ok:true,status:200,json:async()=>url.includes('userinfo')?{email:user.email}:url.includes('/events')?{items:[]}:{id:'fictional-calendar',summary:'Missão Tática'}};
    };
    const options={clientId:'fictional',enableInbound:true,getState:()=>state,getUser:()=>user,saveState:()=>saved.push(JSON.stringify(state))};
    const sync=createCalendarSync(options);sync.setOwner(user);
    return {sync,state,user,oauth,requests,saved,options};
}
const approved={access_token:'synthetic-token',expires_in:3600};

test('pending Google consent is busy, cannot open a second popup and writes nothing before approval',async t=>{
    const b=setup(t,{enabled:false}),before=JSON.stringify(b.state),pending=b.sync.connect();
    assert.equal(b.sync.view().status,'Aguardando autorização do Google');
    assert.equal(b.sync.view().busy,true);assert.equal(b.sync.view().connected,false);
    assert.match(b.sync.view().notice,/mesma aba/);
    await b.sync.connect();b.sync.pause();b.sync.schedule();
    assert.equal(b.oauth.length,1);assert.equal(b.saved.length,0);assert.equal(b.requests.length,0);
    assert.equal(JSON.stringify(b.state),before);
    b.oauth[0].callback(approved);await pending;
    assert.equal(b.sync.view().busy,false);assert.equal(b.sync.view().connected,true);
    assert.equal(b.sync.view().status,'Sincronizado');assert.ok(b.sync.view().lastSyncedAt);
});

test('closed popup exposes the failure instead of generic Reconnect and permits a new attempt',async t=>{
    const b=setup(t),pending=b.sync.connect();
    b.oauth[0].error_callback({type:'popup_closed'});await pending;
    assert.equal(b.sync.view().status,'Falha na conexão');assert.equal(b.sync.view().busy,false);
    assert.match(b.sync.view().error,/fechada antes da conclusão/);assert.equal(b.requests.length,0);
    const retry=b.sync.connect();assert.equal(b.oauth.length,2);
    b.oauth[1].callback(approved);await retry;assert.equal(b.sync.view().status,'Sincronizado');
});

test('popup failure and denied consent stay distinct without exposing raw provider details',async t=>{
    const b=setup(t);let pending=b.sync.connect();
    b.oauth[0].error_callback({type:'popup_failed_to_open'});await pending;
    assert.match(b.sync.view().error,/Permita pop-ups/);
    pending=b.sync.connect();b.oauth[1].callback({error:'access_denied',error_description:'private-provider-detail'});await pending;
    assert.match(b.sync.view().error,/não foi concedida/);assert.doesNotMatch(b.sync.view().error,/private-provider-detail/);
    assert.equal(b.saved.length,0);assert.equal(b.requests.length,0);
});

test('incomplete or expired token responses never reach Google APIs or enable the integration',async t=>{
    const b=setup(t,{enabled:false});
    for(const response of [undefined,{expires_in:3600},{access_token:'synthetic',expires_in:0},{access_token:'synthetic',expires_in:'invalid'},{access_token:'synthetic',expires_in:Infinity}]) {
        const pending=b.sync.connect();b.oauth.at(-1).callback(response);await pending;
        assert.equal(b.sync.view().connected,false);assert.equal(b.sync.view().busy,false);
        assert.match(b.sync.view().error,/inválida ou expirada/);
    }
    assert.equal(b.saved.length,0);assert.equal(b.requests.length,0);assert.equal(b.state.calendarSync.enabled,false);
});

test('missing provider callback times out and late approval cannot install its token',async t=>{
    t.mock.timers.enable({apis:['setTimeout']});
    const b=setup(t),pending=b.sync.connect(),old=b.oauth[0];
    t.mock.timers.tick(300000);await pending;
    assert.equal(b.sync.view().busy,false);assert.match(b.sync.view().error,/5 minutos/);
    old.callback(approved);await Promise.resolve();
    assert.equal(b.sync.view().connected,false);assert.equal(b.requests.length,0);assert.equal(b.saved.length,0);
    const retry=b.sync.connect();b.oauth[1].callback(approved);await retry;
    assert.equal(b.sync.view().status,'Sincronizado');
});

test('identity check remains busy and rejects a different account before reading or writing calendars',async t=>{
    const b=setup(t);let release;
    globalThis.fetch=url=>{b.requests.push({url});return new Promise(resolve=>release=resolve);};
    const pending=b.sync.connect();b.oauth[0].callback(approved);await Promise.resolve();
    assert.equal(b.sync.view().status,'Conferindo conta Google');assert.equal(b.sync.view().busy,true);
    await b.sync.connect();assert.equal(b.oauth.length,1);
    release({ok:true,json:async()=>({email:'different@example.test'})});await pending;
    assert.match(b.sync.view().error,/mesma conta Google/);assert.equal(b.sync.view().connected,false);
    assert.equal(b.saved.length,0);assert.equal(b.requests.length,1);assert.match(b.requests[0].url,/userinfo/);
});

test('a new page does not inherit the other page token or claim its synchronization succeeded',async t=>{
    const b=setup(t),pending=b.sync.connect();b.oauth[0].callback(approved);await pending;
    const other=createCalendarSync(b.options);other.setOwner(b.user);
    assert.equal(b.sync.view().status,'Sincronizado');assert.equal(other.view().connected,false);
    assert.equal(other.view().lastSyncedAt,'');assert.match(other.view().notice,/somente nesta aba/);
    assert.doesNotMatch(JSON.stringify(b.state),/synthetic-token/);
});
