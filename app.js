require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const port = process.env.PORT;
const app = express();
app.use(cors());

mongoose
  .connect(process.env.DB_KEY)
  .then(() => console.log(`mongoDB port:${port}!!!!`))
  .catch((err) => console.log(err));

app.get("/hi", (req, res) => {
  return res.status(200).json({ hi: "Hello World!" });
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
