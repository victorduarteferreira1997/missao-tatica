# Autorizar a conta da Sara

Este procedimento é manual e só deve ser executado após autorização para a etapa de configuração/produção. Nada foi cadastrado automaticamente durante o desenvolvimento.

1. Confirme no Firebase Console o projeto `missao-tatica` e abra **Authentication → Users**. Se a conta Google da Sara já existir, abra o registro e confira pessoalmente o email e o UID.
2. Se ainda não existir, no momento aprovado para o primeiro acesso, Sara entra com sua própria conta Google. O Firebase cria a identidade de autenticação, mas o aplicativo bloqueia os módulos e não cria o estado enquanto não houver autorização. A nova tela informa o **UID** para o administrador. Se for utilizado o aplicativo antigo antes da publicação, ele recusará o acesso e o administrador obtém o UID pela lista do Authentication.
3. Confira que o UID informado corresponde ao email da Sara no Console. Não autorize um UID recebido sem essa conferência. UID é identificador público; não é senha nem token. Não solicitar credenciais dela.
4. No **Firestore Database**, selecione explicitamente o banco **`(default)`**, e confira que as regras revisadas desta fase já foram aplicadas pelo procedimento aprovado. Não usar o banco `missao-tatica-ai`.
5. Crie o documento **`appAccess/UID_REAL_DA_SARA`** com os campos:

   | Campo | Tipo | Valor |
   | --- | --- | --- |
   | `enabled` | boolean | `true` |
   | `role` | string | `member` |

   Substitua o ID do documento pelo UID real. Não cadastrar outros membros nesta fase. O proprietário mantém a autorização original e não precisa desse documento.
6. Sara entra novamente. O aplicativo cria apenas `users/UID_DA_SARA` e `users/UID_DA_SARA/state/main`, com estado independente, e abre o perfil para escolher nome e apresentação dos títulos. Categorias, objetivos de estudo, rotinas e tema de campanha são ajustados nas mesmas telas existentes.
7. Faça as verificações reais previstas no plano de implantação. Para Agenda, Sara usa **Conectar Google Agenda** e seleciona a mesma conta Google do aplicativo. Se o projeto OAuth estiver restrito a usuários de teste, o administrador precisa adicionar a conta dela na tela de consentimento antes desse teste. Os escopos usados permanecem os mesmos.

Para revogar o acesso, altere administrativamente `enabled` para `false`. As regras negam novas leituras/gravações. Faça logout e entre novamente para a interface conferir a revogação; a cópia local própria pode continuar no navegador. Não excluir os documentos de estado para revogar acesso. Nenhum usuário, inclusive o proprietário pelo cliente web, pode escrever na lista de autorização com estas regras: a administração é feita no Console com as permissões administrativas do projeto.

A conexão privada ChatGPT do proprietário continua exclusiva dele. Não conectar a conta da Sara a esse plugin, não copiar grants/tokens e não tentar habilitar os botões IA por edição no navegador.
