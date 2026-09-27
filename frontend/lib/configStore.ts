import { create } from "zustand";
import type { RenderScenario, SimWorkloadConfig } from "./types";

type ConfigState = {
  scenario: RenderScenario;
  virtualized: boolean;
  selectiveSubscriptions: boolean;
  workerOffload: boolean;
  workload: SimWorkloadConfig;
  setScenario: (s: RenderScenario) => void;
  setVirtualized: (v: boolean) => void;
  setSelectiveSubscriptions: (v: boolean) => void;
  setWorkerOffload: (v: boolean) => void;
  setWorkload: (patch: Partial<SimWorkloadConfig>) => void;
};

const SCENARIO_PRESETS: Record<RenderScenario, Partial<ConfigState>> = {
  naive: { virtualized: false, selectiveSubscriptions: false, workerOffload: false },
  batched: { virtualized: true, selectiveSubscriptions: false, workerOffload: false },
  raf: { virtualized: true, selectiveSubscriptions: true, workerOffload: false },
  "worker-offload": { virtualized: true, selectiveSubscriptions: true, workerOffload: true },
};

export const useConfigStore = create<ConfigState>((set) => ({
  scenario: "raf",
  virtualized: true,
  selectiveSubscriptions: true,
  workerOffload: true,
  workload: {
    mode: "simulation",
    instrumentCount: 500,
    updatesPerSec: 500,
    burstSize: 1,
    eventMix: { quote: 0.7, trade: 0.2, book: 0.1 },
    volatility: 0.0006,
  },
  setScenario: (scenario) =>
    set((state) => ({ scenario, ...SCENARIO_PRESETS[scenario], workload: state.workload })),
  setVirtualized: (virtualized) => set({ virtualized }),
  setSelectiveSubscriptions: (selectiveSubscriptions) => set({ selectiveSubscriptions }),
  setWorkerOffload: (workerOffload) => set({ workerOffload }),
  setWorkload: (patch) => set((state) => ({ workload: { ...state.workload, ...patch } })),
}));
