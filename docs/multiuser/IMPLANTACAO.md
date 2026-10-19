# Implantação e reversão

Registro de 19/10/2026: o proprietário autorizou expressamente atualizar as permissões e publicar a versão multiusuário, dispensando o backup obrigatório dos dados. Informou a publicação manual das regras e confirmou uma gravação na nuvem no aplicativo existente. O PR #3 foi integrado à main no commit `39fec004e200799f3f9532b4f5f50ddc603f2cc2`. A autorização do UID da Sara e a validação com as contas reais seguem pendentes. A sequência abaixo é mantida como procedimento de referência, considerando essa autorização já concedida.

## Antes de liberar

1. Revisar o diff e o PR da branch `codex/multiuser-phase1-20261019`. Baseline oficial preservado: `af53ae3bfeb11d5bd2f183c62e1233e802d3dffd`, árvore `12f33649e06de45562ee9d96563771eef51c6170`.
2. Em acesso administrativo legítimo ao Firebase, exportar e registrar o conteúdo/hash das **regras realmente ativas de `(default)`** e a configuração App Check/Auth/OAuth relevante. Não substituir o conjunto de regras sem conferir coleções, integrações e campos reais utilizados. Em especial, conferir documentos de perfil, envelope `state/main`, `revision` e recibos `aiApplications`. Se houver uso legítimo não coberto pela proposta, adaptar e repetir os testes antes de publicar.
3. O proprietário exporta um backup JSON completo pela aplicação atual e verifica se contém todos os módulos e o titular correto. Guardar também uma cópia local original e um backup administrativo apropriado dos documentos que serão alterados, se disponível. Não colar os arquivos privados em PRs. O commit do código não substitui backup de banco.
4. Executar os testes documentados. Se possível, testar em um projeto Firebase separado já disponível, sem contratar serviço ou alterar configuração real de produção. Um preview normal do HTML aponta para o Firebase existente; os runners fornecidos são a opção isolada já validada.
5. Confirmar GitHub Pages ligado exclusivamente à fonte de produção prevista e que não há workflow externo que publique esta branch. A configuração Pages não foi acessível via API pública; o único workflow identificado é o Pages dinâmico. Não mudar a fonte de publicação para esta branch durante revisão.
6. Autorização explícita já concedida nesta sessão. O proprietário confirmou as regras e o salvamento; prosseguir com a publicação do código, conferir a versão e realizar os testes reais restantes.

## Sequência de liberação a executar somente após aprovação

1. As regras anteriores enviadas pelo usuário foram analisadas e a compatibilidade do cliente existente foi exercitada no emulador. Antes de publicar, preparar uma cópia privada de `firestore.default.proposed.rules` com `__OWNER_EMAIL__` substituído pelo email original já presente nas regras atuais. Guardá-la como `firestore.default.deployment.rules` (ignorada pelo git) ou preparar o conteúdo diretamente no editor privado do Console. Não fazer commit do email pessoal nem publicar o template não configurado. Aplicar as regras revisadas **somente a `(default)`**, inicialmente sem `appAccess` de membro ativo. Não alterar `ai/firestore.rules`, Worker/D1, segredos, grants ou tokens da IA. Não usar a configuração do emulador para deploy.
2. Ainda com a versão antiga do aplicativo, validar leitura/gravação normal do proprietário e a aplicação de uma proposta fictícia revisada, preservando recibos. Se não funcionar, interromper a liberação e conferir as regras antes de mudar o código. A proposta permite o envelope legado do proprietário e os campos atuais; isso deve ser confirmado contra o ambiente real.
3. Publicar o código aprovado via merge/release no fluxo habitual do GitHub Pages. Conferir commit da implantação e versão v1.9.62. O rollback de código é o baseline indicado acima.
4. Proprietário entra, confirma os módulos, perfil, XP, moedas, campanhas e histórico; compara o backup/contagens e confirma que cache legado continua preservado. Testa um registro fictício reversível e a Agenda da própria conta.
5. Identificar o UID da Sara e autorizá-lo conforme `AUTORIZAR_SARA.md`. Registrar apenas identificador e autorização administrativa em local apropriado, sem dados privados em documentos públicos.
6. Sara entra, configura o perfil e cria registros fictícios em Missões, RADAR, Inteligência, Finanças e Corpo; valida persistência e recarregamento. Proprietário não deve ver esses registros e vice-versa. Conferir também Rituais, Pomodoro, gamificação, recompensas e histórico semanal.
7. Em uma máquina de teste, trocar contas e abrir duas abas; confirmar que a aba anterior é bloqueada sem exibir dados. Validar backups próprios e rejeição de backup alheio com arquivos fictícios.
8. Validar Agenda de cada conta, identidade e eventos correspondentes; validar a conexão privada e revisão de propostas do proprietário. Sara não deve ver a integração IA. Concluir a liberação apenas após essas verificações reais.

## Reversão

- Interromper o rollout ao detectar exposição, titular incorreto, reset de dados, falha crítica de sincronização ou incompatibilidade das regras.
- Desativar `appAccess/{UID_DA_SARA}.enabled` para conter novos acessos. Preservar o estado e os backups dela; não excluir registros.
- Retornar o código ao baseline oficial por uma reversão revisada no fluxo de deploy. O aplicativo antigo volta a ser exclusivo do proprietário. Não usar reset destrutivo da main nem remover commits sem revisão.
- Preferir manter as regras seguras e compatíveis enquanto se investiga. A simples restauração de regras antigas desconhecidas pode reabrir acesso indevido. Se for indispensável reverter regras, comparar o snapshot administrativo anterior e aplicar uma versão previamente verificada que preserve isolamento; avaliar a compatibilidade com os campos `ownerUid`, revisões e recibos já gravados.
- Os novos campos e caches são aditivos e não exigem apagar dados para voltar. O cache global original permanece; ao reabrir a versão antiga, conferir que foi carregada a nuvem atual. Não substituir a nuvem por esse cache antigo. Preservar os caches novos até a recuperação ser conferida.
- Se houver dano real nos dados, restaurar somente o UID afetado, a partir de backup validado e com autorização específica. Conferir estado e comprovantes `aiApplications` em conjunto: não remover recibos isoladamente nem provocar reaplicação de propostas. O rollback de código não desfaz dados ou eventos externos já salvos.
- Reconferir Google Agenda após o retorno. A sincronização desta fase usa os mesmos IDs e escopos e não apaga eventos em logout; não executar exclusão em lote de calendários como parte da reversão.

## Evidência de entrega

Os resultados automatizados estão em `README.md` desta pasta. Logs locais do emulador/navegador são ignorados pelo git, pois não são artefatos de produção. O estado final do código e a lista exata de arquivos estão nos commits/PR da branch. Durante o desenvolvimento isolado não houve alterações em produção. Após autorização, o proprietário confirmou a aplicação manual das regras e foi realizado o merge registrado acima. A confirmação das regras é um relato do proprietário; não houve acesso administrativo direto ao Firebase por este ambiente.
