import test from 'node:test';import assert from 'node:assert/strict';
import {createCalendarSync,buildWeekEvents} from './calendar_sync.v3.js';
import {applyMissionSchedule} from './mission_schedule.v1.js';
function fixture(){
 const owner={uid:'synthetic-calendar-owner',email:'owner@example.test'},state={currentPlanningWeekStart:'2026-10-19',planning:{legacyWeek:'2026-10-19',history:[]},calendarSync:{calendarId:'calendar-fixture',enabled:true},tasks:[{id:11,text:'Missão fictícia',day:'friday',planningWeekStart:'2026-10-19',time:'30 min'}],studyData:{studyPlan:{weeklyBlocks:[]}}};
 const remote=new Map(),requests=[];let failOld=false;
 globalThis.window={google:{accounts:{oauth2:{initTokenClient:({callback})=>({requestAccessToken:()=>callback({access_token:'synthetic-token',expires_in:3600})})}}}};
 globalThis.fetch=async(url,options={})=>{
  const u=new URL(url),method=options.method||'GET',path=u.pathname;requests.push([method,path,u.search]);const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
  if(path.endsWith('/userinfo'))return response({email:owner.email});
  if(path.endsWith('/calendars/calendar-fixture'))return response({id:'calendar-fixture'});
  if(path.endsWith('/events')&&method==='GET'){const week=u.searchParams.get('privateExtendedProperty')?.split('=')[1];if(failOld&&week==='2026-10-19')throw Error('Synthetic network failure');return response({items:[...remote.values()].filter(e=>e.extendedProperties.private.mtWeek===week)});}
  if(path.endsWith('/events')&&method==='POST'||path.includes('/events/')&&method==='PUT'){const e=JSON.parse(options.body);remote.set(e.id,e);return response(e);}
  if(path.includes('/events/')&&method==='DELETE'){const id=path.split('/').at(-1);assert.equal(remote.has(id),true,'No duplicate DELETE');remote.delete(id);return {ok:true,status:204};}
  throw Error('Unexpected synthetic request: '+method+' '+path);
 };
 const sync=createCalendarSync({clientId:'synthetic-client',getState:()=>state,getUser:()=>owner,saveState:()=>{}});sync.setOwner(owner);
 const move=date=>{const plan=applyMissionSchedule(state,state.tasks[0],date);state.currentPlanningWeekStart=plan.planningWeekStart;};
 return {state,owner,remote,requests,sync,move,setFail:v=>failOld=v};
}
test('agenda substitui data em outra semana e remove só o antigo ID gerenciado',async()=>{
 const f=fixture();try{await f.sync.connect();const old=[...f.remote.keys()][0];f.move('2026-10-26');await f.sync.syncNow({force:true});assert.equal(f.remote.size,1);assert.equal(f.remote.has(old),false);assert.equal([...f.remote.values()][0].start.date,'2026-10-26');assert.deepEqual(f.state.planning.calendarMoves,[]);assert.ok(f.requests.every(([,p])=>!p.includes('/primary/')));}finally{f.sync.pause();}
});
test('sincronizar a origem também limpa a fila sem excluir duas vezes',async()=>{const f=fixture();try{await f.sync.connect();f.move('2026-10-26');f.state.currentPlanningWeekStart='2026-10-19';await f.sync.syncNow({force:true});assert.equal(f.remote.size,0);assert.deepEqual(f.state.planning.calendarMoves,[]);f.state.currentPlanningWeekStart='2026-10-26';await f.sync.syncNow({force:true});assert.equal(f.remote.size,1);}finally{f.sync.pause();}});
test('falha na origem mantém marcador; tentativa posterior remove cópia sem duplicar destino',async()=>{const f=fixture();try{await f.sync.connect();f.move('2026-10-26');f.setFail(true);const log=console.error;console.error=()=>{};try{await f.sync.syncNow({force:true});}finally{console.error=log;}assert.equal(f.remote.size,2);assert.equal(f.state.planning.calendarMoves.length,1);f.setFail(false);await f.sync.syncNow({force:true});assert.equal(f.remote.size,1);assert.deepEqual(f.state.planning.calendarMoves,[]);}finally{f.sync.pause();}});
test('mover de volta antes de sincronizar preserva evento na data final',async()=>{const f=fixture();try{await f.sync.connect();f.move('2026-10-26');f.move('2026-10-23');await f.sync.syncNow({force:true});assert.equal(f.remote.size,1);assert.equal([...f.remote.values()][0].start.date,'2026-10-23');assert.deepEqual(f.state.planning.calendarMoves,[]);}finally{f.sync.pause();}});
test('marcador não apaga evento com outro proprietário nem histórico fechado',async()=>{for(const mode of ['owner','history']){const f=fixture();try{await f.sync.connect();const old=[...f.remote.values()][0];f.move('2026-10-26');if(mode==='owner')old.extendedProperties.private.mtOwner='foreign-owner';else f.state.planning.history=[{week:'2026-10-19',tasks:[{id:11,completed:false}]}];await f.sync.syncNow({force:true});assert.equal(f.remote.has(old.id),true);assert.equal(f.remote.size,2);}finally{f.sync.pause();}}});
test('mudança de dia na mesma semana atualiza o evento sem fila nem duplicação',async()=>{const f=fixture();try{await f.sync.connect();const id=[...f.remote.keys()][0];f.move('2026-10-20');assert.equal(f.state.planning.calendarMoves,undefined);await f.sync.syncNow({force:true});assert.equal(f.remote.size,1);assert.equal(f.remote.get(id).start.date,'2026-10-20');}finally{f.sync.pause();}});
