# Histórico e detalhes das entregas

[Voltar ao README](../README.md)

## IA 2.0 — progresso de cadastro e posição da janela · 2026-10-14

- Proprietário confirmou cadastro real e permanência da fila aberta. Reabertura
  para comprovar persistência visual ainda não foi confirmada nesta conversa.
- Janela preserva rolagem, foco e seleção de texto ao redesenhar; digitação atualiza
  o rascunho sem esperar perda de foco, preservando linhas livres das subtarefas.
- Botão mostra progresso de salvamento/preparação/cadastro/confirmação com indicador
  visual e bloqueio de clique repetido. Rodapé do formulário permanece visível.
- Teste cobre posição, rascunho, progresso, segundo clique e conclusão com fila aberta.
  Conferência visual real do ajuste ainda pendente.

## IA 2.0 — cadastro habilitado após conferência do servidor · 2026-10-14

- Captura mostra AI_V2_APPLY_ENABLED=true em produção. Healthcheck real confirma
  applyVersion:1, enabled:true e consulta MCP real da fila passa sem erro.
- A consulta ativa usa o JOIN da tabela aditiva; instalação suficiente para leitura
  conferida, sem afirmar inspeção completa de constraints do D1.
- Frontend habilita revisão/cadastro e salvamento transacional. Wrangler registra
  flag ativa. Orientação de fechar abas antigas antes de usar o novo salvamento.
- Cadastro real, regras Firebase para revision/aiApplications e confirmação visual
  do formulário ainda pendentes de teste pelo proprietário.

## IA 2.0 — cadastro confirmado preparado · 2026-10-14

- Formulário edita os campos da proposta e calcula custos no app; cadastro mantém
  a fila aberta. Cancelar revisão mantém pendência.
- Reserva condicional no D1, missão + comprovante na mesma transação Firebase e
  confirmação posterior permitem recuperar falhas sem duplicar.
- Gravações normais usam conferência de conflitos após habilitar a etapa. Cópia
  local mais recente preservada para download ao carregar nuvem após conflito.
- Comprovantes persistem após exclusão/importação; cadastro não concede recompensas.
- 222 testes do app/Worker e 14 da conexão passaram, com fluxo integrado sintético.
  Flag de cadastro permanece desligada até instalação D1/Worker e conferência real.
- Teste real anterior confirmou criação da proposta, consulta e recusa sem fechar
  a janela. Consentimento e envio da etapa 1 também conferidos por capturas.

## IA 2.0 — instalação da fila de propostas conferida · 2026-10-14

- Capturas mostram execução bem-sucedida do SQL aditivo no D1, publicação do
  Worker, variável de produção ativa e healthcheck proposalsVersion:1, enabled:true.
- Frontend libera a permissão específica e a fila de consulta/recusa. Wrangler
  registra a flag ativa para preservar a configuração nos próximos deploys.
- Consentimento de propostas no app, ativação do envio no Site e envio real ainda
  precisam de conferência. Cadastro definitivo continua bloqueado até a etapa 2.

## IA 2.0 — propostas sem seleção semanal preparadas · 2026-10-14

- Nova fila independente para missões de qualquer categoria. Envio exige permissão
  explícita no app e ativação no Site; leitura existente não ganha escrita.
- Criação repetida não duplica; grant e versão conferidos na inserção. Novas
  propostas são bloqueadas após revogação, vencimento ou troca da autorização.
- App consulta e recusa sem fechar a fila. Cadastro definitivo permanece bloqueado
  até a etapa 2; planos de estudos e escrita no RADAR continuam para depois.
- Tabela aditiva, limpeza lógica após 90 dias e limites de capacidade. Instalação
  do Worker/D1 e conferência real pendentes; flag do frontend permanece desligada.
- Testes locais incluem fluxo Site → Worker, OAuth direto e regressões existentes.

## IA 2.0 — consultas instaladas e conferidas no ChatGPT · 2026-10-13

