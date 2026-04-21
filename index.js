import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

const logFilePath = path.join(process.cwd(), 'gemini-mcp.log');
function logToFile(level, message) {
  try {
    const time = new Date().toISOString();
    fs.appendFileSync(logFilePath, `[${time}] [${level}] ${message}\n`);
  } catch(e) {} // fail silently
}

const server = new McpServer({
  name: "gemini-mcp",
  version: "1.0.0",
});

/**
 * Запуск Gemini CLI
 * @param {string} prompt 
 * @param {string} [cwd] 
 * @param {Object} [options] 
 * @returns {Promise<string>}
 */
function runGemini(prompt, cwd, options = {}) {
  return new Promise((resolve, reject) => {
    // На Windows shell: true имеет баг с передачей аргументов с пробелами, поэтому оборачиваем в кавычки явно
    const safePrompt = process.platform === "win32" ? `"${prompt.replace(/"/g, '\\"')}"` : prompt;
    const args = ["-p", safePrompt];
    
    if (options.model) {
      args.push("-m", options.model);
    }
    if (options.includeStats) {
      args.push("-o", "json");
    }
    if (options.includeDirectories && Array.isArray(options.includeDirectories)) {
      for (const dir of options.includeDirectories) {
        args.push("--include-directories", path.resolve(process.cwd(), dir));
      }
    }
    if (options.yolo) args.push("--yolo");
    if (options.sandbox) args.push("--sandbox");
    if (options.worktree) {
      args.push("--worktree");
      if (typeof options.worktree === 'string') args.push(options.worktree);
    }
    if (options.policy) args.push("--policy", options.policy);

    const command = process.platform === 'win32' ? 'gemini.cmd' : 'gemini';
    
    logToFile("INFO", `--- NEW REQUEST ---`);
    logToFile("INFO", `CWD: ${cwd || process.cwd()}`);
    logToFile("INFO", `Options: ${JSON.stringify(options)}`);
    logToFile("INFO", `Prompt: ${prompt.substring(0, 150)}...`);

    const proc = spawn(
      command,
      args,
      {
        cwd: cwd || process.cwd(),
        shell: true,
        env: { ...process.env },
      }
    );

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => { stdout += data.toString(); });
    proc.stderr.on("data", (data) => { 
      const msg = data.toString();
      stderr += msg; 
      logToFile("WARN_STDERR", msg.trim());
    });

    proc.on("close", (code) => {
      logToFile("INFO", `Process closed with code ${code}`);
      if (code === 0) {
        let outputText = stdout.trim();
        logToFile("INFO", `Successfully received ${outputText.length} bytes of output`);
        if (options.includeStats) {
          try {
            const data = JSON.parse(outputText);
            let result = data.response || data.content || "";
            let statsStr = "";
            if (data.stats && data.stats.models) {
              statsStr = "--- Token Usage & Context ---\n";
              for (const [modelName, modelStats] of Object.entries(data.stats.models)) {
                const tokens = modelStats.tokens || {};
                statsStr += `Model: ${modelName}\n`;
                statsStr += `Context (input): ${tokens.input || 0} tokens\n`;
                statsStr += `Response (candidates): ${tokens.candidates || 0} tokens\n`;
                statsStr += `Total Used: ${tokens.total || 0} tokens\n`;
              }
            }
            resolve({ text: result.trim(), stats: statsStr });
            return;
          } catch (e) {
            logToFile("ERROR", `Failed to parse stats JSON: ${e.message}`);
            resolve({ text: outputText, stats: "[Warning: Failed to parse stats JSON]" });
            return;
          }
        }
        resolve({ text: outputText || stderr.trim() || "Success (no output)" });
      } else {
        logToFile("ERROR", `Gemini exited with abnormal code ${code}`);
        reject(new Error(`Gemini exited with code ${code}: ${stderr.trim() || "unknown error"}`));
      }
    });

    proc.on("error", (err) => {
      logToFile("ERROR", `Process spawn error: ${err.message}`);
      reject(new Error(`Failed to start gemini: ${err.message}`));
    });

    // Таймаут 5 минут
    setTimeout(() => {
      if (proc.exitCode === null) {
        logToFile("ERROR", "Timeout reached (5 minutes), killing process");
        proc.kill();
        reject(new Error("Gemini timed out after 5 minutes"));
      }
    }, 300000);
  });
}

