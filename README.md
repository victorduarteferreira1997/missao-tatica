# Missão Tática

Aplicação pessoal de planejamento semanal com Missões, Semana, Radar, Estudos,
Finanças, Corpo, Pomodoro e gamificação por campanhas. Inclui sincronização
bidirecional com o Google Agenda, recompensas configuráveis e backups JSON.

## Multiusuário — Fase 1

A Fase 1 está implementada em **v1.9.62**, com publicação autorizada pelo
proprietário em 19/10/2026. Ele informou a atualização das regras de `(default)`
e confirmou o salvamento na nuvem antes da liberação do código. O acesso da
Sara depende da autorização administrativa do UID dela e dos testes reais.
A integração privada com IA continua exclusiva do proprietário.

- [Arquitetura e validação](docs/multiuser/README.md)
- [Autorização da Sara](docs/multiuser/AUTORIZAR_SARA.md)
- [Implantação e reversão](docs/multiuser/IMPLANTACAO.md)
- [Diagnóstico e baseline](docs/multiuser/DIAGNOSTICO.md)

## Acesso

- [Aplicação oficial](https://victorduarteferreira1997.github.io/missao-tatica/)
- [Endereço direto](https://victorduarteferreira1997.github.io/missao-tatica/app.html)

A versão atual é **v1.9.73**. A raiz, `teste_novos_modulos.html` e as prévias
estáticas v1.9.11/v1.9.13 encaminham para a aplicação oficial. Parâmetros e
fragmentos dos favoritos são preservados.

## Biblioteca: catálogo, leituras e planos · v1.9.70

Em **Mais recursos → Biblioteca**, cadastre livros e seus formatos/edições, busque,
registre leituras anteriores e marque intenção/período sem gerar compromissos.
Arquivados ficam ocultos e podem ser restaurados. Histórico, contas e backups são
preservados. Acompanhe páginas/percentual, registre sessões reais, releia mantendo
o histórico e planeje dias com término opcional. Um bloco recolhível **Estudos e
leituras** reúne as sessões do dia; leituras também aparecem na semana. Nenhuma
leitura vira Missão ou altera o Frenesi. A importação pela conexão GPT vem depois.

- [Modelo, preservação, validação e próximas etapas](docs/BIBLIOTECA.md)

A revisão de catálogo pela IA está preparada em **Biblioteca → Importar com IA**:
edite/desmarque livros, confira duplicados e retome partes interrompidas. Usa
permissão própria, sem compartilhar a estante. **A fila ainda depende da ativação
no Cloudflare**; até lá o aplicativo informa a pendência e mantém os fluxos atuais.

- [Ativar a importação na infraestrutura existente](docs/ATIVAR_IMPORTACAO_BIBLIOTECA.md)

## Exclusão e reagendamento sem penalidade · v1.9.68

Excluir ou mover uma missão preserva o Frenesi. A exclusão pede somente confirmação,
sem justificativa obrigatória, e avisa quando há pré-requisitos ou repetição.
Excluir não registra conclusão, não gera recompensas nem retira as já conquistadas.
O RADAR e as dependências das outras missões permanecem disponíveis para revisão.
A opção **Próxima semana** mantém um dia válido e move a data de planejamento.
Registros antigos de exclusão são preservados; combos já zerados não são recalculados.

## Concluídas no dia · v1.9.67

Missões pendentes aparecem primeiro. As finalizadas ficam em **Concluídas (N)**,
recolhida no final do mesmo dia e filtro. Abra para consultar, editar ou reabrir.
Concluir/reabrir preserva a ordem manual; arraste e botões de ordenação atuam
somente nas pendentes visíveis. Reuniões não realizadas não viram concluídas.
A alteração é visual, sem migração, exclusão ou cópia de registros. Recompensas,
dependências, RADAR, repetição, visão semanal e sincronização usam as regras atuais.

## RADAR, missões e subtarefas · v1.9.65

A semana inclui **Follow-ups do RADAR** por prazo, revisão ou retorno, mesmo sem
missão, e destaca **RADARs ativos sem missão executável**. Vínculos e dependências
são campos distintos. É possível vincular/desvincular missões atuais ou históricas
sem copiá-las; concluir uma missão oferece próximos passos sem encerrar o RADAR.
O editor de subtarefas preserva IDs e conclusões, permite inserção, edição,
exclusão, arraste e botões para ordenar. Propostas da IA exibem destino e data real.

[Diagnóstico, preservação, arquivos, testes e limitações](docs/UX_RADAR_MISSOES.md).

## Repetição com data final · v1.9.66

Em **Nova missão / Editar missão → Repetição**, escolha os dias e uma data final
opcional. O término é inclusivo e vale também para uma repetição em um único dia.
**Encerrar repetição…** preserva hoje, o passado e o trabalho iniciado, sem alterar
RADAR ou recompensas. As regras são persistentes e respeitadas na passagem de semana.
A edição da série informa sua data de vigência e preserva as ocorrências concluídas.
[Comportamento, compatibilidade e testes](docs/RECORRENCIA_MISSOES.md).

## Revisão das propostas da IA · v1.9.64

A revisão normaliza espaços do título e das subtarefas antes de cadastrar.
Alterar início ou duração ajusta o fim visível; alterar o fim recalcula a duração.
Erros são específicos e aparecem junto ao botão, com o rascunho preservado.
O cadastro mantém a fila aberta e confirma o salvamento na nuvem.

## Reinício e perfil · v1.9.63

A limpeza completa preserva os comprovantes internos de cadastros da IA, evitando
um falso conflito e o retorno de missões antigas ao reabrir. A conclusão só é
anunciada após confirmação na nuvem; durante a gravação, o perfil aguarda.
O cadastro inicial do perfil permite escolher o tema da campanha com prévia dos
títulos. Editar um perfil existente mantém a campanha e o progresso.

## Estrutura

| Caminho | Finalidade |
| --- | --- |
| `app.html` | Aplicação oficial |
| `calendar_sync.v2.js` | Sincronização atual com o Google Agenda; v1 preservada para prévias |
| `ui/` | Módulos de formulários, missões e visão semanal |
| `*.test.mjs` | Testes de integração e regras dos módulos |
| `index.html`, `teste_novos_modulos.html` | Entradas compatíveis com favoritos antigos |
| `preview_layout_verified.html` | Carregador único de prévias por commit e versão |
| `preview_layout_simplification.html` | Atalho para o carregador verificado |
| `preview_layout_v1_9_11.html`, `preview_layout_v1_9_13.html` | Atalhos históricos para a aplicação oficial |
| [Histórico das entregas](docs/HISTORICO.md) | Detalhes de campanhas, limpeza, exportação, foco e recompensas |

## Validação

A suíte completa, incluindo SQLite do D1, requer Node.js 24 ou mais recente. Execute na raiz do repositório:

```bash
TZ=America/Sao_Paulo node --test '*.test.mjs' 'ai/*.test.mjs'
```

Os testes cobrem regras, preservação de registros, migrações, inicialização,
montagem das telas e compatibilidade das entradas. Firebase é simulado; login,
gravação e sincronização reais precisam de validação manual em uma semana de teste.

## Prévia e publicação

`main` contém a aplicação oficial publicada pelo GitHub Pages. Antes de atualizar
essa branch, execute os testes e revise as mudanças na prévia.

O carregador verificado aceita `?v=v1.9.61&build=<SHA completo do commit>`.
Ele busca `app.html` desse commit e confere a versão declarada antes de exibi-la.
Sem parâmetros, abre a prévia validada v1.9.61 do commit
`5f5f20f177ff3df192529f6c6ab6cad3b7f79601`. Seus módulos de `ui/` são carregados
pelo endereço oficial; mudanças nesses módulos precisam manter compatibilidade
com as prévias que se pretende continuar usando.

O histórico do Git e a branch `backup/pre-layout-v1.9.10` ficam preservados para
consulta e recuperação. Não apague branches com commits ainda não incorporados.

## Segurança

O token OAuth do Google fica somente na memória do navegador. Não adicione ao
repositório tokens, credenciais privadas, backups pessoais ou arquivos contendo
dados reais.

## Entrada da Agenda · v1.9.61

Na aba **Semana**, os painéis Google Agenda e Entrada da Agenda ficam sempre
visíveis no topo, antes da **Semana Geral**. Os compromissos pendentes mantêm
as ações Classificar e Ignorar. Os estados de conexão, erros, atualização e
semana vazia continuam disponíveis; a lógica de sincronização não foi alterada.
A visão atual usa `ui/planning_views.v3.js`; v1/v2 permanecem para prévias antigas.

## Tarefas e reuniões · v1.9.60

No cadastro ou na edição de uma missão, escolha **Atividade → Tarefa/Reunião**.
Reuniões usam os estados Agendada, Realizada e Não ocorreu. Apenas tarefas têm
botão Foco. O campo Impacto (Normal/Logística/Recarga) continua independente.
Marcar Realizada utiliza as regras existentes; a sincronização nunca conclui
uma atividade ou concede recompensas automaticamente.

Eventos convertidos da Entrada da Agenda mantêm o vínculo pelo ID original.
Horários e dia são gerenciados no Google; uma remarcação pode levar o registro
para outra semana. Cancelamento confirmado é distinto de evento indisponível,
e registros de realização anteriores ficam preservados. Após a atualização,
recarregue o app para usar os módulos novos e sincronize a agenda conectada.

`Reunião · Coaktion` é reconhecida como reunião com título genérico. O aplicativo
não guarda organizadores, participantes, descrição, local ou links desse evento.
A origem também pode ser identificada por `extendedProperties.private.mtOrigin`
igual a `coaktion`; o título é normalizado mesmo se vier incorreto.

A ponte **Google Workspace da Coaktion → agenda pessoal** ainda precisa ser
configurada nas contas Google. Esta versão prepara o recebimento das cópias
sanitizadas, mas não cria acesso à agenda corporativa nem instala automações.
O teste real deve usar um evento genérico de teste: criar, converter uma vez,
mudar dia/horário, mudar de semana, cancelar e sincronizar novamente.

## Integração privada com IA

As consultas e propostas de missões, RADAR e estudos usam autorização por módulo
e revisão no app. Detalhes operacionais estão em [ai/README.md](ai/README.md).
A ponte não recebe acesso administrativo ao Firebase. Finanças e Corpo permanecem
manuais. Alterações na autorização exigem reativar a conexão privada; a rotina de
consulta não exige nova publicação manual da seleção semanal legada.

## Reagendamento por data · v1.9.73

No menu da missão, **Reagendar…** abre uma data de destino, Cancelar e Salvar.
Na edição, **Data da missão** substitui o seletor de dia para missões avulsas.
Semana e dia são calculados juntos, preservando ID, subtarefas, status e vínculos.
**Hoje** retorna ao dia real; o cabeçalho diário mostra a data e um aviso discreto
permite revisar pendências anteriores. Navegar não transfere missões automaticamente.

Concluídas, semanas fechadas e eventos do Google têm proteção; séries continuam
em Repetição. O reagendamento manual mantém os horários; Preparar próxima semana
mantém suas regras. A agenda gerenciada reconcilia o evento antigo após trocas de
semana, com fila recuperável. Não há migração ou correção automática de datas antigas.

[Diagnóstico, compatibilidade, arquivos e validação](docs/REAGENDAMENTO_MISSOES.md).

## Planejamento integrado

Use **Revisar planejamento** junto de Hoje, Semana e Radar para consultar alertas,
limites diários, pendências anteriores e histórico. Na criação/edição de missão,
abra **RADAR e pré-requisitos**. No RADAR, **Missões vinculadas** permite criar
uma missão já relacionada à demanda.

**Preparar próxima semana** abre uma revisão do fechamento: transfere pendências
sem horários fixos, renova recorrências sem duplicar recompensas e guarda até
12 semanas/320 KB. O histórico começa no primeiro fechamento e não reconstrói
semanas antigas. A confirmação informa quais semanas antigas sairão da retenção.
Eventos do Google continuam nas datas da agenda. Finanças e Corpo permanecem manuais.

Os alertas do aplicativo são calculados por regras locais. No ChatGPT, peça ao
plugin Missão Tática para revisar a semana com os módulos já autorizados. As
consultas atuais não incluem vínculos, dependências ou histórico fechado.
