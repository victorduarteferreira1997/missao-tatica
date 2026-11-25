# QA integrada — 25/11/2026

Versão verificada: v1.9.102 (`67355c2`). Esta rodada cobre quatro cenários de interface. Não equivale à execução automática integral dos doze roteiros.

## Método

As fixtures dos roteiros `browser_daily_missions`, `browser_recurrence`, `browser_mission_maintenance` e `browser_create_dates` foram usadas em páginas locais com o código atual. Firebase e demais serviços foram substituídos por simulações; a política de conteúdo bloqueou conexões externas. Foram acionados os controles da interface e conferidos comprovantes visíveis da gravação simulada e a reabertura da página. Os cenários móveis usaram um iframe de 390 × 844 px.

Para comparar saldos e registros de manutenção/cadastro, o estado inicial foi salvo após a normalização do aplicativo, como fazem os roteiros originais. Comparar a fixture bruta com o estado já normalizado produz diferenças de preenchimento de campos e migração que não resultam da ação testada.

## Resultados observados

| Cenário | Verificações aprovadas |
| --- | --- |
| Missões do dia, desktop | Conclusão por Enter move o foco para a próxima missão e envia a concluída à seção inferior; reabertura restaura a energia da missão; filtro mantém apenas a categoria escolhida; reunião marcada como não ocorrida permanece com conclusão direta desabilitada; subtarefa concluída permanece preservada. |
| Dependências e RADAR, desktop | Missão bloqueada exige o pré-requisito; conclusão da missão vinculada não abre o RADAR automaticamente; o botão Atualizar RADAR abre as opções; Decidir depois mantém a demanda ativa; o pré-requisito concluído libera a dependente; ambas continuam concluídas após reabrir a página. |
| Repetição, desktop | Série de segunda/quarta/sexta com término na terça cria apenas segunda; série sem fim cria os três dias; edição de quarta preserva o título da segunda e altera quarta/sexta; data final anterior é rejeitada; cancelar o encerramento preserva o editor; confirmar também mantém o editor aberto e cancela somente sexta; XP, moedas e combo permanecem iguais. |
| Fechamento semanal, desktop | Após reabrir a página, a regra de encerramento permanece; fechar a semana guarda as ocorrências no histórico, inclusive a cancelada; nenhuma ocorrência da série encerrada é recriada na semana seguinte; os campos preexistentes do RADAR permanecem preservados. |
| Exclusão, 390 px | Confirmação abre com foco em Manter missão; Esc cancela; diálogo cabe na tela; exclusões de missão pendente e concluída preservam os saldos normalizados, Frenesi, RADAR e registro anterior de exclusão; a dependente continua bloqueada após remover seu pré-requisito. |
| Manutenção e reagendamento, 390 px | Excluir a ocorrência de sexta retira apenas sexta dos dias da série e mantém segunda; reagendar uma missão para terça de outra semana grava 27/10 na semana de 26/10; ela aparece no dia correto após reabrir. A largura do conteúdo e da área útil foi de 375 px, descontada a barra de rolagem. |
| Cadastro por data, 390 px | Em domingo 08/11 simulado, data inicial e dica mostram a semana de 02/11; cadastro em 02/11 e 09/11 grava segundas-feiras de semanas distintas; repetição em 09/11 cria segunda e quarta da semana seguinte; após reabrir, os registros aparecem em 09/11 e 11/11; missões anteriores, RADAR e saldos permanecem iguais. O modal coube em 390 px e o botão de envio ficou dentro dos 844 px de altura. |

## Correção do roteiro

`browser_recurrence.mjs` ainda tentava abrir Repetição dentro de Personalizar missão recolhido. O roteiro agora expande o contêiner antes da seção, tanto no helper desktop quanto no cenário móvel. A sequência foi conferida interativamente nos controles atuais. Os doze roteiros e o helper de MIME passaram na verificação de sintaxe (`node --check`, treze arquivos).

Durante o teste móvel, o comprovante auxiliar local cobriu o botão de envio de um formulário longo. O painel de teste foi ocultado enquanto há diálogos. A criação foi repetida com o botão desobstruído e terminou corretamente. Essa sobreposição era da instrumentação e não integra os arquivos publicados do aplicativo.

Não foi identificado novo defeito funcional do aplicativo nos caminhos desta rodada. Não houve alteração de comportamento do produto nem incremento de versão.

## Homologação externa já concluída

O login real foi validado anteriormente. Na v1.9.102, em 25/11, a mesma aba que iniciou a autorização mostrou Sincronizado e data/hora da sincronização. A entrada de compromissos da Agenda foi carregada. Isso conclui a pendência de homologação básica da integração externa registrada nos relatórios anteriores. Não foram classificados ou ignorados compromissos reais nesta rodada de QA.

## Limites e próximas verificações

- A última execução dos testes de código desta versão aprovou 655 casos, na rodada da correção da Agenda. Não foi repetida aqui: esta alteração contém apenas documentação e roteiro.
- Os testes completos dos doze roteiros de navegador continuam pendentes. Foram conferidos os caminhos acima pela interface; não foram executadas todas as suas asserções, nem os cenários de arraste, toque nativo, troca entre contas e duas abas de cada roteiro.
- Próxima cobertura: Biblioteca/Leituras, importação e revisão de propostas da IA, recuperação após falha de gravação e isolamento entre contas na interface.
- Finanças ainda exige decisão de produto sobre competência histórica das contas fixas, antes de mudar a fórmula do resultado estimado.
