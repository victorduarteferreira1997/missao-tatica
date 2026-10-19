# Diagnóstico e recuperação — Fase 1

Baseline oficial: `af53ae3bfeb11d5bd2f183c62e1233e802d3dffd`, árvore `12f33649e06de45562ee9d96563771eef51c6170`, versão v1.9.61. Baseline local equivalente: `a58e2465323f3a1d8967bcb638107f563df45bed`. Branch exclusiva: `codex/multiuser-phase1-20261019`.

Aplicação HTML/JS com Firebase JS 11.6.1, Authentication Google, App Check e Firestore `(default)`. Perfil em `users/{uid}`; todos os módulos no JSON `users/{uid}/state/main.data`. Escritas usam transações com comparação da versão anterior e recibos de aplicação da IA. A integração privada Worker/D1 e o banco separado `missao-tatica-ai` continuam exclusivos do proprietário. `ai/firestore.rules` NÃO representa as regras do banco principal.

Riscos identificados antes das mudanças: cache global lido antes do login; respostas assíncronas antigas capazes de substituir estado; importação sem conferência do titular; gravação adiada acessando estado mutável; tokens/respostas da Agenda sobrevivendo a operações de troca; conflitos entre abas; mistura por spread de estado anterior e nuvem.

Não há CLI Firebase autenticado nem conector administrativo disponível neste ambiente. Em 19/10/2026 o usuário enviou manualmente o texto da aba Regras do banco `(default)`, após imagem da seleção desse banco. O conteúdo foi analisado: exige autenticação, UID original e email original, e permite operações apenas em `/users/{uid}/**` do próprio titular. Não concede acesso a `appAccess`. O código conhecido usa o perfil e `state/main` dentro desse caminho. Não houve consulta administrativa direta ao release das regras; a origem é a cópia enviada pelo usuário.

A proposta foi ajustada para manter também a verificação de email do proprietário. O endereço real não foi incluído no repositório público: o template usa `__OWNER_EMAIL__`, que precisa ser substituído em uma cópia privada antes de qualquer publicação. Os testes usam um email fictício e reproduzem a política anterior sem dados pessoais. A comparação e os testes de compatibilidade passaram; a confirmação real após liberação permanece pendente. As regras originais completas devem ser guardadas privadamente pelo administrador como backup de rollback. Nenhum segredo ou documento privado foi consultado.

O único workflow identificado via API pública é o GitHub Pages dinâmico `pages-build-deployment`; não há `.github/workflows` no baseline. A API pública de configuração Pages retornou 404 (configuração não verificada). Não fazer push na main nem implantação.

Recuperação do código: o commit oficial acima preserva integralmente a versão em uso. Não se presume backup dos dados de produção: nenhum dado real foi lido, migrado ou alterado. O plano de liberação exige backup validado antes de qualquer mudança externa.
