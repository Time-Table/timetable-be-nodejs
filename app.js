require("./instrument.js");
require("dotenv").config();
const Sentry = require("@sentry/node");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");
const Table = require("./models/Table");
const Chat = require("./models/Chat");
const User = require("./models/User");
const Schedule = require("./models/Schedule");
const { v4: uuid } = require("uuid");
const DeletedUser = require("./models/DeletedUser.js");
const Visiter = require("./models/Visiter.js");
const moment = require("moment-timezone");

const port = process.env.PORT;
const app = express();
app.set("trust proxy", 1);

app.use(helmet());

const createLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  limit: 4,
  message: "연속적인 생성 요청은 제한됩니다. 잠시 후 다시 시도하세요.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req, res) => req.method === "OPTIONS",
});

const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  limit: 1500, // 1분 당 30명*50회
  message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req, res) => req.method === "OPTIONS",
});

app.use("/api/create", createLimiter);
app.use("/api", generalLimiter);

app.use(cors({ origin: [process.env.CORS, "https://www.timetable2.com"] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

mongoose
  .connect(process.env.DB_KEY)
  .then(() => console.log(`mongoDB connected!`))
  .catch((err) => {
    console.error("MongoDB 연결 실패:", err);
    process.exit(1);
  });

app.post("/api/trackVisit", async (req, res) => {
  const { page } = req.body;
  const today = moment().tz("Asia/Seoul").format("YYYY-MM-DD");

  try {
    let visiterData = await Visiter.findOne({ date: today });

    if (!visiterData) {
      const previousData = await Visiter.findOne().sort({ date: -1 });

      visiterData = new Visiter({
        date: today,
        todayVisitCreatePage: 0,
        todayVisitAboutPage: 0,
        todayVisitUsePage: 0,
        totalVisitCreatePage: previousData ? previousData.totalVisitCreatePage : 0,
        totalVisitAboutPage: previousData ? previousData.totalVisitAboutPage : 0,
        totalVisitUsePage: previousData ? previousData.totalVisitUsePage : 0,
        totalSignUp: previousData ? previousData.totalSignUp : 0,
        totalLogin: previousData ? previousData.totalLogin : 0,
      });
    }

    if (page === "create") {
      visiterData.todayVisitCreatePage += 1;
      visiterData.totalVisitCreatePage += 1;
    } else if (page === "about") {
      visiterData.todayVisitAboutPage += 1;
      visiterData.totalVisitAboutPage += 1;
    } else if (page === "table") {
      visiterData.todayVisitUsePage += 1;
      visiterData.totalVisitUsePage += 1;
    }

    await visiterData.save();

    res.status(200).json({
      success: true,
      message: `${page} 페이지 방문 기록 업데이트 완료`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "서버 오류 발생", err });
  }
});

app.get("/api/getTrackVisit", async (req, res) => {
  try {
    const visiterData = await Visiter.find().sort({ date: -1 });

    if (!visiterData || visiterData.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          "정보가 비었어요.": "😭",
        },
      });
    }

    res.status(200).json({
      success: true,
      data: visiterData,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "서버 오류 발생", err });
  }
});

