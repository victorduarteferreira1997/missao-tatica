# Missão Tática — contrato mínimo da IA 2.0

Contrato aprovado com ampliação de escopo em 13/10/2026, America/Sao_Paulo.
Fundação instalada e validada; consultas implementadas, aguardando instalação
do novo Worker. Propostas v2 ainda pendentes.
Base oficial conferida: `b747ff73aa911ebc579f77409b8be9ef82faad12`.

## 1. Primeira entrega e resultado esperado

Autorizar o compartilhamento por um período, consultar missões/RADAR/propostas
autorizados e receber propostas de novas missões mesmo sem uma seleção fresca.
O usuário escolhe os dados no app, consulta a prévia e pode revogar o acesso.
Prazo proposto: 30 dias, sem renovação automática. As rotas v1 continuam disponíveis.

A primeira entrega será dividida em duas partes: consentimento e sincronização;
depois consultas e recebimento de propostas. Propostas v2 só serão aplicáveis
após o ciclo de persistência confirmada da etapa 2. Criação/alteração de RADAR
pela IA pertence à etapa 3; nesta primeira entrega o RADAR é consultável.

## 2. Evidências operacionais e limites da conferência

Capturas do proprietário confirmam `DB → missao-tatica-ai`, identidade do D1,
colunas das três tabelas v1 e existência dos índices de propostas e códigos OAuth.
A definição inteira de constraints/defaults e todas as colunas do índice de
propostas não ficaram visíveis; não afirmar igualdade integral do esquema.
Captura do Firestore (default) mostra regras publicadas restritas ao proprietário,
com UID correspondente ao app, e o projeto mostra plano Spark.
Workers plans/PDF identifica Free como plano atual e informa quotas Free de D1.
O painel do Worker mostra publicação pronta, 92 invocações e zero erros em 24h.

Não foram auditados IAM, enforcement real de App Check no Firestore, consumo
atual de linhas/armazenamento D1 ou equivalência do código Worker publicado com
o código GitHub. Histórico de alteração de ACTION_SECRET não é inspeção de valor.
Workers Logs aparece ativado, divergindo da recomendação do piloto. Avaliar
desativação ou redução de retenção antes de ampliar a projeção. Nenhum segredo
foi necessário para esta conferência.

## 3. Autorização

Grant no D1: `grantId`, `grantVersion`, `status`, `issuedAt`, `expiresAt`,
`scopes`, `selection`, `fieldAllowlist`. Proprietário vem da identidade verificada.
IDs externos são opacos e estáveis; nunca são credenciais ou IDs de conta.

Escopos iniciais: `planning:read`, `missions:read`, `radar:read`,
`proposals:read`, `proposals:create` e `studies:read`. Nenhum escopo permite escrever diretamente
no estado definitivo, concluir missões ou controlar XP/HP/moedas.

Seleção começa desmarcada. O usuário pode escolher registros específicos ou
grupos de missões por categoria / demandas por área e projeto. Compartilhar
novos registros desses grupos exige marcar explicitamente essa opção; seleção
de IDs não inclui automaticamente registros futuros. Seletores respeitam a
categoria de missões e os campos area/project do RADAR, sem tratar texto livre
como uma fronteira de segurança. Campos de identificação profissional podem
ser substituídos por aliases escolhidos pelo usuário.

A prévia informa campos, registros, grupos dinâmicos e prazo. Alterações de
seleção/escopos exigem revisão, incrementam grantVersion e invalidam a projeção
anterior. Expiração impede leitura de payloads e novas propostas. Revogação
invalida tokens vinculados ao grant e apaga a projeção correspondente. Propostas
já recebidas permanecem disponíveis ao proprietário no app para revisão.
Revogar não apaga conteúdo já recebido em conversas.

## 4. Projeção autorizada

Somente DTOs permitidos; nunca copiar `state/main` integral ao Worker/Site.

| Entidade | Campos mínimos |
| --- | --- |
| Missão | ref, entityVersion, título/alias autorizado, categoria, tipo, estado, duração, horários, semana/data conhecida, indicação de recorrência e subtarefas autorizadas |
| RADAR | ref, entityVersion, título/alias autorizado, área/projeto autorizados, workflowStatus, próxima ação, prazo, próxima revisão, nível de atenção e datas de atualização |
| RADAR em espera | aguardando quem/alias, desde quando e follow-up, somente com autorização desses campos |
| Proposta | ref, version, kind, status, campos propostos, avisos e timestamps, vinculada ao mesmo grant e dentro do escopo autorizado |

Estados RADAR permanecem `active`, `waiting`, `backlog`, `closed`. Encerrada não
significa automaticamente concluída com êxito. Estados de missão são derivados
das regras reais do app, incluindo completed, workflowStatus e meetingOutcome.
Não inventar semana para missões antigas: sem evidência, retornar data desconhecida.

