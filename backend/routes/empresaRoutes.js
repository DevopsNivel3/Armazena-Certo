const express = require('express');
const router = express.Router();
const empresaController = require('../controllers/EmpresaController');
const authMiddleware = require('../middlewares/authMiddleware');

router.use(authMiddleware); // Protege todas as rotas

router.get('/', empresaController.getAll);
router.get('/:id', empresaController.getById);
const requireAdmin = (req, res, next) => req.user.nivel_acesso === 'admin'
  ? next()
  : res.status(403).json({ error: 'Apenas administradores podem gerenciar empresas.' });

router.post('/', requireAdmin, empresaController.create);
router.put('/:id', requireAdmin, empresaController.update);
router.delete('/:id', requireAdmin, empresaController.delete);

module.exports = router;
