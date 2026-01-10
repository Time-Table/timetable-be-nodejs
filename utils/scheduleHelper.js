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
};

module.exports = { calculateTimeInfo, calculateSimpleTimeInfo };
