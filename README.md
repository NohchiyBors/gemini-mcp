# Gemini MCP Server 🚀

[Русское описание ниже](#russian-description)

This project is a **Model Context Protocol (MCP)** server that acts as a bridge between [Gemini CLI](https://github.com/google/gemini-cli) and various MCP clients (Claude Desktop, Cursor, Windsurf, Cline, etc.).

By using this server, you can empower your AI assistant with the capabilities of Google Gemini for code analysis, complex task execution, and local file system interaction.

---

## ✨ Features

This server provides **21 specialized tools** powered by the Gemini CLI ecosystem. Here are the core capabilities:

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

## ⚙️ Configuration for MCP Clients

### 1. Claude Desktop
Edit `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "gemini-mcp": {
      "command": "node",
      "args": [
        "/absolute/path/to/gemini-mcp/index.js"
      ]
    }
  }
}
```

### 2. Cursor (IDE)
1. Go to **Settings** -> **Cursor Settings** -> **General** -> **MCP**.
2. Click **+ Add Server**.
3. Name: `gemini-mcp`.
4. Type: `command`.
5. Command: `node "/absolute/path/to/gemini-mcp/index.js"`.

### 3. Windsurf (IDE)
1. Open **Windsurf Settings**.
2. Navigate to **MCP Servers**.
3. Add a new server configuration:
```json
{
  "mcpServers": {
    "gemini-mcp": {
      "command": "node",
      "args": [
        "/absolute/path/to/gemini-mcp/index.js"
      ]
    }
  }
}
```

### 4. Cline (VS Code Extension)
1. Open **Cline Settings** in VS Code.
2. Find the **MCP Servers** section.
3. Click **Edit MCP Settings** (which opens `mcp_settings.json`).
4. Add the following entry:
```json
{
  "mcpServers": {
    "gemini-mcp": {
      "command": "node",
      "args": [
        "/absolute/path/to/gemini-mcp/index.js"
      ]
    }
  }
}
```

---

<a name="russian-description"></a>
# Gemini MCP Server (На русском) 🇷🇺

Этот проект представляет собой сервер **Model Context Protocol (MCP)**, который выступает в роли моста между [Gemini CLI](https://github.com/google/gemini-cli) и различными MCP-клиентами (Claude Desktop, Cursor, Windsurf, Cline и др.).

## ✨ Возможности

Сервер предоставляет **21 специализированный инструмент**, раскрывая всю мощь экосистемы Gemini:

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

## ⚙️ Настройка для клиентов

### 1. Claude Desktop
Отредактируйте файл `%APPDATA%\Claude\claude_desktop_config.json`:
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

### 2. Cursor
1. **Settings** -> **Cursor Settings** -> **General** -> **MCP**.
2. **+ Add Server**.
3. Название: `gemini-mcp`, Тип: `command`.
4. Команда: `node "/absolute/path/to/gemini-mcp/index.js"`.

### 3. Windsurf
Настройки Windsurf -> **MCP Servers** -> Добавить конфиг (аналогично Claude Desktop).

### 4. Cline (VS Code)
В настройках Cline нажмите **Edit MCP Settings** и добавьте блок `gemini-mcp` в JSON файл настроек.

## 📝 License / Лицензия

Non-Commercial License (see `LICENSE`)
