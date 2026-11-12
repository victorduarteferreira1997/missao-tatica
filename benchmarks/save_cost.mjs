// CPU/local-copy benchmark with synthetic data. No network or personal records.
// Optional argument selects a baseline checkout with test-support/app_boot.mjs.
import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const repo=resolve(process.argv[2]||new URL('..',import.meta.url).pathname);
const {boot}=await import(pathToFileURL(resolve(repo,'test-support/app_boot.mjs')));
const median=values=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)];
const results=[];
for(const size of [100,500,1500]){
 const b=boot();b.state.tasks=Array.from({length:size},(_,i)=>({id:'synthetic-'+i,text:'Missão fictícia '+i,day:['monday','tuesday','wednesday','thursday','friday'][i%5],category:'work',time:'30 min',xp:80,energyCost:20,completed:i%4===0,planningWeekStart:'2026-10-05',subtasks:Array.from({length:4},(_,j)=>({id:'s-'+j,text:'Etapa '+j,completed:j<2}))}));
 for(let i=0;i<5;i++)b.window.saveState(true,'synthetic-benchmark');
 const samples=[];for(let i=0;i<21;i++){const start=performance.now();b.window.saveState(true,'synthetic-benchmark');samples.push(performance.now()-start);}
 const originalStringify=JSON.stringify,originalParse=JSON.parse;let stringifies=0,parses=0;
 b.c.JSON=JSON;
 try{JSON.stringify=function(...args){stringifies++;return originalStringify.apply(this,args);};JSON.parse=function(...args){parses++;return originalParse.apply(this,args);};b.window.saveState(true,'synthetic-benchmark');}
 finally{JSON.stringify=originalStringify;JSON.parse=originalParse;}
 results.push({tasks:size,bytes:JSON.stringify(b.state).length,medianLocalSaveMs:Number(median(samples).toFixed(3)),stringifiesBeforeReturn:stringifies,parsesBeforeReturn:parses});
}
console.log(JSON.stringify({runtime:process.version,scope:'synchronous local save; no DOM, network or background receipt',results},null,2));
