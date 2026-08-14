const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const authMiddleware = require('../middlewares/authMiddleware');

router.use(authMiddleware);

router.post('/', inventoryController.createInventory);
router.get('/', inventoryController.getInventories);
router.get('/:id', inventoryController.getInventoryById);
router.put('/:id/status', inventoryController.updateInventoryStatus);
router.get('/:id/dashboard', inventoryController.getInventoryDashboard);
router.get('/:id/produtos', inventoryController.getInventoryProducts);
router.get('/:id/relatorio', inventoryController.getInventoryReport);
router.get('/:id/validade-report', inventoryController.getValidadeReport);
router.get('/:id/abc-curve', inventoryController.getABCCurve);
router.get('/:id/productivity', inventoryController.getOperatorProductivity);
router.get('/:id/export', inventoryController.exportInventoryReport);
router.get('/:id/export-adjusted', inventoryController.exportAdjustedSpreadsheet);
router.get('/:id/export-loss', inventoryController.exportLossReport);
router.get('/:id/usuarios/:usuario_id/export-history', inventoryController.exportUserHistory);
router.get('/:id/usuarios', inventoryController.getInventoryUsers);
router.get('/:id/liberacoes', inventoryController.getInventoryReleaseOptions);
router.post('/:id/liberacoes', inventoryController.saveInventoryRelease);
router.delete('/:id/liberacoes/:usuarioId', inventoryController.clearInventoryRelease);
router.post('/:id/usuarios', inventoryController.addInventoryUser);
router.put('/:id/usuarios/:usuarioId/local', inventoryController.updateInventoryUserLocal);
router.post('/:id/contagem', inventoryController.submitCount);
router.post('/:id/ajuste-manual', inventoryController.manualAdjustment);

module.exports = router;
