require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const Table = require("./models/Table");
const { v4: uuid } = require("uuid");
const User = require("./models/User");
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

app.post("/api/join", async (req, res) => {
  const { tableId, name, password } = req.body;

  if (!tableId || !name || !password) {
    return res.status(400).json({
      success: false,
      message: "필수 데이터를 입력하세요.",
    });
  }

  try {
    const tableData = await Table.findOne({ tableId });
    if (!tableData) {
      return res.status(404).json({
        success: false,
        message: "테이블을 찾을 수 없습니다.",
        queriedId: tableId,
      });
    }

    const user = new User({
      tableId,
      name,
      password,
    });

    await user.save();

    return res.status(200).json({
      success: true,
      code: 200,
      message: "유저 등록 성공",
      data: { name },
    });
  } catch (error) {
    console.error("/api/join error:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: "중복된 이름입니다. 다른 이름을 사용하세요.",
      });
    }

    return res.status(500).json({
      success: false,
      code: 500,
      message: "서버 오류가 발생했습니다.",
      error,
    });
  }
});

app.get("/api/userInfo", async (req, res) => {
  const { tableId, name, password } = req.query;

  if (!tableId || !name || !password) {
    return res.status(400).json({
      success: false,
      message: `이름과 비밀번호를 모두 입력해주세요.`,
    });
  }

  try {
    const userData = await User.findOne({ tableId, name });

    if (!userData) {
      return res.status(201).json({
        success: true,
        code: 201,
        message: "새로운 유저 등록이 가능합니다.",
      });
    }

    if (userData.password !== password) {
      return res.status(401).json({
        success: false,
        code: 401,
        message: "비밀번호가 틀렸습니다.",
      });
    }

    res.status(200).json({
      success: true,
      code: 200,
      data: userData,
      message: "유저가 존재합니다.",
    });
  } catch (error) {
    console.error("Error /api/userInfo:", error);
    res.status(500).json({
      success: false,
      message: "서버 오류가 발생했습니다.",
      error,
    });
  }
});

app.delete("/api/deleteUser", async (req, res) => {
  const { tableId, name, password } = req.body;

  // 필수 데이터 검증
  if (!tableId || !name) {
    return res.status(400).json({
      success: false,
      message: `이름과 비밀번호를 모두 입력해주세요.`,
    });
  }

  try {
    // 유저 조회
    const user = await User.findOne({ tableId, name });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "유저를 찾을 수 없습니다.",
      });
    }

    // 비밀번호 검증 (선택)
    if (password && user.password !== password) {
      return res.status(401).json({
        success: false,
        message: "비밀번호가 일치하지 않습니다.",
      });
    }

    // 유저 삭제
    await User.deleteOne({ tableId, name });

    res.status(200).json({
      success: true,
      message: "유저가 성공적으로 삭제되었습니다.",
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({
      success: false,
      message: "서버 오류가 발생했습니다.",
      error,
    });
  }
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
