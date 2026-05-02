/**
 * src/gemini.js
 * Core Gemini CLI runner — shared between index.js, backend.js, and handlers.js
 */
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import { trackCall, trackError, trackRateLimit, isRateLimitError, getRpm, getRpmLimit } from "./usage-tracker.js";

// ─── Logger ─────────────────────────────────────────────────────────────────
// Always write next to the project root (one level up from src/), regardless
// of what cwd Claude Desktop uses when spawning the MCP server process.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hostName = os.hostname().replace(/[^a-zA-Z0-9._-]/g, "_") || "unknown-host";
const logFilePath = path.join(__dirname, "..", `gemini-mcp.${hostName}.log`);

export function logToFile(level, message) {
  try {
    const time = new Date().toISOString();
    fs.appendFileSync(logFilePath, `[${time}] [${level}] ${message}\n`);
  } catch (_) {
    // fail silently — never pollute stdio
  }
}

// ─── Default model state (per-process) ──────────────────────────────────────
export let defaultModel = null;

export function setDefaultModel(model) {
  defaultModel = model ? model.trim() : null;
}

// ─── Task registry ───────────────────────────────────────────────────────────
let taskIdCounter = 0;
const activeTasks = new Map();   // id → task object (running right now)
const recentTasks = [];          // ring buffer — last 10 completed/failed

export function getActiveTasks() {
  return Array.from(activeTasks.values());
}

export function getRecentTasks(n = 10) {
  return recentTasks.slice(-n);
}

// ─── Known models catalogue ──────────────────────────────────────────────────
export const KNOWN_MODELS = [
  { id: "gemini-2.5-pro",         context: "1M tokens", notes: "Самая мощная модель. Лучший выбор для сложных задач, анализа кода, архитектурных решений." },
  { id: "gemini-2.5-flash",       context: "1M tokens", notes: "Быстрая и умная. Оптимальный баланс скорости и качества для большинства задач." },
  { id: "gemini-2.5-flash-lite",  context: "1M tokens", notes: "Ультрабыстрая и дешёвая. Для простых вопросов и маршрутизации." },
  { id: "gemini-3-flash-preview", context: "1M tokens", notes: "🆕 Предпросмотр Gemini 3. Используется CLI как основная модель по умолчанию." },
  { id: "gemini-2.0-flash",       context: "1M tokens", notes: "Предыдущее поколение Flash. Стабильная, хорошо протестированная." },
  { id: "gemini-1.5-pro",         context: "2M tokens", notes: "Огромный контекст 2M токенов. Для анализа очень больших кодовых баз." },
  { id: "gemini-1.5-flash",       context: "1M tokens", notes: "Быстрая версия 1.5. Хороша для потоковых задач." },
];

// ─── Core runner ─────────────────────────────────────────────────────────────
/**
 * @param {string} prompt
 * @param {string|undefined} cwd
 * @param {{ model?: string, includeStats?: boolean, includeDirectories?: string[],
 *           yolo?: boolean, sandbox?: boolean, worktree?: boolean|string,
 *           policy?: string }} [options]
 * @returns {Promise<{text: string, stats?: string}>}
 */
