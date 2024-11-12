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
  const meetingId = uuid();
  const table = new Table({
    title,
    meetingId,
    dates,
    startHour,
    endHour,
    banedCells,
  });
  try {
    await table.save();
    res.status(200).json({
      success: true,
      code: 200,
      message: "테이블 등록 성공",
      data: { meetingId: meetingId },
    });
  } catch (err) {
    console.error("/api/create error:", err);
    res.status(400).json({ success: false, err: err, code: 400 });
  }
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
