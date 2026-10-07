# Roteiro anterior — Google Cloud (não executar no piloto atual)

Preservado como referência. O piloto atual usa Cloudflare Workers + D1, conforme [README.md](README.md). Não criar recursos pagos nem conceder acesso ao Firebase `(default)`.

# Integração privada com ChatGPT — em preparação

Base: `main` em `ccd0f26d58c1d57ff3796c5a12eab81469489448`, app v1.9.59.
Não está publicada nem conectada ao Google Cloud. `config.v1.js` mantém a
integração desligada; o layout e o fluxo normais permanecem disponíveis.

## Fluxo implementado

1. O proprietário abre **Integração com IA** no rodapé, seleciona missões da
   semana visível e revisa a prévia exata antes de compartilhar. Nada é
   selecionado por padrão. Pode compartilhar um contexto vazio.
2. O navegador grava só a seleção no banco **`missao-tatica-ai`**, usando
   Firebase Auth e App Check. O banco `(default)` e seu documento
   `users/{uid}/state/main` continuam na persistência existente.
3. Uma Action privada consulta o contexto e envia uma proposta. Ela nunca
   registra uma missão, reorganiza registros ou atribui XP/moedas.
4. **Atualizar** busca até 50 propostas pendentes. **Revisar no formulário**
   abre o formulário atual. Categoria, prioridade, natureza e dificuldade
   continuam sob controle do usuário. **Criar missão** usa o cálculo e a
   gravação existentes. A IA não fornece XP, HP, moedas ou IDs de tarefas.

O contexto contém exclusivamente títulos, dias, durações, horários e status
das missões selecionadas. Não inclui subtarefas, categorias, Radar, estudos,
Agenda externa, finanças, saúde ou gamificação. Não é uma agenda completa:
o GPT deve tratar horários livres como hipóteses, nunca como disponibilidade
confirmada. Texto das missões é dado não confiável, nunca instrução ao GPT.

Cada publicação expira em até 24 horas e tem uma revisão diferente. A Action
recusa contexto ausente/expirado e propostas baseadas em outra revisão.
Atualizações da rotina não são publicadas automaticamente. **Remover contexto
desta semana** interrompe novas consultas/propostas dessa semana; outras
semanas e propostas recebidas precisam ser revisadas separadamente. Remover
o documento não apaga dados já recebidos pelo ChatGPT.

## Limites de acesso

| Identidade | Acesso necessário |
| --- | --- |
| Navegador do proprietário | Publicar/remover contexto e revisar inbox, pelas Rules do banco isolado |
| Serviço Cloud Run | `datastore.entities.get` e `datastore.entities.create`, somente no banco isolado |
| ChatGPT | HTTPS da ponte, com segredo Bearer de uma Action privada |

Use uma **nova** conta de serviço, por exemplo `missao-tatica-ai-bridge`, e
papel próprio, por exemplo **Missão Tática AI Bridge**, com somente as duas
permissões acima. Não altere nem reutilize silenciosamente o antigo papel
**Missão Tática Firestore Reader**. A vinculação antiga foi removida; sua
conta e papel podem continuar sem acesso.

Condição IAM da nova vinculação:

```text
resource.name == "projects/missao-tatica/databases/missao-tatica-ai"
```

IAM não restringe coleções/documentos dentro desse banco. A conta de serviço
ignora Security Rules; por isso o banco deve conter **apenas** dados
deliberadamente compartilhados e propostas. O servidor fixa projeto,
banco e proprietário no código e recusa configurações diferentes.
Não copie backups ou `state/main` para esse banco.

## Próximas etapas, na ordem

1. Criar banco **Standard / Native mode**, ID `missao-tatica-ai`, localização
   `southamerica-east1`, com regras iniciais em **modo de produção**.
   Não recrie nem altere o banco `(default)`. Se aparecer exigência de
   faturamento, revisar essa tela antes de habilitar serviços.
2. Publicar `ai/firestore.rules` **somente no banco isolado**. O próprio
   arquivo nega acesso se aplicado a outro ID, mas nunca deve substituir as
   Rules de produção do `(default)`. Testar proprietário, anônimo e outro UID,
   publicação, recusa de gravação arbitrária e atualização só do status.
   Testes unitários da ponte não substituem validação das Rules no emulador.
