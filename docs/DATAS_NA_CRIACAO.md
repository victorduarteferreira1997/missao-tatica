# Datas claras na criação de missões · v1.9.76

Resolve a melhoria #20. O formulário antigo mostrava somente o dia da semana,
embora o cadastro o interpretasse dentro de `currentPlanningWeekStart`.
Em domingo, 08/11/2026, “Segunda” significava 02/11, enquanto a opção
“Próxima semana” significava segunda, 09/11. A referência não aparecia na tela.

## Alteração

O controle existente passa a se chamar **Data da missão**, ocupa a largura da
linha e mostra, por exemplo, **Segunda, 02/11/2026** e
**Segunda, 09/11/2026 · próxima semana**. O período da semana selecionada fica
abaixo do campo e é atualizado sem reconstruir o formulário.

A referência vem da mesma semana usada por `saveNewTask`: a do evento convertido,
quando houver, ou `state.currentPlanningWeekStart`. A opção `next_week` conserva
seu significado: segunda da semana seguinte. Os valores internos do seletor,
os IDs dos controles e o mecanismo de gravação permanecem compatíveis.

A semana da máquina não substitui silenciosamente a semana do planejamento.
O cadastro em outros dias de semanas futuras continua disponível pela edição
com data explícita ou pelo planejamento existente. Esta entrega esclarece a
seleção atual; não acrescenta um segundo seletor nem um novo fluxo de cadastro.

Recorrências usam os dias marcados na semana escolhida; o formulário explica isso
na seção Repetição. Conversões do Google Agenda exibem a semana/data do evento
original e conservam o controle de data bloqueado.

## Preservação

Sem migração, mudanças no Firestore, alteração de vínculos ou atualização do
Worker Cloudflare. Nenhuma missão ou histórico existente é modificado ao carregar
a atualização. Recompensas, conclusão de subtarefas, recorrências e recebimento
de propostas da IA conservam suas regras. `ui/task_forms.v6.js` foi preservado;
a aplicação atual utiliza a nova versão `ui/task_forms.v7.js`.

## Validação

- 474 testes automatizados aprovados, incluindo sete casos novos: domingo,
  distinção de semanas, restauração de rascunho, troca de estado/conta, referência
  do evento Google, viradas de mês/ano e ano bissexto, cadastro real, reabertura
  do estado serializado e recorrência na semana seguinte.
- Conferência no navegador pela prévia gerenciada/CUA: formulário real em desktop
  e iframe de 390 × 844; seleção 02/11 e 09/11, período correspondente e gravação
  pelo código real de `saveNewTask` com Firebase substituído por uma memória local.
  A série de segunda e quarta foi salva na semana de 09/11. Os registros persistidos
  foram conferidos pela saída visível do ambiente fictício.
- As verificações do navegador não acessaram contas Google ou Firestore reais.
  `test-support/browser_create_dates.mjs` fica disponível para executar o mesmo
  fluxo automatizado em ambientes com Playwright. Seu runner direto não foi
  executado com sucesso nesta sessão: o ambiente gerenciado bloqueia o lançamento
  local do Chromium; por isso a conferência visual/funcional usou CUA.
