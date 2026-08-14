const bcrypt = require('bcrypt');
const { sequelize, Usuario, Empresa } = require('./models');

async function createAdmin() {
  try {
    // Ensure DB connection
    await sequelize.authenticate();
    console.log('Conectado ao banco de dados.');

    const email = 'admin@sistema.com'.trim().toLowerCase();
    const senha = 'senha123';
    const nome = 'Administrador Sistema';

    // Hash password once for create/update flow
    const salt = await bcrypt.genSalt(10);
    const senha_hash = await bcrypt.hash(senha, salt);

    // Check if user exists
    const existingUser = await Usuario.findOne({ where: { email } });
    if (existingUser) {
      existingUser.nome = nome;
      existingUser.senha_hash = senha_hash;
      existingUser.nivel_acesso = 'admin';
      await existingUser.save();

      console.log('------------------------------------------------');
      console.log('✅ Usuário Administrador atualizado com sucesso!');
      console.log(`📧 Email: ${email}`);
      console.log(`🔑 Senha redefinida para: ${senha}`);
      console.log('------------------------------------------------');
      return;
    }

    // Find or create a default company
    let empresa = await Empresa.findOne();
    if (!empresa) {
      empresa = await Empresa.create({
        nome: 'Empresa'
      });
      console.log('Empresa Padrão criada para associar ao usuário.');
    }

    // Create User
    const user = await Usuario.create({
      nome,
      email,
      senha_hash,
      nivel_acesso: 'admin',
      empresa_id: empresa.id
    });

    console.log('------------------------------------------------');
    console.log('✅ Usuário Administrador criado com sucesso!');
    console.log(`📧 Email: ${email}`);
    console.log(`🔑 Senha: ${senha}`);
    console.log('------------------------------------------------');

  } catch (error) {
    console.error('❌ Erro ao criar usuário:', error);
  } finally {
    await sequelize.close();
  }
}

createAdmin();