export function runGemini(prompt, cwd, options = {}, _attempt = 0) {
  return new Promise((resolve, reject) => {
    // On Windows, shell:true has arg-passing issues with spaces — wrap in quotes explicitly
    const safePrompt =
      process.platform === "win32" ? `"${prompt.replace(/"/g, '\\"')}"` : prompt;
    const args = ["-p", safePrompt];

    const modelToUse = options.model || defaultModel;
    if (modelToUse) args.push("-m", modelToUse);
    if (options.includeStats) args.push("-o", "json");
    if (options.includeDirectories && Array.isArray(options.includeDirectories)) {
      for (const dir of options.includeDirectories) {
        args.push("--include-directories", path.resolve(cwd || process.cwd(), dir));
      }
    }
    if (options.yolo) args.push("--yolo");
    if (options.sandbox) args.push("--sandbox");
    if (options.worktree) {
      args.push("--worktree");
      if (typeof options.worktree === "string") args.push(options.worktree);
    }
    if (options.policy) args.push("--policy", options.policy);

    const command = process.platform === "win32" ? "gemini.cmd" : "gemini";

    // Fall back to user home rather than whatever cwd the host inherited
    // (e.g. C:\Windows\System32 under Claude Desktop — causes EPERM spam)
    const safeCwd = cwd || process.env.USERPROFILE || process.env.HOME || path.join(__dirname, "..");

    // RPM warning
    const currentRpm = getRpm();
    const rpmLimit   = getRpmLimit(modelToUse);
    if (currentRpm >= rpmLimit - 1) {
      logToFile("WARN", `RPM near limit: ${currentRpm}/${rpmLimit} req/min for model ${modelToUse || "default"}`);
    }

    logToFile("INFO", `--- NEW REQUEST (attempt ${_attempt + 1}) ---`);
    logToFile("INFO", `CWD: ${safeCwd}`);
    logToFile("INFO", `RPM: ${currentRpm}/${rpmLimit}`);
    logToFile("INFO", `Options: ${JSON.stringify(options)}`);
    logToFile("INFO", `Prompt: ${prompt.substring(0, 150)}...`);

    // Register task in the active registry
    const taskId = ++taskIdCounter;
    const taskEntry = {
      id: taskId,
      startedAt: Date.now(),
      prompt: prompt.substring(0, 120) + (prompt.length > 120 ? "…" : ""),
      model: modelToUse || "default",
      status: "running",
      bytesReceived: 0,
      lastActivityAt: Date.now(),
    };
    activeTasks.set(taskId, taskEntry);
    const proc = spawn(command, args, {
      cwd: safeCwd,
      shell: true,
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
      taskEntry.bytesReceived += data.length;
      taskEntry.lastActivityAt = Date.now();
    });
    proc.stderr.on("data", (data) => {
      const msg = data.toString();
      stderr += msg;
      taskEntry.lastActivityAt = Date.now();
      logToFile("WARN_STDERR", msg.trim());
    });

    const _finalizeTask = (status) => {
      activeTasks.delete(taskId);
      recentTasks.push({ ...taskEntry, status, endedAt: Date.now(), durationMs: Date.now() - taskEntry.startedAt });
      if (recentTasks.length > 10) recentTasks.shift();
    };

    proc.on("close", (code) => {
      logToFile("INFO", `Process closed with code ${code}`);

      if (code === 0) {
        _finalizeTask("completed");
        const outputText = stdout.trim();
        logToFile("INFO", `Successfully received ${outputText.length} bytes of output`);

        if (options.includeStats) {
          try {
            const data = JSON.parse(outputText);
            const result = data.response || data.content || "";
            let statsStr = "";

            if (data.stats?.models) {
              statsStr = "─── Token Usage ───────────────────\n";
              for (const [modelName, modelStats] of Object.entries(data.stats.models)) {
                const tokens = modelStats.tokens || {};
                const api    = modelStats.api    || {};
                statsStr += `🤖 ${modelName}\n`;
                statsStr += `   Input:    ${tokens.input || 0} tokens`;
                if (tokens.cached)   statsStr += ` (${tokens.cached} cached)`;
                statsStr += "\n";
                if (tokens.thoughts) statsStr += `   Thinking: ${tokens.thoughts} tokens\n`;
                statsStr += `   Output:   ${tokens.candidates || 0} tokens\n`;
                statsStr += `   Total:    ${tokens.total || 0} tokens\n`;
                if (api.totalLatencyMs) statsStr += `   Latency:  ${api.totalLatencyMs}ms\n`;

                // Record per-model token usage
                trackCall({
                  model: modelName,
                  tokens: {
                    input:    tokens.input      || 0,
                    output:   tokens.candidates || 0,
                    thinking: tokens.thoughts   || 0,
                    total:    tokens.total      || 0,
                  },
                });
              }
            } else {
              // Stats flag was set but no model breakdown — count the call
              trackCall({ model: modelToUse || "default" });
            }

            if (data.stats?.tools?.totalCalls > 0) {
              const t = data.stats.tools;
              statsStr += `─── Tools ──────────────────────────\n`;
              statsStr += `   Calls: ${t.totalCalls} (✓${t.totalSuccess} ✗${t.totalFail})\n`;
            }
            if (data.stats?.files) {
              const f = data.stats.files;
              if (f.totalLinesAdded > 0 || f.totalLinesRemoved > 0) {
                statsStr += `─── Files ──────────────────────────\n`;
                statsStr += `   +${f.totalLinesAdded} / -${f.totalLinesRemoved} lines\n`;
              }
            }
            if (statsStr) statsStr += "────────────────────────────────────";
            resolve({ text: result.trim(), stats: statsStr });
            return;
          } catch (e) {
            logToFile("ERROR", `Failed to parse stats JSON: ${e.message}`);
            trackCall({ model: modelToUse || "default" });
            resolve({ text: outputText, stats: "[Warning: Failed to parse stats JSON]" });
            return;
          }
        }

        // No stats requested — just count the call
        trackCall({ model: modelToUse || "default" });
        resolve({ text: outputText || stderr.trim() || "Success (no output)" });

      } else {
        // Check for rate-limit / quota errors → auto-retry with exponential backoff
        if (isRateLimitError(stderr) && _attempt < 3) {
          _finalizeTask("rate-limited");
          trackRateLimit({ model: modelToUse || "default" });
          const delayMs = Math.pow(2, _attempt + 1) * 5_000; // 10s → 20s → 40s
          logToFile("WARN", `Rate limit hit (attempt ${_attempt + 1}/3). Retrying in ${delayMs / 1000}s…`);
          setTimeout(() => {
            runGemini(prompt, cwd, options, _attempt + 1).then(resolve).catch(reject);
          }, delayMs);
          return;
        }

        _finalizeTask("failed");
        trackError({ model: modelToUse || "default" });
        logToFile("ERROR", `Gemini exited with abnormal code ${code}`);
        reject(new Error(`Gemini exited with code ${code}: ${stderr.trim() || "unknown error"}`));
      }
    });

    proc.on("error", (err) => {
      _finalizeTask("failed");
      trackError({ model: modelToUse || "default" });
      logToFile("ERROR", `Process spawn error: ${err.message}`);
      reject(new Error(`Failed to start gemini: ${err.message}`));
    });

    // 5-minute hard timeout
    setTimeout(() => {
      if (proc.exitCode === null) {
        _finalizeTask("timeout");
        logToFile("ERROR", "Timeout reached (5 minutes), killing process");
        proc.kill();
        reject(new Error("Gemini timed out after 5 minutes"));
      }
    }, 300_000);
  });
}
