# Datas de missões — v1.9.73 · 27/10/2026

## Problema e comportamento final

Na v1.9.72, `moveTaskFromSelect` e `saveEditedTask` trocavam `day` e mantinham
`planningWeekStart`. Sexta 23/10, semana de 19/10, passava a segunda 19/10.
`currentPlanningWeekStart` é a semana consultada, não a semana civil de hoje.
O botão Hoje apenas abria a visualização diária. Próxima semana era relativa à
semana consultada. Firebase persistia essa combinação já produzida pelo cliente.

A edição avulsa tem uma data, sem seletor independente de semana. Reagendar… abre
um diálogo com data, Cancelar e Salvar. A rotina calcula a segunda-feira e `day`
por operações de data civil, sem depender do fuso para interpretar YYYY-MM-DD.
Uma segunda de outra semana é uma mudança válida; selecionar a data atual da missão
é uma operação vazia. Hoje tem navegação própria, mantendo `setMainView('day')`
para abrir um dia escolhido na semana. A data aparece no cabeçalho diário; apenas
quando há pendências anteriores aparece uma contagem que abre a revisão existente.

## Preservação e limites

- Mesmo ID e objeto da missão avulsa; array e conclusões das subtarefas preservados.
- Status, horários, duração, RADAR, dependências, comprovantes IA e campos extras
  preservados no reagendamento. A edição continua permitindo alterar seus campos.
- Reordenação limitada ao destino, sem reindexar outra semana aberta na tela.
- Concluídas conservam sua data. Semanas fechadas são recusadas na origem/destino.
- Séries conservam sua edição própria; nenhuma exceção avulsa é criada. Eventos da
  agenda principal continuam gerenciados pelo Google. Foco ativo/sincronização impedem
  mudança de data que conflite com a operação em andamento.
- Gamificação existente: atalho de reagendar mantém +10 HP, estatística de movimento
  e badge; não penaliza Frenesi. Editar não recebe esse benefício. Destino idêntico,
  clique duplo e repetição de salvamento falho não repetem os benefícios.
- Navegação não transfere pendências automaticamente. Preparar próxima semana mantém
  IDs das pendências, histórico, recorrências e sua regra de limpar horários.
- Sem migração, limpeza ou inferência de datas antigas. Nenhum dado de usuário foi
  usado nos testes. Firebase, regras de acesso e permissões Google não mudam.

## Persistência e agenda

`planningWeekStart` + `day` continuam canônicos. O alias `googleCalendarWeekStart`
local, quando presente, acompanha a troca. Referências legadas são lidas como antes.
Não existe uma terceira data persistida. Reagendamento e edição avulsa usam salvamento
confirmado; falha informa alteração local não confirmada, sem anunciar sucesso na nuvem.
O rascunho de reagendamento é isolado por sessão e verifica alteração concorrente.

Somente contas com calendário gerenciado conhecido recebem, sob demanda, a fila
aditiva `planning.calendarMoves: [{taskId, week}]`. Ela registra os antigos IDs
semanais a reconciliar. Há deduplicação e limite de 2.000 marcadores; atingir o
limite recusa antes de alterar a missão. A fila faz parte do estado/backup existente.
A sincronização remove apenas IDs exatos da agenda gerenciada, com proprietário e
origem task conferidos. Datas presentes em snapshots históricos são preservadas.
Falha mantém a fila para nova tentativa. Voltar à semana de origem antes de sincronizar
preserva o evento da data final. Atualização concorrente mantém marcadores para revisão.
Arquivos ICS já importados continuam sendo cópias estáticas, sem atualização automática.

Propostas mission.create mantêm o contrato weekStart/day. A interface verifica a semana
aberta antes de reservar, e a transação Firestore repete a validação antes de inserir.
Uma proposta antiga já em aplicação para uma semana fechada é recusada sem inserir
missão/comprovante; seus campos travados não são reescritos automaticamente.

## Arquivos

- Regras de datas e movimentação: `mission_schedule.v1.js`.
- Diálogo: `ui/mission_schedule.v1.js`; edição: `ui/task_forms.v6.js`.
- Ações da lista: `ui/planning_views.v8.js`; transferência: `ui/planning_tools.v4.js`.
- Agenda: `calendar_sync.v3.js`; integração/navegação: `app.html`.
- Guardas IA: `ui/ai_proposals.v2.js`, `ai/v2/cloud_state.js`.
- Regressões: `mission_schedule.test.mjs`, `calendar_moves.test.mjs`, testes existentes
  apontados aos módulos atuais, `test-support/browser_mission_dates.mjs` e manutenção.
- O cenário de recorrência no navegador fixa 21/10/2026 para distinguir edição futura
  da proteção correta de ocorrências passadas. Os módulos antigos foram preservados.

## Validação

Testes cobrem 23→26/10, mesmo dia em semanas diferentes, passado aberto/futuro,
virada de mês/ano e ano bissexto, status/subtarefas, semanas fechadas, dados legados,
ordem no destino, salvamento falho/clique duplo, sessão/rascunho obsoleto, reload,
fechamento semanal após movimento e recusa transacional IA. Agenda usa API simulada
para origem/destino, falha e repetição, retorno à origem, identidade e histórico.
Navegador usa conta e Firebase fictícios, incluindo seleção real de data, Hoje,
edição com outra semana consultada, desktop, 390 px/toque e troca de conta.
