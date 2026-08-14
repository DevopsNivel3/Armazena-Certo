const { Sequelize } = require('sequelize');
const dotenv = require('dotenv');
const path = require('path');

const envPath = path.resolve(__dirname, '..', '.env');
const envResult = dotenv.config({ path: envPath });

if (envResult.error) {
  throw new Error(`Nao foi possivel carregar o arquivo ${envPath}: ${envResult.error.message}`);
}

// Os valores do arquivo .env prevalecem sobre variaveis antigas herdadas pelo PM2.
const fileEnv = envResult.parsed || {};
const dbConfig = {
  host: fileEnv.DB_HOST ?? process.env.DB_HOST,
  port: Number(fileEnv.DB_PORT ?? process.env.DB_PORT ?? 3306),
  name: fileEnv.DB_NAME ?? process.env.DB_NAME,
  user: fileEnv.DB_USER ?? process.env.DB_USER,
  password: fileEnv.DB_PASS ?? process.env.DB_PASS,
};

const missingVariables = [
  ['DB_HOST', dbConfig.host],
  ['DB_NAME', dbConfig.name],
  ['DB_USER', dbConfig.user],
  ['DB_PASS', dbConfig.password],
]
  .filter(([, value]) => value === undefined || value === '')
  .map(([name]) => name);

if (missingVariables.length > 0) {
  throw new Error(`Variaveis obrigatorias ausentes no backend/.env: ${missingVariables.join(', ')}`);
}

if (!Number.isInteger(dbConfig.port) || dbConfig.port < 1 || dbConfig.port > 65535) {
  throw new Error('DB_PORT deve ser uma porta TCP valida.');
}

const sequelize = new Sequelize(
  dbConfig.name,
  dbConfig.user,
  dbConfig.password,
  {
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: 'mysql',
    logging: false,
  }
);

module.exports = sequelize;
