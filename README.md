# Missão Tática

Aplicação pessoal de planejamento semanal com sincronização bidirecional com o Google Agenda.

## Acesso

- Aplicação oficial: <https://victorduarteferreira1997.github.io/missao-tatica/>
- Endereço direto: <https://victorduarteferreira1997.github.io/missao-tatica/app.html>

`index.html` redireciona a URL raiz para a aplicação oficial. O antigo endereço
`teste_novos_modulos.html` também é mantido somente como redirecionamento para
não quebrar favoritos existentes.

## Estrutura

| Arquivo | Finalidade |
| --- | --- |
| `app.html` | Aplicação oficial |
| `calendar_sync.js` | Integração bidirecional com o Google Agenda |
| `calendar_sync.test.mjs` | Testes automatizados da sincronização |
| `index.html` | Entrada pela URL raiz |
| `teste_novos_modulos.html` | Compatibilidade com o endereço antigo |

## Validação

Requer Node.js 18 ou mais recente:

```bash
TZ=America/Sao_Paulo node --test app_integrity.test.mjs calendar_sync.test.mjs security.test.mjs gamification.test.mjs data_cleanup.test.mjs recovery_ui.test.mjs finance_study.test.mjs
```

Antes de publicar uma mudança:

1. executar o teste automatizado;
2. abrir a aplicação e validar login, gravação e sincronização;
3. confirmar o comportamento em uma semana de teste antes de usar dados reais.

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

## Segurança

O token OAuth do Google fica somente na memória do navegador. Não adicione ao
repositório tokens, credenciais privadas, backups pessoais ou arquivos contendo
dados reais.