Decisão do usuário: compartilhar todas as missões e demandas do RADAR, incluindo
novos registros, e incluir estudos do módulo Inteligência. A UI ainda exige
confirmação explícita antes de transmitir dados reais. Seleção de áreas específicas
pode ser oferecida em uma evolução posterior. Missões já convertidas da agenda
são missões do app; isso não inclui consultar eventos externos não convertidos.

Estudos: trilhas e metas semanais, disciplinas, ciclos, blocos e revisões; progresso
agregado por disciplina (minutos, sessões e questões), sem notas pessoais,
barreiras, confiança, enunciados ou logs de erros. Criar/alterar planos de estudos
é uma entrega própria após o ciclo seguro de aplicação, assim como RADAR.

Finanças, saúde, notas livres, anexos, credenciais e metadados profissionais não
integram a projeção. Agenda externa fica para consentimento
específico em entrega posterior. Ausência de dados não comprova tempo livre.

## 5. Sincronização e atualidade

Enviar a projeção após gravação Firebase confirmada, somente se campos
autorizados mudaram. Debounce e uma fila serial por sessão; nada de polling
constante. Sincronizar também ao reabrir o app, com sessão e grant válidos.

Pré-requisito: capturar um snapshot imutável do estado antes do salvamento,
confirmar o resultado booleano do escritor e projetar exatamente esse snapshot.
Não ler um state mutável depois do await. `saveStateNow()` atual descarta o
booleano de sucesso; o novo fluxo deverá expor esse resultado corretamente.

Publicações usam grantVersion e expectedProjectionVersion. D1 faz atualização
condicional. Conflito não autoriza sobrescrever com snapshot local antigo:
exigir leitura atual no app e nova sincronização. Datas de relógio do cliente
não constituem ordenação confiável entre dispositivos.

Respostas incluem `schemaVersion`, `grantVersion`, `projectionVersion`,
`sourceSavedAt`, `syncedAt`, `freshUntil`, `coverage`, `omissions`, `freshness`.
Frescor proposto: 24h. Autorização de 30 dias e atualidade de 24h são independentes.
Com app fechado, devolver somente o último snapshot sincronizado com sua data.
Em dados antigos, a consulta identifica a desatualização; planejamento por
disponibilidade atual não pode ser afirmado.

O salvamento atual substitui o JSON completo e pode sofrer sobrescrita entre
dispositivos. Uma projeção confirmada comprova aquele snapshot, não transação
global permanente. A etapa 2 deve compatibilizar todos os escritores antes de
prometer aplicação concorrente segura de propostas v2.

## 6. Propostas independentes

Primeiro kind: `mission.create`. Campos: `idempotencyKey`, `grantId`,
`grantVersion`, `kind`, `fields` e `basis` opcional com projectionVersion.
fields: título, data/semana e dia coerentes, duração, horários opcionais,
subtarefas e categoria opcional para revisão. Validar os limites do formulário
e da regra v1 (título até 200 caracteres, até 12 subtarefas, duração 5–240 min).

Com autorização válida, aceitar a proposta independentemente de existir uma
projeção fresca. O servidor atribui `conflictCheck: unverified`; mesmo uma
projeção fresca é parcial e não fornece garantia de ausência de conflitos.
O app mostra: “Horários e duplicidades ainda precisam ser conferidos”.
Proposta registra seleção/grant de origem, versão, timestamps e status pending.
A mesma chave e operação/conteúdo retorna a proposta anterior; conteúdo
divergente com a mesma chave retorna conflito. Chave não detecta equivalência
semântica entre missões.

Na primeira entrega, propostas v2 podem ser consultadas e recusadas pelo
proprietário, mas cadastro definitivo v2 fica bloqueado até a etapa 2. O fluxo
v1 vigente continua funcionando. Novos kinds para RADAR/edição/conclusão exigem
contratos próprios e revisão antes/depois em entregas posteriores.

## 7. Operações

| Interface | Operações iniciais |
| --- | --- |
| App, proprietário + Firebase Auth + App Check | criar/consultar/revogar grant; publicar snapshot; consultar propostas; recusar pendentes |
| ChatGPT, conexão autenticada vinculada a grant/version/scopes | getPlanningOverview, listMissions, listRadarDemands, listProposals, createProposal |

Rotas novas versionadas `/v2`; app em `/v2/app`. Tokens curtos verificam grant,
version e scopes no servidor a cada operação; ACTION_SECRET isoladamente não
confere acesso irrestrito v2. Todas as listas filtram o grant antes da paginação.
Paginação 25 registros por padrão, máximo 50, cursor opaco; campos/filtros
permitidos explicitamente. Negar alvos desconhecidos ou fora da seleção.

## 8. Limites iniciais propostos

