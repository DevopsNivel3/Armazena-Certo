# Backend — Armazena Certo

API Node.js/Express com MySQL, Sequelize, JWT e Socket.IO.

## Configuração

1. Copie `.env.example` para `.env`.
2. Crie o banco configurado em `DB_NAME`.
3. Execute `npm install`.
4. Em banco já existente, execute `npm run migrate:conferencia-finalizacao`.
5. Inicie com `npm run dev`.

`DB_AUTO_ALTER` deve permanecer `false` em produção. Faça backup antes de migrations.

## Scripts principais

- `npm test`: testes automatizados.
- `npm run migrate:conferencia-finalizacao`: adiciona rastreabilidade da exportação XML e situação logística das NF-es.
- `npm start`: execução de produção.

## Retenção e acesso

Os XMLs originais são armazenados no banco e acessíveis somente por usuários autenticados da mesma empresa. A interface não oferece exclusão de XML. Backup, retenção legal e descarte do banco devem seguir a política definida pela empresa operadora.
