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
4. Execute `npm run migrate:conferencia-finalizacao` no backend existente.
5. Inicie o backend com `npm run dev` e o frontend com `npm run dev`.

## Validação

```text
backend:      npm test
frontend-web: npm run lint
frontend-web: npm run build
```

Em produção, mantenha `DB_AUTO_ALTER=false`, execute migrations antes da atualização da aplicação e faça backup do banco, especialmente dos campos que armazenam os XMLs originais.
