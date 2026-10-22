# Biblioteca — catálogo · v1.9.69

## Entrega atual (etapas 1 e 2)

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

## Modelo aditivo e preservação

`libraryData` contém `version:1`, `books`, `editions`, `readings`, `plans`, `sessions`
e `imports`. As últimas três estruturas estão reservadas para as próximas etapas;
a interface atual não cria planejamento ou importações.

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

- 369 testes automatizados aprovados.
- Regressão do aplicativo e testes do catálogo: inicialização, alterações atômicas,
  formatos, datas desconhecidas, intenção independente, duplicados, histórico,
  referências protegidas, arquivamento, limite de tamanho e contas isoladas.
- Catálogo de 300 livros: IDs únicos e busca do último registro.
- Navegador desktop e celular de 390 px: formulários reais, rascunho/caret, filtros,
  confirmação/cancelamento, duas edições, edição/histórico, reload e conta membro.
- Serviços externos simulados: nenhum dado real consultado ou alterado nos testes.

## Próximas etapas já definidas

1. Acompanhamento de leitura: progresso por edição, correção e releituras.
2. Planejamento opcional e bloco compacto **Estudos e leituras**, oculto quando vazio,
   com contagens de sessões, detalhes sob demanda e preservação das telas de estudo.
3. Importação assistida pelo GPT: ampliar consentimento, projeção, contrato de
   propostas, backend e revisão em lote, com deduplicação/retomada. A ponte atual
   continua aceitando apenas Missões, RADAR e Estudos; não recebe livros nesta versão.
4. Integração de uma leitura com trilhas da Inteligência após a base, sem duplicar registros.

Integração Kindle, recomendações automáticas e armazenamento de PDFs ficam fora
desta entrega. O aplicativo não é um leitor de e-books nem sincroniza posição Kindle.
