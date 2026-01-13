const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chatController");
const { validateChatPost } = require("../middlewares/validators");

router.post("/", validateChatPost, chatController.postChat);
router.get("/", chatController.getChats);

module.exports = router;
