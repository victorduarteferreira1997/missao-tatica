# Repetição de missões com término — v1.9.66

## Uso

Em **Nova missão → Repetição**, selecione os dias e escolha **Sem data final**
ou **Até uma data**. A data é inclusiva: uma série de segunda, quarta e sexta
até 10/11/2026 tem sua última ocorrência elegível em 09/11. Não gera quarta 11/11.
Também funciona com um único dia da semana.

Na edição, a interface informa a data a partir da qual a alteração vale.
Ocorrências anteriores, concluídas, pausadas, em andamento ou com subtarefas
concluídas são preservadas. A primeira entrega não oferece exceções individuais.
Para alterar os dias, use a edição da repetição, em vez do atalho de mover dia.

**Encerrar repetição…** pede confirmação e mantém o editor aberto. Preserva hoje,
o passado e qualquer trabalho iniciado. Cancela as ocorrências futuras ainda não
iniciadas e impede novas gerações. Não conclui missões nem altera XP, moedas,
combo ou RADAR. Para iniciar outra série depois do encerramento manual, cadastre
outra missão. A lista recolhida no editor permite consultar cancelamentos
preservados da série. Pendências anteriores permanecem como registros, sujeitas
à retenção de histórico já existente (12 semanas/320 KB).

## Modelo e compatibilidade

- Regra aditiva por grupo em `planning.recurrenceRules[groupId]`: dias, início,
  início de vigência da edição, data final opcional e modelo para novas ocorrências.
- Encerramento explícito guarda `stoppedAfter` e `stoppedAt` na regra.
- `recurrenceCancelled` identifica ocorrências retiradas do planejamento sem
  apagar ID, campos, subtarefas ou vínculos. Datas futuras retiradas de uma agenda
  podem voltar com o mesmo ID quando uma extensão explícita da regra as permite.
  Cancelamentos anteriores e encerramentos manuais não são reativados.
- Sem migração em massa. Séries antigas continuam sem data final e recebem uma
  regra ao serem editadas/encerradas. Nenhuma série existente é apagada ou reiniciada.
- O carregamento não escolhe uma ocorrência irmã para sobrescrever os dados das
  séries controladas. Não remove silenciosamente registros duplicados antigos.
- A passagem de semana aplica a regra antes de gerar ocorrências, renova IDs e
  zera apenas a conclusão das novas subtarefas. Mantém os IDs/recompensas no histórico
  e remapeia pré-requisitos entre ocorrências de semanas sucessivas.
- A limpeza explícita de missões também remove as regras. Excluir registros de
  campanha retira regras órfãs. Remover RADAR/categoria atualiza o modelo da série,
  evitando vínculos/categorias antigos nas próximas gerações.

Não há alteração de regras Firestore, perfil, contas, concessões de IA, Worker/D1,
planos de estudo, Finanças ou Corpo. O backup JSON da conta inclui as novas regras.

## Agenda e demais módulos

O RADAR acompanha o assunto e permanece independente da repetição da ação.
Pré-requisitos cancelados continuam bloqueando dependentes, até revisão explícita
do usuário. O encerramento informa a existência de dependentes.

O envio ao Google mantém IDs de eventos estáveis. Ocorrências retiradas não são
exportadas e suas cópias conhecidas em outras semanas são removidas apenas da
agenda gerenciada pelo app, com conferência de proprietário, tipo e ID exato.
Alterações de título/horário em outras semanas seguem a sincronização da semana
selecionada. Eventos recebidos da agenda principal continuam gerenciados no Google.

A exportação `.ics` permanece um retrato da semana selecionada. Séries com regra
nova usam eventos individuais, preservando diferenças entre ocorrências sem criar
uma repetição infinita. Um arquivo já importado no Google não recebe atualizações
automáticas. Propostas da IA mantêm seu contrato atual de cadastro de missões únicas.

## Arquivos e validação

- `recurrence.v1.js`: regras e reconciliação sem rede.
- `ui/recurrence.v1.js`: data final, explicações, confirmação e resumo da série.
- `ui/task_forms.v5.js`, `ui/planning_views.v5.js`, `ui/planning_tools.v3.js`:
  formulários e visões atuais. As versões anteriores permanecem disponíveis.
- `app.html`, `planning.v1.js`, `calendar_sync.v2.js`: integração com cadastro,
  edição, limpeza, histórico, passagem de semana e Google Agenda.
- `recurrence.test.mjs`: 20 regressões de datas, semanas, preservação, dependências,
  encerramento, recarga, limpeza, categorias e RADAR.
- `calendar_sync.test.mjs`: retirada de evento em outra semana e proteção de eventos
  de outro proprietário.
- `test-support/browser_recurrence.mjs`: formulários reais em Chromium desktop e
  celular (390 px, toque), validação de data, rascunho, confirmação/cancelamento,
  editor aberto, reload, fechamento de semana e conta membro independente.
- Suíte geral: **342 testes aprovados**. Navegador: contas/IA, RADAR/subtarefas e
  recorrência aprovados. Os serviços externos foram simulados, sem dados reais.

Comandos:

```sh
npm test
npm run test:browser --prefix security-tests
npm run test:browser:radar --prefix security-tests
npm run test:browser:recurrence --prefix security-tests
```

Para a inspeção visual, os runners aceitam `MISSAO_QA_CSS_PATH` com CSS Tailwind
compilado. Nenhum teste automatizado usa a conta Google ou o banco real. Dispositivos
físicos, Safari e Firefox não foram validados nesta entrega.
