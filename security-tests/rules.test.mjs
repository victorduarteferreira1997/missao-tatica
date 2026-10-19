import {readFile} from 'node:fs/promises';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,deleteDoc,collection,getDocs,runTransaction} from 'firebase/firestore';
const projectId='demo-missao-tatica-phase1', owner='1LDBfIQ5vQTUtaE5j0k4Sp9w7Rj2', sara='fictional-sara', stranger='fictional-stranger';
let env;
const main=(db,uid)=>doc(db,'users',uid,'state','main');
const row=uid=>({ownerUid:uid,data:JSON.stringify({ownerUid:uid,tasks:[],xp:0}),updatedAt:'2026-10-19T12:00:00Z',revision:1});
before(async()=>{
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8089')throw Error('This test requires the isolated local emulator.');
 env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8089,rules:await readFile(new URL('../firestore.default.proposed.rules',import.meta.url),'utf8')}});
 await env.withSecurityRulesDisabled(async c=>{
  await setDoc(doc(c.firestore(),'appAccess',sara),{enabled:true,role:'member'});
  await setDoc(main(c.firestore(),owner),{data:JSON.stringify({tasks:[{id:'legacy'}]}),updatedAt:'2026-10-01T12:00:00Z'});
  await setDoc(main(c.firestore(),sara),row(sara));
 });
});
after(async()=>env?.cleanup());
for(const uid of [owner,sara]){
 test(`${uid}: own state only, collection enumeration and foreign paths denied`,async()=>{
  const db=env.authenticatedContext(uid).firestore(),other=uid===owner?sara:owner;
  await assertSucceeds(getDoc(main(db,uid)));
  await assertFails(getDoc(main(db,other)));
  await assertFails(setDoc(main(db,other),row(other)));
  await assertFails(deleteDoc(main(db,other)));
  await assertFails(setDoc(doc(db,'users',other),{displayName:'overwrite'}));
  await assertFails(getDocs(collection(db,'users')));
  await assertFails(getDocs(collection(db,'users',uid,'state')));
  await assertFails(setDoc(doc(db,'users',uid,'state','unexpected'),row(uid)));
  await assertFails(setDoc(doc(db,'users',uid,'private','data'),{fake:true}));
 });
 test(`${uid}: profile uses existing format; authorization cannot be escalated`,async()=>{
  const db=env.authenticatedContext(uid).firestore(),profile=doc(db,'users',uid);
  await assertSucceeds(setDoc(profile,{email:'fictional@example.test',displayName:'Fictício',updatedAt:'2026-10-19',app:'missao-tatica'}));
  await assertFails(updateDoc(profile,{role:'admin'}));
  await assertFails(setDoc(doc(db,'appAccess',uid),{enabled:true,role:'member'}));
  await assertFails(setDoc(doc(db,'appAccess',stranger),{enabled:true,role:'member'}));
  await assertFails(getDoc(doc(db,'appAccess',otherUid(uid))));
  await assertFails(deleteDoc(main(db,uid)));
 });
}
function otherUid(uid){return uid===owner?sara:owner;}
test('anonymous and unauthorized cannot read, write, enroll, list or inspect authorization of another account',async()=>{
 for(const db of [env.unauthenticatedContext().firestore(),env.authenticatedContext(stranger).firestore()]){
  await assertFails(getDoc(main(db,owner)));await assertFails(getDoc(main(db,sara)));
  await assertFails(setDoc(main(db,stranger),row(stranger)));
  await assertFails(getDoc(doc(db,'users',owner)));
  await assertFails(setDoc(doc(db,'appAccess',stranger),{enabled:true,role:'member'}));
  await assertFails(getDocs(collection(db,'appAccess')));
 }
 await assertSucceeds(getDoc(doc(env.authenticatedContext(stranger).firestore(),'appAccess',stranger)));
});
test('legacy owner row is readable and lazily upgraded without replacing its tasks',async()=>{
 const db=env.authenticatedContext(owner).firestore(),ref=main(db,owner);
 await assertSucceeds(runTransaction(db,async tx=>{
  const snap=await tx.get(ref);const old=snap.data();
  tx.set(ref,{...old,ownerUid:owner,revision:1});
 }));
 await assertSucceeds(updateDoc(ref,{revision:2,aiApplications:{p:{taskId:9}}}));
 await assertFails(updateDoc(ref,{revision:3,aiApplications:{}}));
 await assertFails(updateDoc(ref,{revision:3,aiApplications:{p:{taskId:10}}}));
});
test('member cannot forge owner, attach AI receipts, skip revision, or change unrelated metadata',async()=>{
 const db=env.authenticatedContext(sara).firestore(),ref=main(db,sara);
 await assertFails(updateDoc(ref,{ownerUid:owner,revision:2}));
 await assertFails(updateDoc(ref,{aiApplications:{stolen:{taskId:1}},revision:2}));
 await assertFails(updateDoc(ref,{data:'changed without revision'}));
 await assertFails(updateDoc(ref,{revision:9}));
 await assertFails(updateDoc(ref,{admin:true,revision:2}));
 await assertSucceeds(updateDoc(ref,{data:JSON.stringify({ownerUid:sara,tasks:[{id:'sara-mission'}]}),revision:2}));
});
test('new authorized account can create only its own state, while revoked accounts lose access',async()=>{
 const uid='fictional-new',disabled='fictional-disabled';
 await env.withSecurityRulesDisabled(async c=>{
  await setDoc(doc(c.firestore(),'appAccess',uid),{enabled:true,role:'member'});
  await setDoc(doc(c.firestore(),'appAccess',disabled),{enabled:false,role:'member'});
 });
 const db=env.authenticatedContext(uid).firestore();
 await assertSucceeds(setDoc(main(db,uid),row(uid)));
 await assertFails(setDoc(main(db,uid),{...row(uid),ownerUid:owner,revision:2}));
 await assertFails(setDoc(main(env.authenticatedContext(disabled).firestore(),disabled),row(disabled)));
 await env.withSecurityRulesDisabled(async c=>updateDoc(doc(c.firestore(),'appAccess',uid),{enabled:false}));
 await assertFails(getDoc(main(db,uid)));await assertFails(updateDoc(main(db,uid),{revision:2}));
});

test("stale revision cannot overwrite another device's committed snapshot",async()=>{
 const db=env.authenticatedContext(sara).firestore(),ref=main(db,sara),old=(await getDoc(ref)).data();
 const attempts=await Promise.allSettled([
  updateDoc(ref,{data:'device-one',revision:old.revision+1}),
  updateDoc(ref,{data:'device-two',revision:old.revision+1})
 ]);
 assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(attempts.filter(r=>r.status==='rejected'&&r.reason.code==='permission-denied').length,1);
});
