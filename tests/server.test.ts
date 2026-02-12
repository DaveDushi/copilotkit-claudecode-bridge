import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import { AppState } from "../src/server/state.js";
import { createAguiServer } from "../src/server/agui-server.js";
import { createWsServer } from "../src/server/ws-server.js";
import { createSession } from "../src/server/session.js";

function fetch(url: string, options?: { method?: string; body?: string }): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: options?.method ?? "GET",
        headers: options?.body ? { "Content-Type": "application/json" } : {},
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk.toString()));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body }),
        );
      },
    );
    req.on("error", reject);
    if (options?.body) req.write(options.body);
    req.end();
  });
}

describe("AG-UI HTTP Server", () => {
  let server: http.Server;
  let port: number;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("GET /info returns agent discovery JSON", async () => {
    const state = new AppState();
    server = createAguiServer(state, { agentId: "default" });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address() as { port: number };
    port = addr.port;

    const res = await fetch(`http://127.0.0.1:${port}/info`);

    expect(res.status).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.agents).toBeDefined();
    expect(json.agents.default).toBeDefined();
    expect(json.agents.default.description).toBe("Claude Code AI agent");
    expect(json.version).toBe("1.0.0");
  });

  it("POST /agent/default/run returns SSE with RUN_ERROR when no session", async () => {
    const state = new AppState();
    server = createAguiServer(state);

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address() as { port: number };
    port = addr.port;

    const res = await fetch(`http://127.0.0.1:${port}/agent/default/run`, {
      method: "POST",
      body: JSON.stringify({
        threadId: "t1",
        runId: "r1",
        messages: [{ role: "user", content: "hello" }],
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");

    // Parse SSE events
    const events = res.body
      .split("\n\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.replace("data: ", "")));

    // Should have RUN_STARTED then RUN_ERROR (no session available)
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0].type).toBe("RUN_STARTED");

    const errorEvent = events.find((e: any) => e.type === "RUN_ERROR");
    expect(errorEvent).toBeDefined();
    expect(errorEvent.message).toContain("No active Claude session");
  }, 20_000);

  it("POST /agent/default/run completes gracefully for empty messages", async () => {
    const state = new AppState();
    server = createAguiServer(state);

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address() as { port: number };
    port = addr.port;

    const res = await fetch(`http://127.0.0.1:${port}/agent/default/run`, {
      method: "POST",
      body: JSON.stringify({
        messages: [],
      }),
    });

    expect(res.status).toBe(200);
    const events = res.body
      .split("\n\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.replace("data: ", "")));

    // Should complete gracefully with RUN_STARTED + RUN_FINISHED (no error)
    expect(events[0].type).toBe("RUN_STARTED");
    const finishedEvent = events.find((e: any) => e.type === "RUN_FINISHED");
    expect(finishedEvent).toBeDefined();
  });

  it("POST /agent/default/connect returns SSE handshake", async () => {
    const state = new AppState();
    server = createAguiServer(state);

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address() as { port: number };
    port = addr.port;

    const res = await fetch(`http://127.0.0.1:${port}/agent/default/connect`, {
      method: "POST",
      body: JSON.stringify({ threadId: "t1" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");

    const events = res.body
      .split("\n\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.replace("data: ", "")));

    expect(events.length).toBe(3);
    expect(events[0].type).toBe("RUN_STARTED");
    expect(events[1].type).toBe("STATE_SNAPSHOT");
    expect(events[1].snapshot.status).toBe("connected");
    expect(events[2].type).toBe("RUN_FINISHED");
  });

  it("returns 404 for unknown routes", async () => {
    const state = new AppState();
    server = createAguiServer(state);

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address() as { port: number };
    port = addr.port;

    const res = await fetch(`http://127.0.0.1:${port}/unknown`);
    expect(res.status).toBe(404);
  });
});

describe("WebSocket Server", () => {
  it("creates a WS server that can listen", async () => {
    const state = new AppState();
    const { httpServer } = createWsServer(state);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", () => resolve());
    });

    const addr = httpServer.address() as { port: number };
    expect(addr.port).toBeGreaterThan(0);

    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });
});
