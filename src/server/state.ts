import { EventEmitter } from "node:events";
import type { Session } from "./session.js";
import type { WsEvent } from "./types.js";

/**
 * Shared application state, equivalent to Rust's AppState.
 * Uses Node.js EventEmitter as a broadcast channel replacement.
 */
export class AppState extends EventEmitter {
  sessions = new Map<string, Session>();

  emitWsEvent(event: WsEvent): void {
    this.emit("ws_event", event);
  }

  onWsEvent(handler: (event: WsEvent) => void): void {
    this.on("ws_event", handler);
  }

  offWsEvent(handler: (event: WsEvent) => void): void {
    this.off("ws_event", handler);
  }

  emitSessionStatus(sessionId: string, status: string): void {
    this.emit("session:status", sessionId, status);
  }

  emitSessionMessage(sessionId: string, message: unknown): void {
    this.emit("session:message", sessionId, message);
  }
}
