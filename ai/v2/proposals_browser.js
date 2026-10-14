import {createV2BrowserRequest} from './browser.js';
import {v2Assert} from './contract.js';
import {v2ProposalRow} from './proposals.js';
export function createV2ProposalsBrowserStore(options){
 const call=createV2BrowserRequest(options);
 return {async list({status='pending',cursor}={}){const q=new URLSearchParams({status,pageSize:'25',...(cursor?{cursor}:{})});const r=await call('/v2/app/proposals?'+q);v2Assert(r.schemaVersion===2&&Array.isArray(r.items)&&r.items.length<=25&&(r.nextCursor===null||typeof r.nextCursor==='string'&&r.nextCursor.length<=4096));r.items.forEach(v2ProposalRow);return r;},async reject(row){const r=await call('/v2/app/proposals/reject','POST',{id:row.id,expectedVersion:row.version});v2Assert(r.schemaVersion===2);v2ProposalRow(r.proposal);v2Assert(r.proposal.id===row.id&&r.proposal.status==='rejected');return r.proposal;}};
}
