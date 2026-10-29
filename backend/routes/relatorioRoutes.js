const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const relatorioController = require('../controllers/relatorioController');
const { requireModule } = require('../middlewares/moduleAccessMiddleware');

const router = express.Router();
router.use(authMiddleware);
router.get('/prestacao-contas', requireModule('cross_docking'), relatorioController.prestacaoContas);
router.get('/cargas/:id/manifesto', requireModule('cross_docking'), relatorioController.manifestoCarga);
router.get('/inbound/:id/termo-divergencia', requireModule('cross_docking'), relatorioController.termoDivergenciaInbound);
router.get('/auditoria-conferencia', requireModule('cross_docking'), relatorioController.auditoriaConferencia);

module.exports = router;
