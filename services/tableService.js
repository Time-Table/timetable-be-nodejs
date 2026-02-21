const Table = require("../models/Table");
const User = require("../models/User");
const { v4: uuid } = require("uuid");
const visitService = require("./visitService");

const createTable = async (data) => {
  const { title, dates, startHour, endHour, banedCells } = data;
  const tableId = uuid();

  const table = new Table({
    title,
    tableId,
    dates,
    startHour,
    endHour,
    banedCells,
  });

  const savedTable = await table.save();

  const updateFields = {
    todayTableCreateCount: 1,
    totalTableCreateCount: 1,
  };

  await visitService.updateVisitStats(updateFields);

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
  return await Table.findOneAndUpdate({ tableId }, updateData, { new: true });
};

const deleteTable = async (tableId) => {
  return await Table.findOneAndDelete({ tableId });
};

module.exports = {
  createTable,
  getTableByTableId,
  getAllTables,
  updateTable,
  deleteTable,
};
