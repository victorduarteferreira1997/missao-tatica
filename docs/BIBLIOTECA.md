# Biblioteca — catálogo, leituras e planos · v1.9.71

## Catálogo (etapas 1 e 2)

Acesso em **Mais recursos → Biblioteca**. Catálogo pessoal disponível para as contas
já autorizadas, incluindo contas independentes. Nenhum dado anterior é importado,
apagado, classificado como lido ou transmitido à IA automaticamente.

- Cadastro rápido: apenas título obrigatório; autor(es), categoria e observações opcionais.
- Um livro reúne até 20 formatos/edições, com identificação, páginas, ISBN, localização,
  link e indicação de posse. Nenhum arquivo PDF, e-book ou imagem é armazenado.
- Intenção independente: sem intenção, quero ler, reler ou revisar trechos/anotações.
  Um mês desejado é apenas intenção, sem geração de missões ou sessões.
- Leituras anteriores são acrescentadas exclusivamente por declaração do usuário.
  Datas de conclusão e edições são desconhecidas (`null`), nunca estimadas a partir
  do dia do cadastro. Registrar posse não registra conclusão.
- Histórico pode ser corrigido removendo um registro declarado, com confirmação.
  Registros vinculados a sessões/planos são protegidos.
- Busca por título, autor, categoria, edição, ISBN e localização. Arquivados ficam
  ocultos por padrão, têm filtro separado e podem ser restaurados.
- Exclusão definitiva somente para livro sem histórico, sessões ou planos. Livros
  com dados associados podem ser arquivados; leitura/plano ativo precisa ser pausado.
- Botões de salvar/cancelar ficam fixos e visíveis no formulário, inclusive no celular.
- Catálogo permanece aberto após ações. Busca preserva foco/caret e o formulário
  mantém rascunho/expansão/rolagem durante redraws. Alterações não salvas pedem descarte.
- Sem XP, moedas, energia, Frenesi, mudança de campanha ou criação de Missões.

## Acompanhamento e planejamento (etapas 3 e 4)

- Abas **Em leitura**, **Minha estante** e **Planejamento**. A abertura prioriza
  acompanhamentos não arquivados em andamento; o catálogo permanece acessível.
- Um acompanhamento aberto por livro, com uma edição definida, métrica em páginas
  ou percentual e posição inicial. Nova releitura é um novo ciclo, sem sobrescrever
  conclusões anteriores. Revisão de trechos não soma leitura completa ao histórico.
- Registro realizado informa data, posição e/ou minutos reais; anotação opcional.
  Tempo planejado não preenche o tempo real. Chegar à última página ou registrar
  uma sessão não conclui automaticamente o livro.
- Correção e remoção de registros recalculam o progresso desde a posição inicial.
  Leituras normais não podem regredir entre registros cronológicos; revisão de
  trechos pode. O total de páginas não pode invalidar nenhuma posição histórica.
- Concluir o acompanhamento é uma ação explícita, que encerra apenas seus planos
  abertos e preserva todas as sessões. Acompanhamentos concluídos e seus registros
  podem ser consultados/corrigidos em **Minha estante → Formatos e histórico**.
- Plano opcional: dias, início, término inclusivo opcional, minutos e horário opcional.
  Não cria Missões, recompensas, vínculo com RADAR ou blocos de estudo.
- Ocorrências são calculadas por data, com identidade `planId:sourceDate`; não são
  copiadas para o banco a cada semana. Não existe acúmulo automático de atrasadas.
  Uma remarcação guarda uma exceção e respeita o período do plano; cancelar uma
  sessão não encerra a leitura nem altera as demais datas.
- Pausar leitura pausa seus planos ativos. Retomar reativa somente esses planos,
  sem recuperar atrasos da pausa; planos pausados manualmente continuam pausados.
  Encerrar plano preserva os registros e oculta suas sessões ainda não realizadas.
- Editar dias/período preserva os registros reais, mesmo quando sua data deixa de
  corresponder ao padrão. Registros planejados realizados cedo/tarde aparecem na
  data real, sem uma segunda cópia na data original.
