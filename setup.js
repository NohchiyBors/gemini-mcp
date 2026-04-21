import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import os from 'os';

// Detect OS Language
const locale = Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
const isRu = locale.startsWith('ru');

const t = {
  header: isRu ? "🛠  Настройка Gemini MCP и Проверка Системы 🛠" : "🛠  Gemini MCP Setup & System Check 🛠",
  step1: isRu ? "📦 1. Проверка и установка npm-пакетов проекта..." : "📦 1. Checking and installing npm packages...",
  step1Ok: isRu ? "✅ Зависимости успешно установлены.\n" : "✅ Dependencies successfully installed.\n",
  step1Err: isRu ? "❌ Ошибка при установке npm пакетов." : "❌ Error installing npm packages.",
  step2: isRu ? "🔍 2. Проверка наличия Google Gemini CLI в системе..." : "🔍 2. Checking for Google Gemini CLI...",
  step2Ok: isRu ? "✅ Gemini CLI найден: версия" : "✅ Gemini CLI found: version",
  step2Err1: isRu ? "⚠️  ВНИМАНИЕ: Команда 'gemini' не найдена в системе." : "⚠️  WARNING: Command 'gemini' not found.",
  step2Err2: isRu ? "   Серверу требуется глобально установленный Gemini CLI." : "   The server requires Gemini CLI installed globally.",
  step3: isRu ? "📄 3. Авто-генерация конфигураций MCP..." : "📄 3. Auto-generating MCP configurations...",
  configHeader: isRu ? "\n✅ === КОНФИГУРАЦИЯ ДЛЯ ВАШИХ КЛИЕНТОВ (Скопируйте это) ===\n" : "\n✅ === CLIENT CONFIGURATION (Copy this) ===\n",
  whereToPaste: isRu ? "\n📍 КУДА ВСТАВИТЬ ЭТОТ JSON:" : "\n📍 WHERE TO PASTE THIS JSON:",
  savedTo: isRu ? "\n💾 Конфигурация успешно сохранена в файл: mcp_config_generated.json" : "\n💾 Configuration also saved to file: mcp_config_generated.json",
  warningEnd: isRu ? "\n⚠️ Обратите внимание: Установите Gemini CLI перед тем, как пользоваться MCP в редакторе!" : "\n⚠️ Note: Please install Google Gemini CLI before using this MCP server!",
  successEnd: isRu ? "\n🎉 Настройка полностью завершена! Можно перезапускать ваш ИИ-редактор." : "\n🎉 Setup complete! You can now restart your AI Editor."
};

console.log("==========================================");
console.log(t.header);
console.log("==========================================\n");

// 1. Проверка установки зависимостей
console.log(t.step1);
try {
  execSync('npm install', { stdio: 'inherit' });
  console.log(t.step1Ok);
} catch (e) {
  console.error(t.step1Err);
  process.exit(1);
}

// 2. Проверка Gemini CLI
console.log(t.step2);
let geminiWarning = false;
try {
  const geminiCmd = os.platform() === 'win32' ? 'gemini.cmd' : 'gemini';
  const version = execSync(`${geminiCmd} --version`, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
  console.log(`${t.step2Ok} ${version}\n`);
} catch (e) {
  console.log(t.step2Err1);
  console.log(t.step2Err2);
  geminiWarning = true;
}

// 3. Формирование путей
console.log(t.step3);
const absolutePath = path.resolve(process.cwd(), 'index.js').replace(/\\/g, '/');

const mcpConfig = {
  "mcpServers": {
    "gemini-mcp": {
      "command": "node",
      "args": [absolutePath]
    }
  }
};

const jsonString = JSON.stringify(mcpConfig, null, 2);

console.log(t.configHeader);
console.log(jsonString);

console.log(t.whereToPaste);

const isWin = os.platform() === 'win32';
const claudePath = isWin ? '%APPDATA%\\Claude\\claude_desktop_config.json' : '~/Library/Application Support/Claude/claude_desktop_config.json';
const cursorPath = isRu ? 'Курсор настройки -> Features -> MCP -> Add new MCP' : 'Cursor Settings -> Features -> MCP -> Add new MCP';

console.log(`  - 🤖 Claude Desktop: ${isRu ? 'Отредактируйте файл' : 'Edit file'} -> ${claudePath}`);
console.log(`  - 💻 Cursor: ${cursorPath} (Type: command, Command: node "${absolutePath}")`);
console.log(`  - 🏄 Windsurf: ${isRu ? 'Настройки' : 'Settings'} -> MCP Servers -> ${isRu ? 'Вставьте JSON-блок' : 'Paste the JSON block'}`);
console.log(`  - 🛠  Cline (VS Code): ${isRu ? 'Настройки Cline' : 'Cline Settings'} -> Edit MCP Settings -> ${isRu ? 'Вставьте JSON-блок' : 'Paste the JSON block'}`);

// 4. Сохранение файла
fs.writeFileSync('mcp_config_generated.json', jsonString);
console.log(t.savedTo);

if (geminiWarning) {
  console.log(t.warningEnd);
} else {
  console.log(t.successEnd);
}
