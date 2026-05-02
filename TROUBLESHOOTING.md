# Troubleshooting: Trusted Folders Error (Gemini CLI ≥ 0.39)

## Проблема

После обновления `@google/gemini-cli` до версии 0.39.x все вызовы инструментов `gemini-mcp` падают с ошибкой:

```
Error: Gemini exited with code 55:
Gemini CLI is not running in a trusted directory.
To proceed, either use `--skip-trust`, set the `GEMINI_CLI_TRUST_WORKSPACE=true`
environment variable, or trust this directory in interactive mode.
```

**Причина:** Google в версии 0.39 ужесточил политику безопасности, добавив механизм Trusted Folders. CLI отказывается выполняться в «недоверенной» рабочей директории, если запущен неинтерактивно (как делает MCP-обёртка).

---

## Решение

Прокинуть переменную окружения `GEMINI_CLI_TRUST_WORKSPACE=true` в дочерний процесс CLI через конфиг Claude Desktop.

### Шаг 1. Проверить версию CLI

```js
// MCP tool call
gemini_update({ checkOnly: true })
```

Если показано `0.39.x` — патч обязателен. На `0.37.x` и ниже проблемы нет.

### Шаг 2. Применить патч к `claude_desktop_config.json`

PowerShell, одной командой (создаёт `.bak`, парсит JSON структурно, валидирует результат):

```powershell
python -c @"
import json, pathlib, shutil
p = pathlib.Path(r'C:\Users\<USER>\AppData\Roaming\Claude\claude_desktop_config.json')
bak = p.with_suffix(p.suffix + '.bak')
if not bak.exists():
    shutil.copy2(p, bak)
    print(f'Backup: {bak}')
cfg = json.loads(p.read_text(encoding='utf-8'))
for name, srv in cfg.get('mcpServers', {}).items():
    if 'gemini' in name.lower():
        srv.setdefault('env', {})['GEMINI_CLI_TRUST_WORKSPACE'] = 'true'
        print(f'Patched: {name}')
p.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding='utf-8')
json.loads(p.read_text(encoding='utf-8'))  # validate
print('Done.')
"@
```

Итоговый блок в конфиге должен выглядеть так:

```json
"gemini-mcp": {
  "command": "node",
  "args": ["D:/.../gemini-mcp/index.js"],
  "env": {
    "GEMINI_CLI_TRUST_WORKSPACE": "true"
  }
}
```

### Шаг 3. Полный перезапуск Claude Desktop

> ⚠️ Закрытие окна крестиком не считается — процесс остаётся в трее и держит старое окружение.

```powershell
Get-Process Claude -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep 3
Start-Process "$env:LOCALAPPDATA\AnthropicClaude\Claude.exe"
```

### Шаг 4. Верификация

В новой сессии Claude:

```js
gemini_chat({ message: "ping" })
// Ожидаемый ответ: текстовый ответ Gemini без ошибки exit code 55
```

---

## Альтернативные решения

| Вариант | Когда применять |
|---|---|
| `env: { "GEMINI_CLI_TRUST_WORKSPACE": "true" }` в конфиге | **Рекомендуется** — переживает обновления, не требует правки исходников |
| Откат на `0.37.2` через `npm i -g @google/gemini-cli@0.37.2` | Если по политике компании нельзя помечать workspace как trusted |
| Флаг `--skip-trust` в args обёртки | Если у обёртки есть проброс аргументов; правка кода MCP-сервера |

---

## Известные подводные камни

- **Конфиг иногда сохраняется без патча при первом запуске** — если после применения скрипта `env` отсутствует в файле, повторите Шаг 2 и сразу перезапустите Claude (Шаг 3) без промежуточных действий.
- **Бэкап создаётся однократно** — `.bak` пишется только если его ещё нет, чтобы повторные запуски не затёрли исходный рабочий конфиг.
- **UTF-8 без BOM** — Python пишет JSON корректно по умолчанию; не сохраняйте конфиг через Notepad с кодировкой «UTF-8 with BOM», Claude Desktop её не любит.
- **Делегировать правку самому Gemini нельзя** — он сам сломан этой же ошибкой, замкнутый круг.

---

## История инцидента (тестовый прогон)

1. Текущая версия — `0.37.2`, последняя в npm — `0.39.1` → запущено обновление.
2. После апгрейда `gemini_chat` → `Error: exit code 55` (trust violation).
3. Патч `env.GEMINI_CLI_TRUST_WORKSPACE=true` применён через Python-скрипт в PowerShell.
4. Полный рестарт Claude Desktop (`Stop-Process` → `Start-Process`).
5. `gemini_chat({ message: "ping" })` → корректный ответ. Все 24 инструмента восстановлены.
