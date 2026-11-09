# Planejamento por data — v1.9.77

A criação usava weekday/next_week e mantinha a referência da semana visualizada; next_week representava apenas a segunda-feira. O acesso “Hoje” também era o seletor de visão diária e apagava o contexto de navegação. As setas de semana só existiam no resumo semanal.

Agora o formulário usa uma data ISO validada por scheduleForDate, que calcula juntos day e planningWeekStart. A edição existente continua usando a mesma regra. Google Agenda mantém a data de origem bloqueada; o adaptador legado IA converte seu DTO de dia para data, sem alterar o contrato externo. O cadastro em outra semana calcula a ordem nessa semana sem reordenar registros da semana aberta.

Dia/Semana preservam o período. Navegação comum permite anterior/próxima/Hoje. Cada cartão semanal permite cadastrar com data predefinida. A navegação apenas renderiza e atualiza a caixa de entrada do calendário; não chama fechamento, gravação de missões ou concessão de recompensas. Semanas fechadas mostram histórico em ambos os modos.

planning_preview.v1.js calcula cópias para leitura, com marcadores planningPreview nunca persistidos. Regras de repetição respeitam início/fim/encerramento e ocorrências existentes; séries legadas têm previsão pelo padrão já registrado. Estudos fora da semana de seus estados mostram previsão sem reaproveitar conclusão, usando o último fechamento/semana legada como referência. Leituras continuam utilizando suas ocorrências por data. A previsão entra na carga diária. Somente o fechamento explícito continua materializando repetições da rotina antiga. Não há criação automática ao consultar uma semana.

Na criação de uma nova série, a data é o início: dias anteriores ficam de fora. Caso todos os dias marcados sejam anteriores na semana, a primeira ocorrência cai na semana seguinte. O fim é validado antes de qualquer inserção.

Não há migração de dados, novos documentos Firestore ou mudança de permissões/contrato IA. IDs, conclusões, subtarefas, vínculos e recibos existentes não são reescritos. Navegação não transfere pendências.

Limitação: a rotina de estudos continua sendo um modelo semanal; a previsão não fornece edição independente de estudos por semana. Repetições previstas são informativas até o fechamento explícito da semana anterior. A prévia visual gerenciada ficou indisponível nesta sessão (preview relay unavailable); não foi possível afirmar QA visual desktop/celular da versão nova. Testes automatizados verificam os handlers e HTML dos fluxos principais com dados sintéticos e sem escrita em produção.
