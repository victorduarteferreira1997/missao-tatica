import {weekDate,shortDate} from '../radar_missions.v1.js';
const days=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const names=['Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado','Domingo'];
export function proposalDestination(kind){return kind?.startsWith('radar.')?'RADAR':kind==='study.plan.create'?'Inteligência/Estudos':'Missões';}
export function missionDateLabel(fields){const index=days.indexOf(fields.day),date=index<0?'':weekDate(fields.weekStart,index);return date?{date,title:names[index]+', '+shortDate(date),week:'Semana de '+shortDate(fields.weekStart)+' a '+shortDate(weekDate(fields.weekStart,6))}:null;}
export function renderProposalDestination(kind){return `<span class="inline-flex rounded-lg border border-cyan-700 bg-cyan-950 px-3 py-1.5 text-sm font-semibold text-cyan-100">Destino: ${proposalDestination(kind)}</span>`;}
export function renderMissionDate(fields){const label=missionDateLabel(fields);return label?`<div class="rounded-lg bg-slate-800 p-3"><p class="text-base font-semibold text-white">${label.title}</p><p class="mt-1 text-sm text-slate-300">${label.week}</p></div>`:'<p class="text-sm text-amber-200">Escolha a semana de planejamento e o dia para ver a data da missão.</p>';}
