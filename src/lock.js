/**
 * src/lock.js
 * Single-instance lock for backend.js via a PID file in os.tmpdir().
 *
 * Flow:
 *   1. tryLock()  — returns true if we are now the owner, false if another
 *                   backend process is already alive (healthz responded).
 *   2. releaseLock() — delete the PID file on clean exit.
 */
import fs from "fs";
import os from "os";
import path from "path";

const LOCK_FILE = path.join(os.tmpdir(), "gemini-mcp-backend.pid");
const HEALTH_PORT_FILE = path.join(os.tmpdir(), "gemini-mcp-backend.port");

/** Write our PID (and port) so backend-manager can find us. */
export function writeLock(port) {
  fs.writeFileSync(LOCK_FILE, String(process.pid), "utf8");
  fs.writeFileSync(HEALTH_PORT_FILE, String(port), "utf8");
}

/** Remove the PID file. Call on process exit. */
export function releaseLock() {
  try { fs.unlinkSync(LOCK_FILE); } catch (_) {}
  try { fs.unlinkSync(HEALTH_PORT_FILE); } catch (_) {}
}

/**
 * Read the port from the lock file (written by a running backend).
 * Returns null if no lock file or port file exists.
 */
export function readLockedPort() {
  try {
    const port = parseInt(fs.readFileSync(HEALTH_PORT_FILE, "utf8").trim(), 10);
    return isNaN(port) ? null : port;
  } catch (_) {
    return null;
  }
}

/**
 * Check if the process recorded in the PID file is still alive.
 * On Windows, process.kill(pid, 0) throws if the PID does not exist.
 */
export function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Read the PID from the lock file.
 * Returns null if the file doesn't exist or contains a non-integer.
 */
export function readLockedPid() {
  try {
    const pid = parseInt(fs.readFileSync(LOCK_FILE, "utf8").trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch (_) {
    return null;
  }
}
