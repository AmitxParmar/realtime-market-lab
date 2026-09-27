"use client";

import { useEffect, useRef } from "react";
import { useMarketStore } from "@/lib/marketStore";
import { useMetricsStore } from "@/lib/metricsStore";
import type { MarketWebSocketClient } from "@/lib/wsClient";

// module-level so <CommitProbe> (mounted deep in the tree via React
// Profiler) and this hook (mounted once near the root) can share a
// counter without threading props through the component tree.
export const commitCounter = { count: 0 };

type MemoryInfo = { usedJSHeapSize: number };

export function usePerfMetrics(clientRef: React.RefObject<MarketWebSocketClient | null>) {
  const fpsFrameCount = useRef(0);
  const fpsRafId = useRef<number | null>(null);

  // continuous FPS sampler - independent rAF loop, so it keeps measuring
  // real paint cadence even if the data-drain loop is paused/throttled
  useEffect(() => {
    const tick = () => {
      fpsFrameCount.current += 1;
      fpsRafId.current = requestAnimationFrame(tick);
    };
    fpsRafId.current = requestAnimationFrame(tick);
    return () => {
      if (fpsRafId.current) cancelAnimationFrame(fpsRafId.current);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const client = clientRef.current;
      const fps = fpsFrameCount.current;
      fpsFrameCount.current = 0;

      const uiUpdates = useMarketStore.getState().resetCounter();
      const messages = client?.consumeRawEventCount() ?? 0;
      const dropped = client?.consumeDroppedCount() ?? 0;
      const latency = client?.avgLatencyMs() ?? 0;

      const perf = performance as Performance & { memory?: MemoryInfo };
      const memoryMB = perf.memory ? Math.round(perf.memory.usedJSHeapSize / 1_048_576) : null;

      useMetricsStore.getState().set({
        fps,
        messagesPerSec: messages,
        uiUpdatesPerSec: uiUpdates,
        reactCommitsPerSec: commitCounter.count,
        wsLatencyMs: Math.round(latency),
        memoryMB,
      });
      commitCounter.count = 0;

      if (dropped > 0) {
        // surfaced via console for now; a dedicated "dropped (client buffer)"
        // stat could be added to the metrics panel alongside droppedFrames
        console.debug(`[market-lab] client backpressure dropped ${dropped} events`);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [clientRef]);
}
