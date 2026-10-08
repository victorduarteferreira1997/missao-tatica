# Integração privada com ChatGPT — Cloudflare Workers + D1

Base incorporada: app v1.9.61, incluindo reuniões e Entrada da Agenda.
A integração continua **desligada** em `config.v1.js`. Esta branch não altera
os dados, o layout publicado, a persistência ou a sincronização da aplicação.

## Estado do piloto

- Firebase voltou ao plano Spark, com o banco original `(default)`.
- D1 `missao-tatica-ai` criado, ID `102fd5fd-7781-4f4b-a4b3-fb835b26bad8`.
- Worker `missao-tatica-ai-bridge` publicado com a ponte D1.
- Binding de produção `DB → missao-tatica-ai` confirmado no painel.
- Schema aplicado e tabelas `ai_context` e `ai_proposals` criadas.
- `ACTION_SECRET` configurado no Worker; `/healthz` respondeu com sucesso e
  uma consulta sem credencial foi recusada com `401`.
- Código da ponte, adaptador do navegador e prévia isolada preparados nesta branch.
- **Ainda falta** publicar a prévia no GitHub Pages, testar Auth/App Check reais,
  conectar o GPT privado e validar o fluxo completo.

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
3. GPT Actions consultam somente o contexto publicado e criam propostas
   pendentes, usando outro Bearer: o segredo privado `ACTION_SECRET`.
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
| GPT com segredo privado | Consultar uma semana publicada; criar proposta validada/idempotente |
| Worker | Binding do D1; chaves **públicas** rotativas de Auth/App Check |
| Anônimo | Somente `/healthz`; não lê D1 |

As rotas `/v1/app/*` exigem também a origem exata
`https://victorduarteferreira1997.github.io`. CORS permite apenas os métodos e
headers declarados. Não há cookies, SQL recebido do cliente, IDs de usuário
variáveis, rotas de leitura do estado completo ou operações administrativas.
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
6. **Prévia:** publicar esta branch e abrir `preview_ai.html`. Ela carrega a
   mesma v1.9.61 do aplicativo e troca somente `config.v1.js` por
   `config.preview.js`. O aplicativo oficial permanece com `enabled: false`.
   Validar Owner/Auth/App Check reais, origem e D1 com dados fictícios.
7. **GPT Somente eu:** importar [`openapi.json`](openapi.json), que já contém
   a URL real do Worker. Autenticação **API Key / Bearer** com `ACTION_SECRET`.
   Copiar [`gpt-instructions.md`](gpt-instructions.md). Manter o GPT privado.
   POST exige confirmação (`x-openai-isConsequential: true`) e revisão no app.
8. **Teste real:** compartilhar seleção fictícia, consultar, propor, repetir,
   cancelar revisão sem efeito, criar uma missão, recusar outra e revogar
   contexto. Conferir cálculos, reload, sincronização e layout. Só então
   revisar/incorporar a branch na main para disponibilizar a integração.

A ponte não chama APIs de modelos nem precisa de saldo de API OpenAI. O
piloto usa o plano Free existente de Workers/D1, sem habilitar upgrade ou
faturamento. Validar o limite de CPU de 10 ms também na execução real:
os testes Node/SQLite não medem o runtime Cloudflare. Se exceder limites
Free, as chamadas podem falhar; não fazer upgrade automático.

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
