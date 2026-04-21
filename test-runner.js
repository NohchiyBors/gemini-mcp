import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  console.log("==========================================");
  console.log("⚙️  Starting MCP Server Test Runner");
  console.log("==========================================");
  
  const transport = new StdioClientTransport({
    command: "node",
    args: ["index.js"]
  });

  const client = new Client(
    { name: "test-client", version: "1.0.0" },
    { capabilities: {} }
  );

  console.log("1. Connecting to gemini-mcp server...");
  try {
    await client.connect(transport);
    console.log("   ✅ Connected successfully!\n");
  } catch (e) {
    console.error("   ❌ Connection failed:", e.message);
    process.exit(1);
  }

  console.log("2. Requesting available tools...");
  try {
    const toolsResult = await client.listTools();
    const tools = toolsResult.tools;
    console.log(`   ✅ Found ${tools.length} configured tools.`);
    console.log("   Tool names:", tools.map(t => t.name).join(", "), "\n");
  } catch (e) {
    console.error("   ❌ Failed to list tools:", e.message);
  }

  console.log("3. Testing gemini_task (with Stats and Model overriding)...");
  try {
    const response = await client.callTool({
      name: "gemini_task",
      arguments: {
        prompt: "Say only 'System functioning normally.'",
        includeStats: true,
        model: "gemini-2.5-flash"
      }
    });

    console.log(`   ✅ Call returned ${response.content.length} text blocks.`);
    response.content.forEach((block, idx) => {
      console.log(`\n   --- Block ${idx + 1} (${block.type}) ---`);
      console.log(block.text);
    });
    console.log("\n   ✅ Test 1 (Task + Stats) passed!\n");
  } catch (e) {
    console.error("\n   ❌ Task execution failed. Output:", e.message);
  }

  console.log("==========================================");
  console.log("🏁 Testing finished successfully. Closing...");
  console.log("==========================================");
  
  setTimeout(() => {
    process.exit(0);
  }, 1000); // give time for graceful shutdown
}

main().catch(e => {
  console.error("Critical error:", e);
  process.exit(1);
});
