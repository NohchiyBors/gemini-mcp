/**
 * backend.js — Persistent HTTP backend for gemini-mcp.
 *
 * Endpoints:
 *   GET  /healthz  ->  200 { status, pid, port, model, version }
 *   POST /call     ->  { tool, args } -> MCP { content, isError? }
 *
 * Usage:
 *   node backend.js
 *   node backend.js --port 3101
 *   GEMINI_BACKEND_PORT=3101 node backend.js
 */
import http from "http";
import net from "net";
import { spawn } from "child_process";
import { HANDLERS } from "./src/handlers.js";
import { writeLock, releaseLock, readLockedPid, isPidAlive, readLockedPort } from "./src/lock.js";
import { defaultModel } from "./src/gemini.js";

const portArg = process.argv.indexOf("--port");
const PORT = portArg !== -1
  ? parseInt(process.argv[portArg + 1], 10)
  : parseInt(process.env.GEMINI_BACKEND_PORT || "3101", 10);

// Check if a TCP port is currently bound (anything listening on it)
function isPortBound(port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(800);
    sock.on("connect", () => { sock.destroy(); resolve(true); });
    sock.on("error",   (e) => resolve(e.code !== "ECONNREFUSED"));
    sock.on("timeout", () => { sock.destroy(); resolve(true); });
    sock.connect(port, "127.0.0.1");
  });
}

// Single-instance check — guards against 3 stale-lock scenarios:
//
//   1. Crash/SIGKILL  : process dead, lock files remain.
//      port is FREE  -> isPortBound=false -> just releaseLock, no kill.
//
//   2. Hung process   : PID alive, /healthz silent, port still BOUND.
//      -> SIGTERM -> SIGKILL -> releaseLock.
//
//   3. PID reused by OS: different process took old PID, port is FREE.
//      -> only releaseLock, never kill the innocent process.
//
// Rule: we ONLY kill a process if the port is demonstrably still bound.
// This prevents collateral damage from OS PID reuse.
async function checkSingleInstance() {
  const existingPid = readLockedPid();
  const existingPort = readLockedPort() ?? PORT;

  if (existingPid === null || existingPid === process.pid) return;

  // Try /healthz — only trust if PID in response matches lock file
  let healthyPid = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`http://127.0.0.1:${existingPort}/healthz`, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      healthyPid = data.pid ?? null;
    }
  } catch (_) {}

  if (healthyPid !== null && healthyPid === existingPid) {
    // Verified: genuine live instance
    console.error(`[gemini-mcp backend] Already running (PID ${existingPid} on :${existingPort}). Exiting.`);
    process.exit(0);
  }

  // /healthz did not confirm a live backend. Check if the port is still bound.
  // We ONLY kill if the port is bound — this prevents killing an innocent process
  // that happened to reuse the stale PID after the real backend crashed.
  const portBound = await isPortBound(existingPort);

  if (portBound && isPidAlive(existingPid)) {
    // Port is held by what is likely a hung/zombie backend
    console.error(`[gemini-mcp backend] Hung process PID ${existingPid} holds :${existingPort} — killing...`);
    try { process.kill(existingPid, "SIGTERM"); } catch (_) {}
    await new Promise((r) => setTimeout(r, 1500));
    if (isPidAlive(existingPid)) {
      try { process.kill(existingPid, "SIGKILL"); } catch (_) {}
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  releaseLock();
  console.error("[gemini-mcp backend] Stale lock cleared.");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; });
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

function sendJson(res, code, body) {
  const payload = JSON.stringify(body);
  res.writeHead(code, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === "GET" && url.pathname === "/healthz") {
    return sendJson(res, 200, { status: "ok", pid: process.pid, port: PORT, model: defaultModel ?? null, version: "1.0.0" });
  }

  if (req.method === "POST" && url.pathname === "/call") {
    let body;
    try { body = await readBody(req); } catch (e) { return sendJson(res, 400, { error: e.message }); }
    const { tool, args = {} } = body;
    if (!tool) return sendJson(res, 400, { error: "Missing 'tool' field" });
    const handler = HANDLERS[tool];
    if (!handler) return sendJson(res, 404, { error: `Unknown tool: ${tool}` });
    try {
      return sendJson(res, 200, await handler(args));
    } catch (e) {
      return sendJson(res, 500, { content: [{ type: "text", text: `Backend error: ${e.message}` }], isError: true });
    }
  }

  sendJson(res, 404, { error: "Not found" });
}

(async () => {
  await checkSingleInstance();

  try {
    const cli = spawn(process.platform === "win32" ? "gemini.cmd" : "gemini", ["--help"], { shell: true });
    cli.on("error", () => console.error("[gemini-mcp backend] WARNING: Gemini CLI not found in PATH."));
  } catch (_) {}

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((e) => {
      console.error("[gemini-mcp backend] Error:", e);
      try { sendJson(res, 500, { error: "Internal server error" }); } catch (_) {}
    });
  });

  // Last-resort: port still occupied after cleanup (non-gemini process holds it)
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[gemini-mcp backend] Port ${PORT} still in use after cleanup. Kill the process manually and retry.`);
      releaseLock();
      process.exit(1);
    } else throw err;
  });

  server.listen(PORT, "127.0.0.1", () => {
    writeLock(PORT);
    console.error(`[gemini-mcp backend] Listening on http://127.0.0.1:${PORT} (PID ${process.pid})`);
  });

  function shutdown(sig) {
    console.error(`[gemini-mcp backend] ${sig} received, shutting down`);
    releaseLock();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  }
  process.on("SIGINT",  () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("exit", releaseLock);
})();
