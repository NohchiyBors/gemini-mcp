# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install      # install dependencies
npm start        # start the MCP server (node index.js)
node index.js    # run directly — server communicates over stdio
```

There are no tests or lint scripts configured.

## Architecture

This is a single-file MCP server (`index.js`) that wraps the **Gemini CLI** (`gemini` / `gemini.cmd` on Windows) and exposes its capabilities as MCP tools.

**Runtime flow:**
1. Server initialises via `@modelcontextprotocol/sdk` (`McpServer` + `StdioServerTransport`).
2. Each tool call constructs a prompt string and delegates to `runGemini(prompt, cwd, options)`.
3. `runGemini` spawns the `gemini` CLI process with the `-p <prompt>` flag and optional flags (`-m`, `--yolo`, `--sandbox`, `--worktree`, `--policy`, `--include-directories`, `-o json`).
4. Output is returned over stdio back to the MCP client.

**Windows note:** On Windows, `shell: true` is used with `gemini.cmd`; double-quotes in prompts must be escaped manually to avoid arg-passing bugs.

**Logging:** All requests and errors are appended to `gemini-mcp.log` in the current working directory (not stdout, to avoid polluting the MCP stdio channel).

**Tool categories implemented:**
- General tasks: `gemini_task`, `gemini_chat`, `gemini_analyze`
- Code & Git: `gemini_refactor`, `gemini_generate_tests`, `gemini_explain_error`, `gemini_review_diff`, `gemini_generate_commit`, `gemini_extract_data`
- Multimodal: `gemini_analyze_image`, `gemini_analyze_video`, `gemini_analyze_audio`, `gemini_generate_image`, `gemini_edit_image`, `gemini_generate_audio`
- Autonomous agents: `gemini_autonomous_agent` (YOLO), `gemini_sandbox_agent` (sandbox+YOLO), `gemini_experimental_worktree` (worktree+YOLO)
- Utilities: `gemini_notebook_query` (`--include-directories`), `gemini_summarize_url`, `gemini_security_audit`

**`includeStats` option:** When `true`, passes `-o json` to the CLI and parses the `stats.models` block, appending token usage to the response.

**Timeout:** 5 minutes hard-coded per Gemini process.

## Prerequisites

- Node.js 18+
- `gemini` CLI installed and available in `PATH` (from [google/gemini-cli](https://github.com/google/gemini-cli))

## Before working with tools

**Always verify the environment first:**
```bash
gemini --version   # must return a version number, e.g. 0.37.2
```
If this fails, the Gemini CLI is not in PATH — all `mcp__gemini-mcp__*` tools will fail with a spawn error regardless of whether the MCP server itself started correctly.

**All 21 tools require the local Gemini CLI.** There is no fallback to a remote API. A tool returning `Error: Failed to start gemini` or timing out almost always means the CLI is missing or not in PATH, not a bug in this server.

**Diagnosing failures:**
- Check `gemini-mcp.log` in the working directory for per-request error details.
- `gemini_summarize_url` and network-dependent tools can time out if outbound HTTP is blocked — this is an environment/firewall issue, not a server bug.
- On Windows the server uses `gemini.cmd`; on macOS/Linux it uses `gemini`. If running in a Linux container or WSL without the CLI installed, tools will not work even if they work on the host Windows machine.

## MCP Client Configuration

The server runs over stdio. Register it in your client with:
```json
{ "command": "node", "args": ["/absolute/path/to/gemini-mcp/index.js"] }
```
Setup scripts for automatic configuration: `setup.bat` (Windows), `setup.command` (macOS), `setup.sh` (Linux).
