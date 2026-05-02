/**
 * src/handlers.js
 * Pure async handler functions for every Gemini MCP tool.
 * Each function accepts the tool args object and returns the standard MCP
 * { content: [{type, text}], isError? } response — serialisable to JSON.
 */
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { runGemini, defaultModel, setDefaultModel, KNOWN_MODELS, getActiveTasks, getRecentTasks } from "./gemini.js";
import { getUsageStats, getRpm, getRpmLimit } from "./usage-tracker.js";

// Safe default working directory — avoids C:\Windows\System32 when Claude Desktop
// launches the MCP server without a meaningful cwd.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAFE_CWD = process.env.USERPROFILE || process.env.HOME || path.join(__dirname, "..");

/** Resolve a user-supplied cwd or fall back to the safe default. */
function resolveCwd(cwd) {
  if (cwd) return path.resolve(SAFE_CWD, cwd);
  return SAFE_CWD;
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function ok(text, stats) {
  const content = [{ type: "text", text: String(text) }];
  if (stats) content.push({ type: "text", text: stats });
  return { content };
}
function err(message) {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}
async function gem(prompt, cwd, options) {
  const { text, stats } = await runGemini(prompt, cwd, options);
  return ok(text, stats);
}

// Split a string into chunks of roughly `size` characters, breaking on whitespace
function splitIntoChunks(text, size) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    // Try to break on a newline near the boundary
    if (end < text.length) {
      const newline = text.lastIndexOf("\n", end);
      if (newline > start + size * 0.7) end = newline + 1;
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}

// Pick a model appropriate for the estimated context size
function resolveModelForContext(contextSize, promptLength, currentModel) {
  if (currentModel) return currentModel; // explicit model always wins
  if (contextSize === "2M") return "gemini-1.5-pro";
  if (contextSize === "auto") {
    // ~4 chars per token → 500k chars ≈ 125k tokens; > 700k chars → use 2M model
    if (promptLength > 700_000) return "gemini-1.5-pro";
  }
  return currentModel || null; // fall back to default
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function gemini_task({ prompt, cwd, systemPrompt, model, includeStats, contextSize, chunkSize }) {
  let finalPrompt = prompt;
  if (systemPrompt) finalPrompt = `[SYSTEM INSTRUCTION: ${systemPrompt}]\n\n${prompt}`;

  // Resolve model based on contextSize hint (ignored when model is explicitly set)
  const resolvedModel = resolveModelForContext(contextSize, finalPrompt.length, model);

  // Chunked mode: split large inline text into portions, process each, then synthesize
  if (chunkSize && finalPrompt.length > chunkSize) {
    const chunks = splitIntoChunks(finalPrompt, chunkSize);
    const partResults = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkPrompt = `[Часть ${i + 1} из ${chunks.length}]\n${chunks[i]}`;
      try {
        const { text } = await runGemini(chunkPrompt, cwd, { model: resolvedModel });
        partResults.push(`[Результат части ${i + 1}/${chunks.length}]\n${text}`);
      } catch (e) {
        partResults.push(`[Ошибка части ${i + 1}/${chunks.length}: ${e.message}]`);
      }
    }
    // Final synthesis pass
    const synthPrompt =
      `Ты только что обработал задачу в ${chunks.length} частях. Ниже — результаты каждой части.\n` +
      `Объедини их в единый, связный итоговый ответ без дублирования.\n\n` +
      partResults.join("\n\n---\n\n");
    try { return await gem(synthPrompt, cwd, { model: resolvedModel, includeStats }); }
    catch (e) { return ok(partResults.join("\n\n---\n\n")); } // fallback: return raw parts
  }

  try { return await gem(finalPrompt, cwd, { model: resolvedModel, includeStats }); }
  catch (e) { return err(e.message); }
}

export async function gemini_analyze({ path: targetPath, question, model, includeStats }) {
  const absolutePath = path.resolve(SAFE_CWD,targetPath);
  const prompt = `Analyze the following path: ${absolutePath}\n\n${question}`;
  try { return await gem(prompt, path.dirname(absolutePath), { model, includeStats }); }
  catch (e) { return err(e.message); }
}

export async function gemini_refactor({ path: targetPath, instructions, model, includeStats }) {
  const absolutePath = path.resolve(SAFE_CWD,targetPath);
  const prompt = `Refactor the file at ${absolutePath}.\n\nInstructions: ${instructions}\n\nPlease output ONLY the refactored code. Do not include any markdown formatting like \`\`\` or any explanations.`;
  try { return await gem(prompt, path.dirname(absolutePath), { model, includeStats }); }
  catch (e) { return err(e.message); }
}

export async function gemini_generate_tests({ path: targetPath, framework, model, includeStats }) {
  const absolutePath = path.resolve(SAFE_CWD,targetPath);
  const fwInfo = framework ? `Use the following framework: ${framework}.` : "";
  const prompt = `Generate comprehensive unit tests for the code in ${absolutePath}. ${fwInfo}\nOutput the test code clearly.`;
  try { return await gem(prompt, path.dirname(absolutePath), { model, includeStats }); }
  catch (e) { return err(e.message); }
}

export async function gemini_explain_error({ errorText, path: targetPath, model, includeStats }) {
  let prompt = `Please explain the following error and suggest how to fix it:\n\n${errorText}`;
  let targetDir = SAFE_CWD;
  if (targetPath) {
    const absolutePath = path.resolve(SAFE_CWD,targetPath);
    targetDir = path.dirname(absolutePath);
    prompt += `\n\nThis error occurred in relation to the file: ${absolutePath}. Please take its contents into account.`;
  }
  try { return await gem(prompt, targetDir, { model, includeStats }); }
  catch (e) { return err(e.message); }
}

export async function gemini_generate_commit({ cwd, model, includeStats }) {
  const workDir = resolveCwd(cwd);
  const prompt = `Review the current uncommitted git changes in this directory and generate a conventional commit message. Do not make any commits, just output the message.`;
  try { return await gem(prompt, workDir, { model, includeStats }); }
  catch (e) { return err(e.message); }
}

export async function gemini_review_diff({ cwd, model, includeStats }) {
  const workDir = resolveCwd(cwd);
  const prompt = `Review the current uncommitted git changes in this directory. Point out any potential bugs, security issues, or bad practices. Provide constructive feedback.`;
  try { return await gem(prompt, workDir, { model, includeStats }); }
  catch (e) { return err(e.message); }
}

export async function gemini_extract_data({ path: targetPath, schema, model, includeStats }) {
  const absolutePath = path.resolve(SAFE_CWD,targetPath);
  const prompt = `Extract data from the file at ${absolutePath} according to the following structure/schema:\n\n${schema}\n\nPlease output ONLY valid JSON. Do not include javascript/json markdown blocks.`;
  try { return await gem(prompt, path.dirname(absolutePath), { model, includeStats }); }
  catch (e) { return err(e.message); }
}

export async function gemini_chat({ message, history, systemPrompt, model, includeStats }) {
  let prompt = "";
  if (systemPrompt) prompt += `[SYSTEM INSTRUCTION: ${systemPrompt}]\n\n`;
  if (history && history.length > 0) {
    prompt += "Conversation history:\n";
    for (const msg of history) prompt += `${msg.role.toUpperCase()}: ${msg.content}\n\n`;
    prompt += "CURRENT MESSAGE:\n";
  }
  prompt += message;
  try { return await gem(prompt, SAFE_CWD, { model, includeStats }); }
  catch (e) { return err(e.message); }
}

export async function gemini_analyze_image({ path: targetPath, prompt: userPrompt, model, includeStats }) {
  const absolutePath = path.resolve(SAFE_CWD,targetPath);
  const prompt = `Execute multimodal analysis. Image path: ${absolutePath}\n\nTask: ${userPrompt}`;
  try { return await gem(prompt, path.dirname(absolutePath), { model, includeStats }); }
  catch (e) { return err(e.message); }
}

export async function gemini_generate_image({ prompt, outputPath, model, includeStats }) {
  const absolutePath = path.resolve(SAFE_CWD,outputPath);
  const fullPrompt = `Task: ${prompt}\n\nIMPORTANT: Save the final generated image to this exact path: ${absolutePath}`;
  try { return await gem(fullPrompt, path.dirname(absolutePath), { model, includeStats }); }
  catch (e) { return err(e.message); }
}

export async function gemini_edit_image({ inputPath, prompt, outputPath, model, includeStats }) {
  const absoluteInput = path.resolve(SAFE_CWD,inputPath);
  const absoluteOutput = path.resolve(SAFE_CWD,outputPath);
  const fullPrompt = `Task: Edit the image located at ${absoluteInput}.\nInstructions: ${prompt}\n\nIMPORTANT: Save the final edited image to this exact path: ${absoluteOutput}`;
  try { return await gem(fullPrompt, path.dirname(absoluteOutput), { model, includeStats }); }
  catch (e) { return err(e.message); }
}

export async function gemini_notebook_query({ directories, prompt, model, includeStats }) {
  // Resolve each directory against SAFE_CWD so relative paths work correctly
  const absoluteDirectories = directories.map((d) => path.resolve(SAFE_CWD, d));
  const fullPrompt = `You are an expert research assistant acting like Google NotebookLM. I am providing you with context from loaded directories.\n\nPlease answer the following query strictly based on the information found within the provided sources. Do not make up information.\n\nQuery: ${prompt}`;
  // Use the first directory as cwd so Gemini CLI starts in a relevant location
  const workDir = absoluteDirectories[0] || SAFE_CWD;
  try { return await gem(fullPrompt, workDir, { model, includeStats, includeDirectories: absoluteDirectories }); }
  catch (e) { return err(e.message); }
}

export async function gemini_autonomous_agent({ prompt, cwd, systemPrompt, model, includeStats }) {
  let finalPrompt = prompt;
  if (systemPrompt) finalPrompt = `[SYSTEM INSTRUCTION: ${systemPrompt}]\n\n${prompt}`;
  try { return await gem(finalPrompt, cwd, { model, includeStats, yolo: true }); }
  catch (e) { return err(e.message); }
}

export async function gemini_analyze_video({ path: targetPath, prompt: userPrompt, model, includeStats }) {
  const absolutePath = path.resolve(SAFE_CWD,targetPath);
  const prompt = `Execute multimodal video analysis. Video path: ${absolutePath}\n\nTask: ${userPrompt}`;
  try { return await gem(prompt, path.dirname(absolutePath), { model, includeStats }); }
  catch (e) { return err(e.message); }
}

export async function gemini_analyze_audio({ path: targetPath, prompt: userPrompt, model, includeStats }) {
  const absolutePath = path.resolve(SAFE_CWD,targetPath);
  const prompt = `Execute multimodal audio analysis. Audio path: ${absolutePath}\n\nTask: ${userPrompt}`;
  try { return await gem(prompt, path.dirname(absolutePath), { model, includeStats }); }
  catch (e) { return err(e.message); }
}

export async function gemini_sandbox_agent({ prompt, cwd, model, includeStats }) {
  try { return await gem(prompt, cwd, { model, includeStats, sandbox: true, yolo: true }); }
  catch (e) { return err(e.message); }
}

export async function gemini_experimental_worktree({ prompt, branchName, cwd, model, includeStats }) {
  const worktreeArg = branchName || true;
  try { return await gem(prompt, cwd, { model, includeStats, worktree: worktreeArg, yolo: true }); }
  catch (e) { return err(e.message); }
}

export async function gemini_summarize_url({ urls, prompt, model, includeStats }) {
  const fullPrompt = `Please fetch the following URLs and fulfill the task entirely based on their contents:\nURLs:\n${urls.join("\n")}\n\nTask: ${prompt}`;
  try { return await gem(fullPrompt, SAFE_CWD, { model, includeStats }); }
  catch (e) { return err(e.message); }
}

export async function gemini_generate_audio({ textToSpeak, outputPath, model, includeStats }) {
  const absoluteOutput = path.resolve(SAFE_CWD,outputPath);
  const fullPrompt = `Task: Generate human-like spoken audio (text-to-speech) of the following text and SAVE it exactly to this path: ${absoluteOutput}\n\nText to speak:\n${textToSpeak}`;
  try { return await gem(fullPrompt, path.dirname(absoluteOutput), { model, includeStats }); }
  catch (e) { return err(e.message); }
}

export async function gemini_security_audit({ filesToAudit, customPolicyPath, model, includeStats }) {
  const sysPrompt = "You are a cybersecurity auditor. Identify critical logic flaws and secret leaks ONLY. Do not suggest semantic/styling changes.";
  const fullPrompt = `[SYSTEM INSTRUCTION: ${sysPrompt}]\n\nPerform a strict security audit on:\n${filesToAudit}`;
  try { return await gem(fullPrompt, SAFE_CWD, { model, includeStats, policy: customPolicyPath }); }
  catch (e) { return err(e.message); }
}

export async function gemini_list_models({ refresh }) {
  let text = `📋 Доступные модели Gemini\n`;
  text += `${"─".repeat(50)}\n`;
  text += `Активная модель по умолчанию: ${defaultModel ? `✅ ${defaultModel}` : "⬜ не задана (используется модель CLI по умолчанию)"}\n`;
  text += `${"─".repeat(50)}\n\n`;
  for (const m of KNOWN_MODELS) {
    text += `🤖 ${m.id}\n   Контекст: ${m.context}\n   ${m.notes}\n\n`;
  }
  text += `💡 Чтобы выбрать модель по умолчанию, используй:\n   gemini_set_model({ model: "gemini-2.5-pro" })\n\n`;
  text += `💡 Или передай model напрямую в любой инструмент:\n   gemini_task({ prompt: "...", model: "gemini-2.5-pro" })`;

  if (refresh) {
    try {
      const { text: liveText } = await runGemini(
        `List all Gemini models you have access to right now. For each model show the exact model ID string (as used with -m flag), context window size, and a one-line description. Format as a simple list.`,
        SAFE_CWD,
        {}
      );
      text += `\n\n${"─".repeat(50)}\n🔄 Актуальный список от CLI:\n${liveText}`;
    } catch (e) {
      text += `\n\n⚠️ Не удалось получить актуальный список от CLI: ${e.message}`;
    }
  }
  return { content: [{ type: "text", text }] };
}

export async function gemini_set_model({ model }) {
  const previous = defaultModel;
  if (model && model.trim()) {
    setDefaultModel(model.trim());
    const known = KNOWN_MODELS.find((m) => m.id === model.trim());
    let text = `✅ Модель по умолчанию установлена: ${model.trim()}\n`;
    if (previous) text += `   (предыдущая: ${previous})\n`;
    if (known) text += `\n📝 ${known.notes}`;
    else text += `\n⚠️ Модель не найдена в известном списке — убедись, что ID корректен.`;
    return { content: [{ type: "text", text }] };
  } else {
    setDefaultModel(null);
    return { content: [{ type: "text", text: `🔄 Модель по умолчанию сброшена. CLI будет использовать свою модель автоматически.${previous ? `\n   (была: ${previous})` : ""}` }] };
  }
}

export function gemini_usage({ period = "today" }) {
  const data   = getUsageStats();
  const todayKey = new Date().toISOString().slice(0, 10);
  const rpm    = getRpm();

  const fmtNum = (n) => (n || 0).toLocaleString();

  const renderSection = (label, section) => {
    if (!section) return `  (нет данных)\n`;
    let s = "";
    s += `  Вызовов:        ${fmtNum(section.calls)}\n`;
    s += `  Ошибок:         ${fmtNum(section.errors)}\n`;
    s += `  Rate-limit хиты: ${fmtNum(section.rateLimitHits)}\n`;

    const models = section.models || {};
    if (Object.keys(models).length > 0) {
      s += `\n  По моделям:\n`;
      for (const [model, m] of Object.entries(models)) {
        const rpmLimit = getRpmLimit(model);
        s += `    🤖 ${model}  (лимит: ${rpmLimit} RPM)\n`;
        s += `       Вызовов:  ${fmtNum(m.calls)}\n`;
        s += `       Input:    ${fmtNum(m.inputTokens)} токенов\n`;
        if (m.thinkingTokens) s += `       Thinking: ${fmtNum(m.thinkingTokens)} токенов\n`;
        s += `       Output:   ${fmtNum(m.outputTokens)} токенов\n`;
        s += `       Итого:    ${fmtNum(m.totalTokens)} токенов\n`;
      }
    }
    return s;
  };

  let text = `📊 Gemini MCP — Статистика использования\n${"─".repeat(44)}\n`;
  text += `⚡ Текущий RPM: ${rpm} запросов за последние 60 сек\n`;
  if (data.lastUpdated) text += `🕐 Последнее обновление: ${new Date(data.lastUpdated).toLocaleString("ru-RU")}\n`;
  text += "\n";

  if (period === "today" || period === undefined) {
    const dayData = data.daily?.[todayKey];
    text += `📅 Сегодня (${todayKey}):\n`;
    text += renderSection("today", dayData);
  }

  if (period === "all") {
    text += `\n🗂 Всего за всё время:\n`;
    text += renderSection("allTime", data.allTime);

    const days = Object.keys(data.daily || {}).sort().reverse().slice(0, 7);
    if (days.length > 1) {
      text += `\n📆 По дням (последние ${days.length}):\n`;
      for (const d of days) {
        const dd = data.daily[d];
        text += `  ${d}: ${fmtNum(dd.calls)} вызовов`;
        const totalTokens = Object.values(dd.models || {}).reduce((sum, m) => sum + (m.totalTokens || 0), 0);
        if (totalTokens) text += `, ${fmtNum(totalTokens)} токенов`;
        if (dd.rateLimitHits) text += ` ⚠️ ${dd.rateLimitHits} rate-limit`;
        text += "\n";
      }
    }
  }

  text += `\n💡 Подсказка: gemini_usage({ period: "all" }) — полная история`;
  return { content: [{ type: "text", text }] };
}

export function gemini_status({ verbose }) {
  const active = getActiveTasks();
  const recent = getRecentTasks(10);
  const now = Date.now();

  const fmtElapsed = (ms) => {
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
  };
  const fmtBytes = (b) => b < 1024 ? `${b}B` : `${(b / 1024).toFixed(1)}KB`;

  let text = `🔄 Gemini MCP — Статус задач\n${"─".repeat(44)}\n\n`;

  if (active.length === 0) {
    text += `✅ Нет активных задач\n`;
  } else {
    text += `⚡ Активные задачи (${active.length}):\n`;
    for (const t of active) {
      const elapsed = now - t.startedAt;
      const idle = now - t.lastActivityAt;
      const promptStr = verbose ? t.prompt : t.prompt.substring(0, 80) + (t.prompt.length > 80 ? "…" : "");
      text += `\n  #${t.id} [${t.model}]\n`;
      text += `     Время: ${fmtElapsed(elapsed)} | Получено: ${fmtBytes(t.bytesReceived)}\n`;
      if (idle > 15_000) text += `     ⚠️  Нет активности: ${fmtElapsed(idle)}\n`;
      text += `     Промпт: ${promptStr}\n`;
    }
  }

  if (recent.length > 0) {
    text += `\n📋 Последние задачи:\n`;
    for (const t of [...recent].reverse()) {
      const icon = t.status === "completed" ? "✅" : t.status === "timeout" ? "⏱️" : "❌";
      const promptStr = verbose ? t.prompt : t.prompt.substring(0, 70) + (t.prompt.length > 70 ? "…" : "");
      text += `  ${icon} #${t.id} [${t.model}] ${fmtElapsed(t.durationMs)} — ${promptStr}\n`;
    }
  }

  text += `\n💡 Подсказка: вызови снова пока задача выполняется, чтобы увидеть прогресс.`;
  return { content: [{ type: "text", text }] };
}

export async function gemini_update({ checkOnly, global: isGlobal = true }) {
  return new Promise((resolve) => {
    const command = process.platform === "win32" ? "cmd" : "sh";
    const checkArgs =
      process.platform === "win32"
        ? ["/c", "npm list -g @google/gemini-cli --depth=0 2>nul & npm view @google/gemini-cli version"]
        : ["-c", "npm list -g @google/gemini-cli --depth=0 2>/dev/null; npm view @google/gemini-cli version"];

    const checkProc = spawn(command, checkArgs, { shell: false });
    let checkOut = "";
    checkProc.stdout.on("data", (d) => { checkOut += d.toString(); });
    checkProc.stderr.on("data", (d) => { checkOut += d.toString(); });

    checkProc.on("close", () => {
      const installedMatch = checkOut.match(/@google\/gemini-cli@([\d.]+)/);
      const lines = checkOut.trim().split("\n");
      const latestVersion = lines[lines.length - 1].trim();
      const installedVersion = installedMatch ? installedMatch[1] : "неизвестна";

      let text = `📦 Gemini CLI\n${"─".repeat(40)}\nУстановлена: ${installedVersion}\nПоследняя:   ${latestVersion}\n`;
      const isUpToDate = installedVersion === latestVersion;
      if (isUpToDate) {
        text += `\n✅ Версия актуальна, обновление не требуется.`;
        resolve({ content: [{ type: "text", text }] });
        return;
      }

      text += `\n🆙 Доступно обновление: ${installedVersion} → ${latestVersion}`;
      if (checkOnly) {
        text += `\n\n💡 Чтобы обновить, вызови:\n   gemini_update({ checkOnly: false })`;
        resolve({ content: [{ type: "text", text }] });
        return;
      }

      text += `\n\n⏳ Устанавливаю обновление...\n`;
      const globalFlag = isGlobal !== false ? ["-g"] : [];
      const updateArgs =
        process.platform === "win32"
          ? ["/c", `npm install ${globalFlag.join(" ")} @google/gemini-cli@latest`]
          : ["-c", `npm install ${globalFlag.join(" ")} @google/gemini-cli@latest`];

      const updateProc = spawn(command, updateArgs, { shell: false });
      let updateOut = "";
      updateProc.stdout.on("data", (d) => { updateOut += d.toString(); });
      updateProc.stderr.on("data", (d) => { updateOut += d.toString(); });

      updateProc.on("close", (code) => {
        if (code === 0) {
          text += `✅ Обновление успешно! Перезапусти MCP сервер чтобы применить изменения.\n`;
        } else {
          text += `❌ Ошибка при обновлении (код ${code}):\n${updateOut}`;
        }
        resolve({ content: [{ type: "text", text }] });
      });
    });
  });
}

// ─── Handler map (used by backend.js) ────────────────────────────────────────
export const HANDLERS = {
  gemini_task,
  gemini_analyze,
  gemini_refactor,
  gemini_generate_tests,
  gemini_explain_error,
  gemini_generate_commit,
  gemini_review_diff,
  gemini_extract_data,
  gemini_chat,
  gemini_analyze_image,
  gemini_generate_image,
  gemini_edit_image,
  gemini_notebook_query,
  gemini_autonomous_agent,
  gemini_analyze_video,
  gemini_analyze_audio,
  gemini_sandbox_agent,
  gemini_experimental_worktree,
  gemini_summarize_url,
  gemini_generate_audio,
  gemini_security_audit,
  gemini_list_models,
  gemini_set_model,
  gemini_usage,
  gemini_status,
  gemini_update,
};
