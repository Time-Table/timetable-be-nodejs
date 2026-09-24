const User = require("../models/User");
const DeletedUser = require("../models/DeletedUser");
const Table = require("../models/Table");
const Schedule = require("../models/Schedule");
const visitService = require("./visitService");
const { runTelemetry } = require("../utils/telemetry");
const { calculateTimeInfo } = require("../utils/scheduleHelper");

const joinTable = async (data, options = {}) => {
  const { tableId, name, password, availableTimes } = data;

  const tableData = await Table.findOne({ tableId });
  if (!tableData) {
    throw { status: 404, message: "테이블을 찾을 수 없습니다." };
  }

  const existingUser = await User.findOne({ tableId, name }).select("+password");

  if (existingUser) {
    const isMatch = await existingUser.comparePassword(password);
    if (!isMatch) {
      throw { status: 401, message: "비밀번호가 일치하지 않습니다." };
    }

    if (!options.skipStats) {
      await runTelemetry("login_counter", () => visitService.updateVisitStats({ todayLogin: 1, totalLogin: 1 }));
    }

    return {
      isNewUser: false,
      user: { name: existingUser.name, availableTimes: existingUser.availableTimes },
    };
  }

  const user = new User({
    tableId,
    name,
    password,
    availableTimes,
  });

  await user.save();

  // 관리자 계정으로 테스트 참여한 건은 가입 카운터에 반영하지 않는다.
  if (!options.skipStats) {
    await runTelemetry("join_counter", () => visitService.updateVisitStats({ todaySignUp: 1, totalSignUp: 1 }));
  }

  return {
    isNewUser: true,
    user: { name: user.name, availableTimes: user.availableTimes },
  };
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

  const user = await User.findOne({ tableId, name }).select("+password");

  if (!user) {
    throw { status: 404, message: "유저를 찾을 수 없습니다." };
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw { status: 401, message: "비밀번호가 일치하지 않습니다." };
  }

  const { availableTimes, _id } = user;

  const deletedUser = new DeletedUser({ tableId, name, userId: _id, availableTimes });
  await deletedUser.save();

  await User.findOneAndDelete({ tableId, name });

  const users = await User.find({ tableId });
  const updatedTimeInfo = calculateTimeInfo(users);

  await Schedule.findOneAndUpdate({ tableId }, { timeInfo: updatedTimeInfo }, { upsert: true });

  return true;
};

module.exports = {
  joinTable,
  getUserInfo,
  getAllUsers,
  deleteUser,
};
