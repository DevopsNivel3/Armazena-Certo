const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const authMiddleware = require('../middlewares/authMiddleware');
const { requireModule } = require('../middlewares/moduleAccessMiddleware');

router.use(authMiddleware);
router.use(requireModule('inventario'));

router.post('/', productController.createProduct);
router.get('/', productController.getProducts);
router.get('/:id', productController.getProductById);

module.exports = router;
