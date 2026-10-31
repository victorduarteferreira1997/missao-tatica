# Alterações de missões pela IA · v1.9.75

## Uso

No chat, consulte as missões e peça uma alteração específica, por exemplo:
“Proponha mover a missão X para 09/11/2026 e reduzir a duração para 30 minutos”.
A conversa não altera o aplicativo. Em **Propostas da IA → Alterar missões**,
abra a proposta, confira o antes e depois e confirme **Aplicar alteração**.
Os campos pedidos podem ser ajustados; depois clique em **Conferir ajustes**.
A fila permanece aberta após a confirmação. Não há outro botão no rodapé.

Disponível nesta etapa: título, data efetiva, duração, início opcional, prioridade,
edição do texto de subtarefas e acréscimo de subtarefas. Os índices das subtarefas
são da consulta original, começando em zero. IDs, ordem e conclusão das etapas
existentes são preservados. O término é calculado a partir de início e duração.

Missões concluídas, canceladas, recorrentes, reuniões, eventos externos, semanas
fechadas e missões com foco iniciado continuam usando seus fluxos habituais.
Não há conclusão, exclusão, reorganização em lote ou alteração de estudos nesta
primeira etapa. Finanças e Corpo permanecem manuais.

## Segurança e persistência

- `submitMissionChange` cria uma proposta `mission.update` na fila independente
  `ai_mission_changes`; `listMissionChanges` consulta seu andamento. As filas
  existentes e os IDs das missões não mudam.
- Permissão opcional `allowMissionChanges`, vinculada à consulta de missões e
  desligada em autorizações antigas. Exige também envio ativado na conexão.
- Envio exige cópia autorizada com menos de 24 horas, referência real e versão
  correspondente. Campos desconhecidos, conclusão e recompensas são recusados.
- A revisão verifica novamente a versão pública e calcula SHA-256 do registro
  completo. A reserva fixa os campos finais e esse hash. A transação no Firestore
  recusa alterações concorrentes, inclusive em campos não compartilhados.
- Aplicação modifica a missão existente e registra comprovante transacional.
  Uma repetição após perda da confirmação retorna o comprovante, sem reaplicar.
  Reabrir a fila “Alteração a concluir” permite finalizar a confirmação.
- Datas usam os mesmos auxiliares de reagendamento: dia e semana mudam juntos.
  Eventos gerenciados pela aplicação conservam a manutenção do Google Agenda.
- Custos e recompensas **previstos da missão** são recalculados quando duração
  ou prioridade mudam. XP, moedas, energia, Frenesi e históricos já registrados
  não são alterados.
- A tabela é criada de forma aditiva e repetível no primeiro uso autenticado,
  somente com a função ativada. Não há migração dos dados atuais. O SQL equivalente
  está em `ai/cloudflare/mission-changes-schema.sql` para auditoria.

## Ativação na infraestrutura atual

O aplicativo e a conexão privada podem ser publicados pelo fluxo de código.
O Worker externo do Cloudflare requer uma atualização administrativa separada;
as ferramentas desta sessão não oferecem esse acesso.

1. Atualize **o Worker existente** `missao-tatica-ai-bridge` com o conteúdo completo
   de [`worker-dashboard.js`](../ai/cloudflare/worker-dashboard.js). O arquivo é
   gerado por `node ai/cloudflare/build-dashboard.mjs`.
2. Adicione a variável `AI_MISSION_CHANGES_ENABLED` com valor `true`. Preserve DB,
   segredos e todas as variáveis já existentes, inclusive as da Biblioteca. Não
   copie a configuração local inteira para produção: novos recursos ficam
   desligados por padrão nela.
3. No app, abra **Propostas da IA → Alterar missões → Configurar permissão**.
   Marque a consulta de missões e a permissão de alteração, confira a prévia e
   autorize. Na conexão privada existente, reative consultas e envio uma vez.

Não é necessário executar SQL, recriar banco, campanha, perfil ou conexão.
O diagnóstico `/healthz?check=changes` deve responder `missionChangeVersion: 1`
e `enabled: true`. Até a ativação, a aba explica a pendência sem alterar registros.

## Verificação e limites

`npm test` inclui autenticação, consentimento, origem, campos permitidos, cópia
antiga, referências inválidas, reserva imutável, alterações concorrentes, recibos,
paginação, expiração e preservação dos dados. O teste de navegador
`npm run test:browser:ai-changes --prefix security-tests` usa Worker e SQLite reais,
com Firebase e rede externa simulados; cobre desktop, 390 px, edição final,
reabertura após perda da confirmação e isolamento de contas.

Dados de teste são fictícios; os testes não acessam o Firestore de produção.
Não foram usadas missões reais para testar gravações. A integração permanece
restrita ao proprietário, conforme a configuração anterior. A fila compartilha
o limite existente de 1.000 comprovantes do aplicativo; aceita até 100 revisões
abertas e 1.000 propostas por tabela. Pendentes expiram após 90 dias; revisões
iniciadas permanecem recuperáveis. Se o registro mudar depois da reserva, ela é
bloqueada para evitar sobrescrita; sua resolução manual e o descarte de reservas
obsoletas ficam para uma etapa posterior.