// Инструмент: выполнить задачу через Gemini
server.tool(
  "gemini_task",
  "Run a task using Google Gemini CLI. Gemini can write code, analyze files, answer questions, and work with the local filesystem.",
  {
    prompt: z.string().describe("The task or question for Gemini to handle"),
    cwd: z.string().optional().describe("Working directory for the task (optional)"),
    systemPrompt: z.string().optional().describe("System Persona or Developer Instructions (e.g. 'You are an expert dev.')"),
    model: z.string().optional().describe("The model to use (e.g., 'gemini-2.5-pro')"),
    includeStats: z.boolean().optional().describe("Include token usage and context size stats in the output"),
  },
  async ({ prompt, cwd, systemPrompt, model, includeStats }) => {
    let finalPrompt = prompt;
    if (systemPrompt) {
      finalPrompt = `[SYSTEM INSTRUCTION: ${systemPrompt}]\n\n${prompt}`;
    }
    try {
      const { text, stats } = await runGemini(finalPrompt, cwd, { model, includeStats });
      const content = [{ type: "text", text }];
      if (stats) content.push({ type: "text", text: stats });
      return { content };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Инструмент: задать вопрос Gemini про файл/папку
server.tool(
  "gemini_analyze",
  "Ask Gemini to analyze a file or directory. Provide the path and your question.",
  {
    path: z.string().describe("Path to the file or directory to analyze"),
    question: z.string().describe("What you want Gemini to tell you about this file/directory"),
    model: z.string().optional().describe("The model to use (e.g., 'gemini-2.5-pro')"),
    includeStats: z.boolean().optional().describe("Include token usage and context size stats in the output"),
  },
  async ({ path: targetPath, question, model, includeStats }) => {
    const absolutePath = path.resolve(process.cwd(), targetPath);
    const prompt = `Analyze the following path: ${absolutePath}\n\n${question}`;
    
    try {
      const targetDir = path.dirname(absolutePath);
      const { text, stats } = await runGemini(prompt, targetDir, { model, includeStats });
      const content = [{ type: "text", text }];
      if (stats) content.push({ type: "text", text: stats });
      return { content };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Инструмент: рефакторинг кода
server.tool(
  "gemini_refactor",
  "Refactor code in a specific file. Outputs only the refactored code without markdown formatting.",
  {
    path: z.string().describe("Path to the file to refactor"),
    instructions: z.string().describe("Refactoring instructions (e.g., 'convert to TypeScript')"),
    model: z.string().optional().describe("The model to use (e.g., 'gemini-2.5-pro')"),
    includeStats: z.boolean().optional().describe("Include token usage and context size stats in the output"),
  },
  async ({ path: targetPath, instructions, model, includeStats }) => {
    const absolutePath = path.resolve(process.cwd(), targetPath);
    const prompt = `Refactor the file at ${absolutePath}.\n\nInstructions: ${instructions}\n\nPlease output ONLY the refactored code. Do not include any markdown formatting like \`\`\` or any explanations.`;
    
    try {
      const targetDir = path.dirname(absolutePath);
      const { text, stats } = await runGemini(prompt, targetDir, { model, includeStats });
      const content = [{ type: "text", text }];
      if (stats) content.push({ type: "text", text: stats });
      return { content };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Инструмент: генерация тестов
server.tool(
  "gemini_generate_tests",
  "Generate unit tests for a specified file.",
  {
    path: z.string().describe("Path to the source file"),
    framework: z.string().optional().describe("Testing framework to use (e.g., 'jest', 'pytest')"),
    model: z.string().optional().describe("The model to use (e.g., 'gemini-2.5-pro')"),
    includeStats: z.boolean().optional().describe("Include token usage and context size stats in the output"),
  },
  async ({ path: targetPath, framework, model, includeStats }) => {
    const absolutePath = path.resolve(process.cwd(), targetPath);
    const fwInfo = framework ? `Use the following framework: ${framework}.` : "";
    const prompt = `Generate comprehensive unit tests for the code in ${absolutePath}. ${fwInfo}\nOutput the test code clearly.`;
    
    try {
      const targetDir = path.dirname(absolutePath);
      const { text, stats } = await runGemini(prompt, targetDir, { model, includeStats });
      const content = [{ type: "text", text }];
      if (stats) content.push({ type: "text", text: stats });
      return { content };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Инструмент: объяснение ошибки
server.tool(
  "gemini_explain_error",
  "Explain an error message or stack trace, optionally with context of the problematic file.",
  {
    errorText: z.string().describe("The error message or stack trace"),
    path: z.string().optional().describe("Path to the file where the error occurred (optional)"),
    model: z.string().optional().describe("The model to use (e.g., 'gemini-2.5-pro')"),
    includeStats: z.boolean().optional().describe("Include token usage and context size stats in the output"),
  },
  async ({ errorText, path: targetPath, model, includeStats }) => {
    let prompt = `Please explain the following error and suggest how to fix it:\n\n${errorText}`;
    let targetDir = process.cwd();
    
    if (targetPath) {
      const absolutePath = path.resolve(process.cwd(), targetPath);
      targetDir = path.dirname(absolutePath);
      prompt += `\n\nThis error occurred in relation to the file: ${absolutePath}. Please take its contents into account.`;
    }
    
    try {
      const { text, stats } = await runGemini(prompt, targetDir, { model, includeStats });
      const content = [{ type: "text", text }];
      if (stats) content.push({ type: "text", text: stats });
      return { content };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Инструмент: сгенерировать сообщение коммита
server.tool(
  "gemini_generate_commit",
  "Review local changes and generate a suitable git commit message.",
  {
    cwd: z.string().optional().describe("Path to the git repository (optional)"),
    model: z.string().optional().describe("The model to use (e.g., 'gemini-2.5-pro')"),
    includeStats: z.boolean().optional().describe("Include token usage and context size stats in the output"),
  },
  async ({ cwd, model, includeStats }) => {
    const workDir = cwd ? path.resolve(process.cwd(), cwd) : process.cwd();
    const prompt = `Review the current uncommitted git changes in this directory and generate a conventional commit message. Do not make any commits, just output the message.`;
    
    try {
      const { text, stats } = await runGemini(prompt, workDir, { model, includeStats });
      const content = [{ type: "text", text }];
      if (stats) content.push({ type: "text", text: stats });
      return { content };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Инструмент: код-ревью изменений
server.tool(
  "gemini_review_diff",
  "Review local uncommitted changes for bugs or bad practices.",
  {
    cwd: z.string().optional().describe("Path to the git repository (optional)"),
    model: z.string().optional().describe("The model to use (e.g., 'gemini-2.5-pro')"),
    includeStats: z.boolean().optional().describe("Include token usage and context size stats in the output"),
  },
  async ({ cwd, model, includeStats }) => {
    const workDir = cwd ? path.resolve(process.cwd(), cwd) : process.cwd();
    const prompt = `Review the current uncommitted git changes in this directory. Point out any potential bugs, security issues, or bad practices. Provide constructive feedback.`;
    
    try {
      const { text, stats } = await runGemini(prompt, workDir, { model, includeStats });
      const content = [{ type: "text", text }];
      if (stats) content.push({ type: "text", text: stats });
      return { content };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Инструмент: извлечение данных (JSON)
server.tool(
  "gemini_extract_data",
  "Extract structured data from a file based on a given schema description.",
  {
    path: z.string().describe("Path to the file to extract data from"),
    schema: z.string().describe("Description of the JSON schema or structure to extract"),
    model: z.string().optional().describe("The model to use (e.g., 'gemini-2.5-pro')"),
    includeStats: z.boolean().optional().describe("Include token usage and context size stats in the output"),
  },
  async ({ path: targetPath, schema, model, includeStats }) => {
    const absolutePath = path.resolve(process.cwd(), targetPath);
    const prompt = `Extract data from the file at ${absolutePath} according to the following structure/schema:\n\n${schema}\n\nPlease output ONLY valid JSON. Do not include javascript/json markdown blocks.`;
    
    try {
      const targetDir = path.dirname(absolutePath);
      const { text, stats } = await runGemini(prompt, targetDir, { model, includeStats });
      const content = [{ type: "text", text }];
      if (stats) content.push({ type: "text", text: stats });
      return { content };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Инструмент: чат с историей
server.tool(
  "gemini_chat",
  "Send a message to Gemini along with conversation history for context.",
  {
    message: z.string().describe("The new message to send to Gemini"),
    history: z.array(z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string()
    })).optional().describe("Previous messages in the conversation"),
    systemPrompt: z.string().optional().describe("System Persona or Developer Instructions (e.g. 'Act as a senior dev.')"),
    model: z.string().optional().describe("The model to use (e.g., 'gemini-2.5-pro')"),
    includeStats: z.boolean().optional().describe("Include token usage and context size stats in the output"),
  },
  async ({ message, history, systemPrompt, model, includeStats }) => {
    let prompt = "";
    if (systemPrompt) {
      prompt += `[SYSTEM INSTRUCTION: ${systemPrompt}]\n\n`;
    }
    if (history && history.length > 0) {
      prompt += "Conversation history:\n";
      for (const msg of history) {
        prompt += `${msg.role.toUpperCase()}: ${msg.content}\n\n`;
      }
      prompt += "CURRENT MESSAGE:\n";
    }
    prompt += message;
    
    try {
      const { text, stats } = await runGemini(prompt, process.cwd(), { model, includeStats });
      const content = [{ type: "text", text }];
      if (stats) content.push({ type: "text", text: stats });
      return { content };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Инструмент: визуальный анализ
server.tool(
  "gemini_analyze_image",
  "Analyze an image. Provide the path to the image and a prompt.",
  {
    path: z.string().describe("Path to the image file"),
    prompt: z.string().describe("What you want Gemini to analyze or describe in the image"),
    model: z.string().optional().describe("The model to use (e.g., 'gemini-2.5-pro')"),
    includeStats: z.boolean().optional().describe("Include token usage and context size stats in the output"),
  },
  async ({ path: targetPath, prompt: userPrompt, model, includeStats }) => {
    const absolutePath = path.resolve(process.cwd(), targetPath);
    const prompt = `Execute multimodal analysis. Image path: ${absolutePath}\n\nTask: ${userPrompt}`;
    
    try {
      const targetDir = path.dirname(absolutePath);
      const { text, stats } = await runGemini(prompt, targetDir, { model, includeStats });
      const content = [{ type: "text", text }];
      if (stats) content.push({ type: "text", text: stats });
      return { content };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Инструмент: Работа с графикой / генерация изображений (Nano Banano / Imagen)
server.tool(
  "gemini_generate_image",
  "Generate an image using a graphical model (like Nano Banano).",
  {
    prompt: z.string().describe("Detailed description of the image to generate"),
    outputPath: z.string().describe("Path where the resulting image should be saved"),
    model: z.string().optional().describe("The model to use (e.g., 'nano-banana')"),
    includeStats: z.boolean().optional().describe("Include token usage and context size stats in the output"),
  },
  async ({ prompt, outputPath, model, includeStats }) => {
    const absolutePath = path.resolve(process.cwd(), outputPath);
    const targetDir = path.dirname(absolutePath);
    // Напрямую просим CLI сохранить итоговую картинку
    const fullPrompt = `Task: ${prompt}\n\nIMPORTANT: Save the final generated image to this exact path: ${absolutePath}`;
    
    try {
      const { text, stats } = await runGemini(fullPrompt, targetDir, { model, includeStats });
      const content = [{ type: "text", text }];
      if (stats) content.push({ type: "text", text: stats });
      return { content };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Инструмент: Редактирование существующего изображения
server.tool(
  "gemini_edit_image",
  "Edit an existing image based on a prompt (using models like Nano Banano).",
  {
    inputPath: z.string().describe("Path to the original image file"),
    prompt: z.string().describe("Description of what to change, add, or remove in the image"),
    outputPath: z.string().describe("Path to save the edited image"),
    model: z.string().optional().describe("The model to use (e.g., 'nano-banana')"),
    includeStats: z.boolean().optional().describe("Include token usage and context size stats in the output"),
  },
  async ({ inputPath, prompt, outputPath, model, includeStats }) => {
    const absoluteInput = path.resolve(process.cwd(), inputPath);
    const absoluteOutput = path.resolve(process.cwd(), outputPath);
    const targetDir = path.dirname(absoluteOutput);
    
    const fullPrompt = `Task: Edit the image located at ${absoluteInput}.\nInstructions: ${prompt}\n\nIMPORTANT: Save the final edited image to this exact path: ${absoluteOutput}`;
    
    try {
      const { text, stats } = await runGemini(fullPrompt, targetDir, { model, includeStats });
      const content = [{ type: "text", text }];
      if (stats) content.push({ type: "text", text: stats });
      return { content };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Инструмент: Локальный NotebookLM (Чтение папок)
server.tool(
  "gemini_notebook_query",
  "Acts like NotebookLM: Query a set of local directories (containing your documents/code) to get answers strictly based on those files.",
  {
    directories: z.array(z.string()).describe("List of directory paths to use as the knowledge base (sources)."),
    prompt: z.string().describe("The user's question or task regarding the provided sources."),
    model: z.string().optional().describe("The model to use (e.g., 'gemini-2.5-pro' for analyzing lots of files)."),
    includeStats: z.boolean().optional().describe("Include token usage and context size stats in the output"),
  },
  async ({ directories, prompt, model, includeStats }) => {
    // Формируем абсолютные пути
    const absoluteDirectories = directories.map(d => path.resolve(process.cwd(), d));
    
    // Просим модель действовать как аналитик
    const fullPrompt = `You are an expert research assistant acting like Google NotebookLM. I am providing you with context from loaded directories.\n\nPlease answer the following query strictly based on the information found within the provided sources. Do not make up information.\n\nQuery: ${prompt}`;
    
    try {
      const { text, stats } = await runGemini(fullPrompt, process.cwd(), { 
        model, 
        includeStats, 
        includeDirectories: absoluteDirectories 
      });
      const content = [{ type: "text", text }];
      if (stats) content.push({ type: "text", text: stats });
      return { content };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Проверка наличия Gemini CLI перед запуском
try {
  const command = process.platform === 'win32' ? 'gemini.cmd' : 'gemini';
  const check = spawn(command, ["--help"], { shell: true });
  check.on("error", () => {
    console.error("КРИТИЧЕСКАЯ ОШИБКА: Gemini CLI не найден. Убедитесь, что он установлен и доступен в PATH.");
  });
} catch (e) {
  console.error("Ошибка при проверке Gemini CLI:", e.message);
}

// Новые Инструменты: YOLO Агент, Видео, Аудио
server.tool(
  "gemini_autonomous_agent",
  "Instruct Gemini CLI to autonomously act on the filesystem, write code, run commands, and execute a complex task without human intervention (YOLO mode).",
  {
    prompt: z.string().describe("The complex task you want the agent to fulfill autonomously"),
    cwd: z.string().optional().describe("Working directory for the task"),
    systemPrompt: z.string().optional().describe("System Instructions"),
    model: z.string().optional().describe("Model to use (e.g. gemini-2.5-pro)"),
    includeStats: z.boolean().optional(),
  },
  async ({ prompt, cwd, systemPrompt, model, includeStats }) => {
    let finalPrompt = prompt;
    if (systemPrompt) finalPrompt = `[SYSTEM INSTRUCTION: ${systemPrompt}]\n\n${prompt}`;
    try {
      const { text, stats } = await runGemini(finalPrompt, cwd, { model, includeStats, yolo: true });
      const content = [{ type: "text", text }];
      if (stats) content.push({ type: "text", text: stats });
      return { content };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "gemini_analyze_video",
  "Analyze a video file (MP4, etc.) to extract audio transcripts, visual events, or answer user questions.",
  {
    path: z.string().describe("Path to the video file"),
    prompt: z.string().describe("What to extract, summarize, or answer about the video"),
    model: z.string().optional().describe("The model to use (gemini-2.5-pro recommended)"),
    includeStats: z.boolean().optional()
  },
  async ({ path: targetPath, prompt: userPrompt, model, includeStats }) => {
    const absolutePath = path.resolve(process.cwd(), targetPath);
    const prompt = `Execute multimodal video analysis. Video path: ${absolutePath}\n\nTask: ${userPrompt}`;
    try {
      const targetDir = path.dirname(absolutePath);
      const { text, stats } = await runGemini(prompt, targetDir, { model, includeStats });
      const content = [{ type: "text", text }];
      if (stats) content.push({ type: "text", text: stats });
      return { content };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "gemini_analyze_audio",
  "Analyze an audio file (MP3, WAV, etc.) to extract transcripts, detect speakers, or summarize the conversation.",
  {
    path: z.string().describe("Path to the audio file"),
    prompt: z.string().describe("What to extract, summarize, or answer about the audio"),
    model: z.string().optional().describe("The model to use (gemini-2.5-pro recommended)"),
    includeStats: z.boolean().optional()
  },
  async ({ path: targetPath, prompt: userPrompt, model, includeStats }) => {
    const absolutePath = path.resolve(process.cwd(), targetPath);
    const prompt = `Execute multimodal audio analysis. Audio path: ${absolutePath}\n\nTask: ${userPrompt}`;
    try {
      const targetDir = path.dirname(absolutePath);
      const { text, stats } = await runGemini(prompt, targetDir, { model, includeStats });
      const content = [{ type: "text", text }];
      if (stats) content.push({ type: "text", text: stats });
      return { content };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Инструмент: Песочница (Изолированный запуск)
server.tool(
  "gemini_sandbox_agent",
  "Run the Gemini CLI in an isolated sandbox environment. Useful for executing untrusted code or investigating malware safely.",
  {
    prompt: z.string().describe("Task for the sandbox agent"),
    cwd: z.string().optional().describe("Directory to work in (will be sandboxed)"),
    model: z.string().optional(),
    includeStats: z.boolean().optional(),
  },
  async ({ prompt, cwd, model, includeStats }) => {
    try {
      const { text, stats } = await runGemini(prompt, cwd, { model, includeStats, sandbox: true, yolo: true });
      const content = [{ type: "text", text }];
      if (stats) content.push({ type: "text", text: stats });
      return { content };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Инструмент: Git Worktree (Безопасные эксперименты)
server.tool(
  "gemini_experimental_worktree",
  "Creates an isolated Git worktree branch and runs Gemini autonomously there. It prevents messing up the currently opened files in the IDE.",
  {
    prompt: z.string().describe("The massive refactoring or risky changes you want to apply in the background branch"),
    branchName: z.string().optional().describe("Optional branch name for the new worktree"),
    cwd: z.string().optional().describe("Path to the git repository"),
    model: z.string().optional(),
    includeStats: z.boolean().optional(),
  },
  async ({ prompt, branchName, cwd, model, includeStats }) => {
    const worktreeArg = branchName ? branchName : true;
    try {
      const { text, stats } = await runGemini(prompt, cwd, { model, includeStats, worktree: worktreeArg, yolo: true });
      const content = [{ type: "text", text }];
      if (stats) content.push({ type: "text", text: stats });
      return { content };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Инструмент: Веб-ридер / Скрапер
server.tool(
  "gemini_summarize_url",
  "Read internet URLs and parse their contents for context or summary.",
  {
    urls: z.array(z.string()).describe("A list of URLs (HTTP/HTTPS) to read"),
    prompt: z.string().describe("What to do with the URL contents (e.g. 'summarize main ideas', 'extract code')"),
    model: z.string().optional(),
    includeStats: z.boolean().optional(),
  },
  async ({ urls, prompt, model, includeStats }) => {
    const fullPrompt = `Please fetch the following URLs and fulfill the task entirely based on their contents:\nURLs:\n${urls.join('\n')}\n\nTask: ${prompt}`;
    try {
      const { text, stats } = await runGemini(fullPrompt, process.cwd(), { model, includeStats });
      const content = [{ type: "text", text }];
      if (stats) content.push({ type: "text", text: stats });
      return { content };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Инструмент: Аудио генератор (Text-to-Speech)
server.tool(
  "gemini_generate_audio",
  "Generate spoken audio (TTS / Podcast) from text.",
  {
    textToSpeak: z.string().describe("The script or text you want read aloud"),
    outputPath: z.string().describe("Path to save the .mp3 or .wav file"),
    model: z.string().optional(),
    includeStats: z.boolean().optional(),
  },
  async ({ textToSpeak, outputPath, model, includeStats }) => {
    const absoluteOutput = path.resolve(process.cwd(), outputPath);
    const targetDir = path.dirname(absoluteOutput);
    const fullPrompt = `Task: Generate human-like spoken audio (text-to-speech) of the following text and SAVE it exactly to this path: ${absoluteOutput}\n\nText to speak:\n${textToSpeak}`;
    try {
      const { text, stats } = await runGemini(fullPrompt, targetDir, { model, includeStats });
      const content = [{ type: "text", text }];
      if (stats) content.push({ type: "text", text: stats });
      return { content };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Инструмент: Строгий аудит безопасности
server.tool(
  "gemini_security_audit",
  "Audit given code or workspace purely for security vulnerabilities (e.g. OWASP, XSS, injections, misconfigurations) ignoring styling issues.",
  {
    filesToAudit: z.string().describe("Space separated paths to files or directories for auditing"),
    customPolicyPath: z.string().optional().describe("Path to a custom config file to load (--policy)"),
    model: z.string().optional().describe("Security-oriented model"),
    includeStats: z.boolean().optional()
  },
  async ({ filesToAudit, customPolicyPath, model, includeStats }) => {
    const sysPrompt = "You are a cybersecurity auditor. Identify critical logic flaws and secret leaks ONLY. Do not suggest semantic/styling changes.";
    const fullPrompt = `[SYSTEM INSTRUCTION: ${sysPrompt}]\n\nPerform a strict security audit on:\n${filesToAudit}`;
    try {
      const { text, stats } = await runGemini(fullPrompt, process.cwd(), { 
        model, 
        includeStats,
        policy: customPolicyPath
      });
      const content = [{ type: "text", text }];
      if (stats) content.push({ type: "text", text: stats });
      return { content };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// Запуск сервера
const transport = new StdioServerTransport();

// Обработка корректного завершения
process.on("SIGINT", async () => {
  await server.close();
  process.exit(0);
});

await server.connect(transport);
console.error("Gemini MCP Server started over stdio.");
