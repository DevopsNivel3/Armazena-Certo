const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const importController = require('../controllers/importController');
const authMiddleware = require('../middlewares/authMiddleware');

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

router.use(authMiddleware);

// Route for file upload (returns headers)
router.post('/upload', upload.single('file'), importController.uploadFile);

// Route for processing import (receives mapping)
router.post('/process', importController.processImport);

module.exports = router;
