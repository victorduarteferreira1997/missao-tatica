# QA — Biblioteca, Leituras, IA e recuperação

Rodada iniciada em 25/11/2026, sobre a v1.9.102; correção resultante: v1.9.103.

## Defeito reproduzido e corrigido

Ao editar uma proposta de alteração, aplicá-la e perder apenas a resposta de confirmação do compartilhamento, a missão já estava salva. A revisão mostrava corretamente “Alteração já salva”, mas Fechar ainda perguntava “Descartar os ajustes desta revisão?”. A verificação de rascunho não distinguia ajustes salvos de ajustes locais.

A confirmação de descarte agora se aplica somente a ajustes ainda não gravados. Fechar e Voltar à fila não tratam uma alteração aplicada como rascunho. A retomada continua disponível na fila para concluir a confirmação sem repetir a edição. A proteção de descarte continua ativa quando o salvamento falha.

## Verificação de código

657 testes aprovados, incluindo dois novos testes: saída/retorno à fila após ajustes editados e salvos com confirmação perdida; proteção do rascunho quando a gravação falha. Os cenários existentes de clique duplicado, revisão desatualizada, preservação de subtarefas e troca de conta continuam aprovados.

Também foram corrigidos controles desatualizados nos roteiros:

- Biblioteca: Cancelar no lugar de Voltar à estante; expansão dos detalhes do livro arquivado antes de Restaurar.
- Alterações da IA: a missão usada para testar preservação de subtarefas concluídas passa a declarar estado Planejada. Sem estado explícito, a normalização infere Em andamento, que não é elegível para esse fluxo de propostas.

Os dois roteiros alterados e o módulo corrigido passaram em `node --check`.

## Verificação pela interface, com serviços simulados

| Área | Evidência observada |
| --- | --- |
| Biblioteca, desktop | Cadastro de dois formatos mantém os campos já preenchidos; leitura anterior informada cria histórico sem inventar data; busca digitada preserva valor e foco; cancelar saída da edição mantém o rascunho; edição mantém o livro; exclusão com histórico é bloqueada; arquivar/restaurar preserva o registro anterior; duplicata de título/autor e URL `javascript:` são rejeitadas; catálogo e formatos reaparecem após reabrir. Missões, estudos e saldos permaneceram iguais. |
| Leituras, 390 × 844 px | Início de leitura, plano com dias e horário, registro parcial, correção do mesmo registro, conclusão do livro e releitura separada. A correção não duplicou a sessão; ao final havia duas sessões para duas leituras, uma concluída e outra ativa. O plano anterior terminou. Cancelar descarte manteve a anotação móvel; botão Salvar ficou dentro da tela. Após reabrir permaneceu uma leitura ativa na posição correta. Missões, estudos e saldos permaneceram iguais. |
| Propostas da IA, desktop | Após alterar campos, Aplicar fica desabilitado até Conferir ajustes. A comparação mostrou título, data, prioridade, duração e subtarefa. Com perda simulada da confirmação, a alteração permaneceu salva e pôde ser retomada após reabrir. Depois da correção, Fechar saiu sem perguntar sobre descarte. A retomada manteve nove missões e apenas uma subtarefa adicionada à missão alterada. |
| Gravação pendente, 390 × 844 px | Exclusão removeu a missão da tela e fechou o diálogo enquanto o cabeçalho dizia Salvando; a cópia simulada na nuvem ainda tinha o registro. Foi possível abrir e cancelar a edição de outra missão. Ao liberar a gravação, a nuvem simulada foi atualizada e o status passou para Salvo na nuvem. |
| Falha de gravação, 390 × 844 px | Nova exclusão com erro de rede não foi enviada à nuvem simulada; o erro ficou visível. Após reabrir, Configurações → Backups ofereceu uma cópia de alterações não sincronizadas. Após uma segunda reabertura, continuou existindo apenas uma cópia. |

## Método e limites

As páginas usaram código do aplicativo com fixtures locais, Firebase simulado, datas controladas e conexões externas bloqueadas. O transporte da fila de alterações foi simulado, com referências calculadas pelas funções reais de projeção e uma falha única na confirmação. A passagem por serviços reais da IA não foi homologada nesta rodada. O fluxo real de Agenda já havia sido confirmado na rodada anterior e não foi refeito.

Os cenários partiram de gravação inicial normalizada, como os roteiros originais. Uma tentativa adicional sem essa preparação foi bloqueada por alteração da versão da missão durante a revisão; não foi usada para aprovar o caminho de confirmação perdida.

Não foram executadas todas as asserções dos doze roteiros automatizados. Esta rodada não cobre integralmente importação de catálogo via IA, múltiplas abas/contas, toque nativo ou restauração de backup a partir de arquivo. A recuperação foi verificada até a oferta persistente da cópia, sem baixar ou restaurar o arquivo.
