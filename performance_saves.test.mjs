import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountStorage,accountStateKey} from './account_storage.v3.js';
import {createConfirmedStateWriter} from './ai/v2/saved_state.v2.js';
import {boot} from './test-support/app_boot.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('cópia local retorna os mesmos bytes persistidos sem perder metadados ou permitir outra aba',()=>{
 const map=new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)},store=createAccountStorage(storage,'owner');store.load('owner');const state={ownerUid:'owner',tasks:[{id:1,subtasks:[{completed:true}]}],future:{preserve:true}};const payload=store.save('owner',state);assert.equal(payload,map.get(accountStateKey('owner')));assert.deepEqual(JSON.parse(payload),state);state.tasks=[];assert.equal(JSON.parse(payload).tasks.length,1);map.set(accountStateKey('owner'),'changed elsewhere');assert.throws(()=>store.save('owner',state),/Outra aba/);assert.throws(()=>store.save('other',state),/outra conta/);
});
test('fila reutiliza bytes imutáveis, preserva ordem e não sobrepõe gravação explícita ou transação IA',async()=>{
 const user={uid:'x'},events=[],w=createConfirmedStateWriter({getUser:()=>user,writeAccount:async()=>events.push('account'),writeSnapshot:async(_,payload)=>events.push(JSON.parse(payload).id)});await Promise.all([w.serialized(user,'{"id":1}'),w.exclusive(async()=>events.push('ai')),w.serialized(user,'{"id":2}')]);assert.deepEqual(events,['account',1,'ai',2]);
});
test('gravações de fundo aguardando são compactadas sem atravessar uma gravação explícita',async()=>{
 const user={uid:'x'},writes=[];let release;const w=createConfirmedStateWriter({getUser:()=>user,writeAccount:async()=>{},writeSnapshot:async(_,payload)=>{writes.push(payload);if(writes.length===1)await new Promise(r=>release=r);}});const first=w.serialized(user,'first');await tick();const second=w.serialized(user,'second','',{background:true}),third=w.serialized(user,'third','',{background:true});assert.equal(second,third);const explicit=w.serialized(user,'explicit'),last=w.serialized(user,'last','',{background:true});release();await Promise.all([first,second,third,explicit,last]);assert.deepEqual(writes,['first','third','explicit','last']);
});
test('troca de sessão cancela snapshot pendente e nenhuma confirmação é mostrada antes da nuvem',async()=>{
 let user={uid:'x'},release;const firstUser=user,status=[],writes=[];const w=createConfirmedStateWriter({getUser:()=>user,writeAccount:async()=>{},writeSnapshot:async(_,payload)=>{writes.push(payload);await new Promise(r=>release=r);},onStatus:s=>status.push(s)});const first=w.serialized(user,'{"id":1}');await tick();const pending=w.serialized(user,'{"id":2}');assert.ok(!status.includes('Salvo na nuvem'));user={uid:'y'};w.reset();release();assert.equal(await first,false);assert.equal(await pending,false);assert.deepEqual(writes,['{"id":1}']);assert.equal(await w.serialized(firstUser,'{}'),false);assert.ok(!status.includes('Salvo na nuvem'));
});
test('erro de transporte mantém retorno falso e status de erro',async()=>{
 const user={uid:'x'},status=[];const w=createConfirmedStateWriter({getUser:()=>user,writeAccount:async()=>{},writeSnapshot:async()=>{throw Error('offline');},onStatus:s=>status.push(s)});assert.equal(await w.serialized(user,'{}'),false);assert.equal(status.at(-1),'Erro ao salvar');
});
test('gravação de fundo usa o snapshot local original, mesmo com novas mudanças antes do envio',async()=>{
 const b=boot(),writes=[];b.c.setDoc=async(path,data)=>{writes.push({path,data});};b.window.saveState(true,'snapshot-first');const cloudJob=[...b.timers.values()].at(-1),raw=b.stored.get(accountStateKey(b.state.ownerUid));b.state.tasks.push({id:'later',text:'Ainda não enviada'});await cloudJob();const saved=writes.find(row=>row.path.endsWith('/state/main'));assert.ok(saved);assert.equal(saved.data.data,raw);assert.ok(!JSON.parse(saved.data.data).tasks.some(t=>t.id==='later'));
});
test('aceitar confirmação cujo callback já redesenhou a tela não faz um segundo redesenho',()=>{
 const b=boot();b.window.showConfirmModal('Teste',()=>b.window.setHealthTab('treinos'));const before=b.window.transientFullRevision();b.window.handleConfirmResult(true);assert.equal(b.window.transientFullRevision()-before,1);
});
