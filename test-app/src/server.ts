/**
 * Test server — spawns the bridge and a Claude CLI session.
 *
 * Run:  npx tsx src/server.ts
 */
import { CopilotKitClaudeBridge } from "copilotkit-claude-bridge";

async function main() {
  const bridge = new CopilotKitClaudeBridge({
    httpPort: 3000,
    wsPort: 3001,
  });

  bridge.on("session:status", (sessionId, status) => {
    console.log(`[test] Session ${sessionId.slice(0, 8)}: ${status}`);
  });

  const { wsPort, httpPort } = await bridge.start();
  console.log(`\n  AG-UI server:     http://localhost:${httpPort}`);
  console.log(`  WebSocket server: ws://localhost:${wsPort}\n`);

  // Spawn a Claude session pointing at the current directory
  const sessionId = await bridge.spawnSession(process.cwd());
  console.log(`  Spawned session:  ${sessionId}`);
  console.log(`\n  Open http://localhost:5173 in your browser to chat!\n`);

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n  Shutting down...");
    await bridge.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
