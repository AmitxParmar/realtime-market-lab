/// <reference lib="webworker" />

// Sorting thousands of instruments by % change on every tick is exactly
// the kind of work that's cheap in isolation but adds up: at 10,000
// instruments, a naive full re-sort on the main thread on every batch
// competes directly with React's own work for the same thread. Moving it
// here means the ranking calculation can never cause a dropped frame,
// no matter how expensive it gets - worst case the *worker* falls
// behind, which just means movers update a little less often, not that
// the UI stutters.

import type { MarketEvent } from "../lib/types";

type MainToWorkerMsg =
  | { type: "events"; events: MarketEvent[] }
  | { type: "configure"; intervalMs: number }
  | { type: "reset" };

type MoverEntry = { symbol: string; changePct: number };

type WorkerToMainMsg = {
  type: "movers";
  gainers: MoverEntry[];
  losers: MoverEntry[];
  computeMs: number;
  trackedSymbols: number;
};

const changeBySymbol = new Map<string, number>();
let intervalMs = 250;
let timer: ReturnType<typeof setInterval> | null = null;

function applyEvents(events: MarketEvent[]): void {
  for (const evt of events) {
    if (evt.t === "quote") {
      changeBySymbol.set(evt.s, evt.chg);
    } else if (evt.t === "snapshot") {
      changeBySymbol.set(evt.s, 0);
    }
  }
}

function computeMovers(): void {
  const t0 = performance.now();

  // Deliberately a straightforward full sort each tick (O(n log n)) -
  // the point of this worker is that this cost is fine here, off the
  // main thread, at instrument counts where it would NOT be fine
  // running synchronously inside a React render.
  const entries: MoverEntry[] = [];
  for (const [symbol, changePct] of changeBySymbol) entries.push({ symbol, changePct });
  entries.sort((a, b) => b.changePct - a.changePct);

  const gainers = entries.slice(0, 10);
  const losers = entries.slice(-10).reverse();
  const computeMs = performance.now() - t0;

  const msg: WorkerToMainMsg = {
    type: "movers",
    gainers,
    losers,
    computeMs,
    trackedSymbols: changeBySymbol.size,
  };
  (self as unknown as Worker).postMessage(msg);
}

function restartTimer(): void {
  if (timer) clearInterval(timer);
  timer = setInterval(computeMovers, intervalMs);
}

restartTimer();

self.onmessage = (ev: MessageEvent<MainToWorkerMsg>) => {
  const msg = ev.data;
  switch (msg.type) {
    case "events":
      applyEvents(msg.events);
      break;
    case "configure":
      intervalMs = msg.intervalMs;
      restartTimer();
      break;
    case "reset":
      changeBySymbol.clear();
      break;
  }
};

export {};
