const User = require("../models/User");
const tableMutation = require("./tableMutation");
const activationService = require("./activationService");
const Schedule = require("../models/Schedule");
const { calculateTimeInfo, calculateSimpleTimeInfo } = require("../utils/scheduleHelper");

const addSchedule = async (data, options = {}) => {
  const { tableId, name, availableTimes } = data;

  const result = await tableMutation.withTableMutation(tableId, async (session) => {
    const user = await User.findOneAndUpdate(
      { tableId, name },
      { availableTimes: Array.from(new Set([...availableTimes])) },
      { new: true, session }
    );
    if (!user) throw { status: 404, message: "유저를 찾을 수 없습니다." };
    const users = await User.find({ tableId }).session(session);
    const timeInfo = calculateTimeInfo(users);
    await Schedule.findOneAndUpdate({ tableId }, { timeInfo }, { upsert: true, session });
    return { userAvailableTimes: user.availableTimes, scheduleTimeInfo: timeInfo };
  });
  if (!options.skipStats) {
    await activationService.recordSchedule({ tableId, name, availableTimes: result.userAvailableTimes, completedAt: new Date() });
  }
  return result;
};

const generateSchedule = async (tableId) => tableMutation.withTableMutation(tableId, async (session) => {
  const users = await User.find({ tableId }).session(session);
  if (!users || users.length === 0) throw { status: 404, message: "No users found for the given TableId." };
  const timeInfo = calculateSimpleTimeInfo(users);
  await Schedule.findOneAndUpdate({ tableId }, { timeInfo }, { upsert: true, session });
  return timeInfo;
});

const getSchedule = async (tableId) => {
  const schedule = await Schedule.findOne({ tableId });
  return schedule ? schedule.timeInfo : null;
};

module.exports = {
  addSchedule,
  generateSchedule,
  getSchedule,
};
