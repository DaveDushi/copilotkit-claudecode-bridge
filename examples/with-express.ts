/**
 * Example: Embedding the bridge in an existing Express app.
 *
 * Run with: npx tsx examples/with-express.ts
 * Requires: npm install express @types/express
 */
import express from "express";
import { CopilotKitClaudeBridge } from "../src/index.js";

async function main() {
  const app = express();

  const bridge = new CopilotKitClaudeBridge({
    wsPort: 3001,
  });

  // Start only the WS server (the HTTP is handled by Express)
  const { wsPort } = await bridge.start();
  console.log(`WebSocket server: ws://localhost:${wsPort}`);

  // Mount the AG-UI handler on Express
  const handler = bridge.getRequestHandler();
  app.use((req, res) => {
    handler(req, res);
  });

  // Start Express
  const port = 3000;
  app.listen(port, () => {
    console.log(`Express + AG-UI server: http://localhost:${port}`);
  });

  // Spawn a session
  const sessionId = await bridge.spawnSession(process.cwd());
  console.log(`Spawned session: ${sessionId}`);
  console.log("\nReady! Connect CopilotKit to http://localhost:3000");

  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    await bridge.stop();
    process.exit(0);
  });
}

main().catch(console.error);
