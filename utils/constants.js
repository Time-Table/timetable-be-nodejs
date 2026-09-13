const NAME_VALIDATION_REGEX = /^[A-Za-z0-9\uAC00-\uD7A3\u3131-\u318E\s]+$/;
const TIMEZONE = "Asia/Seoul";

const COLOR_THRESHOLDS = {
  HIGH: 80,
  MEDIUM_HIGH: 60,
  MEDIUM: 40,
  LOW: 20,
};

const COLOR_VALUES = {
  MAX: 100,
  HIGH: 80,
  MEDIUM: 60,
  LOW: 40,
  MIN: 20,
};

const RATE_LIMIT = {
  CREATE_WINDOW_MS: 1 * 60 * 1000,
  CREATE_MAX: 8,
  GENERAL_WINDOW_MS: 1 * 60 * 1000,
  GENERAL_MAX: 1500,
  // 비밀번호가 4자리(10,000가지)라 무차별 대입이 현실적인 위협이다.
  // 실패 기준으로만 세므로 정상 사용에는 걸리지 않는다.
  ADMIN_LOGIN_WINDOW_MS: 15 * 60 * 1000,
  ADMIN_LOGIN_MAX: 5,
  // 블로그 조회 기록은 영구 저장이라 전역 제한(분당 1500회)만으로는 무의미한 문서가 쌓일 수 있다.
  // 두 겹으로 건다. 브라우저(visitorId)당 분당 20회 — 한 사람이 1분에 20편을 읽지는 않는다.
  // IP당 분당 120회 — 학교·회사처럼 한 IP를 여럿이 쓰는 망의 정상 독자가 잘리지 않을 만큼 넉넉하고,
  // visitorId를 바꿔 가며 적재하는 것을 막는다.
  BLOG_VIEW_WINDOW_MS: 1 * 60 * 1000,
  BLOG_VIEW_VISITOR_MAX: 20,
  BLOG_VIEW_IP_MAX: 120,
};

const VALIDATION_RULES = {
  NAME: {
    REGEX: /^[A-Za-z0-9\uAC00-\uD7A3\u3131-\u318E\s]+$/,
    MAX_LENGTH: 15,
    MIN_LENGTH: 1,
  },
  PASSWORD: {
    MAX_LENGTH: 15,
    MIN_LENGTH: 1,
  },
  TITLE: {
    MAX_LENGTH: 25,
    MIN_LENGTH: 1,
  },
  MESSAGE: {
    MAX_LENGTH: 500,
    MIN_LENGTH: 1,
  },
  // 블로그 조회 기록. slug는 blogPosts.js의 slug 형식(소문자·숫자·하이픈)만 받는다.
  BLOG_SLUG: /^[a-z0-9-]{1,80}$/,
  VISITOR_ID: { MAX_LENGTH: 64 },
  TIME_FORMAT: /^([01]\d|2[0-3]):([0-5]\d)$|^24:00$/, // HH:mm format, allowing 24:00
  DATE_FORMAT: /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD format
};

module.exports = {
  NAME_VALIDATION_REGEX,
  TIMEZONE,
  COLOR_THRESHOLDS,
  COLOR_VALUES,
  RATE_LIMIT,
  VALIDATION_RULES,
};
