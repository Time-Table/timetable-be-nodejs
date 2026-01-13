const scheduleService = require("../services/scheduleService");
const Sentry = require("@sentry/node");

const addSchedule = async (req, res) => {
  const { tableId, name, availableTimes } = req.body;

  try {
    const result = await scheduleService.addSchedule({ tableId, name, availableTimes });

    res.status(200).json({
      success: true,
      message: "스케줄이 성공적으로 업데이트되었습니다.",
      data: result,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json(err);
    }
    Sentry.captureException(err);
    res.status(500).json({
      success: false,
      message: "서버 오류가 발생했습니다.",
      err,
    });
  }
};

const generateSchedule = async (req, res) => {
  const { tableId } = req.body;

  if (!tableId) {
    return res.status(400).json({
      success: false,
      message: "TableId is required.",
    });
  }

  try {
    const timeInfo = await scheduleService.generateSchedule(tableId);

    return res.status(200).json({
      success: true,
      message: "Schedule generated successfully.",
      data: timeInfo,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json(err);
    }
    Sentry.captureException(err);
    return res.status(500).json({
      success: false,
      message: "An error occurred while generating the schedule.",
      err,
    });
  }
};

const getSchedule = async (req, res) => {
  const { tableId } = req.query;

  if (!tableId) {
    return res.status(400).json({
      success: false,
      message: "TableId is required.",
    });
  }

  try {
    const scheduleData = await scheduleService.getSchedule(tableId);

    if (!scheduleData) {
      return res.status(201).json({
        success: true,
        message: "등록된 스케줄이 없습니다.",
      });
    }

    return res.status(200).json({
      success: true,
      data: scheduleData,
    });
  } catch (err) {
    Sentry.captureException(err);
    return res.status(500).json({
      success: false,
      message: "An error occurred while fetching the schedule.",
      err,
    });
  }
};

module.exports = {
  addSchedule,
  generateSchedule,
  getSchedule,
};
