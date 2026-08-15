const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const importController = require('../controllers/importController');
const authMiddleware = require('../middlewares/authMiddleware');

const uploadDirectory = path.resolve(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDirectory, { recursive: true });

const allowedExtensions = new Set(['.xlsx', '.xls', '.csv']);

// O caminho absoluto evita depender do diretório em que o processo foi iniciado.
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirectory);
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const baseName = path
      .basename(file.originalname, extension)
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'planilha';

    cb(null, `${Date.now()}-${baseName}${extension}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(extension)) {
      return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'file'));
    }
    return cb(null, true);
  }
});

const receiveSpreadsheet = (req, res, next) => {
  upload.single('file')(req, res, (error) => {
    if (!error) return next();

    console.error('Erro no upload da planilha:', error);

    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'A planilha excede o limite de 25 MB.'
        : 'Não foi possível receber a planilha. Use um arquivo XLSX, XLS ou CSV válido.';
      return res.status(400).json({ message });
    }

    return res.status(500).json({ message: 'Não foi possível armazenar a planilha no servidor.' });
  });
};

router.use(authMiddleware);

// Route for file upload (returns headers)
router.post('/upload', receiveSpreadsheet, importController.uploadFile);

// Route for processing import (receives mapping)
router.post('/process', importController.processImport);

module.exports = router;
