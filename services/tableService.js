const Table = require("../models/Table");
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

module.exports = {
  createTable,
  getTableByTableId,
};
