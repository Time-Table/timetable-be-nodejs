const User = require("../models/User");
const Schedule = require("../models/Schedule");
const { calculateTimeInfo, calculateSimpleTimeInfo } = require("../utils/scheduleHelper");

const addSchedule = async (data) => {
  const { tableId, name, availableTimes } = data;

  const user = await User.findOneAndUpdate(
    { tableId, name },
    { availableTimes: Array.from(new Set([...availableTimes])) },
    { new: true }
  );

  if (!user) {
    throw { status: 404, message: "유저를 찾을 수 없습니다." };
  }

  const users = await User.find({ tableId });
  const timeInfo = calculateTimeInfo(users);

  await Schedule.findOneAndUpdate({ tableId }, { timeInfo }, { upsert: true });

  return { userAvailableTimes: user.availableTimes, scheduleTimeInfo: timeInfo };
};

const generateSchedule = async (tableId) => {
  const users = await User.find({ tableId });

  if (!users || users.length === 0) {
    throw { status: 404, message: "No users found for the given TableId." };
  }

  const timeInfo = calculateSimpleTimeInfo(users);

  await Schedule.findOneAndUpdate({ tableId }, { timeInfo }, { upsert: true });

  return timeInfo;
};

const getSchedule = async (tableId) => {
  const schedule = await Schedule.findOne({ tableId });
  return schedule ? schedule.timeInfo : null;
};

module.exports = {
  addSchedule,
  generateSchedule,
  getSchedule,
};