app.post("/api/create", async (req, res) => {
  const { title, dates, startHour, endHour, banedCells } = req.body;
  const tableId = uuid();

  try {
    const table = new Table({
      title,
      tableId,
      dates,
      startHour,
      endHour,
      banedCells,
    });

    const savedTable = await table.save();

    const today = moment().tz("Asia/Seoul").format("YYYY-MM-DD");
    let visiterData = await Visiter.findOne({ date: today });
    if (!visiterData) {
      visiterData = new Visiter({
        date: today,
        todayTableCreateCount: 1,
        totalTableCreateCount: await Table.countDocuments({}),
      });
    } else {
      visiterData.todayTableCreateCount += 1;
      visiterData.totalTableCreateCount = await Table.countDocuments({});
    }

    await visiterData.save();

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
});

app.get("/api/tableInfo", async (req, res) => {
  const { tableId } = req.query;

  if (!tableId) {
    return res.status(400).json({ success: false, message: "TableId를 받지 못했습니다." });
  }
  //TTL
  // const expiresAfter = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000); // 현재 시간 + 100일
  // const userData = await User.findOne({ tableId: tableId });
  // const scheduleData = await Schedule.findOne({ tableId: tableId });
  // const chatData = await Chat.findOne({ tableId: tableId });

  // try {
  //   if (userData) {
  //     userData.expiresAfter = expiresAfter;

  //     await userData.save();
  //   }
  //   if (scheduleData) {
  //     scheduleData.expiresAfter = expiresAfter;
  //     await scheduleData.save();
  //   }
  //   if (chatData) {
  //     chatData.expiresAfter = expiresAfter;
  //     await chatData.save();
  //   }

  //   if (
  //     !tableData
  //     // || !userData || !scheduleData || !chatData
  //   ) {
  //     return res.status(404).json({
  //       success: false,
  //       message: "테이블을 찾을 수 없습니다.",
  //       queriedId: tableId,
  //     });
  //   }

  //   // expiresAfter 갱신
  //   tableData.expiresAfter = expiresAfter;

  //   await tableData.save();
  try {
    const tableData = await Table.findOne({ tableId: tableId });
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
});

app.post("/api/join", async (req, res) => {
  const { tableId, name, password, availableTimes } = req.body;
  const inputCondition = /^[A-Za-z0-9\uAC00-\uD7A3\u3131-\u318E\s]+$/;

  if (!tableId || !name || !password) {
    return res.status(400).json({
      success: false,
      code: 400,
      message: "필수 데이터를 입력하세요.",
    });
  }

  if (!inputCondition.test(name)) {
    return res.status(401).json({
      success: false,
      code: 401,
      message: "이름 양식이 잘못되었습니다.",
    });
  }

  try {
    const tableData = await Table.findOne({ tableId });
    if (!tableData) {
      return res.status(404).json({
        success: false,
        code: 404,
        message: "테이블을 찾을 수 없습니다.",
        queriedId: tableId,
      });
    }

    const userData = await User.findOne({ tableId, name }).select("+password");
    if (userData) {
      const isMatch = await userData.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({
          code: 401,
          success: false,
          message: "비밀번호가 일치하지 않습니다.",
        });
      }

      try {
        const today = moment().tz("Asia/Seoul").format("YYYY-MM-DD");
        let visiterData = await Visiter.findOne({ date: today });
        if (!visiterData) {
          visiterData = new Visiter({ date: today });
        }
        visiterData.todayLogin += 1;
        await visiterData.save();
      } catch (err) {
        return res.status(500).json({
          success: false,
          message: "서버 오류 발생",
          code: 500,
          err,
        });
      }

      return res.status(200).json({
        success: true,
        code: 200,
        data: { name: userData.name, availableTimes: userData.availableTimes },
        message: "해당 유저로 로그인됩니다.",
      });
    }

    const user = new User({
      tableId,
      name,
      password,
      availableTimes,
    });

    await user.save();

    try {
      const today = moment().tz("Asia/Seoul").format("YYYY-MM-DD");

      let visiterData = await Visiter.findOne({ date: today });
      if (!visiterData) {
        visiterData = new Visiter({ date: today });
      }
      visiterData.todaySignUp += 1;
      await visiterData.save();
    } catch (err) {
      return res.status(500).json({ success: false, message: "서버 오류 발생", code: 400, err });
    }

    return res.status(200).json({
      success: true,
      code: 201,
      message: "유저 등록 성공",
      data: { name: user.name, availableTimes: user.availableTimes },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: "이미 사용 중인 이름입니다. 다른 이름을 선택하세요.",
      });
    }
    Sentry.captureException(err);

    return res.status(500).json({
      success: false,
      code: 500,
      message: "서버 오류가 발생했습니다.",
      err,
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
        message: "존재하지 않는 유저입니다.",
      });
    }

    const isMatch = await userData.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        code: 401,
        message: "비밀번호가 틀렸습니다.",
      });
    }

    res.status(200).json({
      success: true,
      code: 200,
      data: {
        availableTimes: userData.availableTimes,
        name: userData.name,
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({
      success: false,
      message: "서버 오류가 발생했습니다.",
      err,
    });
  }
});

