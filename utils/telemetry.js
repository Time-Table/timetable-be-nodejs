const Sentry = require("@sentry/node");

// Business writes have already succeeded at these call sites. Never replay them.
// This bounds response waiting, not cancellation of an in-flight MongoDB write.
const WAIT_MS = 250;

const log = (operation, outcome, durationMs) => {
  try {
    console.info(JSON.stringify({ type: "telemetry", operation, outcome, durationMs }));
  } catch (_) { /* Logging must not change the API result. */ }
  if (outcome === "failure" || outcome === "timeout") {
    try {
      Sentry.captureMessage(`telemetry:${operation}:${outcome}`, "warning");
    } catch (_) { /* Sentry is optional. No request data is sent. */ }
  }
};

const runTelemetry = async (operation, task, { retry = false, waitMs = WAIT_MS } = {}) => {
  const started = Date.now();
  let expired = false;
  let timer;
  log(operation, "attempt", 0);
  const work = (async () => {
    for (let attempt = 0; attempt < (retry ? 2 : 1); attempt += 1) {
      try {
        const value = await task();
        return { ok: true, value };
      } catch (_) {
        if (expired || !retry || attempt === 1) return { ok: false, reason: "failure" };
      }
    }
  })();
  const result = await Promise.race([
    work,
    new Promise((resolve) => {
      timer = setTimeout(() => {
        expired = true;
        resolve({ ok: false, reason: "timeout" });
      }, waitMs);
    }),
  ]);
  clearTimeout(timer);
  log(operation, result.ok ? "success" : result.reason, Date.now() - started);
  return result;
};

module.exports = { runTelemetry };
