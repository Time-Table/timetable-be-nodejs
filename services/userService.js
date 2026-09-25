const User = require("../models/User");
const DeletedUser = require("../models/DeletedUser");
const tableMutation = require("./tableMutation");
const Schedule = require("../models/Schedule");
const visitService = require("./visitService");
const { runTelemetry } = require("../utils/telemetry");
const { calculateTimeInfo } = require("../utils/scheduleHelper");

const joinTable = async (data, options = {}) => {
  const { tableId, name, password, availableTimes } = data;

  const result = await tableMutation.withTableMutation(tableId, async (session) => {
    const existingUser = await User.findOne({ tableId, name }).select("+password").session(session);
    if (existingUser) {
      if (!await existingUser.comparePassword(password)) {
        throw { status: 401, message: "비밀번호가 일치하지 않습니다." };
      }
      return { isNewUser: false, user: { name: existingUser.name, availableTimes: existingUser.availableTimes } };
    }
    const user = new User({ tableId, name, password, availableTimes });
    await user.save({ session });
    return { isNewUser: true, user: { name: user.name, availableTimes: user.availableTimes } };
  });

  // Counters run once, after commit; a transaction retry must not replay telemetry.
  if (!options.skipStats) {
    const counterFields = result.isNewUser
      ? { todaySignUp: 1, totalSignUp: 1 }
      : { todayLogin: 1, totalLogin: 1 };
    await runTelemetry(result.isNewUser ? "join_counter" : "login_counter",
      () => visitService.updateVisitStats(counterFields));
  }
  return result;
};

const getUserInfo = async (tableId, name, password) => {
  const user = await User.findOne({ tableId, name }).select("+password");
  if (!user) {
    throw { status: 201, message: "존재하지 않는 유저입니다." };
  }
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw { status: 401, message: "비밀번호가 틀렸습니다." };
  }
  return { availableTimes: user.availableTimes, name: user.name };
};

const getAllUsers = async (tableId) => {
  return await User.find({ tableId }, "name availableTimes");
};

const deleteUser = async (data) => {
  const { tableId, name, password } = data;

  return tableMutation.withTableMutation(tableId, async (session) => {
    const user = await User.findOne({ tableId, name }).select("+password").session(session);
    if (!user) throw { status: 404, message: "유저를 찾을 수 없습니다." };
    if (!await user.comparePassword(password)) throw { status: 401, message: "비밀번호가 일치하지 않습니다." };
    const { availableTimes, _id } = user;
    const deletedUser = new DeletedUser({ tableId, name, userId: _id, availableTimes });
    await deletedUser.save({ session });
    await User.findOneAndDelete({ tableId, name }, { session });
    const users = await User.find({ tableId }).session(session);
    const updatedTimeInfo = calculateTimeInfo(users);
    await Schedule.findOneAndUpdate({ tableId }, { timeInfo: updatedTimeInfo }, { upsert: true, session });
    return true;
  });
};

module.exports = {
  joinTable,
  getUserInfo,
  getAllUsers,
  deleteUser,
};
