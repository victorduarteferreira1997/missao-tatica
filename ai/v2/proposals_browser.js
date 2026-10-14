import {createV2BrowserRequest} from './browser.js';
import {v2Assert} from './contract.js';
import {v2ProposalRow} from './proposals.js';
export function createV2ProposalsBrowserStore(options){
 const call=createV2BrowserRequest(options);
 const reviewed=async(path,body,row,statuses)=>{const r=await call(path,'POST',body);v2Assert(r.schemaVersion===2);v2ProposalRow(r.proposal);v2Assert(r.proposal.id===body.id&&r.proposal.kind===(row.kind||'mission.create')&&statuses.includes(r.proposal.status)&&r.proposal.applicationId===body.applicationId);return r.proposal;};
 return {reserve:(row,fields)=>reviewed('/v2/app/proposals/reserve',{id:row.id,expectedVersion:row.version,applicationId:row.applicationId||row.id,fields},row,['applying','accepted']),acknowledge:(row,taskRef)=>reviewed('/v2/app/proposals/acknowledge',{id:row.id,applicationId:row.applicationId,taskRef},row,['accepted']),async list({status='pending',cursor}={}){const q=new URLSearchParams({status,pageSize:'25',...(cursor?{cursor}:{})});const r=await call('/v2/app/proposals?'+q);v2Assert(r.schemaVersion===2&&Array.isArray(r.items)&&r.items.length<=25&&(r.nextCursor===null||typeof r.nextCursor==='string'&&r.nextCursor.length<=4096));r.items.forEach(v2ProposalRow);return r;},async reject(row){const r=await call('/v2/app/proposals/reject','POST',{id:row.id,expectedVersion:row.version});v2Assert(r.schemaVersion===2);v2ProposalRow(r.proposal);v2Assert(r.proposal.id===row.id&&r.proposal.status==='rejected');return r.proposal;}};
}
