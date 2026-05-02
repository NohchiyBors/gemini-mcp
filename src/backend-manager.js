/**
 * src/backend-manager.js
 * Ensures a single backend.js process is running and reachable.
 *
 * Decision rule: trust /healthz, NOT the PID file.
 * PID can be stale (crashed/reused); /healthz cannot lie about
 * whether an HTTP server is actually serving on that port.
 */
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import { readLockedPort } from "./lock.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_SCRIPT = path.resolve(__dirname, "../backend.js");
const DEFAULT_PORT = parseInt(process.env.GEMINI_BACKEND_PORT || "3101", 10);
const HEALTHZ_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 400;

async function isBackendAlive(port) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch (_) {
    return false;
  }
}

async function waitForBackend(port, timeoutMs = HEALTHZ_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isBackendAlive(port)) return true;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return false;
}

/**
 * Ensure backend is running. Returns the port it's listening on.
 * Auto-starts backend.js if /healthz doesn't respond.
 * The backend handles stale-lock cleanup itself on startup.
 */
export async function ensureBackend() {
  const lockedPort = readLockedPort() ?? DEFAULT_PORT;

  // Trust /healthz — if alive, return port immediately
  if (await isBackendAlive(lockedPort)) return lockedPort;

  // Not alive — spawn a new backend (it will clean up any stale lock)
  const port = DEFAULT_PORT;
  const child = spawn(
    process.execPath,
    [BACKEND_SCRIPT, "--port", String(port)],
    {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, GEMINI_BACKEND_PORT: String(port) },
    }
  );
  child.unref();

  const ready = await waitForBackend(port);
  if (!ready) {
    throw new Error(
      `gemini-mcp backend failed to start on port ${port} within ${HEALTHZ_TIMEOUT_MS / 1000}s. ` +
      `Check gemini-mcp.log for details.`
    );
  }
  return port;
}
