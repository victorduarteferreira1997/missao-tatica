# Integração privada com ChatGPT — Cloudflare Workers + D1

Base desta branch: app v1.9.62 em validação; publicação oficial ainda v1.9.61.
Inclui reuniões e Entrada da Agenda. A revisão usa `ui/ai_inbox.v2.js` e
`ui/task_forms.v3.js`: categoria obrigatória nas propostas, retorno à caixa
após salvar/cancelar, contexto separado e concluídas ocultas por padrão.
Não muda o contrato, o Worker, o D1, os tokens ou a sincronização da Agenda.
A integração está **ativada** em `config.v1.js` após validação real no navegador
e no celular. O app mantém publicação explícita de uma seleção parcial e
revisão de propostas no formulário existente; a ativação não migra dados.

## Estado da integração

- Firebase voltou ao plano Spark, com o banco original `(default)`.
- D1 `missao-tatica-ai` criado, ID `102fd5fd-7781-4f4b-a4b3-fb835b26bad8`.
- Worker `missao-tatica-ai-bridge` publicado com a ponte D1.
- Binding de produção `DB → missao-tatica-ai` confirmado no painel.
- Schema aplicado e tabelas `ai_context` e `ai_proposals` criadas.
- `ACTION_SECRET` configurado no Worker; `/healthz` respondeu com sucesso e
  uma consulta sem credencial foi recusada com `401`.
- Código da ponte, adaptador do navegador e prévia isolada preparados nesta branch.
- Prévia no GitHub Pages publicada. Auth/App Check e publicação no D1 foram
  confirmados no Worker real pelo proprietário em 07/10/2026.
- ACTION_SECRET foi rotacionado pelo proprietário no Bitwarden (48 caracteres).
- A conexão passa a ser um plugin privado com MCP/OAuth, pois GPTs personalizados
  estão em descontinuação e suas Actions não migram automaticamente.
- Schema OAuth aplicado e Worker com MCP implantado em 08/10/2026.
- Pacotes importados com MCP direto ficaram restritos ao desktop. O caminho
  validado usa o Site privado **Missão Tática — Conexão**, que mantém o Worker.
- Site: https://missao-tatica-conexao.victorduarteferreira.chatgpt.site
- Plugin: https://chatgpt.com/plugins/plugin_asdk_app_sites_d89d350d86f88191a6cbf291ab36e93d
- Consulta real da seleção confirmada no chat pelo navegador e pelo Android.
- Proposta fictícia enviada, revisada no formulário e criada na quinta-feira
  pelo proprietário; imagens confirmaram o resultado em 08/10/2026.
- A ativação no app oficial libera a mesma interface já validada na prévia.
- Recusa, cancelamento, repetição e revogação têm cobertura local; não foram
  todos repetidos contra os dados reais nesta validação.

Não foram criados o banco Firestore adicional, Cloud Run ou Secret Manager.
O antigo vínculo IAM do Firestore Reader foi removido. Não restaurar esse
vínculo e não conceder acesso ao banco padrão. Os arquivos do servidor Google,
adaptador REST e Rules anteriores permanecem preservados para consulta; seu
[roteiro anterior](google-cloud-legacy.md) foi substituído pelo piloto abaixo.

## Fluxo e dados

1. No app, o proprietário seleciona missões da semana visível e confere uma
   prévia exata. Nada vem selecionado. Pode publicar um contexto vazio.
2. O navegador envia apenas o contexto selecionado à ponte, usando Firebase
   ID token e App Check. A ponte verifica assinatura RS256, emissor, projeto,
   validade, UID fixo e App ID fixo. Guarda a seleção no D1.
3. O plugin do Site usa a autenticação gerenciada pelo ChatGPT Sites. A ponte
   privada exige a identidade autenticada e usa o segredo configurado pelo
   proprietário para consultar `/v1/week` e enviar a `/v1/proposals` no Worker.
   O segredo fica criptografado com AES-GCM e AAD da identidade no D1 do Site;
   a chave de criptografia é um secret do runtime, ausente do código/pacote.
   A conexão é por usuário e a desconexão remove sua credencial criptografada.
