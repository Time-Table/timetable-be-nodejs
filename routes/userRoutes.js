const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");

router.post("/", userController.join);
router.post("/verify", userController.userInfo);
router.delete("/", userController.deleteUser);
router.get("/", userController.getUsers);

module.exports = router;