- Capturas confirmaram a publicação do novo Worker e healthcheck de leituras
  habilitado. A conexão privada foi ativada e testada no navegador.
- Resumo, missões, RADAR e estudos foram consultados com sucesso pelas quatro
  ferramentas do plugin no ChatGPT. Cópia fresca, totais coerentes e sem próxima
  página. RADAR real preenchido, OAuth direto real e esta versão no celular
  continuam sem conferência específica.
- Wrangler registra a flag ativa; painel do app informa consultas disponíveis
  e inclui link para a conexão privada. Propostas v2 e criação de planos ainda
  pertencem às próximas entregas.

## IA 2.0 — consultas de missões, RADAR e estudos preparadas · 2026-10-13

- Quatro ferramentas de consulta da projeção autorizada: resumo, missões, RADAR
  e estudos. Dados atuais/antigos/ausentes ficam identificados; disponibilidade
  permanece não verificada. Nenhuma consulta cria ou modifica registros.
- Listas paginadas com filtros explícitos e cursores assinados por grant/projeção.
- Tokens de leitura vinculados à autorização ativa, verificada antes de devolver
  dados. Revogação, expiração, substituição e alterações concorrentes são recusadas.
- Conexão no Site preserva credenciais criptografadas anteriores e exige ativação
  explícita das novas consultas. Não atualiza o grant salvo silenciosamente.
- OAuth direto ganha scope de leitura separado; tokens v1 não ampliam acesso.
- Testes do Worker e Site, bundle reproduzível e instruções do plugin atualizados.
  Instalação do Worker, ativação da nova flag e consultas reais ainda pendentes.

## IA 2.0 — instalação e ativação do painel de consentimento · 2026-10-13

- Criação da tabela aditiva confirmada pelo Console D1. Worker publicado com
  a fundação v2; variável ativa e binding de produção confirmados no painel.
- Healthcheck público retornou `foundationVersion:1, enabled:true`.
- Flag do frontend habilitada para abrir o painel e revisar o compartilhamento;
  módulos e inclusão de registros futuros continuam exigindo consentimento no app.
- Wrangler registra a variável ativa para preservar a configuração em deploys futuros.
- Capturas do app confirmaram autorização e sincronização dos três módulos com
  registros futuros, revogação e nova autorização/sincronização. Estado revogado
  exibiu última sincronização removida; a nova autorização recebeu novo prazo.
- Ferramentas MCP v2 e criação de planos de estudos continuam para a próxima entrega.

## IA 2.0 — fundação 1A preparada · 2026-10-13

- Consentimento de 30 dias, missões/RADAR/estudos por módulo, prévia e novos
  registros opt-in. Flags desligadas até instalar banco/Worker e validar.
- Projeção mínima com referências opacas, progresso agregado de estudos,
  limites de bytes/entidades e versões condicionais. Revogar apaga a cópia.
- Escritor Firebase captura snapshot imutável, serializa gravações nesta sessão
  e retorna resultado; sincronização v2 só recebe snapshots confirmados.
- Novas rotas são exclusivas do proprietário; ferramentas MCP e propostas v2
  ainda não foram liberadas. Concorrência entre dispositivos continua pendente.
- Migração SQL aditiva, bundle gerado e roteiro de instalação em ai/README.md.
- Testes abrangem SQL real, Auth/App Check, consentimento, omissões, limites,
  falhas, sessão, montagem do app e regressão v1. Teste real/visual pendente.


## Retorno à integração após cadastrar proposta IA · 2026-10-13

- Cadastrar uma proposta retorna automaticamente à caixa de entrada, permitindo
  revisar a próxima sem procurar o botão no rodapé.
- A lista remove a proposta após confirmar a revisão e mantém filtros e seleção
  de contexto. Ao terminar, permanece aberta com a indicação de nenhuma pendência.
- Falhas de confirmação aparecem na própria integração; o vínculo já gravado
  na missão continua impedindo cadastro duplicado.
