/**
 * Minimal standalone server example.
 *
 * Run with: npx tsx examples/standalone.ts
 *
 * Then connect CopilotKit React frontend to http://localhost:3000
 */
import { CopilotKitClaudeBridge } from "../src/index.js";

async function main() {
  const bridge = new CopilotKitClaudeBridge({
    httpPort: 3000,
    wsPort: 3001,
  });

  bridge.on("session:status", (sessionId, status) => {
    console.log(`Session ${sessionId}: ${status}`);
  });

  const { wsPort, httpPort } = await bridge.start();
  console.log(`AG-UI server: http://localhost:${httpPort}`);
  console.log(`WebSocket server: ws://localhost:${wsPort}`);

  // Spawn a session pointing at the current directory
  const sessionId = await bridge.spawnSession(process.cwd());
  console.log(`Spawned session: ${sessionId}`);

  // CopilotKit frontend connects to http://localhost:3000
  console.log("\nReady! Connect CopilotKit to http://localhost:3000");

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    await bridge.stop();
    process.exit(0);
  });
}

main().catch(console.error);