Uma autorização ativa; snapshot até 64 KiB UTF-8 e 200 entidades no total.
Se exceder, rejeitar sem truncamento silencioso e manter o último snapshot
válido, com aviso de falha no app. Proposta até 12 KiB UTF-8, 100 pendentes e
1.000 registros totais; quotas globais do D1 continuam sendo o teto real.

Projeção física é substituída a cada publicação e removida na revogação.
Expirada, deixa de ser consultável e é removida por limpeza limitada. Propostas
e payloads expiram após 90 dias com sinalização no app; exclusão física não
remove marcadores mínimos necessários para impedir repetição. Ao chegar ao
limite dos marcadores, recusar novas chaves até manutenção segura. Evitar
histórico ilimitado dentro do documento principal Firebase. Nenhum prazo aqui
equivale a armazenamento garantido ou histórico completo de execução.

## 9. Verificação necessária para liberar

- Conta errada, grant expirado/revogado e scope insuficiente não leem/escrevem.
- Seleção e allowlist efetivas no servidor; nenhum registro fora da autorização.
- Nova seleção invalida dados anteriores, inclusive em requisição concorrente.
- Falha Firebase não publica projeção; sucesso publica o snapshot exato.
- Conflito de publicação e resposta de outra sessão não sobrescrevem seleção.
- App fechado/contexto antigo nunca resultam em promessa de disponibilidade.
- Proposta sem projeção fresca fica pending/unverified, sem criação definitiva.
- Idempotência resiste a repetição, conteúdo diferente e concorrência.
- APIs v1 continuam operando; limites de bytes e paginação não expõem dados.
- Confirmar comportamento na prévia e no app/celular antes da ativação v2.

## 10. Decisão de produto para iniciar implementação

Aprovar ou ajustar o prazo proposto de 30 dias, a seleção explícita de dados
e a inclusão opcional de registros futuros dos grupos escolhidos. Aprovar essa
proposta define o produto; compartilhar dados reais ainda exige autorização
no aplicativo. Implementar primeiro consentimento/projeção, depois consultas
e propostas, com flags e migrações aditivas. Etapa 2 trata aplicação segura;
etapa 3 trata criação/alteração de RADAR.


## 11. Entrega 1A — fundação preparada em 13/10/2026

Código: grant único de 30 dias, seleção por módulo com registros futuros opt-in,
referências opacas por autorização, projeção por allowlist, estudos agregados,
limites de bytes/entidades, versões condicionais e remoção na revogação/expiração.
Somente rotas autenticadas do proprietário, ainda sem consultas MCP v2.
O grant desta fundação usa escolhas de módulos; scopes MCP serão acrescentados
quando forem implementadas as ferramentas de consulta/propostas da entrega 1B.

Frontend `config.v2.js` desativado. Worker exige `AI_V2_ENABLED=true` e migração
`v2-schema.sql` antes de ativar o frontend. Publicar Pages não instala o Worker.
A nova sincronização faz fila por sessão e descarta outra conta/sessão. Escritor
Firebase captura JSON imutável, serializa gravações locais e informa resultado
booleano; upload usa somente snapshot confirmado. Não resolve concorrência de
outros dispositivos nem modifica a aceitação v1 para fingir uma transação global.

Verificação automatizada: SQLite real, versões/revogação/expiração, validação
RSA reutilizada, omissões, consentimento, UTF-8, sessões, falhas de persistência,
montagem da aplicação, v1 preservada e igualdade do bundle gerado. Validação
visual e salvamento real nas contas ficam pendentes até a instalação.

## 12. Atualização operacional e consultas 1B em 13/10/2026

Fundação 1A instalada, frontend habilitado e fluxo real de autorização,
sincronização, revogação e nova autorização confirmado por capturas no app.
O escritor já retorna o resultado booleano descrito na seção 5.

Parte de leitura implementada: getPlanningOverview, listMissions,
listRadarDemands e listStudies. Scope `planning:read` vincula a conexão ao grant
ID/versão; módulos continuam limitados pelas escolhas do app. Resumo/listas
carregam timestamps e cobertura. Cópia ausente é `unavailable`, com contagens
desconhecidas; antiga é `stale`, sem prometer disponibilidade. Cursores assinados
expiram em até dez minutos e dependem do filtro, grant e projectionVersion.

Site usa tokens de leitura de cinco minutos, renovados para o mesmo grant salvo
criptografado com a credencial existente. Ativar uma autorização substituta exige
ação explícita na página privada. OAuth direto exige novo consentimento para o
scope e usa token de até uma hora. Ambas as formas verificam o grant no servidor
a cada leitura; não basta um token ainda não vencido se o grant foi revogado.

Nova flag `AI_V2_READ_ENABLED` separa a instalação das consultas da fundação.
Nenhuma migração D1 adicional é necessária nesta parte. Leitura real no host
aguarda publicação do novo Worker e ativação da conexão Site. Ferramentas de
propostas independentes e aplicação definitiva v2 ainda não estão implementadas.
