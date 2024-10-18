const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const isAuth = require('../middleware/isAuth');


// Route to get the current jackpot status
router.get('/inventory', isAuth, inventoryController.getInventoryItems);

module.exports = router;
