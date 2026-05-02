# Changelog

## 2026-05-02

### Added
- Added shared-backend mode for multi-client setups:
  - `backend.js` runs one persistent HTTP backend process.
  - `stdio-proxy.js` lets multiple MCP clients share that backend over stdio.
  - Backend lock files are stored in the local OS temp directory, so one machine runs one backend instance.
- Added backend health and call endpoints:
  - `GET /healthz` returns backend status, PID, port, selected model, and version.
  - `POST /call` forwards MCP tool calls to shared handlers.
- Added backend manager and stale-lock handling:
  - detects an existing healthy backend;
  - clears stale PID/port files;
  - avoids killing unrelated processes when a PID was reused.
- Added shared source modules under `src/`:
  - `tool-defs.js` for MCP tool schemas;
  - `handlers.js` for tool implementations;
  - `gemini.js` for Gemini CLI process execution;
  - `usage-tracker.js` for token usage, RPM, errors, and rate-limit counters;
  - `backend-manager.js` for proxy-side backend startup;
  - `lock.js` for backend PID/port state.
- Added runtime task tracking:
  - active Gemini tasks;
  - recent completed/failed task history;
  - per-task status, model, duration, output byte count, and last activity time.
- Added rate-limit observability:
  - per-process RPM window;
  - model-tier RPM limits;
  - rate-limit detection for quota/429/resource-exhausted errors;
  - exponential retry for rate-limit failures.
- Added persistent usage statistics:
  - call counters;
  - error counters;
  - rate-limit hit counters;
  - daily and all-time token totals by model.
- Added host-specific runtime files for cloud-synced workspaces:
  - logs now write to `gemini-mcp.<hostname>.log`;
  - usage stats now write to `gemini-usage.<hostname>.json`.

### Changed
- Refactored the original standalone `index.js` into a compatibility entry point that reuses shared tool definitions and handlers.
- Updated runtime logging to write next to the project root regardless of the MCP client's inherited current working directory.
- Updated `.gitignore` to ignore host-specific usage files with `gemini-usage*.json`.

### Fixed
- Reduced conflict risk when the same project folder is synchronized through OneDrive or another cloud provider and used from multiple machines.
- Prevented different machines from competing over the same `gemini-mcp.log` and `gemini-usage.json` files.
- Improved backend startup behavior when stale lock files remain after crashes or forced process termination.
