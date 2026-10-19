# Fase 1 — suporte multiusuário

Implementação de desenvolvimento v1.9.62. Nenhuma mudança de produção foi realizada.

## Arquitetura

| Área | Implementação |
| --- | --- |
| Identidade | Firebase Authentication Google; UID original preservado. |
| Autorização | Proprietário original com UID e email originais nas regras; Sara mediante documento administrativo `appAccess/{UID}` com `enabled: true` e `role: member`. Sem botão de cadastro público ou concessão de acesso pelo navegador. |
| Dados remotos | Perfil em `users/{uid}`; estado integral de todos os módulos em `users/{uid}/state/main`. Regras propostas autorizam somente o próprio caminho e negam listagens globais. |
| Estado local | `missao_tatica:v2:state:{uid}`. Nenhum dado pessoal é lido antes da autorização e da consulta ao servidor. |
| Legado | Somente o proprietário pode migrar `planeamento_semanal_v11`. O original permanece intacto. Identificador de titular incompatível interrompe a operação. |
| Sessões | Cada evento de autenticação recebe uma identidade de sessão distinta. Leituras, gravações adiadas, confirmações, FileReader, formulários e timers antigos são invalidados; diálogos, rascunhos, Pomodoro, notificações e DOM são limpos. |
| Concorrência | Comparação do snapshot anterior em transação Firestore; revisão crescente; fila de escrita por sessão; detecção de alteração local por outra aba. Conflitos exigem reentrada, sem mescla automática. |
| Falhas | Leitura inicial obrigatoriamente do servidor. Falha de conexão/autorização mantém a interface pessoal fechada e não cria estado vazio na nuvem. O botão Tentar carregar novamente repete a conferência sem exigir novo evento de login. Falhas posteriores preservam a cópia local e sinalizam o erro. Logout aguarda no máximo 2,5 segundos por gravação, conservando a cópia local se a rede travar. |
| Backups | Titular obrigatório; arquivo de outra conta recusado. Legado sem titular somente para o proprietário com confirmação explícita. Toda restauração exige confirmação e preserva uma cópia anterior. Sucesso só após gravação confirmada. |
| Agenda | Motor separado a cada sessão, token em memória, mesma verificação de email Google já usada e mesmos escopos. Respostas antigas não recebem token, estado, configuração ou callbacks da conta seguinte. |
| IA privada | Worker, D1, grants, tokens, banco separado e contratos existentes preservados. Botões e aplicação de propostas restritos ao proprietário; Sara não tem IA nesta fase. |

A nuvem tem prioridade ao abrir uma conta. Uma cópia local diferente é preservada em `missao_tatica_conflict_backup_{uid}` e cópias adicionais em `missao_tatica_conflict_backup_{uid}:history`; se for mais recente, a interface avisa. A versão anterior podia publicar automaticamente uma cópia local mais nova sobre nuvem sem revisão: essa mescla automática foi removida para evitar conflitos entre dispositivos. A recuperação é manual por backup do próprio titular. Cada conta guarda até cinco cópias distintas, com teto estimado de 2 MB no armazenamento local. A primeira nunca é substituída automaticamente. Cópias repetidas são deduplicadas; ao atingir o limite, o carregamento ou a restauração param antes de substituir o estado local. Os arquivos continuam disponíveis para download, inclusive na tela de login. Limpar esse histórico exige confirmação e preserva o estado atual da conta.

O envelope remoto recebe `ownerUid` nas novas escritas. O proprietário continua lendo formatos legados sem esse campo e sem `ownerUid` dentro do JSON. Os demais usuários precisam de titular explícito. Não há reescrita em lote, troca de IDs ou limpeza de histórico. As regras não conseguem interpretar o JSON serializado: a identidade autenticada e o caminho protegem o acesso no servidor; o aplicativo confere também o titular interno para impedir importações acidentais.

Sara utiliza o mesmo perfil inicial, categorias, configurações de campanha, trilhas, organização de rotina e módulos existentes. XP, moedas e históricos começam independentes. As trilhas/categorias padrão são os mesmos modelos públicos do aplicativo, sem registros pessoais do proprietário. Objetivos, temas e rotinas são configurados nas telas existentes.

## Validação executada

Ambiente: Node 24.19, timezone America/Sao_Paulo; Firebase JS 11.6.1; Rules Unit Testing 4.0.1; Firebase CLI 14.26; Firestore Emulator 1.19.8; Java 17; Playwright 1.56.1/Chromium 141.

| Verificação | Resultado |
| --- | --- |
| Suíte da aplicação, incluindo os 267 testes anteriores | 296 testes aprovados, zero falhas. |
| Regras reais compiladas/executadas em emulador local | 12 cenários aprovados; múltiplas operações permitidas/negadas por cenário. |
| Interface em Chromium, com Firebase/Google simulados e rede externa interceptada | Perfil novo, missão, diálogos de Inteligência/Finanças/Corpo/Rituais, troca de conta e evento real de storage entre duas abas, download de cópia preservada, cancelamento/confirmação de limpeza e retomada do carregamento aprovados. |
| Agenda | Regressões existentes e quatro cenários novos de isolamento de OAuth/token/respostas aprovados dentro da suíte. |
| Integração IA | Suíte existente de contratos/Worker/D1/propostas e guardas da aplicação aprovada; nenhuma chamada real foi feita com dados pessoais. |

