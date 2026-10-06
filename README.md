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

## Prestígio

O Prestígio é opcional e fica disponível no nível máximo (90.000 XP da
campanha). Após escolher um subtema e confirmar, a campanha é arquivada e a
próxima começa no título inicial escolhido, com 0 XP. Moedas, reserva,
medalhas, emblemas e registros permanecem intactos.
O XP da carreira soma os resultados das campanhas encerradas e o XP atual.
Desfazer registros de campanhas encerradas não reduz o XP da campanha atual;
registros novos continuam reversíveis. Medalhas preservadas não repetem bônus.
O estado `prestige` acompanha a sincronização e os backups JSON existentes.

O catálogo possui quatro categorias e quinze subtemas: Militar (Exército,
Marinha, Aeronáutica, Forças Especiais, Espionagem), Mitologias (Grega,
Romana, Nórdica, Egípcia), Ficção científica (Frota Espacial, Exploradores
Cósmicos, Marvel — Vingadores) e Fantasia (Ordem dos Cavaleiros, Magos e
Arcanistas, Guardiões da Floresta). Todos compartilham os quinze níveis e
limites de XP; somente títulos, referências e apresentação mudam. As
trajetórias são criadas para o aplicativo. Vingadores usa personagens como
referências, sem hierarquia de poder ou frases atribuídas a eles.

Campanhas antigas mantêm a trajetória original, que também pode ser repetida.
O QG > Progressão permite explorar o catálogo antes de atingir o requisito,
sem alterar o tema nem o XP atual. `prestige.themeId` pertence à campanha
ativa; o histórico guarda tema e título final da campanha encerrada. Ao
atingir o nível 15, cada subtema rende um único emblema permanente, sem XP
ou moedas adicionais. Repetir o subtema acrescenta histórico, sem duplicar
o emblema. A migração reconstrói os emblemas de campanhas antigas encerradas.

## Segurança

O token OAuth do Google fica somente na memória do navegador. Não adicione ao
repositório tokens, credenciais privadas, backups pessoais ou arquivos contendo
dados reais.
