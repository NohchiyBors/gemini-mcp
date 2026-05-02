# Gemini MCP Server 🚀

[Русское описание ниже](#russian-description)

This project is a **Model Context Protocol (MCP)** server that acts as a bridge between [Gemini CLI](https://github.com/google/gemini-cli) and various MCP clients (Claude Desktop, Cursor, Windsurf, Cline, etc.).

By using this server, you can empower your AI assistant with the capabilities of Google Gemini for code analysis, complex task execution, and local file system interaction.

See [CHANGELOG.md](CHANGELOG.md) for version history and recent feature changes.

---

## ✨ Features

This server provides **24 specialized tools** powered by the Gemini CLI ecosystem. Here are the core capabilities:

### Core & Productivity
- **`gemini_task` / `gemini_chat`**: Execute arbitrary prompts and maintain conversational history.
- **`gemini_notebook_query`**: Local RAG agent acting like Google NotebookLM for querying specific directories.
- **`gemini_summarize_url`**: Read internet URLs and parse their contents for context or summary.

### Code & Git
- **`gemini_refactor` / `gemini_generate_tests` / `gemini_explain_error`**: Developer-focused code tools.
- **`gemini_review_diff` / `gemini_generate_commit`**: Uncommitted changes review and intelligent commit messages.
- **`gemini_extract_data`**: Structured JSON extraction constrained by your schemas.

### Multimodal Intelligence
- **`gemini_analyze_image` / `gemini_analyze_video` / `gemini_analyze_audio`**: Native multimodal analysis of local MP4, MP3, WAV, and Image files.
- **`gemini_generate_image` / `gemini_edit_image`**: Generate or modify images using graphical models (like Nano Banano).
- **`gemini_generate_audio`**: Text-to-Speech generation creating human-like podcasts and audio files.

### Advanced Automation
- **`gemini_autonomous_agent`**: Fully autonomous execution (YOLO mode) allowing Gemini to operate on the filesystem freely.
- **`gemini_experimental_worktree`**: Safely execute risky refactoring in isolated Git worktrees.
- **`gemini_sandbox_agent`**: Execute commands in isolated environments.
- **`gemini_security_audit`**: Strict logic and security audits (OWASP rules, XSS, SSRF).

### Model & CLI Management
- **`gemini_list_models`**: List all available Gemini models with context windows and recommended use cases.
- **`gemini_set_model`**: Change the default model used by all tools.
- **`gemini_update`**: Check the current Gemini CLI version and update to the latest if needed.

*All tools support dynamic model overriding (e.g. `gemini-2.5-pro`) and token usage tracking!*

## 🛠 Prerequisites

*   **Node.js**: Version 18 or higher.
*   **Gemini CLI**: Must be installed and configured in your system (the `gemini` command should be accessible in the terminal).

## 🚀 Installation

1. Clone the repository or download the project files.
2. We have provided automated configuration scripts! Run the setup script for your OS:
   - **Windows:** Double-click `setup.bat`
   - **macOS:** Double-click `setup.command`
   - **Linux:** Run `./setup.sh` in terminal
   
   These scripts will automatically install dependencies, check your Gemini CLI, and **generate the exact JSON configuration** you need to paste into your AI editor!
   *(You can also set up manually by navigating to the folder and running `npm install`).*

## 🏗 Architecture: Standalone vs. Shared-Backend Mode

gemini-mcp supports two deployment modes. Choose based on how many MCP clients you run simultaneously.

### Mode 1 — Standalone stdio (default, original)

Each MCP client spawns its own `index.js` process. Simple, zero config, works out of the box.

```
Claude ──→ node index.js ──→ Gemini CLI
Codex  ──→ node index.js ──→ Gemini CLI   (two separate processes)
```

**Use this when**: you have a single client, or each client needs its own isolated model-state.

### Mode 2 — Backend + Stdio Proxy (recommended for multi-client setups)

A single `backend.js` process handles all Gemini calls. Any number of `stdio-proxy.js` instances connect to it. The proxy auto-starts the backend on the first tool call if it isn't running.

```
Claude ──→ stdio-proxy.js ──┐
Codex  ──→ stdio-proxy.js ──┼──→ backend.js (one process) ──→ Gemini CLI
Cursor ──→ stdio-proxy.js ──┘
```

**Benefits**: no duplicate Gemini CLI processes, centralised logs, shared `defaultModel` state across clients, rate-limiting in a single place.

**How to enable**: replace `index.js` with `stdio-proxy.js` in your client config (see configs below). The backend starts automatically — you don't need to launch it manually.

You can also start the backend explicitly (e.g. as a system service):
```bash
node backend.js                       # default port 3101
node backend.js --port 3101
GEMINI_BACKEND_PORT=3101 node backend.js
```

Check it's alive: `curl http://127.0.0.1:3101/healthz`

---

## ⚙️ Configuration for MCP Clients

### ⚠️ Important: Headless / Automated Mode

When running inside an AI assistant (Claude, Cursor, Windsurf, etc.), the Gemini CLI operates without an interactive terminal. You **must** add the following environment variable to your config, otherwise the CLI will refuse to run with exit code 55:

```json
"env": {
  "GEMINI_CLI_TRUST_WORKSPACE": "true"
}
```

### 1. Claude Desktop
Edit `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

**Standalone mode** (original):
```json
{
  "mcpServers": {
    "gemini-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/gemini-mcp/index.js"],
      "env": { "GEMINI_CLI_TRUST_WORKSPACE": "true" }
    }
  }
}
```

**Shared-backend mode** (if you also use Codex, Cursor, etc.):
```json
{
  "mcpServers": {
    "gemini-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/gemini-mcp/stdio-proxy.js"],
      "env": { "GEMINI_CLI_TRUST_WORKSPACE": "true" }
    }
  }
}
```

### 2. Cursor (IDE)
1. Go to **Settings** -> **Cursor Settings** -> **General** -> **MCP**.
2. Click **+ Add Server**.
3. Name: `gemini-mcp`, Type: `command`.
4. Command: `node "/absolute/path/to/gemini-mcp/index.js"` (or `stdio-proxy.js` for shared mode).

### 3. Windsurf (IDE)
```json
{
  "mcpServers": {
    "gemini-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/gemini-mcp/index.js"]
    }
  }
}
```

### 4. Cline (VS Code Extension)
Open **Edit MCP Settings** in Cline and add:
```json
{
  "mcpServers": {
    "gemini-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/gemini-mcp/index.js"]
    }
  }
}
```

### 5. OpenAI Codex (shared-backend mode)
Add to `~/.codex/config.toml` (or your project's codex config):
```toml
[[mcp_servers]]
name = "gemini-mcp"
command = "node"
args = ["/absolute/path/to/gemini-mcp/stdio-proxy.js"]
env = { GEMINI_CLI_TRUST_WORKSPACE = "true" }
```

## 🔧 Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for known issues and fixes.

**Most common issue — exit code 55 (Gemini CLI ≥ 0.39):**  
After upgrading to `@google/gemini-cli` 0.39+, all tools fail with:
```
Gemini CLI is not running in a trusted directory.
```
Fix: add `"GEMINI_CLI_TRUST_WORKSPACE": "true"` to the `env` block in your MCP client config (see the `⚠️ Important` section above), then fully restart the client. Full step-by-step in [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

---

<a name="russian-description"></a>
# Gemini MCP Server (На русском) 🇷🇺

Этот проект представляет собой сервер **Model Context Protocol (MCP)**, который выступает в роли моста между [Gemini CLI](https://github.com/google/gemini-cli) и различными MCP-клиентами (Claude Desktop, Cursor, Windsurf, Cline и др.).

## ✨ Возможности

Сервер предоставляет **24 специализированных инструмента**, раскрывая всю мощь экосистемы Gemini:

### Базовые и продуктивные
- **`gemini_task` / `gemini_chat`**: Выполнение задач и чат с поддержанием контекста переписки.
- **`gemini_notebook_query`**: Локальный RAG-агент (аналог NotebookLM) для поиска информации по вашим локальным папкам.
- **`gemini_summarize_url`**: Веб-ридер для мгновенного скачивания и анализа контента по URL-ссылкам.

### Код и Git
- **`gemini_refactor` / `gemini_generate_tests` / `gemini_explain_error`**: Написание кода, тестов и объяснение стектрейсов ошибок.
- **`gemini_review_diff` / `gemini_generate_commit`**: Ревью незакоммиченного кода и умная генерация коммитов.
- **`gemini_extract_data`**: Извлечение данных в строгом структурированном JSON-формате по заданным схемам.

### Мультимодальность и Генерация
- **`gemini_analyze_image` / `gemini_analyze_video` / `gemini_analyze_audio`**: Анализ фото, длинных MP4-видео или аудиофайлов.
- **`gemini_generate_image` / `gemini_edit_image`**: Создание и редактирование графики (используя модели вроде Nano Banano).
- **`gemini_generate_audio`**: Синтез человеческой речи (Text-to-Speech) в MP3 файл.

### Автономные агенты
- **`gemini_autonomous_agent`**: Полноценный YOLO-агент, способный самостоятельно вносить изменения в ОС и запускать код.
- **`gemini_experimental_worktree`**: Безопасные эксперименты с кодом в параллельных скрытых Git-ветках.
- **`gemini_sandbox_agent`**: Песочница для безопасного исследования подозрительного кода.
- **`gemini_security_audit`**: Жесткий секьюрити-аудит проекта (поиск OWASP уязвимостей и утечек ключей).

### Управление моделями и CLI
- **`gemini_list_models`**: Список доступных моделей Gemini с описанием контекстных окон и рекомендуемых сценариев.
- **`gemini_set_model`**: Смена модели по умолчанию для всех инструментов.
- **`gemini_update`**: Проверка текущей версии Gemini CLI и обновление до последней при необходимости.

*Каждый инструмент поддерживает ручной выбор модели (опция `model`) и изолированный детальный трекинг потребленных токенов (опция `includeStats`)!*

## 🛠 Предварительные требования

*   **Node.js**: Версия 18+.
*   **Gemini CLI**: Должен быть установлен и настроен (команда `gemini` доступна в терминале).

## 🚀 Установка

1. Стяните репозиторий.
2. Воспользуйтесь скриптами автоматической настройки из папки проекта:
   - **Windows:** Запустите `setup.bat` (двойным кликом)
   - **macOS:** Запустите `setup.command` (двойным кликом)
   - **Linux:** Выполните `./setup.sh` в терминале
   
   Эти скрипты автоматически установят пакеты (`npm install`), проверят наличие Google Gemini CLI и **сгенерируют точный JSON-код конфигурации** с правильными абсолютными путями вашего компьютера!
   *(Для ручной установки достаточно выполнить команду `npm install` в терминале).*

## 🏗 Архитектура: Standalone vs. Shared-Backend

gemini-mcp поддерживает два режима работы.

### Режим 1 — Standalone stdio (стандартный, оригинальный)

Каждый MCP-клиент запускает свой процесс `index.js`. Просто, без лишней конфигурации.

```
Claude ──→ node index.js ──→ Gemini CLI
Codex  ──→ node index.js ──→ Gemini CLI   (два отдельных процесса)
```

**Когда использовать**: один клиент, или нужно изолированное состояние модели на клиент.

### Режим 2 — Backend + Stdio Proxy (рекомендуется при нескольких клиентах)

Единый процесс `backend.js` обслуживает все вызовы Gemini. Любое количество `stdio-proxy.js` подключается к нему. Proxy автоматически запускает backend при первом вызове инструмента.

```
Claude ──→ stdio-proxy.js ──┐
Codex  ──→ stdio-proxy.js ──┼──→ backend.js (один процесс) ──→ Gemini CLI
Cursor ──→ stdio-proxy.js ──┘
```

**Преимущества**: нет дублирующихся процессов Gemini CLI, централизованные логи, общее состояние `defaultModel` для всех клиентов, единое место для rate-limiting.

**Как включить**: замените `index.js` на `stdio-proxy.js` в конфиге клиента (см. раздел ниже). Backend стартует автоматически — запускать его вручную не нужно.

Можно также запустить backend явно (например, как системный сервис):
```bash
node backend.js                       # порт по умолчанию 3101
node backend.js --port 3101
GEMINI_BACKEND_PORT=3101 node backend.js
```

Проверка: `curl http://127.0.0.1:3101/healthz`

