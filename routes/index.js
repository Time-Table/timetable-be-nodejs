const express = require("express");
const router = express.Router();
const { generalLimiter } = require("../middlewares/rateLimiters");

const visitRoutes = require("./visitRoutes");
const tableRoutes = require("./tableRoutes");
const userRoutes = require("./userRoutes");
const scheduleRoutes = require("./scheduleRoutes");
const chatRoutes = require("./chatRoutes");

router.use(generalLimiter);

router.use("/", visitRoutes);
router.use("/", tableRoutes);
router.use("/", userRoutes);
router.use("/", scheduleRoutes);
router.use("/", chatRoutes);

module.exports = router;