- Testes cobrem cadastros consecutivos, lista vazia, erro, fechamento manual,
  troca de sessão e o formulário real. Persistência e contratos continuam v1.

## Caixa de entrada IA com propostas primeiro · 2026-10-13

- `ui/ai_inbox.v3.js` coloca propostas para cadastro no topo e recolhe a seleção
  de contexto, preservando o fluxo de revisão no formulário existente.
- Concluídas ficam ocultas; caixas de compartilhamento recebem rótulo explícito
  e não são controles de conclusão.
- Missões antigas sem semana identificada ficam separadas e ocultas por padrão;
  nenhuma data é deduzida, nenhum registro é apagado ou migrado.
- Filtros preservam índices de seleção, retiram itens escondidos da seleção e
  invalidam a prévia. Vínculos explícitos de outra semana não são oferecidos.
- Contratos v1, Firebase, calendário, recompensas e confirmação D1 permanecem
  nos mesmos fluxos. A limitação de persistência/concorrência da IA v1 continua.
- Testes verificam ordenação, estado recolhido, filtros, índices, mudança de
  semana, consentimento e ausência de mutações nas missões.

## Entrada da Agenda · v1.9.61 · 2026-10-07

- Google Agenda e Entrada da Agenda voltam a ficar visíveis antes da Semana Geral,
  sem depender da expansão de um grupo no final da página.
- Painéis, itens e botões acompanham as bordas, tipografia e espaçamentos compactos.
- Estados conectado, desconectado, sincronizando, erro e sem pendências mantêm
  suas ações; IDs usados na atualização dos painéis permanecem iguais.
- `calendar_sync.v2.js`, OAuth, persistência, vínculos e classificação não mudam.
- A visão v3 preserva os módulos v1/v2 usados por prévias anteriores.
- Testes cobrem a montagem completa, visibilidade, ordem, ações e atualização
  dos painéis com compromissos simulados; não executam operações nas contas Google.

## Tarefas e reuniões · v1.9.60 · 2026-10-07

- Cadastro e edição permitem distinguir atividade de seu impacto de gamificação.
- Reuniões têm identificação discreta em Missões e Semana, estados Agendada,
  Realizada e Não ocorreu, e não entram no seletor do Pomodoro.
- Reuniões não realizadas não contam como pendência da semana nem são exportadas
  para a agenda secundária. Realização registrada é uma ação manual.
- Entrada do Google reconhece `Reunião · Coaktion` e remove metadados pessoais
  e confidenciais antes da persistência. Esses espelhos não recebem patches de cor.
- Vínculos seguem o ID original, incluindo remarcação para outra semana, cancelamento
  confirmado e restauração. Evento ausente é consultado individualmente; 404 resulta
  em aviso de indisponibilidade, sem afirmar cancelamento.
- Preparar próxima semana preserva os vínculos da agenda, sem repetir os eventos.
- Novas revisões de calendário e UI preservam os módulos das prévias anteriores.
- Testes de integração e montagem usam dados simulados; a ponte entre a conta
  Workspace e a conta pessoal ainda precisa ser configurada e validada nas contas reais.

## Manutenção do repositório · 2026-10-06

- Prévias estáticas v1.9.11 e v1.9.13 passam a abrir a aplicação oficial.
- A prévia de simplificação encaminha para o carregador único verificado,
  preservando versão, commit e fragmento de links existentes.
- README concentra acesso, estrutura, validação e publicação; detalhes das
  entregas anteriores ficam neste documento.
- A aplicação permanece na v1.9.59; esta manutenção não altera seus dados ou regras.

## Publicação principal · v1.9.59

A versão revisada está na aplicação oficial, com os mesmos arquivos de código
validados na prévia `c3a974c4e82589e5a3fd35d739b3aac7ea565054`. A raiz e o
endereço antigo redirecionam para `app.html`, preservando parâmetros e fragmento.
As prévias continuam aceitando commits e versões explícitos; sem parâmetros,
abrem a v1.9.59. Os endereços históricos de prévia são preservados como redirecionamentos; os
arquivos originais continuam disponíveis no histórico do Git.

