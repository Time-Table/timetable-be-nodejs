const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");

router.post("/", chatController.postChat);
router.get("/", chatController.getChats);

module.exports = router;
