import { create } from "zustand";

export type PerfMetrics = {
  messagesPerSec: number; // raw WS events received/sec (pre-batching)
  uiUpdatesPerSec: number; // store.applyEvents() commits/sec
  fps: number;
  droppedFrames: number; // cumulative rAF ticks whose delta exceeded budget
  reactCommitsPerSec: number;
  renderedRows: number; // rows actually mounted by the virtualizer
  wsLatencyMs: number; // rolling avg of (client receive time - server ts)
  memoryMB: number | null; // null when performance.memory unavailable (non-Chrome)
  bufferDepth: number; // events currently sitting in the client-side WS buffer
};

type MetricsState = PerfMetrics & {
  set: (patch: Partial<PerfMetrics>) => void;
};

export const useMetricsStore = create<MetricsState>((set) => ({
  messagesPerSec: 0,
  uiUpdatesPerSec: 0,
  fps: 0,
  droppedFrames: 0,
  reactCommitsPerSec: 0,
  renderedRows: 0,
  wsLatencyMs: 0,
  memoryMB: null,
  bufferDepth: 0,
  set: (patch) => set(patch),
}));