A publicação mantém Firebase, autorização do proprietário, chave do estado local
e integração com Agenda. A revisão automatizada inclui inicialização completa
com estado vazio/anterior, alvos configurados, preservação de registros e montagem
de Missões, Semana, Radar e todas as abas de QG, Estudos, Finanças e Corpo.
Serviços Firebase são simulados nesses testes; login e sincronização reais não
são declarados como validados por eles. O commit principal anterior
`5c611623c45999c65b5dfc90c499f5134b693306` fica preservado no histórico para reversão.

## Campanhas e Prestígio

O QG > Progressão > Gerenciar campanha permite recomeçar a qualquer momento,
com seleção de tema, subtema, modo e revisão do impacto antes de confirmar.
Arquivar e recomeçar preserva moedas e registros pessoais. Progresso zerado
zera moedas, reserva, alvo, combo e estatísticas e restaura a bateria; apagar
histórico ou registros pessoais exige escolhas adicionais explícitas.

Uma campanha encerrada antes do nível máximo não concede Prestígio nem
emblema de conclusão. Campanhas que alcançaram 90.000 XP contam como
concluídas. IDs são monotônicos, inclusive após excluir histórico. O XP da
carreira soma resultados arquivados e XP atual; excluir histórico remove a
parcela correspondente. Desfazer um ganho antigo não desconta XP nem moedas
da campanha nova. Ganhos atuais continuam reversíveis.

O catálogo tem quatro temas e quinze subtemas: Militar (Exército, Marinha,
Aeronáutica, Forças Especiais, Espionagem), Mitologias (Grega, Romana,
Nórdica, Egípcia), Ficção científica (Frota Espacial, Exploradores Cósmicos,
Marvel — Vingadores) e Fantasia (Ordem dos Cavaleiros, Magos e Arcanistas,
Guardiões da Floresta). Todos compartilham quinze níveis e limites de XP.
Campanhas antigas conservam a trajetória original, que pode ser repetida.
As trajetórias são fictícias; os personagens dos Vingadores são referências
sem hierarquia de poder nem frases atribuídas a eles.

A coleção separa medalhas da campanha atual, conquistas por campanha da
carreira e marcos globais. Títulos de medalhas variam com o tema. Dois novos
critérios reconhecem dez focos e vinte missões da campanha; as missões são
registradas por conclusão e atravessam semanas. Emblemas são únicos por
subtema concluído. Bônus de medalhas são concedidos uma vez por critério na
carreira: um recibo de IDs já premiados evita repetir bônus através de
reinícios ou exclusões, sem preservar o progresso visível apagado.

O histórico guarda resultado, título final, eventos de promoção e medalhas
com datas ISO. Datas anteriores não registradas ficam nulas, nunca estimadas.
O perfil aplica linguagem feminina, masculina ou sem gênero nas superfícies
de progressão, catálogo, emblemas e histórico. A prévia do perfil não salva
alterações até a confirmação de Salvar perfil.

Registros novos recebem `campaignId`; registros anteriores sem origem
conhecida recebem null. A exclusão de dados vinculados é opcional, apresenta
contagens por módulo e preserva registros de outras campanhas. Incluir
registros antigos sem campanha exige uma segunda escolha explícita. Revisões
de outras campanhas são desvinculadas de sessões apagadas, sem serem
excluídas. Ganhos atuais de registros removidos são descontados, inclusive
bônus de missões revertidas. Configurações, perfil e cadastros estruturais
(disciplinas, rituais, orçamentos etc.) ficam preservados. A exclusão do
histórico recalcula emblemas e conquistas mantendo as obtidas em campanhas
restantes. O estado acompanha sincronização e backups JSON existentes.