Os testes específicos incluem usuário não autorizado, cache legado, todas as coleções novas vazias, leituras atrasadas, mesmo objeto Firebase em sessões diferentes, gravação pendente, requisição travada sem bloquear a conta seguinte, falha de rede, estado remoto de titular errado, abas, conflitos, backups próprios/alheios e callbacks obsoletos.

As regras do emulador negaram acesso cruzado nos dois sentidos, criação/edição/exclusão em caminho alheio, listagem global, caminhos não previstos, escalada de perfil/lista de acesso, recibos IA por membro, revisão obsoleta e acesso após revogação. Permitiram perfil e estado próprios, migração lazy do envelope legado e escrita esperada.

## Reproduzir sem produção

```bash
npm test
npm ci --prefix security-tests
npm run test:rules
npx --prefix security-tests playwright install chromium
npm run test:browser --prefix security-tests
```

O comando de regras fixa `demo-missao-tatica-phase1`, portas loopback 8089/4409/4509, sem autenticação CLI ou credenciais. Os dados são fictícios e descartáveis. `firebase.multiuser.test.json` é configuração exclusiva do emulador; não é configuração de deploy. O teste de navegador serve uma cópia local do HTML com base local e substitui Firebase/Google por stubs. Ele não testa OAuth real, App Check real ou desenho visual com o CDN Tailwind (o CSS externo também é simulado).

Não abrir uma cópia normal da branch e entrar com contas reais para testar: o HTML mantém a configuração pública existente de produção para o futuro rollout. Usar os runners isolados acima durante o desenvolvimento. A prévia verificada antiga continua apontando ao baseline; não foi convertida em ambiente de homologação desta fase.

## Estado da entrega

| Classificação | Itens |
| --- | --- |
| Implementado e validado em isolamento | Autorização, cache por UID, migração local preservada, sessões, conflitos, backups, motores da Agenda, perfil/módulos e guardas IA; regras propostas no emulador. |
| Implementado, pendente de validação real | Login Google/Sara, App Check, conteúdo efetivo do estado real e metadados atuais, sincronização Agenda com duas contas e integração privada do proprietário após rollout aprovado. |
| Pendente de configuração manual | Guardar privadamente as regras originais fornecidas e conferir o release ativo, preparar a cópia de implantação com o email original, confirmar backup, identificar/autorizar somente o UID da Sara, verificar usuários de teste OAuth caso o consentimento Google esteja em modo de testes e publicar somente após autorização. |
| Fora do escopo | IA para Sara, compartilhamento familiar, React/TypeScript, cadastro público e serviços pagos. |

## Limites conhecidos

O usuário forneceu manualmente o conteúdo das regras de `(default)` em 19/10/2026. A política anterior exige UID e email do proprietário e acesso somente a seus próprios caminhos. A proposta mantém essas condições e foi testada com o formato de gravação do cliente v1.9.61, inclusive perfil, transação sem `ownerUid` externo e inclusão de recibos de IA. Foi testada também a recusa do proprietário com email ausente/incorreto, inclusive contra tentativa de contornar pela lista de membros. O arquivo `ai/firestore.rules` permanece inalterado.

Não houve leitura administrativa direta do release ativo; a análise usa o texto enviado pelo usuário. A liberação continua pendente de backup, substituição privada do marcador de email e testes reais autorizados. **Não publicar o template do repositório sem configurar `__OWNER_EMAIL__`**: ele bloquearia o acesso do proprietário. O email real fica somente na cópia privada de implantação (`firestore.default.deployment.rules`, ignorada pelo git) ou no editor privado do Console. O teste substitui o marcador por `owner@example.test` em memória; nenhum email pessoal foi publicado no código.

O cache local é separado por identidade, mas não criptografado. Pessoas com acesso às ferramentas do mesmo perfil de navegador podem inspecionar o armazenamento daquele perfil; usar perfis de navegador distintos em equipamentos compartilhados se essa privacidade local for necessária. O isolamento remoto é imposto pelas regras, independentemente do conteúdo do navegador.

Conflitos não são resolvidos mesclando registros automaticamente; reentrada e backup preservado são o caminho de recuperação. Leituras iniciais offline são bloqueadas de propósito. A detecção local entre abas é uma proteção auxiliar; a garantia de concorrência remota é a transação com comparação e revisão no servidor. Uma requisição já recebida pelo servidor pode terminar na conta original, mas não é redirecionada para a seguinte.

A dependência CLI é ferramenta local de testes; Java 21 será necessário para futuras versões da CLI. Não há dependências novas no carregamento da aplicação nem serviço pago novo.

Referências técnicas: [testes oficiais de regras](https://firebase.google.com/docs/firestore/security/test-rules-emulator), [condições e acesso a documentos](https://firebase.google.com/docs/firestore/security/rules-conditions).
