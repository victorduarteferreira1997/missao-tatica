# Autorização da Agenda — v1.9.102

## Constatação e limite do diagnóstico

A integração usa o modelo de token do Google Identity Services. O token e a última sincronização ficam apenas na memória da instância da página, separados do login Firebase. Uma nova aba pode mostrar “Reconectar” mesmo que outra aba tenha concluído a autorização. Assim, as verificações anteriores em novas abas não comprovam falha do retorno OAuth da aba de origem. Não foi confirmado o motivo do retorno incompleto observado com a conta real.

Também foi identificado um defeito reproduzível no cliente: enquanto `connect()` aguardava o Google, `busy` permanecia falso e `view()` podia substituir “Conectando” por “Reconectar”. Isso permitia iniciar outras tentativas sem explicar a etapa pendente.

## Correção

- Expõe espera pela autorização, conferência da identidade e sincronização, tanto em Configurações quanto na Semana.
- Bloqueia uma segunda conexão e os controles concorrentes enquanto a operação está pendente.
- Explica que o usuário deve voltar à mesma aba e que recarregar não preserva a autorização da Agenda.
- Distingue janela fechada, pop-up bloqueado e consentimento negado. Erros não são ocultados pelo status genérico “Reconectar”.
- Encerra a espera sem retorno após cinco minutos e ignora o retorno tardio daquela tentativa; permite uma nova tentativa por ação do usuário.
- Rejeita respostas sem token válido ou com validade inválida antes de consultar APIs ou habilitar a integração.

O token continua somente em memória. Escopos, destinatários, permissões, identidade exigida e regras de acesso não mudaram.

## Validação

655 testes de código aprovados, incluindo nove novos cenários de autorização/interface. Os testes existentes de troca de conta e respostas tardias continuam aprovados.

Na interface isolada, com Firebase e Google simulados e rede externa bloqueada, foram conferidos: espera com ambos os botões desabilitados; fechamento com erro explícito e reconexão disponível; aprovação seguida de “Sincronizado” em Configurações e Semana. Isso não comprova sincronização com uma conta real. A suíte completa dos doze roteiros de navegador não foi executada.

Após publicar a correção, a homologação real foi concluída na mesma aba de origem: o aplicativo mostrou “Sincronizado”, a data/hora da última sincronização e a entrada de compromissos carregada. Não foi necessário repetir a confirmação do celular nessa tentativa. Isso confirma o funcionamento básico da integração; não estabelece a causa das tentativas anteriores sem retorno observado.

## Procedimento para verificar a conexão real

1. Abrir a versão publicada e iniciar a conexão uma vez.
2. Concluir a confirmação do celular e as decisões de consentimento na janela do Google.
3. Retornar à aba que iniciou a conexão, sem recarregá-la ou abrir outra para verificar.
4. Só confirmar sucesso se essa mesma aba mostrar “Sincronizado” e a data/hora da última sincronização. Se mostrar erro, registrar a etapa e a mensagem sem tokens nem URLs de autenticação.

## Referências oficiais

- https://developers.google.com/identity/oauth2/web/guides/use-token-model
- https://developers.google.com/identity/oauth2/web/reference/js-reference