3. Criar a nova conta e papel, conferir a condição, só então vincular o papel.
   Nenhuma chave JSON é necessária. A identidade de execução do Cloud Run
   usa o servidor de metadados para obter um token OAuth de curta duração.
4. Criar um segredo forte de no mínimo 32 caracteres para `ACTION_SECRET`,
   guardado no Secret Manager. Conceder ao serviço acesso **só a esse segredo**.
   Não salvar o valor em arquivo versionado, frontend, print ou comando com
   histórico. Não é uma chave de API da OpenAI.
5. Construir a imagem a partir da **raiz do repositório**, com
   `docker build -f ai/server/Dockerfile -t missao-tatica-ai .`.
   Publicar no Cloud Run usando a nova conta; configurar `ACTION_SECRET`
   por referência ao segredo, `GOOGLE_CLOUD_PROJECT=missao-tatica`,
   `AI_DATABASE=missao-tatica-ai`, mínimo de instâncias 0 e máximo 1 no piloto.
   Requisições HTTPS precisam chegar ao serviço sem login IAM interativo;
   a API exige seu Bearer. `/healthz` só informa que o processo responde.
   Cloud Run/Firestore/Secret Manager podem ter cobrança; revisar limites
   e orçamento antes de publicar. A ponte não chama APIs de modelos.
6. Validar acesso negado ao `(default)` com a identidade real e o acesso
   permitido ao contexto/inbox isolados. Validar Auth/App Check reais no
   navegador. Só então ativar `enabled: true` em uma prévia desta branch.
7. Em um GPT **Somente eu**, importar `openapi.json`, substituir
   `https://REPLACE_WITH_CLOUD_RUN_URL` pela URL HTTPS real e configurar
   autenticação **API Key / Bearer** com o segredo. Não publicar esse GPT.
   O POST usa `x-openai-isConsequential: true`, além da revisão no app.
   Copiar `gpt-instructions.md` para as instruções do GPT.
8. Testar com missões fictícias: consultar, confirmar proposta, revisar,
   cancelar sem efeito, criar uma missão e repetir o pedido sem duplicação.
   Conferir XP/HP calculados, Agenda, persistência, layout e reload. Só depois
   revisar e incorporar a branch na `main` para disponibilizar no app oficial.

## Validação local

Requer Node.js 22+ para o servidor; sem dependências npm de produção.

```bash
TZ=America/Sao_Paulo node --test *.test.mjs ai/*.test.mjs
```

Os testes da API usam um Firestore simulado, não dados reais. O adaptador REST
é testado por URLs, identidade e operações efetivamente emitidas. Não há
validação de IAM/Rules, rede Google, GPT ou publicação real nos testes locais.
O limite de 60 requisições/minuto é por processo, reinicia com a instância e
não é uma quota global. A API não registra corpo, tokens ou credenciais.

Pedidos repetidos com a mesma chave retornam o mesmo ID. Reutilizar a chave
com dados diferentes resulta em conflito. Missões incorporadas guardam
`aiProposalId`, impedindo nova incorporação mesmo se atualizar a inbox falhar.
É uma proteção do estado carregado no app, não uma transação entre dois
bancos: evitar revisão simultânea em múltiplas abas/dispositivos no piloto.
Se uma missão já incorporada for excluída e a atualização remota da inbox
tiver falhado, recusar a proposta pendente antes de tentar incorporá-la de novo.

## Referências oficiais

- [Autenticação das GPT Actions](https://developers.openai.com/api/docs/actions/authentication)
- [Actions em produção e confirmação](https://developers.openai.com/api/docs/actions/production)
- [REST Firestore: Firebase ID token versus IAM](https://firebase.google.com/docs/firestore/use-rest-api)
- [IAM e condições por banco](https://docs.cloud.google.com/firestore/native/docs/security/iam)
- [Identidade do Cloud Run](https://docs.cloud.google.com/run/docs/securing/service-identity)
- [Rules: campos permitidos e alterações](https://firebase.google.com/docs/firestore/security/rules-fields)