## Limpeza por módulo

No rodapé, `Dados e reinício → Gerenciar dados` abre um painel com seleção
independente para Missões, Estudos, Finanças, Corpo, Pomodoro, Rituais,
Recarga, Radar, Recompensas, Gamificação e Perfil. A entrada fica recolhida
e nenhuma área vem selecionada. O painel apresenta cadastros e históricos
afetados, resumo, backup completo opcional e confirmação antes da limpeza.

Limpar módulos preserva XP, moedas e campanhas. A seleção Gamificação zera
também todo o progresso e inicia uma campanha vazia, mantendo o tema atual
e um ID novo quando existem outros dados preservados. Registros antigos não
voltam a premiar a nova campanha. Recompensas e perfil são escolhas separadas.
Selecionar todas as áreas restaura o estado inicial, campanha original e
perfil vazio. Cadastros padrão reaparecem; personalizados são removidos.

A conexão e a identidade de sincronização com o Google permanecem. Na
próxima sincronização, eventos removidos do planejamento da semana visível
podem ser apagados no calendário gerenciado Missão Tática; compromissos da
agenda principal permanecem e podem reaparecer na entrada da agenda.
O painel bloqueia a execução com cronômetro ativo, avaliação ou compra
pendente, carregamento de estado ou sincronização de agenda em andamento.
Cronômetros pausados são preservados na limpeza de módulos não relacionados.

Exportar backup JSON guarda todo o estado do aplicativo. A importação
existente substitui esse estado inteiro, sem mesclar campanhas. Os testes
executam a exportação, o reinício e a restauração reais com dados sintéticos.

## Recarga e Rituais

As janelas usam cabeçalho fixo, conteúdo rolável, fonte de leitura e teclado
do módulo compartilhado de diálogos. Recarga destaca a bateria, opções por
tempo (até 5 minutos, até 15 minutos ou todas) e o registro após a pausa.
Não inicia um cronômetro. HP mostrado respeita o espaço disponível na
bateria; padrões continuam gratuitos e sem XP. Configurações e ações
personalizadas anteriores são preservadas.

Rituais mostra a rotina de hoje, separados por manhã e noite, com conclusão
individual e contagem por período. Zero XP é exibido corretamente. Cada
ritual continua limitado a uma conclusão por dia local, inclusive com IDs
numéricos ou textuais de backups. Datas desconhecidas não viram conclusões
de hoje. Novos registros guardam título e período, XP da campanha e HP
planejado/aplicado, respeitando o limite da bateria.

Criação, ajustes, histórico e gerenciamento ficam recolhidos por padrão.
As duas áreas permitem arquivar/restaurar cadastros sem remover registros.
O histórico oferece hoje ou todos os registros, com páginas de dez itens e
datas antigas desconhecidas explícitas. Reconstruções da interface mantêm
rascunhos, seções, rolagem e foco; salvar limpa o rascunho correspondente.
Títulos, descrições e IDs são escapados antes de entrar no HTML.

## Tesouraria e Estudos · v1.9.54

Tesouraria começa com resultado estimado, receitas, contas fixas e gastos
variáveis. O filtro oferece todo o histórico (padrão), mês atual ou anterior.
As contas fixas não possuem competência mensal: continuam aparecendo e
entrando no cálculo em qualquer período, pagas ou pendentes. O status é manual.
O resultado não é saldo bancário; a explicação completa fica recolhida.
Datas ausentes/inválidas ficam acessíveis em todo o histórico. Datas sem horário
são tratadas como datas locais, sem deslocar o primeiro dia do mês.

Cadastros e contexto dos gastos começam recolhidos. Há páginas de dez registros,
exclusão confirmada e valores formatados em reais. Novos valores positivos são
validados e somados em centavos; descrições e IDs importados são escapados.
Revisão de compras conserva as regras e os bônus existentes; novos registros do
diário guardam XP e campanha para permitir exclusão futura correta.

