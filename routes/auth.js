const express = require('express');
const multer = require('multer');
const router = express.Router();
const authController = require('../controllers/authController');

// File upload config for user_signature
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

router.post('/register', upload.single('user_signature'), authController.register);
router.post('/login', authController.login);

module.exports = router;
