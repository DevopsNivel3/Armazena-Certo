const express = require('express');
const multer = require('multer');
const conferenciaController = require('../controllers/conferenciaController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 200
  }
});

router.use(authMiddleware);

router.get('/inbound/lotes', conferenciaController.getInboundBatches);
router.post('/inbound/lotes', upload.array('xmls', 200), conferenciaController.createInboundBatch);
router.get('/inbound/lotes/:id', conferenciaController.getInboundBatchById);
router.post('/inbound/lotes/:id/conferencia', conferenciaController.submitInboundVolumeCount);
router.post('/inbound/lotes/:id/encerrar', conferenciaController.closeInboundBatch);
router.post('/inbound/lotes/:id/cancelar', conferenciaController.cancelInboundBatch);
router.get('/inbound/lotes/:id/exportar-xml', conferenciaController.exportInboundBatchXml);
router.get('/inbound/lotes/:id/roteirizacao-ready', conferenciaController.getRoteirizacaoReadyInboundNotes);

module.exports = router;
