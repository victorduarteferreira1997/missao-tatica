import test from 'node:test';
import assert from 'node:assert/strict';
import {createCalendarSync} from './calendar_sync.v3.js';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {resolve,promise};};
const tick=()=>new Promise(r=>setImmediate(r));
function setup(){
 let state={currentPlanningWeekStart:'2026-10-05',tasks:[],calendarSync:{enabled:true,calendarId:'old-calendar'}},user={uid:'owner',email:'owner@example.test'},oauth;
 const saved=[],requests=[];
 globalThis.window={google:{accounts:{oauth2:{initTokenClient:options=>{oauth=options;return {requestAccessToken(){}};}}}}};
 globalThis.fetch=async(url,options={})=>{
  requests.push({url,token:options.headers?.Authorization,body:options.body});
  return {ok:true,status:200,json:async()=>url.includes('userinfo')?{email:user.email}:url.includes('/events')?{items:[]}:{id:'calendar',summary:'Missão Tática'}};
 };
 const sync=createCalendarSync({clientId:'fictional',enableInbound:true,getState:()=>state,getUser:()=>user,saveState:()=>saved.push({uid:user.uid,state:JSON.stringify(state)})});sync.setOwner(user);
 return {sync,saved,requests,getState:()=>state,getOauth:()=>oauth,switchAccount(uid='sara'){user={uid,email:uid+'@example.test'};state={currentPlanningWeekStart:'2026-10-05',tasks:[],calendarSync:{enabled:true,calendarId:uid+'-calendar'}};sync.setOwner(user);}};
}
test('late OAuth callback after switch cannot install old token or touch the next calendar',async()=>{
 const b=setup(),connecting=b.sync.connect(),old=b.getOauth();b.switchAccount();old.callback({access_token:'synthetic-old-token',expires_in:3600});await connecting;
 assert.equal(b.sync.view().connected,false);assert.equal(b.sync.view().calendarId,'sara-calendar');assert.equal(b.saved.length,0);assert.equal(b.requests.length,0);
});
test('switch while primary calendar response is pending discards events and subsequent requests',async()=>{
 const b=setup(),wait=deferred(),base=globalThis.fetch;let waiting=false;
 globalThis.fetch=async(url,options)=>{if(url.includes('/primary/events?')){waiting=true;return wait.promise;}return base(url,options);};
 const connecting=b.sync.connect();b.getOauth().callback({access_token:'synthetic-owner',expires_in:3600});await tick();assert.equal(waiting,true);
 b.switchAccount();const count=b.requests.length;
 wait.resolve({ok:true,status:200,json:async()=>({items:[{id:'private',summary:'Old owner event',start:{dateTime:'2026-10-06T12:00:00Z'},end:{dateTime:'2026-10-06T13:00:00Z'}}]})});await connecting;
 assert.equal(b.getState().calendarInboxItems,undefined);assert.equal(b.sync.view().connected,false);assert.equal(b.requests.length,count);assert.equal(b.getState().calendarSync.calendarId,'sara-calendar');
});
test('same UID logout/login invalidates pending Google identity response',async()=>{
 const b=setup(),wait=deferred(),base=globalThis.fetch;
 globalThis.fetch=async(url,options)=>url.includes('userinfo')?wait.promise:base(url,options);
 const connecting=b.sync.connect();b.getOauth().callback({access_token:'old',expires_in:3600});await tick();b.sync.setOwner(null);b.switchAccount('owner');wait.resolve({ok:true,json:async()=>({email:'owner@example.test'})});await connecting;
 assert.equal(b.sync.view().connected,false);assert.equal(b.saved.length,0);
});
test('each account connects independently and API requests always use its own verified token',async()=>{
 const b=setup();let connecting=b.sync.connect();b.getOauth().callback({access_token:'owner-token',expires_in:3600});await connecting;
 assert.equal(b.sync.view().connected,true);b.switchAccount();const previous=b.requests.length;connecting=b.sync.connect();b.getOauth().callback({access_token:'sara-token',expires_in:3600});await connecting;
 assert.equal(b.sync.view().connected,true);assert.ok(b.requests.slice(previous).every(r=>r.token==='Bearer sara-token'));assert.equal(b.sync.view().calendarId,'sara-calendar');
});
