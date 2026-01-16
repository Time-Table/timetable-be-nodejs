const Visiter = require("../models/Visiter");
const moment = require("moment-timezone");
const { TIMEZONE } = require("../utils/constants");

const updateVisitStats = async (updateFields) => {
  const today = moment().tz(TIMEZONE).format("YYYY-MM-DD");

  // Create an object to hold all increments (both today and total)
  const incUpdateFields = { ...updateFields };
  
  if (updateFields.todayVisitCreatePage) incUpdateFields.totalVisitCreatePage = updateFields.todayVisitCreatePage;
  if (updateFields.todayVisitAboutPage) incUpdateFields.totalVisitAboutPage = updateFields.todayVisitAboutPage;
  if (updateFields.todayVisitUsePage) incUpdateFields.totalVisitUsePage = updateFields.todayVisitUsePage;
  if (updateFields.todayTableCreateCount) incUpdateFields.totalTableCreateCount = updateFields.todayTableCreateCount;
  if (updateFields.todaySignUp) incUpdateFields.totalSignUp = updateFields.todaySignUp;
  if (updateFields.todayLogin) incUpdateFields.totalLogin = updateFields.todayLogin;

  try {
    const updatedVisiter = await Visiter.findOneAndUpdate(
      { date: today },
      { $inc: incUpdateFields },
      { new: true }
    );

    if (updatedVisiter) {
      return updatedVisiter;
    }

    const previousData = await Visiter.findOne().sort({ date: -1 });

    const newVisiterData = {
      date: today,
      todayVisitCreatePage: updateFields.todayVisitCreatePage || 0,
      todayVisitAboutPage: updateFields.todayVisitAboutPage || 0,
      todayVisitUsePage: updateFields.todayVisitUsePage || 0,
      todayTableCreateCount: updateFields.todayTableCreateCount || 0,
      todaySignUp: updateFields.todaySignUp || 0,
      todayLogin: updateFields.todayLogin || 0,

      totalVisitCreatePage:
        (previousData ? previousData.totalVisitCreatePage : 0) +
        (updateFields.todayVisitCreatePage || 0),
      totalVisitAboutPage:
        (previousData ? previousData.totalVisitAboutPage : 0) +
        (updateFields.todayVisitAboutPage || 0),
      totalVisitUsePage:
        (previousData ? previousData.totalVisitUsePage : 0) + (updateFields.todayVisitUsePage || 0),
      totalTableCreateCount:
        (previousData ? previousData.totalTableCreateCount : 0) +
        (updateFields.todayTableCreateCount || 0),
      totalSignUp: (previousData ? previousData.totalSignUp : 0) + (updateFields.todaySignUp || 0),
      totalLogin: (previousData ? previousData.totalLogin : 0) + (updateFields.todayLogin || 0),
    };

    const newVisiter = new Visiter(newVisiterData);

    try {
      await newVisiter.save();
      return newVisiter;
    } catch (saveErr) {
      if (saveErr.code === 11000) {
        return await Visiter.findOneAndUpdate(
          { date: today },
          { $inc: incUpdateFields },
          { new: true }
        );
      } else {
        throw saveErr;
      }
    }
  } catch (err) {
    throw err;
  }
};

const getVisitStats = async () => {
  return await Visiter.find().sort({ date: -1 });
};

module.exports = {
  updateVisitStats,
  getVisitStats,
};
