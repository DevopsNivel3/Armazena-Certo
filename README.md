# Armazena Certo

Sistema web de inventário e conferência logística com Inbound por volumetria e Outbound por veículo.

## Componentes

- `backend/`: Node.js, Express, Sequelize, MySQL, JWT e Socket.IO.
- `frontend-web/`: React, Vite e interface responsiva para gestores e coletores.
- `INTEGRACAO_XML.md`: contrato de troca de arquivos com o roteirizador.
- `PLANO_ACOMPANHAMENTO_CONFERENCIA_XML.md`: situação funcional do módulo.

O primeiro escopo utiliza somente arquivos XML. Não há API, SFTP ou autenticação com roteirizador externo. A aplicação web responsiva é também a interface operacional; não existe aplicativo React Native neste repositório.

## Desenvolvimento

1. Copie `backend/.env.example` para `backend/.env` e ajuste o MySQL/JWT.
2. Copie `frontend-web/.env.example` para `frontend-web/.env` se precisar alterar os endereços padrão.
3. Instale as dependências com `npm install` em `backend/` e `frontend-web/`.
4. Execute `npm run migrate:conferencia-finalizacao` e `npm run migrate:modulos` no backend existente.
5. Inicie o backend com `npm run dev` e o frontend com `npm run dev`.

## Validação

```text
backend:      npm test
frontend-web: npm run lint
frontend-web: npm run build
```

Em produção, mantenha `DB_AUTO_ALTER=false`, execute migrations antes da atualização da aplicação e faça backup do banco, especialmente dos campos que armazenam os XMLs originais.

## Permissões por módulo

O sistema possui dois módulos habilitados individualmente em **Usuários e permissões**: **Inventário**, para contagens de estoque, e **Cross Docking**, que reúne recebimento, conferência de mercadorias, expedição, retornos e prestação de contas. O perfil continua definindo as ações permitidas dentro de cada módulo; ser administrador não concede automaticamente acesso operacional.

Usuários com ambos os módulos acessam a seleção em `/modulos`; com apenas um, entram diretamente na operação habilitada. É possível desmarcar todos os módulos para suspender o acesso operacional sem excluir vínculos ou históricos. Novos cadastros sem módulos explícitos ficam sem acesso operacional. Gerentes só podem criar operadores/administradores de inventário com módulos que possuem; administradores de inventário só podem conceder Inventário.

Antes de usar esta versão em um banco existente, execute **no diretório `backend/`, mediante autorização**, `npm run migrate:modulos`. A migração pode ser executada novamente: converte as permissões antigas `recebimento` e/ou `expedicao` em `cross_docking`, preserva listas vazias e habilita os dois módulos apenas para cadastros legados sem configuração. Ter qualquer uma das duas permissões antigas passa a conceder todo o Cross Docking; revise os acessos conforme a organização da equipe. A migração não altera os dados das operações.

As APIs consultam empresa, perfil e módulos atuais no banco a cada requisição. Mudanças no cadastro encerram as conexões em tempo real daquele usuário; salas de inventário exigem empresa e vínculo válidos. A aplicação atualiza as permissões ao recuperar o foco, reconectar à internet e periodicamente. No aplicativo de contagem, somente usuários com Inventário podem operar; dados offline permanecem sujeitos às permissões atuais ao sincronizar.

No Inventário, as regras existentes continuam cumulativas: além de ter o módulo habilitado, operadores e administradores de inventário precisam estar vinculados ao inventário. Local atribuído, produtos liberados e etapas de contagem permanecem configurados dentro de cada operação.
