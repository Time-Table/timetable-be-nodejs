require("./instrument.js");
require("dotenv").config();
const Sentry = require("@sentry/node");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const connectDB = require("./config/db");
const apiRoutes = require("./routes/index");

const port = process.env.PORT;
const app = express();
app.set("trust proxy", 1);

app.use(helmet());

app.use(cors({ origin: [process.env.CORS, "https://www.timetable2.com"] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

connectDB();

app.use("/api", apiRoutes);

Sentry.setupExpressErrorHandler(app);
app.use(function onError(err, req, res, next) {
  res.statusCode = 500;
  res.end(res.sentry + "\n");
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
