import {DAYS,validateWeek} from '../ai/contract.v1.js';
const clock=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const minutes=value=>Number(value.slice(0,2))*60+Number(value.slice(3));
const format=value=>String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');

// Update the related visible values while editing, without rebuilding the form.
export function syncMissionTiming(fields,key){
 const changed={};
 if(key==='startTime'&&!fields.startTime){fields.endTime='';changed.endTime='';}
 else if(['startTime','durationMinutes'].includes(key)&&clock(fields.startTime)&&Number.isInteger(fields.durationMinutes)&&fields.durationMinutes>=5&&fields.durationMinutes<=240){
  const end=minutes(fields.startTime)+fields.durationMinutes;
  fields.endTime=end<1440?format(end):'';changed.endTime=fields.endTime;
 }else if(key==='endTime'&&clock(fields.startTime)&&clock(fields.endTime)&&fields.endTime>fields.startTime){
  fields.durationMinutes=minutes(fields.endTime)-minutes(fields.startTime);changed.durationMinutes=fields.durationMinutes;
 }
 return changed;
}
export function reviewMissionFields(value,categories){
 const fields={...value,title:String(value.title??'').trim(),subtasks:Array.isArray(value.subtasks)?value.subtasks.map(s=>String(s).trim()).filter(Boolean):[]};
 if(!fields.title||fields.title.length>200)throw Error('Informe um título com 1 a 200 caracteres.');
 try{validateWeek(fields.weekStart);}catch{throw Error('Na semana, escolha a data da segunda-feira.');}
 if(!DAYS.includes(fields.day))throw Error('Escolha o dia da missão.');
 if(!categories.some(c=>c.id===fields.category))throw Error('Escolha uma categoria válida no app.');
 if(!Number.isInteger(fields.durationMinutes)||fields.durationMinutes<5||fields.durationMinutes>240)throw Error('A duração deve ser um número inteiro entre 5 e 240 minutos.');
 if(fields.subtasks.length>12||fields.subtasks.some(s=>s.length>200))throw Error('Use até 12 subtarefas, com no máximo 200 caracteres em cada uma.');
 if((fields.startTime&&!clock(fields.startTime))||(fields.endTime&&!clock(fields.endTime)))throw Error('Confira os horários de início e fim.');
 if(Boolean(fields.startTime)!==Boolean(fields.endTime))throw Error('Preencha início e fim no mesmo dia, ou apague o início para deixar a missão sem horário.');
 if(fields.startTime){
  if(fields.endTime<=fields.startTime)throw Error('O fim deve ser posterior ao início, no mesmo dia.');
  if(minutes(fields.endTime)-minutes(fields.startTime)!==fields.durationMinutes)throw Error('Confira a duração: ela deve corresponder ao intervalo entre início e fim.');
 }
 return fields;
}