Estudos conserva as oito abas em quatro áreas com navegação compacta e cabeçalho
fixo. Confiança, barreiras e questões continuam disponíveis em seções opcionais
recolhidas. Duração e questões inválidas não são registradas. Minutos de blocos
concluídos são identificados como minutos do plano, distintos de sessões reais.
Tesouraria e registro de estudos preservam rascunhos entre abas e reconstruções,
incluindo seleções, seções, foco e rolagem. Salvar ou limpar o módulo remove o
rascunho correspondente. As janelas têm título acessível, Escape e controle de Tab,
sem interferir em confirmações sobrepostas.

## Exportação financeira Excel · v1.9.55

Em Tesouraria, **Exportar planilha (.xlsx)** baixa um arquivo Excel com todo o
histórico financeiro, independentemente do filtro da tela. Anexe o arquivo no
chat do consultor financeiro. A exportação é somente leitura e ocorre no
navegador, sem enviar dados a um novo serviço nem exigir bibliotecas de rede.

Abas: Resumo, Por mês, Receitas, Contas fixas, Gastos, Diário, Dívidas, Metas e
Orçamentos. As coleções vazias continuam identificadas. Campos adicionais dos
registros mantêm colunas próprias; outros campos financeiros ficam em Dados
adicionais. Textos acima do limite de uma célula são preservados em partes na
aba Textos longos. IDs e datas originais são texto, valores monetários são
numéricos, cabeçalhos ficam fixos e as listas oferecem filtros.

O resumo explica escopo, cálculo estimado, competência ausente das contas fixas,
datas/valores inválidos e limites da análise. Dívidas, metas e orçamentos são
incluídos como registrados sem duplicar o desconto no resultado estimado.
O quadro mensal agrupa receitas e gastos variáveis por data local; não atribui
contas fixas a meses nem interpreta diferenças como saldo disponível.

Este XLSX serve para consulta. A importação no aplicativo continua usando o
backup JSON completo. Descrições iniciadas por símbolos de fórmula são células
de texto. Os testes abrem o pacote ZIP/XLSX com leitor independente (`openpyxl`
em Python) e verificam registros, tipos, datas, textos longos e recursos de download.

## Corpo e Pomodoro · v1.9.56

Corpo começa com resumo dos registros, últimos sete dias locais (incluindo hoje)
e último treino com data válida. Datas futuras/inválidas não entram no período;
continuam acessíveis no histórico. Não há alerta fictício de 999 dias sem treinar
nem avaliação de condição física baseada no HP do jogo.

Treinos, medidas e check-ins possuem formulários recolhidos e histórico completo
com dez registros por página. O check-in não preenche sono/água automaticamente;
campos opcionais ficam sem informação. Valores inválidos não são registrados.
As regras existentes de XP/HP são preservadas; novos treinos guardam o efeito
real na bateria, inclusive quando há limite de HP. Rascunhos e rolagem são
preservados entre abas/reconstruções e limpos após salvar ou limpar o módulo.

Pomodoro mostra Foco/Pausa, ciclo e ações Iniciar, Retomar, Pausar e Reiniciar.
Ajustes e histórico continuam recolhidos. O botão **Salvar e reiniciar ciclo**
explica o efeito já existente de salvar os tempos. Os campos digitados e seções
abertas sobrevivem às reconstruções da tela. O histórico oferece todos os
ciclos avaliados com paginação, notas e duração, além do gráfico por tarefa.
A pontuação é identificada como autoavaliação, mantendo a fórmula e os bônus.
Missão travada, tempo restante, pausas, recompensas e a saída para missões
continuam seguindo o comportamento anterior.

## Pomodoro livre · v1.9.57

O botão **Pomodoro livre**, na navegação principal, abre o timer sem depender
de uma missão, inclusive quando não há missões pendentes e a visão atual é
Semana/Radar. Informe uma atividade opcional e inicie. A atividade fica travada
até concluir/reiniciar o ciclo. Voltar às missões pausa e mantém o tempo restante;
abrir Pomodoro livre novamente permite retomar.

