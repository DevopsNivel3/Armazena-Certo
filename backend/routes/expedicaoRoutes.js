const express = require('express');
const multer = require('multer');
const authMiddleware = require('../middlewares/authMiddleware');
const expedicaoController = require('../controllers/expedicaoController');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

router.use(authMiddleware);
router.get('/cargas', expedicaoController.listarCargas);
router.get('/cargas/:id', expedicaoController.buscarCarga);
router.put('/cargas/:id', expedicaoController.atualizarCarga);
router.get('/cargas/:id/historico', expedicaoController.listarHistoricoConferencia);
router.get('/cargas/:id/usuarios', expedicaoController.listarUsuariosConferencia);
router.get('/cargas/:id/produtividade', expedicaoController.obterProdutividadeConferencia);
router.post('/cargas/:id/iniciar', expedicaoController.iniciarConferencia);
router.put('/cargas/:id/conferente', expedicaoController.atribuirConferente);
router.post('/cargas/:id/recontagem', expedicaoController.atribuirRecontagem);
router.post('/cargas/:id/recontagem/itens', expedicaoController.registrarRecontagemItem);
router.post('/cargas/importar-roteirizacao', upload.single('xml'), expedicaoController.importarRoteirizacao);
router.post('/cargas/:id/itens/conferencia', expedicaoController.registrarConferenciaItem);
router.patch('/cargas/:id/itens/:itemId', expedicaoController.ajustarConferenciaItem);
router.post('/cargas/:id/encerrar', expedicaoController.encerrarCarga);
router.post('/cargas/:id/liberar', expedicaoController.liberarCarga);
router.post('/cargas/:id/retorno', expedicaoController.registrarRetorno);
router.post('/cargas/:id/cancelar', expedicaoController.cancelarCarga);

module.exports = router;
