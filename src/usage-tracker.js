/**
 * src/usage-tracker.js
 * Persistent token usage tracking, RPM monitoring, and rate-limit detection.
 * Stats are written to a host-specific gemini-usage file after every call.
 */
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hostName = os.hostname().replace(/[^a-zA-Z0-9._-]/g, "_") || "unknown-host";
const USAGE_FILE = path.join(__dirname, "..", `gemini-usage.${hostName}.json`);

// ─── Known RPM limits per model tier ─────────────────────────────────────────
const RPM_LIMITS = {
  "2.5-pro":        5,
  "2.5-flash-lite": 30,
  "2.5-flash":      15,
  "2.0-flash":      15,
  "1.5-pro":        2,
  "1.5-flash":      15,
  "default":        15,
};

// In-process RPM ring buffer — timestamps (ms) of requests in the last 60s
const rpmWindow = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyDay() {
  return { calls: 0, errors: 0, rateLimitHits: 0, models: {} };
}

function emptyAll() {
  return { calls: 0, errors: 0, rateLimitHits: 0, models: {} };
}

function loadUsage() {
  try {
    if (fs.existsSync(USAGE_FILE)) {
      return JSON.parse(fs.readFileSync(USAGE_FILE, "utf8"));
    }
  } catch (_) {}
  return { daily: {}, allTime: emptyAll(), lastUpdated: null };
}

function saveUsage(data) {
  try {
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (_) {}
}

function addTokensTo(store, tokens) {
  store.calls = (store.calls || 0) + 1;
  store.inputTokens   = (store.inputTokens   || 0) + (tokens.input    || 0);
  store.outputTokens  = (store.outputTokens  || 0) + (tokens.output   || 0);
  store.thinkingTokens = (store.thinkingTokens || 0) + (tokens.thinking || 0);
  store.totalTokens   = (store.totalTokens   || 0) + (tokens.total    || 0);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Record a completed Gemini call.
 * @param {{ model: string, tokens?: { input, output, thinking, total } }} info
 */
export function trackCall({ model = "default", tokens } = {}) {
  const key = today();
  const data = loadUsage();
  if (!data.daily[key]) data.daily[key] = emptyDay();

  data.daily[key].calls++;
  data.allTime.calls++;

  if (tokens && (tokens.total || tokens.input)) {
    const modelKey = model || "default";
    if (!data.daily[key].models[modelKey]) data.daily[key].models[modelKey] = {};
    if (!data.allTime.models[modelKey])    data.allTime.models[modelKey]    = {};
    addTokensTo(data.daily[key].models[modelKey], tokens);
    addTokensTo(data.allTime.models[modelKey],    tokens);
  }

  // RPM: add timestamp, prune old entries
  const now = Date.now();
  rpmWindow.push(now);
  pruneRpm(now);

  saveUsage(data);
}

/** Record a failed call (non-rate-limit error). */
export function trackError({ model = "default" } = {}) {
  const key = today();
  const data = loadUsage();
  if (!data.daily[key]) data.daily[key] = emptyDay();
  data.daily[key].errors++;
  data.allTime.errors++;
  saveUsage(data);
}

/** Record a rate-limit hit. */
export function trackRateLimit({ model = "default" } = {}) {
  const key = today();
  const data = loadUsage();
  if (!data.daily[key]) data.daily[key] = emptyDay();
  data.daily[key].rateLimitHits++;
  data.allTime.rateLimitHits++;
  saveUsage(data);
}

/** Current requests in the last 60 seconds. */
export function getRpm() {
  pruneRpm(Date.now());
  return rpmWindow.length;
}

/** RPM limit for the given model string. */
export function getRpmLimit(model) {
  if (model) {
    for (const [key, limit] of Object.entries(RPM_LIMITS)) {
      if (model.includes(key)) return limit;
    }
  }
  return RPM_LIMITS.default;
}

/** Returns true if the stderr output looks like a rate-limit / quota error. */
export function isRateLimitError(stderr) {
  const s = (stderr || "").toLowerCase();
  return (
    s.includes("quota") ||
    s.includes("rate limit") ||
    s.includes("rate_limit") ||
    s.includes("429") ||
    s.includes("resource_exhausted") ||
    s.includes("too many requests")
  );
}

/** Load and return the full usage data object. */
export function getUsageStats() {
  return loadUsage();
}

// ─── Internal ─────────────────────────────────────────────────────────────────
function pruneRpm(now) {
  while (rpmWindow.length > 0 && now - rpmWindow[0] > 60_000) {
    rpmWindow.shift();
  }
}
