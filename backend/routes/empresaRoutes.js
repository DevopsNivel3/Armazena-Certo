const express = require('express');
const router = express.Router();
const empresaController = require('../controllers/EmpresaController');
const authMiddleware = require('../middlewares/authMiddleware');

router.use(authMiddleware); // Protege todas as rotas

router.get('/', empresaController.getAll);
router.get('/:id', empresaController.getById);
router.post('/', empresaController.create);
router.put('/:id', empresaController.update);
router.delete('/:id', empresaController.delete);

module.exports = router;
