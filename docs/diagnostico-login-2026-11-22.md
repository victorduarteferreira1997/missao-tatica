# Diagnóstico do login — v1.9.101

## Evidência observada

Na homologação, a janela do Google foi encerrada e o Firebase registrou auth/popup-closed-by-user. Uma tentativa posterior por redirecionamento reconheceu a conta no Google e retornou ao aplicativo, que continuou exibindo a tela de entrada. Uma página nova também não confirmou sessão autenticada. A causa do retorno incompleto permanece sem confirmação.

## Problemas corrigidos no cliente

- Erros de login eram enviados ao painel de alertas da aplicação, dentro do app-wrapper que permanece oculto antes da autorização. Agora aparecem em auth-access-message, na própria tela de entrada.
- Havia possibilidade de iniciar tentativas simultâneas. Os dois botões agora ficam desabilitados enquanto uma tentativa está em andamento; o bloqueio também vale para chamadas repetidas dos handlers.
- O redirecionamento não tinha tratamento explícito do resultado na inicialização. Um marcador de tentativa em sessionStorage permite conferir getRedirectResult uma vez ao retornar e informar erros ou ausência de sessão. A mensagem não é apagada por um evento de autenticação nula.
- As falhas usam mensagens conhecidas e códigos de autenticação validados, sem publicar mensagens brutas do SDK.

O controle de autorização e a carga de dados continuam no callback de autenticação existente. A resposta do provedor, isoladamente, não libera a aplicação.

## Validação

646 testes de código aprovados, incluindo oito cenários novos: popup fechado, bloqueio de tentativas simultâneas, ausência de liberação antecipada do app, falha ao iniciar redirecionamento, retorno vazio, erro no retorno, abertura comum sem tentativa anterior e armazenamento de sessão indisponível.

Na interface isolada com serviços simulados foram conferidos os botões desabilitados durante a tentativa, a mensagem visível após fechamento da janela, a liberação dos botões para nova tentativa e a mensagem de retorno sem sessão. Os doze mocks de navegador foram atualizados para exportar getRedirectResult. A suíte completa de navegador não foi reexecutada.

## Limitação e referência

A versão melhora o diagnóstico e a recuperação da entrada. O login real e a integração com a Agenda continuam pendentes de homologação.

Atualização em 25/11/2026: o login real foi posteriormente validado e a Agenda concluiu sua homologação básica na v1.9.102, na mesma aba que iniciou a autorização. Ver `diagnostico-agenda-2026-11-25.md` e `qa-fluxos-integrados-2026-11-25.md`. A pendência acima descreve o estado na data deste diagnóstico inicial.

O Firebase documenta que signInWithRedirect depende de armazenamento entre o domínio da aplicação e o domínio auxiliar de autenticação; navegadores que restringem esse armazenamento exigem uma das arquiteturas compatíveis. O app está no GitHub Pages e usa um authDomain firebaseapp.com. Isso constitui uma hipótese para a falha observada, não um diagnóstico conclusivo. Trocar apenas authDomain para o domínio do GitHub Pages não fornece os endpoints auxiliares exigidos e não foi feito.

Referências oficiais:

- https://firebase.google.com/docs/auth/web/redirect-best-practices
- https://firebase.google.com/docs/auth/web/google-signin
