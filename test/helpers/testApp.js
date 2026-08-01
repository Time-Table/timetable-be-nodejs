const express = require("express");

/**
 * 실제 라우터를 그대로 마운트하되 DB에는 연결하지 않는 테스트용 앱.
 *
 * app.js를 쓰지 않는 이유: app.js는 모듈 로드 시점에 connectDB()와 listen()을 실행한다.
 * 테스트가 운영 MongoDB에 붙는 일은 절대 없어야 하므로 라우터만 떼어 쓴다.
 * 따라서 여기서 검증할 수 있는 것은 DB에 닿기 전에 끝나는 경계(인증·검증)뿐이다.
 */
const createTestApp = () => {
  // 연결이 없는 상태에서 mongoose는 쿼리를 기본 10초간 버퍼링한다.
  // DB에 닿는 라우트가 테스트를 10초씩 잡아먹지 않도록 즉시 실패시킨다.
  require("mongoose").set("bufferTimeoutMS", 200);

  const apiRoutes = require("../../routes/index");
  const { detectAdminMode } = require("../../middlewares/adminMode");

  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use(detectAdminMode);
  app.use("/api", apiRoutes);
  return app;
};

/** 임의 포트로 띄우고 (fetch 기준 URL, 종료 함수)를 돌려준다. */
const startTestServer = async () => {
  // 루프백에 명시적으로 바인딩한다. 주소를 생략하면 0.0.0.0에 붙는데,
  // 샌드박스 환경에서는 EPERM으로 막혀 테스트가 통째로 실행되지 않는다.
  const server = createTestApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();

  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

module.exports = { createTestApp, startTestServer };
