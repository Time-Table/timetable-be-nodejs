const Table = require("../models/Table");
const User = require("../models/User");
const activationService = require("./activationService");
const { createSnapshot } = require("../utils/activationDefinition");
const { v4: uuid } = require("uuid");
const visitService = require("./visitService");
const { runTelemetry } = require("../utils/telemetry");

const createTable = async (data, options = {}) => {
  const { title, dates, startHour, endHour, banedCells, creatorVisitorId } = data;
  const tableId = uuid();
  const createdAt = new Date();

  const table = new Table({
    title,
    tableId,
    createdAt,
    activationSnapshot: createSnapshot(data, createdAt, !!options.skipStats),
    dates,
    startHour,
    endHour,
    banedCells,
    creatorVisitorId: !options.skipStats && typeof creatorVisitorId === "string" &&
      creatorVisitorId.length > 0 && creatorVisitorId.length <= 64 ? creatorVisitorId : undefined,
  });

  const savedTable = await table.save();

  // 관리자가 테스트로 만든 테이블은 생성 카운터에 반영하지 않는다.
  if (!options.skipStats) {
    const updateFields = {
      todayTableCreateCount: 1,
      totalTableCreateCount: 1,
    };

    await Promise.all([
      runTelemetry("table_create_counter", () => visitService.updateVisitStats(updateFields)),
      activationService.recordCreation(savedTable),
    ]);
  } else {
    await activationService.recordCreation(savedTable);
  }

  return savedTable;
};

const getTableByTableId = async (tableId) => {
  return await Table.findOne({ tableId: tableId });
};

const getAllTables = async () => {
  const tables = await Table.find().sort({ createdAt: -1 }).lean();

  const userCounts = await User.aggregate([
    { $group: { _id: "$tableId", count: { $sum: 1 } } },
  ]);

  const countsMap = userCounts.reduce((acc, curr) => {
    acc[curr._id] = curr.count;
    return acc;
  }, {});

  return tables.map((t) => ({
    ...t,
    participantCount: countsMap[t.tableId] || 0,
  }));
};

const updateTable = async (tableId, updateData) => {
  const table = await Table.findOneAndUpdate({ tableId }, updateData, { new: true }).select("+activationSnapshot");
  await activationService.recordTableChange(table);
  return table;
};

const deleteTable = async (tableId) => {
  const table = await Table.findOneAndDelete({ tableId }).select("+activationSnapshot");
  await activationService.recordTableChange(table);
  return table;
};

module.exports = {
  createTable,
  getTableByTableId,
  getAllTables,
  updateTable,
  deleteTable,
};
