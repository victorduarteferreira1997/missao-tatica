import {validDate,shortDate,weekDate} from './radar_missions.v1.js';
const severityRank={critical:0,attention:1,upcoming:2,info:3};
export function deadlineHorizon(value=2){const n=parseInt(value,10);return Number.isFinite(n)?Math.max(0,Math.min(30,n)):2;}
const distance=(from,to)=>validDate(from)&&validDate(to)?Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000):null;
const dateKinds=[['dueDate','due','Prazo'],['followUpAt','followup','Follow-up'],['nextReviewAt','review','Revisão']];
function dateSignal(key,kind,label,date,reference,horizon){
 const diff=distance(reference,date);if(diff===null || (diff>0 && (kind!=='due'||diff>horizon)))return null;
 const phase=diff<0?'overdue':diff===0?'today':'upcoming';
 const timing=diff<0?`atrasado há ${Math.abs(diff)} dia${diff===-1?'':'s'}`:diff===0?'neste dia':`se aproximando · em ${diff} dia${diff===1?'':'s'}`;
 return {kind,key,dateKey:date,phase,severity:kind==='due'&&diff<=0||kind==='followup'&&diff<0?'critical':'attention',label:`${label} ${timing} · ${shortDate(date)}`};
}
// Pure read-only projection. Empty optional dates never create signals.
export function operationalSignals(control,reference,horizon=control?.config?.dueSoonDays){
 if(!validDate(reference))return [];
 const rows=[];
 for(const demand of control?.demands||[]){
  if(demand.workflowStatus==='closed')continue;
  const signals=[];
  if(demand.attentionLevel==='immediate')signals.push({kind:'manual-immediate',phase:'manual',severity:'critical',label:'Marcada como ação imediata',dateKey:''});
  else if(demand.attentionLevel==='attention')signals.push({kind:'manual-attention',phase:'manual',severity:'attention',label:'Marcada para atenção',dateKey:''});
  if(demand.workflowStatus==='active'&&!String(demand.nextAction||'').trim())signals.push({kind:'missing-next-action',phase:'missing',severity:'attention',label:'Sem próxima ação definida',dateKey:''});
  if(demand.workflowStatus==='waiting'&&!String(demand.waitingFor||'').trim())signals.push({kind:'missing-waiting-for',phase:'missing',severity:'attention',label:'Aguardando terceiro sem responsável informado',dateKey:''});
  for(const [key,kind,label] of dateKinds){const signal=dateSignal(key,kind,label,demand[key],reference,deadlineHorizon(horizon));if(signal)signals.push(signal);}
  signals.sort((a,b)=>severityRank[a.severity]-severityRank[b.severity]||String(a.dateKey||'9999').localeCompare(String(b.dateKey||'9999')));
  if(signals.length)rows.push({demand,signals,severityRank:Math.min(...signals.map(s=>severityRank[s.severity])),nextRelevantDate:signals.map(s=>s.dateKey).filter(Boolean).sort()[0]||'9999-12-31'});
 }
 return rows.sort((a,b)=>a.severityRank-b.severityRank||a.nextRelevantDate.localeCompare(b.nextRelevantDate)||String(a.demand.title||'').localeCompare(String(b.demand.title||''),'pt-BR'));
}
export function weeklyAttentionReasons(demand,week,today,horizon=2){
 const end=weekDate(week,6);if(!end||demand.workflowStatus==='closed')return [];
 const current=validDate(today)&&week<=today&&today<=end;
 const reasons=[];
 for(const [key,kind,label] of dateKinds){
  const date=demand[key];if(!validDate(date))continue;
  const scheduled=week<=date&&date<=end;
  const signal=current?dateSignal(key,kind,label,date,today,deadlineHorizon(horizon)):null;
  if(scheduled || signal)reasons.push(signal?{...signal,date,label:signal.label}:{key,kind,date,dateKey:date,phase:'scheduled',label:`${label} em ${shortDate(date)}`});
 }
 if(current&&demand.attentionLevel==='immediate')reasons.push({key:'immediate',kind:'manual-immediate',date:today,dateKey:today,phase:'manual',label:'Atenção imediata pendente'});
 return reasons;
}
