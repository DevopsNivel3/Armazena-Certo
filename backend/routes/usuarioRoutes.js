const express = require('express');
const router = express.Router();
const usuarioController = require('../controllers/UsuarioController');
const authMiddleware = require('../middlewares/authMiddleware');
const { requireModule } = require('../middlewares/moduleAccessMiddleware');

router.use(authMiddleware); // Protege todas as rotas

router.get('/', usuarioController.getAll);
router.get('/:id', usuarioController.getById);
router.get('/:id/history', requireModule('inventario'), usuarioController.getHistory);
router.post('/', usuarioController.create);
router.put('/:id', usuarioController.update);
router.delete('/:id', usuarioController.delete);

module.exports = router;
