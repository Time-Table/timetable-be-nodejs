const express = require("express");
const router = express.Router();
const { generalLimiter } = require("../middlewares/rateLimiters");
const { detectAdminMode } = require("../middlewares/adminMode");

const visitRoutes = require("./visitRoutes");
const tableRoutes = require("./tableRoutes");
const userRoutes = require("./userRoutes");
const scheduleRoutes = require("./scheduleRoutes");
const chatRoutes = require("./chatRoutes");
const eventRoutes = require("./eventRoutes");
const adminRoutes = require("./adminRoutes");
const blogViewRoutes = require("./blogViewRoutes");
const inquiryRoutes = require("./inquiryRoutes");
const experimentRoutes = require("./experimentRoutes");

router.use(generalLimiter);
router.use(detectAdminMode);

router.use("/visits", visitRoutes);
router.use("/tables", tableRoutes);
router.use("/users", userRoutes);
router.use("/schedules", scheduleRoutes);
router.use("/chats", chatRoutes);
router.use("/events", eventRoutes);
router.use("/admin", adminRoutes);
router.use("/blog-views", blogViewRoutes);
router.use("/inquiries", inquiryRoutes);
router.use("/experiments", experimentRoutes);

module.exports = router;
