const visitService = require("../services/visitService");

const trackVisit = async (req, res) => {
  const { page } = req.body;
  
  const updateFields = {};
  if (page === "landing") {
    updateFields.todayVisitLandingPage = 1;
  } else if (page === "create") {
    updateFields.todayVisitCreatePage = 1;
  } else if (page === "about") {
    updateFields.todayVisitAboutPage = 1;
  } else if (page === "table") {
    updateFields.todayVisitUsePage = 1;
  }

  try {
    await visitService.updateVisitStats(updateFields);
    res.status(200).json({
      success: true,
      message: `${page} 페이지 방문 기록 업데이트 완료`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "서버 오류 발생", err });
  }
};

const getTrackVisit = async (req, res) => {
  try {
    const visiterData = await visitService.getVisitStats();

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
};

module.exports = {
  trackVisit,
  getTrackVisit,
};
