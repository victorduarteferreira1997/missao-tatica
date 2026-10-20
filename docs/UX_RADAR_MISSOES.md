# RADAR, Missões e revisão da IA — v1.9.65

Implementação de 20/10/2026, baseada na inspeção da v1.9.64 (`ac5c1ba`).
Nenhum procedimento de limpeza, reinício de campanha/perfil ou escrita administrativa
no banco é executado por esta entrega. Os testes usam apenas registros fictícios.

## Diagnóstico e correções

| Problema | Causa constatada | Comportamento implementado |
| --- | --- | --- |
| RADAR sem missão ficava fora da rotina | A visão semanal reunia missões/estudos; a existência de um RADAR não cria nem agenda uma missão. | Seções de follow-ups e ativos sem missão executável, atalho no topo da semana e sinal na visão diária. |
| Revisões e follow-ups ausentes na semana | Os alertas existentes usavam sinais próximos de uma data, não uma projeção de todos os dias da semana. A validação também apagava campos de espera fora do status `waiting`. | Projeção por semana selecionada com prazo, revisão e follow-up de qualquer RADAR aberto; preservação dos metadados antigos na validação e edição manual. |
| Quando criar missão era pouco claro | Faltavam explicação dos estados e ações explícitas de vínculo. | Ativo é frente com ações; aguardando depende de terceiro/documento; backlog é futuro. Aguardando/backlog não entram na cobrança de missão executável. |
| Dependência confundida com RADAR | Campo genérico “O que precisa terminar antes?”, agrupado com vínculo. | Campos distintos, pergunta explícita e explicação sobre terceiros no RADAR; seleção opcional, pré-requisitos visíveis e indicação de bloqueio. |
| Não era possível editar/ordenar subtarefas | A interface oferecia apenas marcar, acrescentar no final e excluir. | Editor com rascunho, texto, conclusão, inserção no início/abaixo de qualquer item, exclusão, arraste e botões acessíveis. Só salvar confirma as mudanças. |
| Proposta editada parecia não cadastrar | Na v1.9.63, espaços periféricos no título e divergência entre duração/horários falhavam na validação; aviso abaixo da fila e validade nativa dificultavam perceber a causa. A v1.9.64 já tratou esses casos. | Correção mantida e coberta por regressões: normalização, horários/duração sincronizados, validação explícita, erro/progresso junto ao botão, rascunho preservado e nova tentativa. |
| Segunda-feira parecia ser a data da missão | A interface apresentava apenas a semana-base e o dia separadamente. | Data efetiva com dia por extenso e intervalo semanal na fila e revisão, atualizada ao trocar semana/dia. |
| Destino da proposta ambíguo | O tipo técnico não tinha etiqueta visual destacada. | Etiquetas “Destino: Missões”, “Destino: RADAR” e “Destino: Inteligência/Estudos”. A execução continua determinada pelo `kind` original. |

## Modelo de dados preservado

- `state.tasks` contém missões. `planningWeekStart` mais `day` determinam a data.
- `state.operationalControl.demands` contém RADARs e datas `dueDate`,
  `nextReviewAt`, `followUpAt`; `workflowStatus` mantém os valores existentes
  `active`, `waiting`, `backlog`, `closed`.
- `task.radarDemandId` identifica um único RADAR; várias missões podem compartilhar
  o mesmo vínculo. Não significa dependência. O seletor também apresenta registros
  do histórico, sem copiar a missão para a semana atual.
- `task.dependsOnTaskIds` e `dependencyReceipts` permanecem no formato atual.
  A validação já impedia ciclos, inclusive entre ocorrências de recorrências.
  Ela continua aplicada antes de salvar; bloqueios impedem início, conclusão e
  avanço por subtarefa enquanto há pré-requisito pendente.
- `task.subtasks` continua sendo o array ordenado existente. A posição no array
  é a ordem persistida. Editar a lista de texto na criação também mantém o
  estado das linhas já organizadas. Objetos são preservados com seus IDs, `completed` e campos
  adicionais; não é criado um campo de ordenação paralelo.
- `planning.history` é consultado junto das missões atuais, eliminando apenas
  representações repetidas **na projeção da interface**, sem apagar registros.
- Comprovantes de aplicação da IA, IDs de propostas, controles de concorrência,
  campanha, perfil, recompensas e isolamento entre contas permanecem vigentes.

### Migração

Não há migração de banco, coleção, schema de missões, dependências ou ordem.
Nenhuma rotina cria missões para os RADARs antigos. A atribuição de vínculo é
uma ação explícita; removê-lo não apaga missão, subtarefas ou dependências.

Um item legado sem ID recebe um ID local no rascunho do editor de subtarefas e
só é persistido caso o usuário salve esse editor. Itens com ID válido preservam
seus identificadores. Cancelar não altera o registro antigo.

Campos de espera que o código antigo já tenha apagado não são reconstruídos ou
inventados. A nova validação deixa de apagá-los automaticamente. Editar um RADAR
ativo também mantém um follow-up existente; a data agora pode ser editada fora
do estado Aguardando.

## Regras da projeção semanal

