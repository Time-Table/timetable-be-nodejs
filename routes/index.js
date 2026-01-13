const express = require("express");
const router = express.Router();
const { generalLimiter } = require("../middlewares/rateLimiters");

const visitRoutes = require("./visitRoutes");
const tableRoutes = require("./tableRoutes");
const userRoutes = require("./userRoutes");
const scheduleRoutes = require("./scheduleRoutes");
const chatRoutes = require("./chatRoutes");

router.use(generalLimiter);

router.use("/visits", visitRoutes);
router.use("/tables", tableRoutes);
router.use("/users", userRoutes);
router.use("/schedules", scheduleRoutes);
router.use("/chats", chatRoutes);

module.exports = router;