4. O proprietário busca até 50 propostas pendentes e revisa no formulário
   existente. Categoria, prioridade, natureza, dificuldade, XP e HP continuam
   sob controle/cálculo do app. A ponte nunca grava uma missão no Firebase.

O contexto inclui apenas títulos, dias, durações, horários e status das missões
selecionadas, com referências opacas. Não inclui IDs internos, subtarefas,
categorias, Radar, estudos, Agenda externa, finanças, saúde ou gamificação.
Não representa disponibilidade completa. Os títulos são dados não confiáveis,
nunca instruções ao GPT. Cada contexto expira em até 24 horas; atualizações
exigem nova publicação. Remover contexto impede novas consultas/propostas,
mas não remove o que o ChatGPT já recebeu nem propostas já existentes.

## Escopo de acesso

| Identidade | Acesso |
| --- | --- |
| Proprietário + App Check | Publicar/remover contexto; listar propostas pendentes; alterar apenas status pendente para aceito/recusado |
| Plugin do Site privado | Consultar uma semana publicada; criar proposta validada/idempotente via ponte autenticada |
| MCP direto do Worker com OAuth | Mesmo acesso limitado; caminho alternativo preservado, não usado na validação pelo celular |
| Worker | Binding do D1; chaves **públicas** rotativas de Auth/App Check |
| Anônimo | Health e descoberta pública OAuth/MCP; não lê a seleção nem propostas |

As rotas `/v1/app/*` exigem também a origem exata
`https://victorduarteferreira1997.github.io`. CORS permite apenas os métodos e
headers declarados. Essas rotas não usam cookies ou SQL recebido do cliente,
IDs de usuário variáveis, leitura do estado completo ou operações administrativas.
O OpenAPI da Action não expõe rotas do proprietário. Não configurar tokens
Firebase como autenticação da Action.

O Worker não tem identidade Google, chave JSON, token administrativo ou
permissão de Firestore. Verificar tokens assinados não exige acesso ao banco.
As chaves públicas Google são buscadas somente em dois endereços fixos e
cacheadas até seu vencimento (máximo 6 horas), com proteção contra repetidas
consultas por IDs desconhecidos. Falha na verificação fecha o acesso.
Não há consulta administrativa de revogação: um Firebase ID token já emitido
pode continuar válido até expirar. App Check é verificado sem consumo/replay
protection. Não registrar tokens/corpos no console ou em prints.

## Implantação manual, na ordem

1. **D1:** Storage & databases → D1 → `missao-tatica-ai` → Console.
   Executar somente [`cloudflare/schema.sql`](cloudflare/schema.sql).
   Os `CREATE ... IF NOT EXISTS` podem ser repetidos sem apagar dados.
2. **Segredo:** Worker → Settings → Variables and secrets → Add variable,
   tipo **Secret**, nome `ACTION_SECRET`. Usar segredo aleatório de 32–256
   caracteres sem espaços, guardado no gerenciador de senhas. Não enviar
   seu valor ao chat, ao GitHub ou em prints. Não é chave da OpenAI.
3. **Código:** Worker → Edit code. Substituir Hello World pelo conteúdo de
   [`cloudflare/worker-dashboard.js`](cloudflare/worker-dashboard.js), gerado
   e testado a partir dos módulos. Publicar e manter binding `DB`.
   O aviso amarelo de Wrangler está atendido por
   [`cloudflare/wrangler.jsonc`](cloudflare/wrangler.jsonc). Não conectar um
   build de GitHub com configuração diferente, que possa remover o binding.
4. **Logs:** desativar Workers Logs no piloto para reduzir retenção de URLs.
   A ponte não usa `console.log`, não devolve detalhes internos e não inclui
   credenciais/seleção em URLs. O Wrangler deixa observability desligada.
5. **Conferir:** `/healthz` deve devolver `ok: true` e o nome da ponte;
   `/v1/week?weekStart=2026-10-05`, aberto sem credencial, deve devolver 401.
   Health confirma o código em execução; não confirma tabelas/login.
6. **Aplicativo:** `app.html` usa `config.v1.js` com `enabled: true`. A prévia
   `preview_ai.html` permanece disponível com banner de isolamento. A integração
   só consulta a caixa ao abrir; publicar exige seleção, prévia e confirmação.