- Uma sessão planejada pode ter um registro parcial ou concluído; corrigir esse
  registro mantém seu ID. Chaves de requisição impedem repetição de uma gravação,
  e a assinatura do rascunho recusa ações sobre uma Biblioteca já alterada.
- No dia, um único bloco **Estudos e leituras** começa recolhido, mostra contagens,
  mantém a abertura ao agir e desaparece quando não há itens naquele dia. Os grupos
  são separados e os controles existentes de estudo são preservados. Na semana,
  leituras aparecem no respectivo dia, junto de missões e estudos.
- Formulários preservam rascunho, foco e ordem durante redraws, têm rodapé fixo e
  navegação por teclado; descartar edição não salva pede confirmação. O salvamento
  informa quando a confirmação em nuvem ainda está pendente.

## Importação assistida pelo GPT (etapa 5 — servidor a ativar)

Frontend e conexão privada estão preparados para **Biblioteca → Importar com IA**.
A implantação do servidor externo exige o procedimento em
[ATIVAR_IMPORTACAO_BIBLIOTECA.md](ATIVAR_IMPORTACAO_BIBLIOTECA.md). Enquanto o
Worker não for atualizado e ativado, a importação informa essa pendência e o
catálogo manual, leituras e módulos anteriores continuam disponíveis.

- A planilha é enviada ao chat, não ao aplicativo. O GPT confirma o mapeamento e
  propõe o catálogo usando `submitLibraryCatalog`; `listLibraryImports` consulta
  as partes enviadas. Conteúdo da planilha é tratado como dado, nunca instrução.
- Permissão `allowLibraryProposals` explícita, independente das consultas de outros
  módulos. Nenhum livro, anotação ou histórico da estante é incluído na projeção IA.
  A integração continua exclusiva do proprietário; outras contas mantêm uso manual.
- Até 20 livros / 12.000 bytes por parte, no máximo 50 partes por lote. O GPT deve
  manter `batchKey`, `partIndex`, `partCount`, `sourceKey` e `idempotencyKey` nas
  tentativas. Não remapear/redividir um lote já iniciado.
- Formatos do mesmo título/autor devem ser agrupados em uma entrada (até 5 edições
  por livro na importação; o editor normal continua permitindo 20).
- Formato desconhecido permanece vazio para resolução na revisão. Autoria, páginas,
  posse e leituras anteriores não são inferidas. Posse ausente = não informada;
  leitura anterior ausente = zero. Datas de conclusão antigas continuam desconhecidas.
- A revisão permite editar os campos, conferir ajustes e selecionar os livros.
  Duplicados exatos, inclusive arquivados, ficam fora; título igual com autoria
  diferente/incompleta exige seleção explícita. A conferência é local à estante.
- Não existe fusão automática: um livro existente não tem metadados substituídos
  nem recebe edições/leituras anteriores em silêncio. Acrescente formatos a um
  livro já cadastrado pelo editor normal.
- Cada parte é aplicada integralmente em uma transação confirmada da conta. Falha
  de validação/tamanho recusa a parte toda. Não cria Missões, planos, sessões reais,
  recompensas, eventos de calendário ou mudança de campanha.
- Estados: pendente, cadastro iniciado, cadastro concluído, recusada e expirada.
  Reserva guarda exatamente os valores e seleção revisados. Depois de iniciar,
  os campos ficam bloqueados e **Retomar cadastro** usa os mesmos dados.
- Comprovantes em `libraryData.imports` e `aiApplications` evitam duplicação mesmo
  se a confirmação da fila falhar. Fechar/reabrir e retomar não recria os livros.
  Nova proposta da mesma parte/conteúdo também não repete livros ou leituras antigas.
- Partes já importadas são reconhecidas pela chave do lote e índice; repetição de
  uma linha em outra parte ou mudança de divisão é recusada. Desmarcados são
  deliberadamente omitidos da parte, não pendências a cadastrar automaticamente.
- A fila tem paginação assinada (5 partes por página), até 100 abertas e 1.000
  marcadores; propostas pendentes expiram em 90 dias. Campos de partes encerradas
  expiram, enquanto marcadores permanecem. Partes com cadastro iniciado continuam
  recuperáveis. A guarda local de importação limita o estado a 720.000 bytes.
