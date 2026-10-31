# Resposta da interface e recuperação — v1.9.74

## Causas

`saveStateNow` redesenhava a interface apenas depois de aguardar a rede. Na exclusão,
a missão já havia sido removida em memória e a confirmação já estava encerrada no
estado, mas a tela ainda mostrava ambos até o retorno do Firebase. Isso também
permitia vários cliques com aparência de botão sem resposta.

Cada salvamento escrevia o perfil e depois o estado, em série. A fila também podia
acumular retratos intermediários de fundo. Estudos/RADAR faziam um salvamento
adiado e imediatamente outro confirmado, serializando estado e cache duas vezes.

O login comparava JSONs inteiros: filtro, aba, semana consultada, ordem das chaves e
horários de salvamento podiam criar uma recuperação sem alteração de conteúdo.
A normalização da nuvem também produz um cache derivado, anteriormente tratado como
edição local na próxima abertura. Cinco versões ocupavam o limite e bloqueavam a
entrada para exigir download/limpeza.

## Mudanças

- Alterações locais duráveis no cache são renderizadas antes de esperar a nuvem.
  O status continua Salvando e sucesso só é informado após confirmação. Falha
  mantém o estado local e informa que falta sincronizar. Edição avulsa também fecha
  sua janela antes da rede. Fluxos críticos (IA, reset, importação) mantêm suas
  confirmações, barreiras e estados de progresso.
- Perfil é gravado uma vez por sessão ou mudança de UID/email/nome. O documento de
  estado e seus timestamps continuam gravados normalmente em cada save explícito.
- Somente jobs de fundo adjacentes, ainda não iniciados, podem ser substituídos pelo
  retrato mais recente. Saves explícitos e `exclusive` são barreiras. Reset invalida
  o epoch da fila, inclusive se o objeto Firebase de usuário for reutilizado.
- Estudos/RADAR fazem uma única captura, atualização de cache e render por save.
- Recuperação compara conteúdo estável com chaves ordenadas. Ignora apenas campos
  raiz de navegação/foco e bookkeeping de salvamento; mantém todos os registros,
  exclusões, subtarefas/ordem, recompensas, comprovantes IA e campos desconhecidos.
  A semana não é ignorada em legado cujas missões ainda dependem dela para a data.
- Até oito assinaturas SHA-256 por UID registram estados confirmados na nuvem e o
  cache normalizado derivado de uma leitura conferida. Uma versão local já
  confirmada não é um conflito apenas porque outro dispositivo alterou a nuvem.
  Falha em gravar uma assinatura opcional não invalida um commit Firestore.
- Cópias redundantes, equivalentes à nuvem ou comprovadamente confirmadas são
  dispensadas; versões únicas não sincronizadas são mantidas. A interface explica
  que são versões locais para recuperação, e não tarefas duplicadas.

## Dados e compatibilidade

Sem reset de campanha/perfil, edição de registros, mudança de regras Firestore ou
migração de coleções. O cache atual conserva sua chave por UID. O módulo antigo
`account_storage.v1.js` foi preservado; o app usa `account_storage.v2.js`.

A compactação grava atomicamente `missao_tatica_conflict_backup_<uid>:v2`, com
`copies` (JSONs preservados) e `settledLegacy` (conteúdos legados já resolvidos).
As chaves antigas não são reescritas: uma aba com código antigo ainda pode gravar
uma nova versão única e o leitor novo a encontra. A compactação confere sessão e
mudanças concorrentes antes da gravação. Quota ou corrupção não apagam os originais. Falta de espaço apenas na
compactação opcional não bloqueia uma entrada segura; preservar alterações
locais realmente não confirmadas continua sendo obrigatório.
A remoção física das chaves antigas continua disponível na limpeza explícita.

Assinaturas opcionais ficam em `missao_tatica:v2:confirmed:<uid>`. Não contêm os
registros e não são compartilhadas entre contas. Leituras e saves confirmados e
aplicações IA registram somente a versão realmente confirmada/derivada da nuvem;
nenhuma assinatura considera uma edição local não salva como confirmada.

Se houver cinco versões genuinamente distintas não confirmadas, ou falta de espaço,
a proteção ainda preserva o cache e pede revisão/download. A atualização não descarta
a única cópia de uma alteração para contornar esse limite. A confirmação da nuvem
continua dependente da conexão; a melhora é resposta visual imediata e menos
trabalho/requisições repetidas, sem alegar reduzir a latência do serviço remoto.

## Arquivos e validação

- `app.html`: renderização, salvamento e login; versão 1.9.74.
- `ai/v2/saved_state.js`: perfil, consolidação e epoch da fila.
- `account_storage.v2.js`: comparação, assinaturas e recuperação compatível.
- `responsiveness.test.mjs`, `account_recovery.test.mjs`, `multiuser.test.mjs`:
  rede retida, falhas, cliques repetidos, 50 jobs de fundo em dois snapshots,
  barreiras IA, sessão, conteúdo significativo, quota, legado e recuperação real.
- `test-support/browser_responsive_save.mjs`: rede intencionalmente retida e
  controles ainda utilizáveis; confirmação verdadeira; cinco cópias redundantes;
  logins repetidos; alteração offline recuperável; desktop e celular.
- Regressões de manutenção aguardam confirmação explícita ao inspecionar a nuvem,
  pois fechar a janela agora ocorre antes do commit. A verificação de uma terça
  escolhe explicitamente a visão diária, sem depender do dia real da execução.

Serviços externos são simulados. Nenhuma conta real foi usada para teste.
