import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
const app=await readFile(new URL('./app.html',import.meta.url),'utf8');
const section=(start,end)=>{const a=app.indexOf(start),b=app.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,start);return app.slice(a,b);};
const plain=value=>JSON.parse(JSON.stringify(value));
class FixedDate extends Date{constructor(...args){super(...(args.length?args:['2026-10-06T22:00:00Z']));}static now(){return Date.parse('2026-10-06T22:00:00Z');}}
function engine(financeData={}){
 const c={APP_VERSION:app.match(/const APP_VERSION = '([^']+)'/)[1],state:{financeData,xp:333,coins:77,profile:{name:'NÃO EXPORTAR PERFIL'},tasks:[{text:'NÃO EXPORTAR MISSÃO'}]},uiState:{financePeriod:'current'},Date:FixedDate,TextEncoder,Uint32Array,Uint8Array,DataView,Blob,
  setTimeout(callback,delay){c.cleanup=callback;c.delay=delay;},URL:{createObjectURL(blob){c.blob=blob;return'blob:finance-test';},revokeObjectURL(url){c.revoked=url;}},
  document:{body:{appendChild(link){c.appended=link;}},createElement(){return{click(){c.clicked=true;},remove(){c.removed=true;}};}},
  window:{showToast(title,message){c.toast=[title,message];},showAlertModal(message){c.alert=message;}}};
 runInNewContext([section('window.getLocalDateKey =','window.spawnFloatingText ='),section('window.getFinanceSum =','window.getFinancePeriodKey =')].join('\n'),c);return c;
}
const sample=()=>({
 incomes:[{id:'0000042',date:'2026-10-01',description:'Receita teste',amount:'500.25',category:'Extra',campaignId:2,metadata:{source:'Cadastro'}},{id:2,date:'2026-09-01',description:'Receita antiga',amount:0.1}],
 fixedExpenses:[{id:'fix-1',description:'Conta teste',amount:100.25,paid:false},{id:3,description:'Conta paga',amount:10,paid:true,createdAt:'2026-10-02T19:00:00Z'}],
 variableExpenses:[{id:'9007199254740993001',date:'2026-10-01T01:00:00Z',description:'Gasto noturno',amount:20.2,category:'Mercado',trigger:'Planejado'},{id:'g2',date:'2026-10-03',description:'=HYPERLINK("https://example.com")',amount:5.1}],
 moneyJournal:[{id:'m1',date:'2026-10-04T15:30:00Z',event:'Compra considerada',action:'Adiou por 24h',mood:'Ansioso',thought:'Quero pensar melhor.\nSegunda linha.',xpAwarded:50,xpCampaign:2}],
 debts:[{id:'d1',description:'Dívida teste',remainingAmount:850.4,status:'Aberta',lender:'Credor teste'}],
 goals:[{id:'goal1',title:'Reserva',targetAmount:1000,currentAmount:25}],categoryBudgets:[{id:'b1',category:'Mercado',amount:150}],
 settings:{currency:'BRL',custom:[1,2]}
});
function readXlsx(bytes){
 const py=spawnSync('python',['-c',`
import sys,base64,io,json,zipfile,openpyxl
raw=base64.b64decode(sys.stdin.read())
z=zipfile.ZipFile(io.BytesIO(raw)); assert z.testzip() is None
w=openpyxl.load_workbook(io.BytesIO(raw))
out={}
for s in w:
 out[s.title]={'rows':list(s.values),'types':[[c.data_type for c in r] for r in s],'formats':[[c.number_format for c in r] for r in s],'freeze':s.freeze_panes,'filter':s.auto_filter.ref}
print(json.dumps(out,ensure_ascii=False))
`],{input:Buffer.from(bytes).toString('base64'),encoding:'utf8',maxBuffer:8*1024*1024});
 assert.equal(py.status,0,py.stderr);assert.ok(!py.stderr.trim(),py.stderr);return JSON.parse(py.stdout);
}
test('exportação inclui sete coleções, campos adicionais e histórico inteiro sem alterar estado',()=>{
 const c=engine(sample()),before=JSON.stringify(c.state),sheets=c.window.buildFinanceExportSheets();assert.equal(JSON.stringify(c.state),before);
 const names=sheets.map(s=>s.name);for(const name of ['Resumo','Por mês','Receitas','Contas fixas','Gastos','Diário','Dívidas','Metas','Orçamentos','Dados adicionais'])assert.ok(names.includes(name));
 assert.equal(sheets.find(s=>s.name==='Receitas').rows.length,3);assert.equal(sheets.find(s=>s.name==='Diário').rows[1][7],50);
 const debts=sheets.find(s=>s.name==='Dívidas');assert.ok(debts.rows[0].includes('lender'));assert.ok(debts.rows[1].includes('Credor teste'));
 const summary=sheets[0].rows;assert.equal(summary.find(r=>r[0]==='Resultado estimado (R$)')[1],364.8);assert.equal(summary.find(r=>r[0]==='Contas fixas pendentes (R$)')[1],100.25);
 assert.match(JSON.stringify(summary),/Não representa saldo bancário/);assert.ok(!JSON.stringify(sheets).includes('NÃO EXPORTAR'));
});
test('XLSX abre com leitor independente, valores numéricos, filtros, cabeçalhos fixos e texto seguro',()=>{
 const c=engine(sample());const data=readXlsx(c.window.buildFinanceXlsx(c.window.buildFinanceExportSheets()));
 assert.equal(data.Receitas.rows[1][1],'0000042');assert.equal(data.Receitas.rows[1][4],500.25);assert.equal(data.Receitas.types[1][4],'n');assert.match(data.Receitas.formats[1][4],/R\$/);
 assert.equal(data.Gastos.rows[1][1],'9007199254740993001');assert.equal(data.Gastos.rows[2][3],'=HYPERLINK("https://example.com")');assert.equal(data.Gastos.types[2][3],'s');
 assert.equal(data['Diário'].rows[1][6],'Quero pensar melhor.\nSegunda linha.');assert.equal(data['Contas fixas'].rows[1][4],'Não');
 assert.equal(data['Por mês'].freeze,'A2');assert.equal(data['Por mês'].filter,'A1:F3');assert.equal(data['Por mês'].rows[1][0],'2026-09');assert.equal(data['Por mês'].rows[1][1],0.1);assert.equal(data['Por mês'].rows[1][2],20.2);
 assert.equal(data.Resumo.rows[3][1],'v1.9.62');assert.equal(data['Dados adicionais'].rows[1][1],'{"currency":"BRL","custom":[1,2]}');
});
test('planilha vazia é válida e não inventa dados, vencimentos ou saldos bancários',()=>{
 const c=engine();const data=readXlsx(c.window.buildFinanceXlsx(c.window.buildFinanceExportSheets()));
 assert.equal(Object.keys(data).length,9);assert.equal(data.Receitas.rows.length,1);assert.equal(data['Contas fixas'].rows.length,1);assert.equal(data.Resumo.rows[7][1],0);
 assert.match(JSON.stringify(data.Resumo.rows),/Ausência de registros não significa ausência de dívidas/);
});
test('datas e valores ausentes/invalidos permanecem nos registros e são explicados',()=>{
 const c=engine({incomes:[{id:1,amount:'inválido',date:null},{id:2,amount:10,date:'2026-02-31'},{id:3,amount:0.2,date:'2026-10-01'}],variableExpenses:[{id:4,amount:-1.1,date:'2026-10-02'}]});
 const sheets=c.window.buildFinanceExportSheets();const summary=sheets[0].rows;
 assert.equal(summary.find(r=>r[0]==='Lançamentos sem data válida')[1],2);assert.equal(summary.find(r=>r[0]==='Lançamentos com valor inválido')[1],1);
 const data=readXlsx(c.window.buildFinanceXlsx(sheets));assert.equal(data.Receitas.rows.length,4);assert.equal(data.Receitas.rows[1][0],'Data não registrada');assert.equal(data.Receitas.rows[1][4],'inválido');
 assert.ok(data['Por mês'].rows.some(r=>r[0]==='Sem data válida'));assert.equal(data.Receitas.rows[2][2],'2026-02-31');
});
test('textos extensos e caracteres XML preservam todas as partes sem fórmulas executáveis',()=>{
 const long='\u{1F4DA}'.repeat(22000)+' & <teste>\nFinal';const c=engine({moneyJournal:[{event:long,thought:'@SUM(A1)\u0000 & < > "'}]});
 const sheets=c.window.buildFinanceExportSheets();const parts=sheets.find(s=>s.name==='Textos longos');assert.ok(parts);assert.equal(parts.rows.slice(1).map(r=>r[4]).join(''),long);
 const data=readXlsx(c.window.buildFinanceXlsx(sheets));assert.equal(data['Textos longos'].rows.slice(1).map(r=>r[4]).join(''),long);assert.ok(data['Diário'].rows[1][3].length<32767);assert.equal(data['Diário'].rows[1][6],'@SUM(A1)\\u0000 & < > "');assert.equal(data['Diário'].types[1][6],'s');
});
test('download usa XLSX real, nome com data local, limpa recursos e preserva dados',async()=>{
 const c=engine(sample()),before=JSON.stringify(c.state);c.window.exportFinanceSpreadsheet();
 assert.equal(JSON.stringify(c.state),before);assert.equal(c.blob.type,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');assert.equal(c.appended.download,'missao_tatica_financas_2026-10-06.xlsx');assert.ok(c.clicked&&c.removed);assert.equal(c.uiState.financeExportBusy,false);assert.equal(c.delay,30000);c.cleanup();assert.equal(c.revoked,'blob:finance-test');
 const data=readXlsx(new Uint8Array(await c.blob.arrayBuffer()));assert.equal(data.Receitas.rows.length,3);assert.match(c.toast[1],/Anexe/);
 assert.match(app,/onclick="window.exportFinanceSpreadsheet\(\)"/);
});
test('falhas liberam a exportação para nova tentativa e cliques ocupados são ignorados',()=>{
 const c=engine(sample());c.uiState.financeExportBusy=true;c.window.exportFinanceSpreadsheet();assert.equal(c.blob,undefined);
 c.uiState.financeExportBusy=false;c.URL.createObjectURL=()=>{throw Error('Falha simulada');};c.window.exportFinanceSpreadsheet();assert.match(c.alert,/Não foi possível exportar/);assert.equal(c.uiState.financeExportBusy,false);assert.equal(c.state.xp,333);
});
