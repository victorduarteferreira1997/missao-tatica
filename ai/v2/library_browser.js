import {createV2BrowserRequest} from './browser.js';
import {v2Assert,v2Exact} from './contract.js';
import {libraryImportRow,libraryImportFields} from './library_import.js';
export function createLibraryImportStore(options){
 const call=createV2BrowserRequest(options);
 const part=async(path,body,row)=>{const reply=await call('/v2/app/library-imports/'+path,'POST',body);v2Exact(reply,['schemaVersion','part']);v2Assert(reply.schemaVersion===1);libraryImportRow(reply.part);v2Assert(reply.part.id===body.id&&reply.part.grantId===row.grantId&&reply.part.grantVersion===row.grantVersion);return reply.part;};
 return {async list({status='pending',cursor}={}){const reply=await call('/v2/app/library-imports?'+new URLSearchParams({status,...(cursor?{cursor}:{})}));v2Exact(reply,['schemaVersion','items','nextCursor']);v2Assert(reply.schemaVersion===1&&Array.isArray(reply.items)&&reply.items.length<=5&&(reply.nextCursor===null||typeof reply.nextCursor==='string'&&reply.nextCursor.length<=4096));reply.items.forEach(libraryImportRow);return reply;},
 reserve:async(row,fields,selection)=>{const result=await part('reserve',{id:row.id,expectedVersion:row.version,fields,selection},row);v2Assert(['applying','accepted'].includes(result.status)&&JSON.stringify(result.fields)===JSON.stringify(libraryImportFields(fields))&&JSON.stringify(result.selection?.slice().sort())===JSON.stringify(selection.slice().sort()));return result;},acknowledge:async(row,receiptRef)=>{const result=await part('acknowledge',{id:row.id,receiptRef},row);v2Assert(result.status==='accepted'&&result.receiptRef===receiptRef);return result;},reject:async row=>{const result=await part('reject',{id:row.id,expectedVersion:row.version},row);v2Assert(result.status==='rejected');return result;}};
}
