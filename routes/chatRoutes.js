const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");

router.post("/postChat", chatController.postChat);
router.get("/getChating", chatController.getChats);

module.exports = router;