---

## ⚙️ Настройка для клиентов

### ⚠️ Важно: Headless / Автоматический режим

При работе внутри ИИ-ассистента (Claude, Cursor, Windsurf и др.) Gemini CLI работает без интерактивного терминала. Необходимо добавить переменную окружения, иначе CLI откажется запускаться с кодом ошибки 55:

```json
"env": {
  "GEMINI_CLI_TRUST_WORKSPACE": "true"
}
```

### 1. Claude Desktop
Отредактируйте файл `%APPDATA%\Claude\claude_desktop_config.json`:

**Standalone режим** (оригинальный):
```json
{
  "mcpServers": {
    "gemini-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/gemini-mcp/index.js"],
      "env": { "GEMINI_CLI_TRUST_WORKSPACE": "true" }
    }
  }
}
```

**Shared-backend режим** (если одновременно используете Codex, Cursor и др.):
```json
{
  "mcpServers": {
    "gemini-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/gemini-mcp/stdio-proxy.js"],
      "env": { "GEMINI_CLI_TRUST_WORKSPACE": "true" }
    }
  }
}
```

### 2. Cursor
1. **Settings** → **Cursor Settings** → **General** → **MCP** → **+ Add Server**.
2. Название: `gemini-mcp`, Тип: `command`.
3. Команда: `node "/absolute/path/to/gemini-mcp/index.js"` (или `stdio-proxy.js` для shared-режима).

### 3. Windsurf
Настройки Windsurf → **MCP Servers** → Добавить конфиг (аналогично Claude Desktop).

### 4. Cline (VS Code)
В настройках Cline нажмите **Edit MCP Settings** и добавьте блок `gemini-mcp` в JSON файл настроек.

### 5. OpenAI Codex (shared-backend режим)
В `~/.codex/config.toml`:
```toml
[[mcp_servers]]
name = "gemini-mcp"
command = "node"
args = ["/absolute/path/to/gemini-mcp/stdio-proxy.js"]
env = { GEMINI_CLI_TRUST_WORKSPACE = "true" }
```

## 🔧 Устранение неполадок

Подробный гайд — в [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

**Самая частая проблема — exit code 55 (Gemini CLI ≥ 0.39):**  
После обновления до `@google/gemini-cli` 0.39+ все инструменты падают с ошибкой:
```
Gemini CLI is not running in a trusted directory.
```
Решение: добавьте `"GEMINI_CLI_TRUST_WORKSPACE": "true"` в блок `env` конфига MCP-клиента (см. раздел `⚠️ Важно` выше) и полностью перезапустите клиент. Пошаговый разбор — в [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

## 📝 License / Лицензия

Non-Commercial License (see `LICENSE`)