- Cada RADAR aberto aparece uma vez em Follow-ups quando prazo, revisão ou retorno
  estiver entre segunda e domingo da semana selecionada. Os vários motivos ficam
  no mesmo cartão.
- Atenção imediata sem data ou com data anterior ainda pendente é destacada na
  semana atual; não é replicada artificialmente em semanas futuras.
- A lista de ativos sem missão executável considera a semana selecionada. Uma
  missão concluída, pausada, cancelada, bloqueada por dependência ou de outra semana
  não satisfaz essa necessidade de ação.
- Se o mesmo RADAR já aparece nos follow-ups, recebe o aviso no próprio cartão e
  não é desenhado novamente na segunda seção. Aguardando/backlog ficam fora dela.
- Os cartões mantêm ações visíveis para criar/vincular missão e um resumo das
  missões relacionadas, incluindo seu estado e registros do histórico.
- Após concluir uma missão vinculada, a escolha entre próxima missão, próxima ação,
  aguardando, backlog e encerramento é explícita. “Decidir depois” preserva o RADAR.
  Campos são confirmados no formulário e encerramento mantém sua confirmação.

## Arquivos de implementação

| Área | Arquivos |
| --- | --- |
| Integração, preservação de follow-ups e chamada após conclusão | `app.html` |
| Projeções semanais, estado de execução e vínculo canônico | `radar_missions.v1.js` |
| Cartões, vínculo/desvínculo e decisões após conclusão | `ui/radar_missions.v1.js` |
| Campos de vínculo/dependência | `ui/planning_tools.v2.js` |
| Formulários e acesso ao editor de subtarefas | `ui/task_forms.v4.js` |
| Subtarefas nas missões e compatibilidade das visões | `ui/planning_views.v4.js` |
| Rascunho, inserção, edição, conclusão, exclusão e ordenação | `ui/subtasks.v1.js` |
| Destino e data efetiva das propostas | `ui/ai_proposal_labels.v1.js`, `ui/ai_proposals.v2.js`, `ui/ai_entity_review.v1.js` |
| Regressões e montagem do app real | `radar_missions.test.mjs`, `subtasks.test.mjs`, `ai/proposal_review.test.mjs`, `startup.test.mjs`, `app_integrity.test.mjs`, `test-support/app_boot.mjs` |
| Navegador desktop/celular | `test-support/browser_radar.mjs`, `security-tests/package.json` |
| Documentação | `README.md`, `docs/HISTORICO.md`, este arquivo |

Versões anteriores dos módulos de planejamento/formulários foram preservadas.
Imports dos módulos de IA alterados usam versão para evitar arquivos antigos em cache.
Nenhuma regra do Firebase ou implantação de Worker/D1 foi necessária.

## Validação

- `npm test`: **322 testes aprovados, zero falhas**. Inclui a suíte existente e
  20 regressões novas para projeções, vínculos, preservação, subtarefas e propostas.
- `npm run test:browser --prefix security-tests`: aprovado; edição real dos campos
  da proposta e confirmação da missão no mock de nuvem, fila aberta, contas
  isoladas, recuperação e regressões do salvamento.
- `npm run test:browser:radar --prefix security-tests`: aprovado com Chromium,
  1280×900 e 390×844, incluindo toque nos controles de ordenação/salvamento.
  CSS compilado com Tailwind 3.4.17 foi usado na inspeção visual e nos testes.
- Navegador: follow-up sem missão; um cartão para várias datas; criação já vinculada;
  três missões no mesmo RADAR; vínculo e desvínculo/cancelamento; edição de
  subtarefas dentro da edição de missão sem perder o título em rascunho;
  inserção, arraste e botões; preservação de IDs/conclusões após recarregar;
  dependência circular rejeitada, desbloqueio e decisão explícita após conclusão;
  destino/data da proposta; ausência de transbordamento horizontal em 390 px.
- Serviços Firebase, Google e Worker foram interceptados/simulados. Nenhum teste
  autenticou uma conta real, escreveu na nuvem de produção ou reiniciou seus dados.

Para repetir a verificação com CSS a partir da raiz:

```sh
npm test
npm run test:browser --prefix security-tests
npm exec --yes --package=tailwindcss@3.4.17 -- tailwindcss --content './app.html,./ui/*.js' --output /tmp/missao-qa.css --minify
MISSAO_QA_CSS_PATH=/tmp/missao-qa.css npm run test:browser:radar --prefix security-tests
```

O Chromium do Playwright deve estar instalado para os testes de navegador.

## Limitações práticas

- Navegadores de aparelhos físicos, Safari/iOS e Firefox não foram executados.
  No celular, os botões são a alternativa ao arraste quando ele não for suportado.
- A visão de RADAR usa o estado atual das demandas; não inventa um histórico de
  status do RADAR em semanas antigas. O histórico de missões/estudos permanece
  como já era armazenado, com os limites de retenção existentes.
- Edições simultâneas em outra aba/dispositivo continuam sujeitas ao bloqueio
  de concorrência existente. Não há mesclagem silenciosa de versões conflitantes.
- O editor rejeita a confirmação se as subtarefas mudaram desde sua abertura;
  fechar e reabrir permite revisar a versão atual, preservando os registros.
