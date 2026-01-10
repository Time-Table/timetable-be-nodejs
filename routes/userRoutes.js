const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");

router.post("/join", userController.join);
router.get("/userInfo", userController.userInfo);
router.delete("/deleteUser", userController.deleteUser);
router.get("/users", userController.getUsers);

module.exports = router;
