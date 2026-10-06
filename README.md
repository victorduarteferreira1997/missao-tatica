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
TZ=America/Sao_Paulo node --test app_integrity.test.mjs calendar_sync.test.mjs security.test.mjs gamification.test.mjs
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

## Segurança

O token OAuth do Google fica somente na memória do navegador. Não adicione ao
repositório tokens, credenciais privadas, backups pessoais ou arquivos contendo
dados reais.
