const { COLOR_THRESHOLDS, COLOR_VALUES } = require("./constants");

/**
 * @param {Array} users
 * @returns {Array}
 */
const calculateTimeInfo = (users) => {
  const timeMembersMap = {};

  users.forEach((user) => {
    if (user.availableTimes) {
      user.availableTimes.forEach((time) => {
        if (!timeMembersMap[time]) {
          timeMembersMap[time] = [];
        }
        timeMembersMap[time].push(user.name);
      });
    }
  });

  const totalUsers = users.length;

  return Object.entries(timeMembersMap).map(([time, members]) => {
    const count = members.length;
    let colorNumber = COLOR_VALUES.LOW;
    const percentage = totalUsers > 0 ? (count / totalUsers) * 100 : 0;

    if (percentage > COLOR_THRESHOLDS.HIGH) {
      colorNumber = COLOR_VALUES.MAX;
    } else if (percentage > COLOR_THRESHOLDS.MEDIUM_HIGH) {
      colorNumber = COLOR_VALUES.HIGH;
    } else if (percentage > COLOR_THRESHOLDS.MEDIUM) {
      colorNumber = COLOR_VALUES.MEDIUM;
    } else if (percentage > COLOR_THRESHOLDS.LOW) {
      colorNumber = COLOR_VALUES.LOW;
    }

    return {
      time,
      colorNumber,
      count,
      members,
    };
  });
};

/**
 * @param {Array} users
 * @returns {Array}
 */
const calculateSimpleTimeInfo = (users) => {
  const timeCounts = {};
  users.forEach((user) => {
    if (user.availableTimes) {
      user.availableTimes.forEach((time) => {
        timeCounts[time] = (timeCounts[time] || 0) + 1;
      });
    }
  });

  const totalUsers = users.length;

  return Object.entries(timeCounts).map(([time, count]) => {
    const percentage = totalUsers > 0 ? (count / totalUsers) * 100 : 0;
    let colorNumber = COLOR_VALUES.LOW;

    if (percentage > COLOR_THRESHOLDS.HIGH) {
      colorNumber = COLOR_VALUES.MAX;
    } else if (percentage > COLOR_THRESHOLDS.MEDIUM_HIGH) {
      colorNumber = COLOR_VALUES.HIGH;
    } else if (percentage > COLOR_THRESHOLDS.MEDIUM) {
      colorNumber = COLOR_VALUES.MEDIUM;
    } else if (percentage > COLOR_THRESHOLDS.LOW) {
      colorNumber = COLOR_VALUES.LOW;
    }

    return {
      time,
      colorNumber,
    };
  });
};

module.exports = { calculateTimeInfo, calculateSimpleTimeInfo };
