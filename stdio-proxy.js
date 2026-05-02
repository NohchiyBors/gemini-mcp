/**
 * stdio-proxy.js
 * ──────────────────────────────────────────────────────────────────────────────
 * Thin MCP stdio server that forwards every tool call to backend.js via HTTP.
 *
 * Multiple instances can run simultaneously (one per MCP client: Claude,
 * Codex, Cursor…) — they all share the SINGLE backend process.
 *
 * Configure in Claude / Codex instead of index.js:
 *   { "command": "node", "args": ["/abs/path/to/gemini-mcp/stdio-proxy.js"] }
 *
 * The proxy auto-starts backend.js on the first tool call if it isn't running.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TOOL_DEFS } from "./src/tool-defs.js";
import { ensureBackend } from "./src/backend-manager.js";

const CALL_TIMEOUT_MS = 360_000; // 6 minutes (Gemini can take up to 5 min)

// ─── Forward a tool call to the backend ──────────────────────────────────────
async function callBackend(toolName, args) {
  const port = await ensureBackend();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);

  try {
    const res = await fetch(`http://127.0.0.1:${port}/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: toolName, args }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => `HTTP ${res.status}`);
      return {
        content: [{ type: "text", text: `Backend returned HTTP ${res.status}: ${text}` }],
        isError: true,
      };
    }
    return await res.json();
  } catch (e) {
    clearTimeout(timer);
    const isTimeout = e.name === "AbortError";
    return {
      content: [{
        type: "text",
        text: isTimeout
          ? `Tool call timed out after ${CALL_TIMEOUT_MS / 1000}s`
          : `Failed to reach backend: ${e.message}`,
      }],
      isError: true,
    };
  }
}

// ─── Build MCP server ─────────────────────────────────────────────────────────
const server = new McpServer({
  name: "gemini-mcp-proxy",
  version: "1.0.0",
});

for (const def of TOOL_DEFS) {
  server.tool(
    def.name,
    def.description,
    def.schema,
    async (args) => callBackend(def.name, args)
  );
}

// ─── Start ────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