app.delete("/api/deleteUser", async (req, res) => {
  const { tableId, name, password } = req.body;

  if (!tableId || !name) {
    return res.status(400).json({
      success: false,
      message: `이름과 비밀번호를 모두 입력해주세요.`,
    });
  }

  try {
    const user = await User.findOne({ tableId, name });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "유저를 찾을 수 없습니다.",
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "비밀번호가 일치하지 않습니다.",
      });
    }

    const { availableTimes, _id } = user;

    const deletedUser = new DeletedUser({ tableId, name, userId: _id, availableTimes });
    await deletedUser.save();

    await User.deleteOne({ tableId, name });

    const users = await User.find({ tableId });
    const schedule = await Schedule.findOne({ tableId });
    if (schedule) {
      const timeMembersMap = {};
      users.forEach((user) => {
        user.availableTimes.forEach((time) => {
          if (!timeMembersMap[time]) {
            timeMembersMap[time] = [];
          }
          timeMembersMap[time].push(user.name);
        });
      });

      const totalUsers = users.length;

      const updatedTimeInfo = Object.entries(timeMembersMap).map(([time, members]) => {
        const count = members.length;

        let colorNumber = 20;
        const percentage = totalUsers > 0 ? (count / totalUsers) * 100 : 0;

        if (percentage > 80) {
          colorNumber = 100;
        } else if (percentage > 60) {
          colorNumber = 80;
        } else if (percentage > 40) {
          colorNumber = 60;
        } else if (percentage > 20) {
          colorNumber = 40;
        }

        return {
          time,
          colorNumber,
          count,
          members,
        };
      });

      schedule.timeInfo = updatedTimeInfo;
      await schedule.save();
    }

    res.status(200).json({
      success: true,
      message: "유저가 성공적으로 삭제되었습니다.",
    });
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({
      success: false,
      message: "서버 오류가 발생했습니다.",
      err,
    });
  }
});

app.post("/api/addSchedule", async (req, res) => {
  const { tableId, name, availableTimes } = req.body;

  if (!tableId || !name || !Array.isArray(availableTimes)) {
    return res.status(400).json({
      success: false,
      message: "필수 데이터를 올바르게 입력하세요. (tableId, name, availableTimes)",
    });
  }

  try {
    const user = await User.findOne({ tableId, name });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "유저를 찾을 수 없습니다.",
      });
    }

    user.availableTimes = Array.from(new Set([...availableTimes]));
    await user.save();

    const users = await User.find({ tableId });

    if (!users || users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No users found for the given TableId.",
      });
    }

    const timeMembersMap = {};

    users.forEach((user) => {
      user.availableTimes.forEach((time) => {
        if (!timeMembersMap[time]) {
          timeMembersMap[time] = [];
        }
        timeMembersMap[time].push(user.name);
      });
    });

    const totalUsers = users.length;

    const timeInfo = Object.entries(timeMembersMap).map(([time, members]) => {
      const count = members.length;
      const percentage = (count / totalUsers) * 100;
      let colorNumber = 20;

      if (percentage > 80) {
        colorNumber = 100;
      } else if (percentage > 60) {
        colorNumber = 80;
      } else if (percentage > 40) {
        colorNumber = 60;
      } else if (percentage > 20) {
        colorNumber = 40;
      }

      return {
        time,
        colorNumber,
        count: count,
        members,
      };
    });

    const existingSchedule = await Schedule.findOne({ tableId });
    if (existingSchedule) {
      existingSchedule.timeInfo = timeInfo;
      await existingSchedule.save();
    } else {
      await Schedule.create({ tableId, timeInfo });
    }

    res.status(200).json({
      success: true,
      message: "스케줄이 성공적으로 업데이트되었습니다.",
      data: { userAvailableTimes: user.availableTimes, scheduleTimeInfo: timeInfo },
    });
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({
      success: false,
      message: "서버 오류가 발생했습니다.",
      err,
    });
  }
});

app.get("/api/users", async (req, res) => {
  const { tableId } = req.query;

  if (!tableId) {
    return res.status(400).json({
      success: false,
      message: "tableId가 제공되지 않았습니다.",
    });
  }

  try {
    const users = await User.find({ tableId }, "name availableTimes");

    if (!users || users.length === 0) {
      return res.status(201).json({
        success: true,
        message: "해당 테이블에 유저가 존재하지 않습니다.",
        code: 201,
      });
    }

    return res.status(200).json({
      success: true,
      data: users,
      code: 200,
    });
  } catch (err) {
    Sentry.captureException(err);
    res.status(500).json({
      success: false,
      message: "서버 오류가 발생했습니다.",
      err,
    });
  }
});

