"use client";

import { useEffect, useRef } from "react";
import { useConfigStore } from "@/lib/configStore";
import { useMarketStore } from "@/lib/marketStore";
import { useMetricsStore } from "@/lib/metricsStore";
import { MarketWebSocketClient } from "@/lib/wsClient";
import type { MarketEvent } from "@/lib/types";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws/market";
const FRAME_BUDGET_MS = (1000 / 60) * 1.5; // >1.5 frames of delay counts as a dropped frame

type MoverEntry = { symbol: string; changePct: number };
type WorkerMsg = {
  type: "movers";
  gainers: MoverEntry[];
  losers: MoverEntry[];
  computeMs: number;
  trackedSymbols: number;
};

function computeMoversSync(events: MarketEvent[], acc: Map<string, number>): void {
  for (const evt of events) {
    if (evt.t === "quote") acc.set(evt.s, evt.chg);
    else if (evt.t === "snapshot") acc.set(evt.s, 0);
  }
}

/**
 * Owns the single WebSocket connection + the render loop that drains it.
 * Mount once near the app root.
 */
export function useMarketConnection() {
  const scenario = useConfigStore((s) => s.scenario);
  const workerOffload = useConfigStore((s) => s.workerOffload);
  const workload = useConfigStore((s) => s.workload);

  const clientRef = useRef<MarketWebSocketClient | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const moversAccRef = useRef<Map<string, number>>(new Map());

  // --- connection lifecycle -------------------------------------------------
  useEffect(() => {
    const client = new MarketWebSocketClient(WS_URL);
    clientRef.current = client;
    client.connect(workload);
    return () => client.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // live reconfiguration - dragging a slider adjusts the running workload
  useEffect(() => {
    clientRef.current?.sendConfig(workload);
  }, [workload]);

  // --- worker lifecycle ------------------------------------------------------
  useEffect(() => {
    if (!workerOffload) {
      workerRef.current?.terminate();
      workerRef.current = null;
      return;
    }
    const worker = new Worker(new URL("../workers/stats.worker.ts", import.meta.url));
    worker.onmessage = (ev: MessageEvent<WorkerMsg>) => {
      const msg = ev.data;
      if (msg.type === "movers") {
        useMarketStore.getState().setMovers(msg.gainers, msg.losers);
      }
    };
    workerRef.current = worker;
    return () => worker.terminate();
  }, [workerOffload]);

  // --- naive mode: apply every incoming frame immediately, synchronously ----
  useEffect(() => {
    if (scenario !== "naive") return;
    const client = clientRef.current;
    if (!client) return;
    const unsubscribe = client.onFrame((frame) => {
      useMarketStore.getState().applyEvents(frame.events);
      computeMoversSync(frame.events, moversAccRef.current);
      const entries = [...moversAccRef.current.entries()].map(([symbol, changePct]) => ({
        symbol,
        changePct,
      }));
      entries.sort((a, b) => b.changePct - a.changePct);
      useMarketStore.getState().setMovers(entries.slice(0, 10), entries.slice(-10).reverse());
    });
    return unsubscribe;
  }, [scenario]);

  // --- batched / raf / worker-offload: drain buffer on a schedule -----------
  useEffect(() => {
    if (scenario === "naive") return;

    const drainAndApply = () => {
      const client = clientRef.current;
      if (!client) return;
      const events = client.drainBuffer();
      if (events.length > 0) {
        useMarketStore.getState().applyEvents(events);
        if (workerOffload && workerRef.current) {
          workerRef.current.postMessage({ type: "events", events });
        } else {
          computeMoversSync(events, moversAccRef.current);
        }
      }
      useMetricsStore.getState().set({ bufferDepth: client.bufferDepth() });
    };

    if (scenario === "batched") {
      // Fixed-interval batching WITHOUT rAF alignment - demonstrates the
      // difference vs. syncing to the browser's paint cycle.
      const id = setInterval(drainAndApply, 100);
      return () => clearInterval(id);
    }

    // "raf" and "worker-offload": align commits to the browser's paint
    // cycle. This is the throttling mechanism - no matter how many
    // thousand events/sec arrive, we never commit more than once per
    // rendered frame.
    const loop = (now: number) => {
      const delta = now - (lastFrameTimeRef.current || now);
      if (delta > FRAME_BUDGET_MS) {
        useMetricsStore.getState().set({
          droppedFrames: useMetricsStore.getState().droppedFrames + 1,
        });
      }
      lastFrameTimeRef.current = now;
      drainAndApply();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [scenario, workerOffload]);

  return clientRef;
}
