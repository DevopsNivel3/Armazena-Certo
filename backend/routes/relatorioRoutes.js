const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const relatorioController = require('../controllers/relatorioController');

const router = express.Router();
router.use(authMiddleware);
router.get('/prestacao-contas', relatorioController.prestacaoContas);
router.get('/cargas/:id/manifesto', relatorioController.manifestoCarga);
router.get('/inbound/:id/termo-divergencia', relatorioController.termoDivergenciaInbound);
router.get('/auditoria-conferencia', relatorioController.auditoriaConferencia);

module.exports = router;
