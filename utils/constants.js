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
