const express = require('express');
const multer = require('multer');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const documentsController = require('../controllers/documentsController');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

router.post('/', authMiddleware, upload.single('pdf'), documentsController.uploadDocument);
router.get('/', authMiddleware, documentsController.listDocuments);
router.post('/:id/approve', authMiddleware, documentsController.approveDocument);
router.post('/:id/reject', authMiddleware, documentsController.rejectDocument);

module.exports = router;
