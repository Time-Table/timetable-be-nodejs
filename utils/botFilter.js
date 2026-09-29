/**
 * 스스로 봇이라고 밝히는 요청(User-Agent)을 가린다(2026-09-29 사람 지시, 랜딩 A/B 봇 섞임 대책).
 * 방문·퍼널 기록을 저장하지 않는 데만 쓴다. 응답은 사람과 똑같이 200을 바로 준다.
 * 페이지 내용·A/B 배정은 봇이라고 바꾸지 않는다(검색엔진에 다른 화면을 주면 클로킹이다).
 *
 * UA를 속이는 봇은 못 거른다. 사람 브라우저를 봇으로 잘못 거르지 않도록 이름을 좁게 적는다.
 * 카카오톡·네이버 앱 안 브라우저(KAKAOTALK, NAVER(inapp)는 사람이라 넣지 않는다.
 */
const BOT_PATTERNS = [
  // 검색엔진·광고 확인
  /googlebot|adsbot-google|mediapartners-google|apis-google|feedfetcher-google|google-inspectiontool|storebot-google|googleother|google-read-aloud/i,
  /bingbot|bingpreview|msnbot|adidxbot/i,
  /yeti\/|naverbot|daumoa|yandex|baiduspider|duckduckbot|slurp|sogou|seznambot|applebot|petalbot/i,
  // SEO·수집 도구, AI 크롤러
  /ahrefsbot|semrushbot|mj12bot|dotbot|rogerbot|screaming frog|bytespider|ccbot|gptbot|chatgpt-user|oai-searchbot|claudebot|claude-web|perplexitybot|amazonbot|diffbot|dataforseobot/i,
  // 미리보기·보관
  /facebookexternalhit|facebot|twitterbot|slackbot|discordbot|telegrambot|kakaotalk-scrap|ia_archiver|archive\.org_bot/i,
  // 자동화 브라우저·점검 도구·스크립트
  /headlesschrome|phantomjs|puppeteer|playwright|selenium|lighthouse|pagespeed|gtmetrix|pingdom|uptimerobot|statuscake|python-requests|python-urllib|curl\/|wget\/|go-http-client|okhttp|java\/|libwww-perl/i,
  // 그 밖에 이름 끝이 bot·crawler·spider이고 바로 뒤에 "/버전"이 붙는 것(예: FooBot/1.0).
  // 휴대폰 이름(CUBOT X30 등)은 뒤에 "/숫자"가 오지 않아 걸리지 않는다.
  /[a-z0-9_.-]*(?:bot|crawler|spider)\/\d/i,
];

/** User-Agent가 비었거나 알려진 봇이면 참. */
const isBotUserAgent = (ua) => {
  if (typeof ua !== "string" || !ua.trim()) return true;
  return BOT_PATTERNS.some((re) => re.test(ua));
};

module.exports = { isBotUserAgent };
