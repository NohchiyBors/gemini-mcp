# 🤖 AI Assistant Instructions / Инструкции для ИИ-Ассистентов

[🇺🇸 English Version](#english-version) | [🇷🇺 Русская версия](#russian-version)

---

<a name="english-version"></a>
## 🇺🇸 English Version

If you have connected this MCP server to your AI editor (Cursor, Windsurf) or Claude Desktop, it is highly recommended to provide the assistant with the following instructions. Copy the text below and paste it into your **Custom Instructions** or add it to the **`.cursorrules`** file in your project root.

```markdown
# GEMINI-MCP META-INSTRUCTIONS

You (the AI Assistant) have access to a powerful MCP server `gemini-mcp`. This server delegates complex, dirty, or resource-intensive tasks to the Google Gemini agent. To save your own resources and execute tasks faster using our 21 specialized tools, ALWAYS delegate the workload to Gemini if the task falls into the following categories:

### 1. Multimedia & Graphics (You cannot do this natively)
- **`gemini_analyze_video` / `gemini_analyze_audio`**: If the user asks to analyze a video (`.mp4`) or audio (`.mp3`/`.wav`), IMMEDIATELY pass the absolute file path to this tool.
- **`gemini_analyze_image`**: Deep analysis of a local image.
- **`gemini_generate_image`**: If you need to draw/generate an image, ask Gemini.
- **`gemini_edit_image`**: Edit an existing image based on the user's prompt.
- **`gemini_generate_audio`**: Text-to-speech generation (creates an MP3 podcast/speech).

### 2. Massive and Dangerous Code Operations
- **`gemini_autonomous_agent`**: For building entire projects from scratch. The `--yolo` flag allows Gemini to autonomously create folders, write code, and run server scripts without stopping.
- **`gemini_experimental_worktree`**: If you need to rewrite thousands of lines of code, DO NOT DO IT YOURSELF. Pass the task here to be executed in an isolated Git branch.
- **`gemini_sandbox_agent`**: If the code is suspicious or downloaded from an untrusted source, run it only through this isolated sandbox.

### 3. Massive Data Analysis (Delegate heavy lifting)
- **`gemini_notebook_query`**: RAG Emulator. If you need to find facts across 50+ files, pass an array of folders to this function. It will find everything itself.
- **`gemini_analyze`**: Deep architectural analysis of a massive directory or a huge file.
- **`gemini_summarize_url`**: You cannot scrape fresh URLs yourself. If the user provides a link `https://...`, call this tool to parse the web.

### 4. Developer Utilities (Quick Delegation)
- **`gemini_refactor`**: Perfect tool for clean refactoring of a specific block (returns ONLY code without fluff).
- **`gemini_generate_tests`**: Instant generation of `jest`, `pytest`, or `mocha` tests.
- **`gemini_explain_error`**: Feed unreadable Stacktraces here to quickly get the root cause.
- **`gemini_extract_data`**: To extract a strict JSON structure from a chaotic log or text.

### 5. Git and Security
- **`gemini_security_audit`**: Strict OWASP vulnerability hunt, XSS, and secret leak detection.
- **`gemini_review_diff` / `gemini_generate_commit`**: Automatic review of uncommitted changes and intelligent commit message generation.

### 6. General Tasks
- **`gemini_task` / `gemini_chat`**: Use for any general questions or retaining long conversational context with Gemini family models.

**IMPORTANT**: All tools support the `model` and `includeStats` parameters. If the task is heavy (video analysis, security audit), always explicitly specify `model: "gemini-2.5-pro"` to get the maximum context window.
```

---

<a name="russian-version"></a>
## 🇷🇺 Русская версия

Если вы подключили этот MCP-сервер к вашему ИИ-редактору или Claude Desktop, настоятельно рекомендуется передать ассистенту следующие инструкции. 
Скопируйте текст ниже и вставьте его в настройки **Custom Instructions** (в Claude) или добавьте в файл **`.cursorrules`** в корне вашего рабочего проекта.

```markdown
# МЕТА-ИНСТРУКЦИЯ ПО ИСПОЛЬЗОВАНИЮ GEMINI-MCP

Тебе (ИИ-Ассистенту) доступен мощный MCP-сервер `gemini-mcp`. Этот сервер делегирует выполнение сложных, грязных или ресурсоемких задач агенту Google Gemini. Чтобы экономить свои ресурсы и выполнять задачи быстрее (используя 21 специализированный инструмент), всегда делегируй работу Gemini, если задача попадает под следующие категории:

### 1. Обработка мультимедиа и графики (Ты не умеешь это сам)
- **`gemini_analyze_video` / `gemini_analyze_audio`**: Если пользователь просит проанализировать видеофайл (`.mp4`) или аудио (`.mp3`/`.wav`), НЕМЕДЛЕННО передай абсолютный путь к этому файлу сюда.
- **`gemini_analyze_image`**: Детальный анализ локальной картинки.
- **`gemini_generate_image`**: Если нужно нарисовать/сгенерировать изображение, проси Gemini.
- **`gemini_edit_image`**: Редактирование уже существующей картинки по промпту пользователя.
- **`gemini_generate_audio`**: Озвучивание текста (создание MP3 подкаста/речи).

### 2. Масштабные и опасные операции с кодом
- **`gemini_autonomous_agent`**: Для создания целых проектов с нуля. Флаг `--yolo` позволит Gemini самой создавать папки, писать код и серверные скрипты без остановок.
- **`gemini_experimental_worktree`**: Если нужно переписать тысячи строк кода, НЕ ДЕЛАЙ ЭТО САМ. Передай задачу сюда, и она будет выполнена в изолированной Git-ветке.
- **`gemini_sandbox_agent`**: Если код подозрительный или скачан из недоверенного источника, запускай его только через этот инструмент (изолированная песочница).

### 3. Анализ огромных объемов данных (Делегируй тяжелую работу)
- **`gemini_notebook_query`**: Эмулятор RAG. Если нужно найти факты среди 50+ файлов, передай этой функции массив папок. Она найдет всё сама.
- **`gemini_analyze`**: Глубокий архитектурный анализ конкретной тяжелой директории или огромного файла.
- **`gemini_summarize_url`**: Ты не умеешь ходить по свежим URL сам. Если пользователь дает ссылку `https://...`, сделай вызов этого инструмента для парсинга веба.

### 4. Утилиты для разработчика (Быстрый Delegation)
- **`gemini_refactor`**: Идеальный инструмент для чистого рефакторинга конкретного блока (возвращает только код без лишних объяснений).
- **`gemini_generate_tests`**: Моментальная генерация `jest`, `pytest` или `mocha` тестов для файла.
- **`gemini_explain_error`**: Скармливай сюда нечитаемые Stacktrace, чтобы быстро получить суть ошибки.
- **`gemini_extract_data`**: Если нужно выцепить JSON-структуру из хаотичного лога или текста.

### 5. Git и безопасность
- **`gemini_security_audit`**: Жесткий поиск OWASP-уязвимостей, XSS и утечек секретов в проекте.
- **`gemini_review_diff` / `gemini_generate_commit`**: Автоматическое ревью текущих изменений и генерация осмысленных коммитов.

### 6. Общие задачи
- **`gemini_task` / `gemini_chat`**: Использовать для любых общих вопросов или сохранения долгого контекста общения с моделями семейства Gemini.

**ВАЖНО**: Все инструменты поддерживают параметры `model` и `includeStats`. Если задача тяжелая (анализ видео, аудит безопасности) — всегда явно указывай в аргументах `model: "gemini-2.5-pro"` для получения максимального контекстного окна.
```
