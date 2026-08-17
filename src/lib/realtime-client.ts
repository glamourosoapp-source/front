"use client";

import { config } from "@/config";
import { REALTIME_WS_PATH } from "@glamouroso/shared";
import type { RealtimeServerEvent } from "@glamouroso/shared";

export type ConnectionState = "connecting" | "open" | "closed";

const MIN_BACKOFF_MS = 3_000;
const MAX_BACKOFF_MS = 30_000;
/** El server manda {type:"heartbeat"} cada 25s; sin mensajes en este margen la conexión está muerta. */
const WATCHDOG_MS = 60_000;

type EventListener = (event: RealtimeServerEvent) => void;
type StateListener = (state: ConnectionState) => void;

function wsUrl(): string {
  // apiBaseUrl ya incluye /api (p. ej. http://localhost:3002/api → ws://localhost:3002/api/ws).
  const base = config.apiBaseUrl.replace(/^http/, "ws").replace(/\/api\/?$/, "");
  return `${base}${REALTIME_WS_PATH}`;
}

class RealtimeClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<EventListener>();
  private stateListeners = new Set<StateListener>();
  private state: ConnectionState = "closed";
  private backoffMs = MIN_BACKOFF_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private enabled = false;

  /** Idempotente: con socket abierto o conectando es no-op (cubre el doble-mount de StrictMode). */
  connect(): void {
    this.enabled = true;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const token = localStorage.getItem("token");
    if (!token) return;

    this.setState("connecting");
    // El token viaja como subprotocolo (el browser no permite headers en el handshake;
    // regla del equipo: nunca en query string).
    const ws = new WebSocket(wsUrl(), ["glamouroso.v1", `bearer.${token}`]);
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.backoffMs = MIN_BACKOFF_MS;
      this.setState("open");
      this.armWatchdog();
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      this.armWatchdog();
      let payload: RealtimeServerEvent;
      try {
        payload = JSON.parse(ev.data as string) as RealtimeServerEvent;
      } catch {
        return;
      }
      // Eventos de control: solo alimentan el watchdog.
      if (payload.type === "heartbeat" || payload.type === "connected") return;
      for (const listener of this.listeners) {
        try {
          listener(payload);
        } catch {
          /* un listener roto no debe tumbar a los demás */
        }
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.clearWatchdog();
      this.setState("closed");
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      // onclose llega después y maneja el retry.
    };
  }

  disconnect(): void {
    this.enabled = false;
    this.clearWatchdog();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.setState("closed");
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  getState(): ConnectionState {
    return this.state;
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    for (const listener of this.stateListeners) {
      try {
        listener(state);
      } catch {
        /* ignore */
      }
    }
  }

  private scheduleReconnect(): void {
    if (!this.enabled || this.reconnectTimer) return;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.enabled) this.connect();
    }, delay);
  }

  private armWatchdog(): void {
    this.clearWatchdog();
    this.watchdogTimer = setTimeout(() => {
      // Conexión medio-abierta: forzar cierre; onclose reconecta con backoff.
      this.ws?.close();
    }, WATCHDOG_MS);
  }

  private clearWatchdog(): void {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }
}

export const realtimeClient = new RealtimeClient();