- A janela da Biblioteca permanece aberta; formulários preservam valores e têm
  rodapé fixo no desktop/celular. Troca de conta invalida trabalhos pendentes.

## Modelo aditivo e preservação

`libraryData` contém `version:1`, `books`, `editions`, `readings`, `plans`, `sessions`
e `imports`. Leituras, planos e sessões agora são utilizados; `imports` continua
reservado. O schema persistido permanece na versão 1, com campos aditivos. Os
arquivos `library.v2.js`, `ui/library.v2.js` e `ui/reading_activity.v1.js` implementam
a nova experiência; os módulos anteriores permanecem disponíveis para snapshots.

A inicialização adiciona a estrutura apenas quando ela não existe. Versões
incompatíveis ou malformadas são retidas intactas; o catálogo informa o problema
sem substituir os registros. Edição mantém IDs e campos extras; validação usa cópia
e só troca a estrutura após sucesso. Formulários detectam edição concorrente.

O módulo usa o estado já isolado em `users/{uid}/state/main` e o cache por UID.
Backup/restauração JSON incluem o objeto completo. A Biblioteca tem seleção própria
na limpeza de dados; limpar Missões, Estudos ou Gamificação a preserva. Reinício
completo a remove apenas por seleção e confirmação explícitas. Não é vinculada às
campanhas e não é varrida pela remoção de registros de campanhas antigas.

Uma guarda conservadora limita o JSON total do estado pessoal a 750.000 bytes
nas operações do catálogo, para deixar espaço para o envelope de nuvem. Ao exceder,
a operação é recusada sem alterações. O catálogo mostra até 100 resultados por
consulta, solicitando refinar a busca; os demais registros continuam preservados.

URLs são limitadas a HTTP(S), sem credenciais e com escaping no HTML; links abrem
com `noopener noreferrer`. ISBN é texto informativo, sem consulta externa automática.
Título/autor repetidos, inclusive arquivados, exigem editar o livro existente para
acrescentar formatos. Não há fusão silenciosa nem inferência de edições.

## Validação

- 403 testes automatizados aprovados (384 anteriores + 19 da importação).
- 18 testes da conexão privada aprovados (incluindo 3 novos de catálogo); build e validação ESM aprovados.
- Regressão do aplicativo e testes do catálogo: inicialização, alterações atômicas,
  formatos, datas desconhecidas, intenção independente, duplicados, histórico,
  referências protegidas, arquivamento, limite de tamanho e contas isoladas.
- Catálogo de 300 livros: IDs únicos e busca do último registro.
- Navegador desktop e celular de 390 px: formulários reais, rascunho/caret, filtros,
  confirmação/cancelamento, duas edições, edição/histórico, reload e conta membro.
- Navegador de leituras: início, plano, alterações finais, clique repetido, parcial,
  correção após conclusão, releitura, remarcação/cancelamento, estudos existentes,
  bloco diário/semanal, fechamento de confirmação, reload e troca de conta.
- Regressões do catálogo e de Missões diárias também aprovadas em desktop e 390 px.
- Navegador de importação: Worker/SQLite real em memória + formulários do app e
  Firebase simulado, valores finais, formato desconhecido, duplicados entre partes,
  confirmação perdida/reload/retomada, janela preservada e conta membro em 390 px.
- Serviços externos simulados: nenhum dado real consultado ou alterado nos testes.

## Próximas etapas

1. Ativar a fila no Cloudflare e validar o primeiro lote real com o proprietário.
2. Integração opcional de leitura com trilhas da Inteligência, sem duplicar registros.

Leituras ainda não são exportadas/sincronizadas com Google Agenda ou ICS.
Registros independentes de plano ficam no acompanhamento do livro; o bloco diário
exibe as sessões vinculadas ao planejamento. O estado continua em um documento
pessoal, com a guarda de tamanho descrita acima; não houve alteração de regras
Firestore nem exclusão ou recriação dos registros existentes. A importação adiciona
apenas uma nova tabela D1, sem alterar as filas ou os registros anteriores.

Integração Kindle, recomendações automáticas e armazenamento de PDFs ficam fora
desta entrega. O aplicativo não é um leitor de e-books nem sincroniza posição Kindle.