7. **Conexão pelo navegador/celular:** abrir o Site privado acima, informar o
   ACTION_SECRET salvo no gerenciador, salvar e testar a seleção. O Site exige
   login do proprietário, verifica o segredo contra o Worker e guarda somente
   sua cópia criptografada. Nunca enviar o valor em chat, arquivos ou prints.
   A rotação no Cloudflare exige salvar o mesmo novo valor no Site.
8. **Uso:** mencionar **Missão Tática — Conexão** no ChatGPT. Consultar a seleção
   antes de propor; confirmar título, dia, duração, horários e subtarefas antes
   de enviar. No app: Integração com IA → Atualizar → Revisar; criar pelo formulário.
   Mudanças no app não republicam a seleção automaticamente. Contexto parcial,
   válido por até 24 horas; compartilhar novamente após selecionar atualizações.

O pacote em `plugin/missao-tatica` e o OAuth direto do Worker permanecem como
implementação alternativa. Não reinstalar esse pacote como solução para celular;
o plugin provisionado pelo Site é o caminho validado. O Site tem repositório de
fonte próprio, com seis testes locais de criptografia, isolamento, erros e fluxo.
Seu endpoint MCP usa os contratos versionados desta pasta e não grava Firebase.

A ponte não chama APIs de modelos nem precisa de saldo de API OpenAI. O
piloto usa o plano Free existente de Workers/D1, sem habilitar upgrade ou
faturamento. Validar o limite de CPU de 10 ms também na execução real:
os testes Node/SQLite não medem o runtime Cloudflare. Se exceder limites
Free, as chamadas podem falhar; não fazer upgrade automático.

## MCP e OAuth do piloto privado

- Duas ferramentas: `getSharedWeek` (leitura) e `submitProposal` (proposta
  idempotente pendente). Usam as mesmas validações, limites e operações do D1
  das rotas REST; não expõem publicação, revogação, revisão ou Firebase.
- Somente o CIMD fixo `https://chatgpt.com/oauth/client.json` e callback fixo
  `https://chatgpt.com/connector_platform_oauth_redirect` são aceitos. A metadata
  pública é conferida sem headers/credenciais, timeout de 5 s e sem redirects.
  Este piloto não oferece clientes genéricos, DCR ou callbacks de desktop.
- OAuth authorization code + PKCE S256, resource exato `/mcp`, consentimento
  assinado de 10 minutos, cookie Secure/HttpOnly/SameSite=Strict e checagem de
  Origin. Código aleatório de 256 bits, hash no D1, validade de 5 minutos,
  consumo atômico único e limite de 128 registros ativos. Origem, escopos,
  client_id, redirect_uri e PKCE são verificados; segredo não passa para o host.
- Tokens HMAC usam domínio de assinatura separado do consentimento, emissor,
  destinatário e proprietário fixos, escopos restritos e validade de 24 horas.
  Não há refresh token; após expiração, conectar novamente. Rotacionar
  ACTION_SECRET invalida tokens, consentimentos e códigos pendentes. Remover
  contexto bloqueia novas leituras/propostas; não apaga dados já recebidos.
- Segredo e tokens não entram no pacote. As rotas REST legadas continuam
  preservadas para compatibilidade, mas não criar um GPT novo com elas.
- Transporte MCP sem sessões/SSE, respostas JSON e notificações 202. GET
  autenticado retorna 405. Annotations/securitySchemes não substituem
  autorização e confirmação explícita dos campos na conversa.
- Testes de Node/SQLite usam segredos fictícios e criptografia real. Não provam
  instalação, OAuth da conta, metadata ChatGPT ou limites de CPU do Worker real.
  Ainda é obrigatório testar o fluxo depois da implantação manual.

