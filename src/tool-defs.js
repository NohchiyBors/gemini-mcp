/**
 * src/tool-defs.js
 * Tool definitions: name, description, and Zod schema for every MCP tool.
 * No handler logic here — pure metadata used by index.js and stdio-proxy.js
 * to register tools with an McpServer.
 */
import { z } from "zod";

export const TOOL_DEFS = [
  {
    name: "gemini_task",
    description: "Run a task using Google Gemini CLI. Gemini can write code, analyze files, answer questions, and work with the local filesystem.",
    schema: {
      prompt: z.string().describe("The task or question for Gemini to handle"),
      cwd: z.string().optional().describe("Working directory for the task (optional)"),
      systemPrompt: z.string().optional().describe("System Persona or Developer Instructions (e.g. 'You are an expert dev.')"),
      model: z.string().optional().describe("The model to use (e.g., 'gemini-2.5-pro')"),
      includeStats: z.boolean().optional().describe("Include token usage and context size stats in the output"),
      contextSize: z.enum(["1M", "2M", "auto"]).optional().describe("Context window hint. 'auto' picks the right model based on prompt length. '2M' forces gemini-1.5-pro. '1M' uses the default 1M-context model."),
      chunkSize: z.number().optional().describe("If the prompt exceeds this many characters, split it into chunks, process each separately, then synthesize. Useful for huge log files or multi-file diffs passed as inline text."),
    },
  },
  {
    name: "gemini_analyze",
    description: "Ask Gemini to analyze a file or directory. Provide the path and your question.",
    schema: {
      path: z.string().describe("Path to the file or directory to analyze"),
      question: z.string().describe("What you want Gemini to tell you about this file/directory"),
      model: z.string().optional().describe("The model to use (e.g., 'gemini-2.5-pro')"),
      includeStats: z.boolean().optional().describe("Include token usage and context size stats in the output"),
    },
  },
  {
    name: "gemini_refactor",
    description: "Refactor code in a specific file. Outputs only the refactored code without markdown formatting.",
    schema: {
      path: z.string().describe("Path to the file to refactor"),
      instructions: z.string().describe("Refactoring instructions (e.g., 'convert to TypeScript')"),
      model: z.string().optional().describe("The model to use (e.g., 'gemini-2.5-pro')"),
      includeStats: z.boolean().optional().describe("Include token usage and context size stats in the output"),
    },
  },
  {
    name: "gemini_generate_tests",
    description: "Generate unit tests for a specified file.",
    schema: {
      path: z.string().describe("Path to the source file"),
      framework: z.string().optional().describe("Testing framework to use (e.g., 'jest', 'pytest')"),
      model: z.string().optional().describe("The model to use (e.g., 'gemini-2.5-pro')"),
      includeStats: z.boolean().optional().describe("Include token usage and context size stats in the output"),
    },
  },
  {
    name: "gemini_explain_error",
    description: "Explain an error message or stack trace, optionally with context of the problematic file.",
    schema: {
      errorText: z.string().describe("The error message or stack trace"),
      path: z.string().optional().describe("Path to the file where the error occurred (optional)"),
      model: z.string().optional().describe("The model to use (e.g., 'gemini-2.5-pro')"),
      includeStats: z.boolean().optional().describe("Include token usage and context size stats in the output"),
    },
  },
  {
    name: "gemini_generate_commit",
    description: "Review local changes and generate a suitable git commit message.",
    schema: {
      cwd: z.string().optional().describe("Path to the git repository (optional)"),
      model: z.string().optional().describe("The model to use (e.g., 'gemini-2.5-pro')"),
      includeStats: z.boolean().optional().describe("Include token usage and context size stats in the output"),
    },
  },
  {
    name: "gemini_review_diff",
    description: "Review local uncommitted changes for bugs or bad practices.",
    schema: {
      cwd: z.string().optional().describe("Path to the git repository (optional)"),
      model: z.string().optional().describe("The model to use (e.g., 'gemini-2.5-pro')"),
      includeStats: z.boolean().optional().describe("Include token usage and context size stats in the output"),
    },
  },
  {
    name: "gemini_extract_data",
    description: "Extract structured data from a file based on a given schema description.",
    schema: {
      path: z.string().describe("Path to the file to extract data from"),
      schema: z.string().describe("Description of the JSON schema or structure to extract"),
      model: z.string().optional().describe("The model to use (e.g., 'gemini-2.5-pro')"),
      includeStats: z.boolean().optional().describe("Include token usage and context size stats in the output"),
    },
  },
  {
    name: "gemini_chat",
    description: "Send a message to Gemini along with conversation history for context.",
    schema: {
      message: z.string().describe("The new message to send to Gemini"),
      history: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })).optional().describe("Previous messages in the conversation"),
      systemPrompt: z.string().optional().describe("System Persona or Developer Instructions (e.g. 'Act as a senior dev.')"),
      model: z.string().optional().describe("The model to use (e.g., 'gemini-2.5-pro')"),
      includeStats: z.boolean().optional().describe("Include token usage and context size stats in the output"),
    },
  },
  {
    name: "gemini_analyze_image",
    description: "Analyze an image. Provide the path to the image and a prompt.",
    schema: {
      path: z.string().describe("Path to the image file"),
      prompt: z.string().describe("What you want Gemini to analyze or describe in the image"),
      model: z.string().optional().describe("The model to use (e.g., 'gemini-2.5-pro')"),
      includeStats: z.boolean().optional().describe("Include token usage and context size stats in the output"),
    },
  },
  {
    name: "gemini_generate_image",
    description: "Generate an image using a graphical model (like Nano Banano).",
    schema: {
      prompt: z.string().describe("Detailed description of the image to generate"),
      outputPath: z.string().describe("Path where the resulting image should be saved"),
      model: z.string().optional().describe("The model to use (e.g., 'nano-banana')"),
      includeStats: z.boolean().optional().describe("Include token usage and context size stats in the output"),
    },
  },
  {
    name: "gemini_edit_image",
    description: "Edit an existing image based on a prompt (using models like Nano Banano).",
    schema: {
      inputPath: z.string().describe("Path to the original image file"),
      prompt: z.string().describe("Description of what to change, add, or remove in the image"),
      outputPath: z.string().describe("Path to save the edited image"),
      model: z.string().optional().describe("The model to use (e.g., 'nano-banana')"),
      includeStats: z.boolean().optional().describe("Include token usage and context size stats in the output"),
    },
  },
  {
    name: "gemini_notebook_query",
    description: "Acts like NotebookLM: Query a set of local directories (containing your documents/code) to get answers strictly based on those files.",
    schema: {
      directories: z.array(z.string()).describe("List of directory paths to use as the knowledge base (sources)."),
      prompt: z.string().describe("The user's question or task regarding the provided sources."),
      model: z.string().optional().describe("The model to use (e.g., 'gemini-2.5-pro' for analyzing lots of files)."),
      includeStats: z.boolean().optional().describe("Include token usage and context size stats in the output"),
    },
  },
  {
    name: "gemini_autonomous_agent",
    description: "Instruct Gemini CLI to autonomously act on the filesystem, write code, run commands, and execute a complex task without human intervention (YOLO mode).",
    schema: {
      prompt: z.string().describe("The complex task you want the agent to fulfill autonomously"),
      cwd: z.string().optional().describe("Working directory for the task"),
      systemPrompt: z.string().optional().describe("System Instructions"),
      model: z.string().optional().describe("Model to use (e.g. gemini-2.5-pro)"),
      includeStats: z.boolean().optional(),
    },
  },
  {
    name: "gemini_analyze_video",
    description: "Analyze a video file (MP4, etc.) to extract audio transcripts, visual events, or answer user questions.",
    schema: {
      path: z.string().describe("Path to the video file"),
      prompt: z.string().describe("What to extract, summarize, or answer about the video"),
      model: z.string().optional().describe("The model to use (gemini-2.5-pro recommended)"),
      includeStats: z.boolean().optional(),
    },
  },
  {
    name: "gemini_analyze_audio",
    description: "Analyze an audio file (MP3, WAV, etc.) to extract transcripts, detect speakers, or summarize the conversation.",
    schema: {
      path: z.string().describe("Path to the audio file"),
      prompt: z.string().describe("What to extract, summarize, or answer about the audio"),
      model: z.string().optional().describe("The model to use (gemini-2.5-pro recommended)"),
      includeStats: z.boolean().optional(),
    },
  },
  {
    name: "gemini_sandbox_agent",
    description: "Run the Gemini CLI in an isolated sandbox environment. Useful for executing untrusted code or investigating malware safely.",
    schema: {
      prompt: z.string().describe("Task for the sandbox agent"),
      cwd: z.string().optional().describe("Directory to work in (will be sandboxed)"),
      model: z.string().optional(),
      includeStats: z.boolean().optional(),
    },
  },
  {
    name: "gemini_experimental_worktree",
    description: "Creates an isolated Git worktree branch and runs Gemini autonomously there. It prevents messing up the currently opened files in the IDE.",
    schema: {
      prompt: z.string().describe("The massive refactoring or risky changes you want to apply in the background branch"),
      branchName: z.string().optional().describe("Optional branch name for the new worktree"),
      cwd: z.string().optional().describe("Path to the git repository"),
      model: z.string().optional(),
      includeStats: z.boolean().optional(),
    },
  },
  {
    name: "gemini_summarize_url",
    description: "Read internet URLs and parse their contents for context or summary.",
    schema: {
      urls: z.array(z.string()).describe("A list of URLs (HTTP/HTTPS) to read"),
      prompt: z.string().describe("What to do with the URL contents (e.g. 'summarize main ideas', 'extract code')"),
      model: z.string().optional(),
      includeStats: z.boolean().optional(),
    },
  },
  {
    name: "gemini_generate_audio",
    description: "Generate spoken audio (TTS / Podcast) from text.",
    schema: {
      textToSpeak: z.string().describe("The script or text you want read aloud"),
      outputPath: z.string().describe("Path to save the .mp3 or .wav file"),
      model: z.string().optional(),
      includeStats: z.boolean().optional(),
    },
  },
  {
    name: "gemini_security_audit",
    description: "Audit given code or workspace purely for security vulnerabilities (e.g. OWASP, XSS, injections, misconfigurations) ignoring styling issues.",
    schema: {
      filesToAudit: z.string().describe("Space separated paths to files or directories for auditing"),
      customPolicyPath: z.string().optional().describe("Path to a custom config file to load (--policy)"),
      model: z.string().optional().describe("Security-oriented model"),
      includeStats: z.boolean().optional(),
    },
  },
  {
    name: "gemini_list_models",
    description: "List all known Gemini models with their capabilities, context windows, and recommended use cases. Also shows the currently active default model.",
    schema: {
      refresh: z.boolean().optional().describe("Ask Gemini CLI directly for the most up-to-date model list (slower, but fresher data)"),
    },
  },
  {
    name: "gemini_set_model",
    description: "Set or clear the default Gemini model for this session. Once set, all tools will use this model unless overridden with the 'model' parameter.",
    schema: {
      model: z.string().optional().describe("Model ID to set as default (e.g. 'gemini-2.5-pro'). Omit or pass empty string to clear the default."),
    },
  },
  {
    name: "gemini_usage",
    description: "Show token usage statistics, RPM rate, and rate-limit hits. Reads from gemini-usage.json which persists across sessions. Use this to monitor API consumption and check if you are approaching Gemini free-tier limits.",
    schema: {
      period: z.enum(["today", "all"]).optional().describe("'today' shows only today's stats (default), 'all' shows all-time totals"),
    },
  },
  {
    name: "gemini_status",
    description: "Show all currently running Gemini tasks and the last 10 completed/failed ones. Use this to monitor long-running operations like video analysis, autonomous agents, or large refactors.",
    schema: {
      verbose: z.boolean().optional().describe("Show full prompt text for each task (default: truncated)"),
    },
  },
  {
    name: "gemini_update",
    description: "Check the current Gemini CLI version, compare with the latest on npm, and optionally update to the latest version.",
    schema: {
      checkOnly: z.boolean().optional().describe("Only check for updates without installing (default: false)"),
      global: z.boolean().optional().describe("Install globally with -g flag (default: true)"),
    },
  },
];
