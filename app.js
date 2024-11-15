require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const Table = require("./models/Table");
const { v4: uuid } = require("uuid");
const port = process.env.PORT;
const app = express();
app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

mongoose
  .connect(process.env.DB_KEY)
  .then(() => console.log(`mongoDB connected!`))
  .catch((err) => console.log(err));

app.get("/hi", (req, res) => {
  return res.status(200).json({ hi: "Hello World~!" });
});

app.post("/api/create", async (req, res) => {
  const { title, dates, startHour, endHour, banedCells } = req.body;
  const tableId = uuid();
  const table = new Table({
    title,
    tableId,
    dates,
    startHour,
    endHour,
    banedCells,
  });
  try {
    const savedTable = await table.save();
    res.status(200).json({
      success: true,
      code: 200,
      message: "테이블 등록 성공",
      data: { tableId: savedTable.tableId },
    });
  } catch (err) {
    console.error("/api/create error:", err);
    res.status(400).json({ success: false, err: err, code: 400 });
  }
});

app.get("/api/tableInfo", async (req, res) => {
  const { tableId } = req.query;

  if (!tableId) {
    return res.status(400).json({ success: false, message: "TableId를 받지 못했습니다." });
  }

  try {
    const tableData = await Table.findOne({ tableId: tableId });

    if (!tableData) {
      return res.status(404).json({
        success: false,
        message: "테이블을 찾을 수 없습니다.",
        queriedId: tableId,
      });
    }

    res.status(200).json({ success: true, data: tableData });
  } catch (error) {
    console.error("Error fetching table:", error);
    res.status(500).json({ success: false, message: "서버 오류가 발생했습니다.", error });
  }
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
