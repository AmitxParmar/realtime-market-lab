import type { MarketEvent, ServerFrame, SimWorkloadConfig } from "./types";

const MAX_CLIENT_BUFFER = 50_000; // hard cap - past this we start dropping (backpressure)
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 10_000;

type FrameListener = (frame: ServerFrame) => void;

/**
 * Deliberately kept OUTSIDE React/Zustand. Every incoming WebSocket
 * message is high-frequency, low-value individually - routing each one
 * through a React state update would mean a re-render (or at least a
 * Zustand notification pass) per message, which is exactly the
 * bottleneck this project exists to avoid. Instead this class owns a
 * plain array as a buffer; consumers (the naive-mode path, or the
 * rAF-driven batching hook) pull from it on their own schedule.
 */
export class MarketWebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private buffer: MarketEvent[] = [];
  private frameListeners = new Set<FrameListener>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closedByUser = false;
  private pendingConfig: SimWorkloadConfig | null = null;

  // raw counters, read + reset by the metrics hook once/sec
  rawEventCount = 0;
  droppedCount = 0;
  latencySamples: number[] = [];

  constructor(url: string) {
    this.url = url;
  }

  connect(initialConfig: SimWorkloadConfig): void {
    this.closedByUser = false;
    this.pendingConfig = initialConfig;
    this.open();
  }

  private open(): void {
    const ws = new WebSocket(this.url);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      this.reconnectAttempt = 0;
      if (this.pendingConfig) {
        ws.send(JSON.stringify(this.pendingConfig));
      }
    };

    ws.onmessage = (ev) => {
      const frame = this.decode(ev.data);
      if (!frame) return;

      const now = Date.now();
      for (const evt of frame.events) {
        this.latencySamples.push(Math.max(0, now - evt.ts));
        if (this.latencySamples.length > 200) this.latencySamples.shift();
      }

      this.rawEventCount += frame.events.length;
      this.pushToBuffer(frame.events);

      for (const listener of this.frameListeners) listener(frame);
    };

    ws.onclose = () => {
      if (!this.closedByUser) this.scheduleReconnect();
    };
    ws.onerror = () => {
      ws.close();
    };

    this.ws = ws;
  }

  private decode(data: unknown): ServerFrame | null {
    try {
      if (data instanceof ArrayBuffer) {
        const text = new TextDecoder().decode(data);
        return JSON.parse(text) as ServerFrame;
      }
      if (typeof data === "string") {
        return JSON.parse(data) as ServerFrame;
      }
    } catch {
      return null;
    }
    return null;
  }

  private pushToBuffer(events: MarketEvent[]): void {
    this.buffer.push(...events);
    const overflow = this.buffer.length - MAX_CLIENT_BUFFER;
    if (overflow > 0) {
      // Backpressure: the consumer (main thread) can't keep up with
      // network throughput. Drop the OLDEST events rather than the
      // newest - stale quotes are worthless anyway, and this bounds
      // memory instead of growing an unbounded queue.
      this.buffer.splice(0, overflow);
      this.droppedCount += overflow;
    }
  }

  /** Pulls everything currently buffered. Used by the rAF/batched consumers. */
  drainBuffer(): MarketEvent[] {
    if (this.buffer.length === 0) return [];
    const drained = this.buffer;
    this.buffer = [];
    return drained;
  }

  bufferDepth(): number {
    return this.buffer.length;
  }

  /** Frame-level subscription, used by naive mode to react per-message. */
  onFrame(listener: FrameListener): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  sendConfig(config: SimWorkloadConfig): void {
    this.pendingConfig = config;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(config));
    }
  }

  consumeRawEventCount(): number {
    const n = this.rawEventCount;
    this.rawEventCount = 0;
    return n;
  }

  consumeDroppedCount(): number {
    const n = this.droppedCount;
    this.droppedCount = 0;
    return n;
  }

  avgLatencyMs(): number {
    if (this.latencySamples.length === 0) return 0;
    const sum = this.latencySamples.reduce((a, b) => a + b, 0);
    return sum / this.latencySamples.length;
  }

  private scheduleReconnect(): void {
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempt, RECONNECT_MAX_MS);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.buffer = [];
  }
}
