const tableService = require("../services/tableService");
const Sentry = require("@sentry/node");

const createTable = async (req, res) => {
  const { title, dates, startHour, endHour, banedCells } = req.body;

  try {
    const savedTable = await tableService.createTable({ title, dates, startHour, endHour, banedCells });

    res.status(200).json({
      success: true,
      code: 200,
      message: "테이블 등록 성공",
      data: { tableId: savedTable.tableId },
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("/api/create error:", err);
    res.status(400).json({ success: false, err: err, code: 400 });
  }
};

const getTableInfo = async (req, res) => {
  const { tableId } = req.query;

  if (!tableId) {
    return res.status(400).json({ success: false, message: "TableId를 받지 못했습니다." });
  }

  try {
    const tableData = await tableService.getTableByTableId(tableId);
    if (!tableData) {
      return res.status(404).json({
        success: false,
        message: "테이블을 찾을 수 없습니다.",
        queriedId: tableId,
      });
    }

    return res.status(200).json({ success: true, data: tableData });
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({ success: false, message: "서버 오류가 발생했습니다.", err });
  }
};

module.exports = {
  createTable,
  getTableInfo,
};
