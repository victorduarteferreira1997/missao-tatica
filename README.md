# Missão Tática

Aplicação pessoal de planejamento semanal com Missões, Semana, Radar, Estudos,
Finanças, Corpo, Pomodoro e gamificação por campanhas. Inclui sincronização
bidirecional com o Google Agenda, recompensas configuráveis e backups JSON.

## Acesso

- [Aplicação oficial](https://victorduarteferreira1997.github.io/missao-tatica/)
- [Endereço direto](https://victorduarteferreira1997.github.io/missao-tatica/app.html)

A versão atual é **v1.9.59**. A raiz, `teste_novos_modulos.html` e as prévias
estáticas v1.9.11/v1.9.13 encaminham para a aplicação oficial. Parâmetros e
fragmentos dos favoritos são preservados.

## Estrutura

| Caminho | Finalidade |
| --- | --- |
| `app.html` | Aplicação oficial |
| `calendar_sync.js` | Sincronização com o Google Agenda |
| `ui/` | Módulos de formulários, missões e visão semanal |
| `*.test.mjs` | Testes de integração e regras dos módulos |
| `index.html`, `teste_novos_modulos.html` | Entradas compatíveis com favoritos antigos |
| `preview_layout_verified.html` | Carregador único de prévias por commit e versão |
| `preview_layout_simplification.html` | Atalho para o carregador verificado |
| `preview_layout_v1_9_11.html`, `preview_layout_v1_9_13.html` | Atalhos históricos para a aplicação oficial |
| [Histórico das entregas](docs/HISTORICO.md) | Detalhes de campanhas, limpeza, exportação, foco e recompensas |

## Validação

Requer Node.js 18 ou mais recente. Execute na raiz do repositório:

```bash
TZ=America/Sao_Paulo node --test app_integrity.test.mjs calendar_sync.test.mjs security.test.mjs gamification.test.mjs data_cleanup.test.mjs recovery_ui.test.mjs finance_study.test.mjs finance_export.test.mjs health_focus.test.mjs rewards_ui.test.mjs startup.test.mjs
```

Os testes cobrem regras, preservação de registros, migrações, inicialização,
montagem das telas e compatibilidade das entradas. Firebase é simulado; login,
gravação e sincronização reais precisam de validação manual em uma semana de teste.

## Prévia e publicação

`main` contém a aplicação oficial publicada pelo GitHub Pages. Antes de atualizar
essa branch, execute os testes e revise as mudanças na prévia.

O carregador verificado aceita `?v=v1.9.59&build=<SHA completo do commit>`.
Ele busca `app.html` desse commit e confere a versão declarada antes de exibi-la.
Sem parâmetros, abre a prévia validada v1.9.59 do commit
`c3a974c4e82589e5a3fd35d739b3aac7ea565054`. Seus módulos de `ui/` são carregados
pelo endereço oficial; mudanças nesses módulos precisam manter compatibilidade
com as prévias que se pretende continuar usando.

O histórico do Git e a branch `backup/pre-layout-v1.9.10` ficam preservados para
consulta e recuperação. Não apague branches com commits ainda não incorporados.

## Segurança

O token OAuth do Google fica somente na memória do navegador. Não adicione ao
repositório tokens, credenciais privadas, backups pessoais ou arquivos contendo
dados reais.

## Integração privada com IA (em preparação)

A ponte de GPT Actions, contexto selecionado e caixa de entrada estão em
[ai/README.md](ai/README.md). A integração fica desligada por padrão até a
validação da ponte Cloudflare Workers + D1 e da prévia; não está publicada
nem conectada. O Firebase original permanece no plano Spark e sem acesso
administrativo concedido à ponte.
