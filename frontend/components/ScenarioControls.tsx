"use client";

import { useConfigStore } from "@/lib/configStore";
import type { RenderScenario } from "@/lib/types";
import clsx from "clsx";

const SCENARIOS: { id: RenderScenario; label: string; description: string }[] = [
  {
    id: "naive",
    label: "Naive",
    description: "Every message applied immediately, no virtualization, whole-map subscriptions.",
  },
  {
    id: "batched",
    label: "Batched (setInterval)",
    description: "Events drained on a fixed 100ms timer, virtualized, whole-map subscriptions.",
  },
  {
    id: "raf",
    label: "rAF + selective",
    description: "Events drained once per animation frame, virtualized, per-row subscriptions.",
  },
  {
    id: "worker-offload",
    label: "rAF + Worker offload",
    description: "Same as above, plus top-movers ranking computed in a Web Worker.",
  },
];

export function ScenarioControls() {
  const scenario = useConfigStore((s) => s.scenario);
  const setScenario = useConfigStore((s) => s.setScenario);
  const virtualized = useConfigStore((s) => s.virtualized);
  const selective = useConfigStore((s) => s.selectiveSubscriptions);
  const workerOffload = useConfigStore((s) => s.workerOffload);
  const setVirtualized = useConfigStore((s) => s.setVirtualized);
  const setSelective = useConfigStore((s) => s.setSelectiveSubscriptions);
  const setWorkerOffload = useConfigStore((s) => s.setWorkerOffload);

  return (
    <div className="panel scenario-controls">
      <div className="panel-header">
        <h2>Rendering Scenario</h2>
      </div>
      <div className="scenario-list">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            className={clsx("scenario-btn", scenario === s.id && "scenario-btn--active")}
            onClick={() => setScenario(s.id)}
            title={s.description}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="scenario-description">
        {SCENARIOS.find((s) => s.id === scenario)?.description}
      </p>

      <div className="toggle-row">
        <label>
          <input type="checkbox" checked={virtualized} onChange={(e) => setVirtualized(e.target.checked)} />
          Virtualized rendering
        </label>
        <label>
          <input type="checkbox" checked={selective} onChange={(e) => setSelective(e.target.checked)} />
          Selective subscriptions
        </label>
        <label>
          <input
            type="checkbox"
            checked={workerOffload}
            onChange={(e) => setWorkerOffload(e.target.checked)}
          />
          Worker offload
        </label>
      </div>
    </div>
  );
}
