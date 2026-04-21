import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { performance } from "perf_hooks";

async function measureTime(name, fn) {
  console.log(`\n▶️ Starting: ${name}`);
  const start = performance.now();
  try {
    await fn();
  } catch(e) {
    console.error(`❌ Error during ${name}: ${e.message}`);
  }
  const end = performance.now();
  console.log(`⏱️ Полное время (с учетом работы самой модели): ${((end - start) / 1000).toFixed(2)} секунд`);
  console.log("---------------------------------------------------");
}

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["index.js"]
  });

  const client = new Client(
    { name: "benchmark-client", version: "1.0.0" },
    { capabilities: {} }
  );

  console.log("📡 Подключение к gemini-mcp серверу...");
  try {
    await client.connect(transport);
  } catch (err) {
    console.error("Ошибка подключения:", err.message);
    process.exit(1);
  }
  console.log("✅ Успешно подключено!\n");

  console.log("==========================================");
  console.log("🚀 НАЧАЛО BENCHMARK ТЕСТА (Реальные данные)");
  console.log("==========================================");

  // Тест 1: Анализ реального файла
  await measureTime("Тест 1: Анализ файла index.js (gemini_analyze)", async () => {
    const res = await client.callTool({
      name: "gemini_analyze",
      arguments: {
        path: "index.js",
        question: "Объясни назначение этого файла кратко в 2 предложениях.",
        includeStats: true,
        model: "gemini-2.5-flash" 
      }
    });
    console.log("Ответ сервера:\n" + res.content[0].text);
    if(res.content[1]) console.log("\n" + res.content[1].text.trim());
  });

  // Тест 2: Запуск строгого Security-аудита
  await measureTime("Тест 2: Аудит безопасности (gemini_security_audit) файла package.json", async () => {
    const res = await client.callTool({
      name: "gemini_security_audit",
      arguments: {
        filesToAudit: "package.json",
        includeStats: true,
        model: "gemini-2.5-flash"
      }
    });
    console.log("Результат аудита (отрывок):\n" + res.content[0].text.substring(0, 300) + "...\n");
    if(res.content[1]) console.log(res.content[1].text.trim());
  });

  // Тест 3: Эмулятор RAG системы на текущую папку (NotebookLM)
  await measureTime("Тест 3: Локальный RAG (gemini_notebook_query)", async () => {
    const res = await client.callTool({
      name: "gemini_notebook_query",
      arguments: {
        directories: ["."],
        prompt: "Найди в этой папке файлы конфигурации и перечисли их имена.",
        includeStats: true,
        model: "gemini-2.5-flash"
      }
    });
    console.log("Ответ NotebookLM эмулятора:\n" + res.content[0].text);
    if(res.content[1]) console.log("\n" + res.content[1].text.trim());
  });

  console.log("==========================================");
  console.log("🏁 Выполнение тестов завершено!");
  
  setTimeout(() => process.exit(0), 1000);
}

main().catch(console.error);
