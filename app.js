require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const Table = require("./models/Table");

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
  //회원 가입 시 필요한 정보를 클라이언트에서
  //가져오면 db에 넣기

  const table = new Table(req.body);
  try {
    await table.save();
    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(400).json({ success: false, err: err });
  }
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