Ciclos livres têm ID de missão nulo e a atividade aparece no histórico de foco.
Nunca usam a missão selecionada como fallback, nem criam/concluem tarefas.
Pausas, XP, moedas, bateria e avaliação seguem as regras atuais. O modo escolhido
é preservado como contexto da tela, sem introduzir persistência do cronômetro.

Trocar entre missão e livre exige confirmação se houver ciclo iniciado, pausado
ou pausa em curso. Cancelar preserva o ciclo; confirmar reinicia sem recompensa.
Uma avaliação pendente precisa ser salva/pulada antes do próximo ciclo. Testes
cobrem a renderização sem missões, IDs exatos, atividade congelada, trocas,
confirmações antigas, histórico e texto escapado.

## Catálogo de recompensas · v1.9.58

A aba **Recompensas** do QG abre com cinco opções pequenas (até 250 MT).
Filtros separam pequenas, médias, grandes, personalizadas e todas. Cinco novas
opções vão de 100 a 700 MT: música favorita, jogo em dupla, cinema em casa,
passeio escolhido e livro escolhido. MT não representa dinheiro real; o resgate
registra uma escolha que a pessoa realiza fora do aplicativo.

Cadastro, gestão, catálogo anterior e histórico ficam recolhidos. Os IDs e
preços oficiais anteriores continuam iguais; Pausa Total e Doce/Junk Food
permanecem no catálogo anterior para preservar metas e registros existentes.
Descanso e necessidades básicas não dependem de moedas. O saldo e a meta
mantêm sua apresentação; Ver recompensas abre o filtro correspondente ao alvo.

Resgatar exige confirmação e verifica novamente saldo, preço, disponibilidade
e campanha. Mantém gasto semanal antes da reserva, limite semanal, bônus de
bateria e regras de medalhas. Novos registros guardam a campanha de origem;
registros antigos mantêm seus snapshots. Personalizadas arquivadas podem ser
restauradas, sem apagar resgates; arquivar o alvo remove essa meta. Custos
novos precisam ser inteiros de pelo menos 50 MT. IDs importados podem ser texto.

O histórico possui todas as páginas (10 registros por página). Textos e IDs
importados são escapados. Rascunhos, seções abertas, rolagem e posição de edição
são preservados nas reconstruções do QG; limpeza de Recompensas também limpa
seus rascunhos. Testes cobrem compatibilidade, filtros, alvos, resgates, saldo,
confirmações antigas, arquivamento, paginação e edição.

## Configuração de recompensas · v1.9.59

**Configurar**, em cada cartão do QG → Recompensas, abre um único editor com
nome, custo em MT, duração opcional em minutos e descrição. Por exemplo,
Videogame pode ter 120 minutos (2 h). Duração e custo são escolhas independentes;
o aplicativo não recalcula o preço automaticamente. A configuração é por conta,
permanece no estado salvo/local, na sincronização existente e no backup JSON.

O catálogo oficial mantém seus IDs e padrões. Ajustes são guardados em
`rewardOverrides`; **Restaurar padrão** exige confirmação. Personalizadas
podem ser editadas mantendo IDs e resgates antigos. O alvo correspondente
acompanha nome, duração e preço; moedas e histórico anteriores não mudam.
Novos resgates guardam a duração escolhida. Limpar Recompensas também apaga
as configurações e fecha o editor; limpar outras áreas as preserva.

Custo precisa ser inteiro de pelo menos 50 MT. Duração, quando informada,
precisa ser um inteiro positivo. Cancelar preserva o catálogo. Trocar a opção
em edição pede confirmação para descartar o rascunho. Confirmações antigas de
resgate não aceitam configurações alteradas, e editores antigos não sobrescrevem
mudanças recebidas por importação/sincronização ou troca de campanha.

