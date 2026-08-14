const sequelize = require('./config/db');

sequelize.query("DROP TABLE IF EXISTS InventarioUsuario;")
  .then(() => console.log('success'))
  .catch(console.error)
  .finally(()=>setTimeout(() => process.exit(0), 1000));