Referência: [autenticação de plugins](https://developers.openai.com/plugins/build/auth).

## Limites e concorrência

- No máximo 52 contextos, 100 propostas pendentes e 1000 propostas totais.
  A consulta traz as primeiras 50; revisar/atualizar libera a próxima página.
  O limite total interrompe novas propostas preservando todos os IDs de
  idempotência. Revisar uma manutenção explícita antes de atingir esse limite.
- Insert de proposta confere, no mesmo SQL, o contexto exato, revisão e
  validade. Revogação/republicação concorrente impede a gravação baseada no
  contexto antigo. Chave repetida mantém ID/status mesmo após a revogação;
  reutilizar chave com outros campos causa conflito.
- Revisão é condicional: uma decisão não pode substituir outra já tomada.
- O limite de 60 chamadas autenticadas/minuto é por isolate, não global;
  reinicia com o runtime. As quotas Free da plataforma continuam aplicáveis.
- Aceitar no app e atualizar D1 não formam uma transação com Firebase.
  `aiProposalId` impede duplicação no estado carregado; no piloto, revisar em
  uma única aba/dispositivo. Excluir uma missão após falha no status exige
  recusar a proposta pendente antes de tentar incorporá-la novamente.
- Contextos expirados não são removidos fisicamente automaticamente. Remover
  pelo app ou substituir uma semana é permitido. D1/ChatGPT podem manter
  histórico conforme seus próprios mecanismos de retenção.

## Validação local

### Diagnóstico do piloto

O modal mantém o status visível fora da lista rolável. Falhas HTTP exibem
o número e, quando disponível, um código fixo aprovado no adaptador.
O Worker atualizado distingue `firebase_keys_unavailable` (obtenção/importação
das chaves públicas), `verification_unavailable` (falha interna na verificação)
e `database_unavailable` (acesso ao D1 após autenticação). Não devolve mensagens
internas, tokens, SQL ou corpos das missões. Esses códigos exigem republicar
`cloudflare/worker-dashboard.js` no Worker; publicar o GitHub Pages não atualiza
o Worker. `service_unavailable` continua aceito para a versão anterior.

`GET /healthz?check=keys` diagnostica somente os dois conjuntos públicos fixos
do Google, reutilizando caches e o cooldown de 30 segundos. Retorna contagem
em sucesso ou etapa (`fetch`, `http`, `json`, `key_set`, `key_format`, `import`,
`cache`), status HTTP e classe de erro conhecida em falha. Não recebe URLs,
tokens ou credenciais, não lê D1 e não devolve corpos/chaves/mensagens externas.
Esse health público não confirma login, assinatura de um token ou acesso ao banco.

As buscas JWKS do Worker usam `redirect: 'manual'` e aceitam somente respostas
HTTP bem-sucedidas. Isso recusa redirecionamentos sem segui-los. Não usar
`redirect: 'error'` no Worker: workerd rejeita essa opção com TypeError antes
da consulta, conforme o código de
[Request no runtime](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/http.c%2B%2B).
O adaptador no navegador usa a implementação Fetch do navegador e mantém sua
própria política de redirecionamento. Testes Node não substituem o teste real do Worker.

Suite completa, incluindo assinatura RSA real e SQL real em SQLite local:

```bash
TZ=America/Sao_Paulo node --test *.test.mjs ai/*.test.mjs
```

Os novos testes requerem Node.js 22.13+ (`node:sqlite`). Não há dependências de
produção. O teste verifica acesso negado antes de SQL, separar credenciais,
JWT/App Check/rotação/falhas, CORS, projeção, fluxo completo, idempotência,
revisão condicional, contexto concorrente/expirado/contaminado, limites e
sessão do navegador. Testes do Google anterior permanecem preservados.

Regerar arquivo para o editor e verificar sintaxe:

```bash
node ai/cloudflare/build-dashboard.mjs
node --check ai/cloudflare/worker-dashboard.js
```

Não há validação de Cloudflare, login Google, App Check ou GPT reais nestes
checks. Não há chamada a dados reais nos testes nem reset de dados.

## Referências oficiais

- [Workers Free e limites](https://developers.cloudflare.com/workers/platform/limits/)
- [D1, preços e quotas](https://developers.cloudflare.com/d1/platform/pricing/)
- [D1 Worker API](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
- [Validar Firebase ID tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [Validar App Check em backend próprio](https://firebase.google.com/docs/app-check/custom-resource-backend)
- [GPT Actions, autenticação](https://developers.openai.com/api/docs/actions/authentication)
- [GPT Actions, confirmação](https://developers.openai.com/api/docs/actions/production)
