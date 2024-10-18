const express = require('express');
const router = express.Router();
const auth = require('../controllers/authController');

// Route to join the jackpot
router.post('/join', jackpotController.joinJackpot);

module.exports = router;
