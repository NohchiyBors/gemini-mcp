/**
 * index.js — Standalone MCP stdio server (backward-compatible entry point).
 *
 * Runs Gemini CLI directly in the same process — no backend required.
 * Existing Claude / Codex configs that point here continue to work as before.
 *
 * For multi-client setups where you want a single shared backend process, use
 * stdio-proxy.js instead (it auto-starts backend.js and proxies calls over HTTP).
 *
 * Architecture overview:
 *   index.js (standalone stdio) ──┐
 *                                  ├─ src/tool-defs.js  (schemas)
 *   stdio-proxy.js (HTTP proxy) ──┤  src/handlers.js   (logic)
 *                                  └─ src/gemini.js     (CLI runner)
 *   backend.js  (HTTP server)    ──┘
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { spawn } from "child_process";
import { TOOL_DEFS } from "./src/tool-defs.js";
import { HANDLERS } from "./src/handlers.js";

const server = new McpServer({ name: "gemini-mcp", version: "1.0.0" });

// Register every tool from the shared definitions, wiring it to the shared handler
for (const def of TOOL_DEFS) {
  const handler = HANDLERS[def.name];
  if (!handler) {
    console.error(`[gemini-mcp] WARNING: no handler found for tool "${def.name}"`);
    continue;
  }
  server.tool(def.name, def.description, def.schema, handler);
}

// Verify Gemini CLI is available at startup (warn, don't abort)
try {
  const command = process.platform === "win32" ? "gemini.cmd" : "gemini";
  const check = spawn(command, ["--help"], { shell: true });
  check.on("error", () => {
    console.error(
      "КРИТИЧЕСКАЯ ОШИБКА: Gemini CLI не найден. Убедитесь, что он установлен и доступен в PATH."
    );
  });
} catch (e) {
  console.error("Ошибка при проверке Gemini CLI:", e.message);
}

const transport = new StdioServerTransport();
await server.connect(transport);