app.post("/api/generateSchedule", async (req, res) => {
  const { tableId } = req.body;

  if (!tableId) {
    return res.status(400).json({
      success: false,
      message: "TableId is required.",
    });
  }

  try {
    const users = await User.find({ tableId });

    if (!users || users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No users found for the given TableId.",
      });
    }
    const timeCounts = {};
    users.forEach((user) => {
      user.availableTimes.forEach((time) => {
        timeCounts[time] = (timeCounts[time] || 0) + 1;
      });
    });

    const totalUsers = users.length;

    const timeInfo = Object.entries(timeCounts).map(([time, count]) => {
      const percentage = (count / totalUsers) * 100;
      let colorNumber = 20;

      if (percentage > 80) {
        colorNumber = 100;
      } else if (percentage > 60) {
        colorNumber = 80;
      } else if (percentage > 40) {
        colorNumber = 60;
      } else if (percentage > 20) {
        colorNumber = 40;
      }

      return {
        time,
        colorNumber,
      };
    });

    const existingSchedule = await Schedule.findOne({ tableId });
    if (existingSchedule) {
      existingSchedule.timeInfo = timeInfo;
      await existingSchedule.save();
    } else {
      await Schedule.create({ tableId, timeInfo });
    }

    return res.status(200).json({
      success: true,
      message: "Schedule generated successfully.",
      data: timeInfo,
    });
  } catch (err) {
    Sentry.captureException(err);
    return res.status(500).json({
      success: false,
      message: "An error occurred while generating the schedule.",
      err,
    });
  }
});

app.get("/api/getSchedule", async (req, res) => {
  const { tableId } = req.query;

  if (!tableId) {
    return res.status(400).json({
      success: false,
      message: "TableId is required.",
    });
  }

  try {
    const schedule = await Schedule.findOne({ tableId });

    if (!schedule) {
      return res.status(201).json({
        success: true,
        message: "등록된 스케줄이 없습니다.",
      });
    }

    return res.status(200).json({
      success: true,
      data: schedule.timeInfo,
    });
  } catch (err) {
    Sentry.captureException(err);
    return res.status(500).json({
      success: false,
      message: "An error occurred while fetching the schedule.",
      err,
    });
  }
});

app.post("/api/postChat", async (req, res) => {
  const { tableId, name, message } = req.body;

  if (!tableId || !name || !message) {
    return res.status(400).json({
      success: false,
      message: "필수 데이터를 모두 입력하세요. (tableId, name, message)",
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

    const existingChat = await Chat.findOne({ tableId });
    if (existingChat) {
      existingChat.chats.push({
        name,
        message: message,
        timestamp: new Date(),
      });
      await existingChat.save();
    } else {
      const newChat = new Chat({
        tableId,
        chats: [{ name, message: message, timestamp: new Date() }],
      });
      await newChat.save();
    }

    return res.status(200).json({
      success: true,
      message: "채팅 메시지가 저장되었습니다.",
    });
  } catch (err) {
    Sentry.captureException(err);
    return res.status(500).json({
      success: false,
      message: "서버 오류가 발생했습니다.",
      err,
    });
  }
});

app.get("/api/getChating", async (req, res) => {
  const { tableId } = req.query;

  if (!tableId) {
    return res.status(400).json({
      success: false,
      message: "tableId를 입력하세요.",
    });
  }

  try {
    const chatData = await Chat.findOne({ tableId });

    if (!chatData) {
      return res.status(201).json({
        success: true,
        message: "채팅 기록이 없습니다.",
        queriedId: tableId,
        status: 201,
      });
    }

    return res.status(200).json({
      success: true,
      data: chatData.chats,
      status: 200,
    });
  } catch (err) {
    Sentry.captureException(err);
    return res.status(500).json({
      success: false,
      message: "서버 오류가 발생했습니다.",
      err,
    });
  }
});

Sentry.setupExpressErrorHandler(app);
app.use(function onError(err, req, res, next) {
  res.statusCode = 500;
  res.end(res.sentry + "\n");
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
