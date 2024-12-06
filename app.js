require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const Table = require("./models/Table");
const Chat = require("./models/Chat");
const User = require("./models/User");
const Schedule = require("./models/schedule");
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

app.post("/api/join", async (req, res) => {
  const { tableId, name, password, availableTimes } = req.body;

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
    const userData = await User.findOne({ tableId, name, password });
    if (userData)
      return res.status(201).json({
        success: true,
        data: userData,
        message: "해당 유저로 로그인됩니다.",
      });

    const user = new User({
      tableId,
      name,
      password,
      availableTimes,
    });

    await user.save();

    return res.status(200).json({
      success: true,
      code: 200,
      message: "유저 등록 성공",
      data: { name: user.name, availableTimes: user.availableTimes },
    });
  } catch (error) {
    console.error("/api/join error:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: "이미 사용 중인 이름입니다. 다른 이름을 선택하세요.",
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
        message: "존재하지 않는 유저입니다.",
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
      message: "이미 사용 중인 이름입니다. 다른 이름을 선택하세요.",
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

    if (password && user.password !== password) {
      return res.status(401).json({
        success: false,
        message: "비밀번호가 일치하지 않습니다.",
      });
    }

    const { availableTimes } = user;
    await User.deleteOne({ tableId, name });
    const schedule = await Schedule.findOne({ tableId });
    if (schedule) {
      const updatedTimeInfo = schedule.timeInfo
        .map((timeEntry) => {
          if (availableTimes.includes(timeEntry.time)) {
            const updatedMembers = timeEntry.members.filter((member) => member !== name);

            return {
              ...timeEntry,
              members: updatedMembers,
              count: updatedMembers.length,
            };
          }
          return timeEntry;
        })
        .filter((timeEntry) => timeEntry.members.length > 0);
      schedule.timeInfo = updatedTimeInfo;
      await schedule.save();
    }

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
  } catch (error) {
    console.error("Error updating schedule:", error);
    res.status(500).json({
      success: false,
      message: "서버 오류가 발생했습니다.",
      error,
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
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({
      success: false,
      message: "서버 오류가 발생했습니다.",
      error,
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
  } catch (error) {
    console.error("Error generating schedule:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while generating the schedule.",
      error,
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
  } catch (error) {
    console.error("Error fetching schedule:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while fetching the schedule.",
      error,
    });
  }
});

app.post("/api/postChat", async (req, res) => {
  const { tableId, name, message } = req.body;

  if (!tableId || !name || !message) {
    console.log(tableId, name, message);
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
  } catch (error) {
    console.error("Error posting chat:", error);
    return res.status(500).json({
      success: false,
      message: "서버 오류가 발생했습니다.",
      error,
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
  } catch (error) {
    console.error("Error fetching chat:", error);
    return res.status(500).json({
      success: false,
      message: "서버 오류가 발생했습니다.",
      error,
    });
  }
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
