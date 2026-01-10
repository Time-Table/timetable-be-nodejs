const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.DB_KEY);
    console.log(`mongoDB connected!`);
  } catch (err) {
    console.error("MongoDB 연결 실패:", err);
    process.exit(1);
  }
};

module.exports = connectDB;
