# Verificação integrada — 22/11/2026

Versão: v1.9.100. Base: v1.9.99 (c01390a).

## Defeito reproduzido e corrigido

Missões antigas/importadas sem XP ou custo de energia completos produziam NaN ao concluir. O problema apareceu no navegador e foi reproduzido após validateState no teste de aplicação. Custos numéricos em texto também eram armazenados sem conversão no comprovante da recompensa, prejudicando a reversão.

A conclusão e a reabertura agora convertem custos para números finitos. Valores ausentes ou inválidos contribuem com zero; custos válidos mantêm seu valor. O comprovante guarda energia numérica para permitir a reversão correta. A alteração previne novas ocorrências; não reconstrói saldos históricos já afetados.

## Verificações concluídas

- 638 testes de código aprovados, incluindo quatro regressões de custos ausentes, inválidos, em texto e zerados. Nos novos cenários, conclusão e reabertura preservam saldos finitos e a bateria volta ao valor inicial.
- 12 testes das regras de acesso aprovados no emulador Firestore.
- Navegador desktop com dados fictícios e Firebase/OAuth isolados: confirmação ao descartar rascunho; conclusão/reabertura de missão antiga sem NaN; RADAR oferece atualização opcional; criação em outra semana; reagendamento por data; abertura da missão reagendada no Foco; ciclo iniciado mantém sua data e bloqueia conclusão ao avançar a semana; cadastro de livro, início e conclusão de leitura com histórico na estante.
- Cinco roteiros de navegador atualizados para os controles atuais: confirmação de descarte e Personalizar missão, navegação Módulos/Biblioteca · Leituras, data com ano, opções recolhidas da leitura e atualização opcional do RADAR. Sintaxe verificada com node --check.

## Limites e pendências

- Os cinco roteiros atualizados não foram reexecutados automaticamente nesta rodada. A verificação interativa cobre os fluxos acima, não a totalidade das suas asserções.
- browser_radar.mjs ainda usa a antiga estrutura de cartões semanais expansíveis e o campo ct-day. Precisa acompanhar o fluxo atual Abrir demanda → Mais ações e a data ct-date antes de nova execução completa.
- Os servidores dos roteiros de navegador servem CSS local como application/octet-stream. Corrigir o MIME antes de usar seus resultados para aprovação visual.
- Não foi feita nova rodada mobile nesta etapa.
- Login Google, reconexão e sincronização real de Agenda ainda precisam de homologação autenticada. Serviços simulados não comprovam funcionamento externo.
- Finanças continua usando contas fixas atuais no resultado estimado, inclusive ao consultar períodos anteriores. Uma mudança para competência mensal exige definir o comportamento histórico antes de implementar.
