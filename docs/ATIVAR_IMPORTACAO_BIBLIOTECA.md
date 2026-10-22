# Ativar o catálogo pela IA · v1.9.71

O aplicativo e a conexão privada foram preparados e testados com dados fictícios.
O envio de livros **ainda depende destas alterações no Cloudflare existente**.
Nenhuma destas etapas exige limpar o Missão Tática, trocar perfil/campanha,
alterar regras Firestore, informar segredos no chat ou contratar outro serviço.

## 1. Adicionar a fila

No Cloudflare: **Storage & databases → D1 → missao-tatica-ai → Console**.
Execute somente o conteúdo de
[library-import-schema.sql](../ai/cloudflare/library-import-schema.sql).

O script usa `CREATE TABLE/INDEX IF NOT EXISTS`: pode ser repetido e não altera
as tabelas anteriores. Confirme a presença da tabela com:

```sql
PRAGMA table_info(ai_library_imports);
```

## 2. Atualizar o código da ponte

Em **Workers & Pages → missao-tatica-ai-bridge → Edit code**, substitua o código
pelo conteúdo completo de [worker-dashboard.js](../ai/cloudflare/worker-dashboard.js)
e publique. Preserve o binding **DB → missao-tatica-ai**, o segredo existente
e todas as variáveis que já estão configuradas. Não altere o código do app no GitHub
nem o Site privado nesta etapa: essas publicações são separadas.

## 3. Ativar a importação

No mesmo Worker: **Settings → Variables and Secrets → Add**.

- Tipo: variável de texto.
- Nome: `AI_LIBRARY_IMPORT_ENABLED`.
- Valor: `true`.

Salve/publique a alteração. As flags anteriores (`AI_V2_ENABLED`,
`AI_V2_READ_ENABLED`, `AI_V2_PROPOSALS_ENABLED` e `AI_V2_APPLY_ENABLED`) continuam
verdadeiras. Não crie outro segredo.

Abra o [diagnóstico da importação](https://missao-tatica-ai-bridge.victorduarteferreira1997.workers.dev/healthz?check=library).
O esperado é `libraryImportVersion: 1` e `enabled: true`. Esse diagnóstico
confirma código/variáveis; o primeiro lote validará o fluxo real e a tabela.

## Autorizar e usar

1. Atualize o Missão Tática. Entre em **Mais recursos → Biblioteca → Importar com IA**.
2. Clique em **Configurar autorização da importação**. Escolha **Permitir propostas
   de catálogo para a Biblioteca**, confira a prévia e autorize. Essa permissão não
   compartilha a estante com o GPT; os outros módulos só ficam selecionados se você
   os escolher/manter.
3. Na [conexão privada existente](https://missao-tatica-conexao.victorduarteferreira.chatgpt.site),
   reative **consultas autorizadas** e **envio de propostas** para a nova autorização.
   A conexão salva pode ser reutilizada: não preencha o segredo novamente.
4. Envie a planilha ao chat e peça ao plugin **Missão Tática — Conexão** para propor
   o catálogo. Confirme o mapeamento das colunas e o envio do lote. As ferramentas
   novas são `submitLibraryCatalog` e `listLibraryImports`. Se não aparecerem em um
   chat antigo após a atualização, abra uma nova conversa com a mesma conexão.
5. No app, abra **Biblioteca → Importar com IA → Revisar livros**. Corrija formatos
   ausentes, títulos, autores e demais campos; clique em **Conferir ajustes**, confira
   a seleção e use **Cadastrar selecionados**.

Partes vão para a Biblioteca, sem criar Missões ou sessões. Um livro na planilha
não é presumido como lido. Duplicados não substituem dados; formatos de livros
já existentes podem ser acrescentados pelo editor normal. Se o cadastro tiver
começado mas a confirmação falhar, escolha **Cadastro iniciado → Retomar cadastro**.
Não envie o mesmo lote com novos identificadores para tentar resolver uma falha.

## Validação e reversão

403 testes do aplicativo/servidor e 18 testes da conexão privada aprovados.
O teste de navegador executa a fila em Worker/SQLite de memória, com o app real e
Firebase simulado: revisão, valores finais, duplicados entre partes, confirmação
perdida, reload/retomada, desktop/celular de 390 px e isolamento de contas.
Nenhum teste leu ou gravou a estante real.

O primeiro envio real e o consentimento do proprietário permanecem a validar após
a ativação. A integração por IA continua exclusiva do proprietário; o catálogo
manual da esposa permanece disponível.

Para suspender, defina `AI_LIBRARY_IMPORT_ENABLED=false`. Preserve a tabela e os
comprovantes: não apague partes iniciadas nem altere as tabelas de propostas antigas.
Revogar o consentimento interrompe novos envios, mas não apaga o que já foi enviado
ao chat ou cadastrado após revisão. Partes existentes continuam acessíveis ao
proprietário para revisão no aplicativo.
