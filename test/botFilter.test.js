const test = require("node:test");
const assert = require("node:assert/strict");
const Event = require("../models/Event");
const visitService = require("../services/visitService");
const { isBotUserAgent } = require("../utils/botFilter");
const { startTestServer } = require("./helpers/testApp");

// 2026-09-29 랜딩 A/B 봇 섞임 대책: 스스로 봇이라고 밝히는 요청은 방문·퍼널 기록을 저장하지 않는다.
const BOTS = [
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.0.0 Safari/537.36",
  "Mozilla/5.0 (compatible; Yeti/1.1; +http://naver.me/spd)",
  "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)",
  "Mozilla/5.0 (compatible; SomeNewBot/1.0; +https://example.com)",
  "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse",
  "curl/8.7.1",
  "",
  undefined,
];

const HUMANS = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36;KAKAOTALK 2410370",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 2000; 12.10.2; 15PRO)",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0 (iPhone15,3; iOS 18_5; ko_KR)",
  "Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-A546N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
];

test("스스로 봇이라고 밝히는 UA와 빈 UA는 봇, 사람 브라우저(앱 안 브라우저 포함)는 사람", () => {
  BOTS.forEach((ua) => assert.equal(isBotUserAgent(ua), true, `봇이어야 함: ${ua}`));
  HUMANS.forEach((ua) => assert.equal(isBotUserAgent(ua), false, `사람이어야 함: ${ua}`));
});

test("봇 요청은 방문·이벤트를 저장하지 않고 사람과 같은 200을 바로 준다", async (t) => {
  const events = t.mock.method(Event, "create", async (data) => data);
  const visits = t.mock.method(visitService, "updateVisitStats", async () => ({}));
  const { base, close } = await startTestServer();
  t.after(close);
  const post = (path, body, ua) => fetch(`${base}/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": ua },
    body: JSON.stringify(body),
  });

  const botEvent = await post("events", { name: "landing_view", visitorId: "v-bot" }, BOTS[0]);
  assert.equal(botEvent.status, 200);
  assert.deepEqual(await botEvent.json(), { success: true, skipped: true });
  const botVisit = await post("visits", { page: "landing" }, BOTS[2]);
  assert.equal(botVisit.status, 200);
  assert.deepEqual(await botVisit.json(), { success: true, skipped: true });
  assert.equal(events.mock.callCount(), 0);
  assert.equal(visits.mock.callCount(), 0);

  const humanEvent = await post("events", { name: "landing_view", visitorId: "v-human" }, HUMANS[1]);
  assert.deepEqual(await humanEvent.json(), { success: true });
  const humanVisit = await post("visits", { page: "landing" }, HUMANS[0]);
  assert.equal((await humanVisit.json()).success, true);
  assert.equal(events.mock.callCount(), 1);
  assert.equal(visits.mock.callCount(), 1);
});
