"use client";

import { useConfigStore } from "@/lib/configStore";

const INSTRUMENT_PRESETS = [100, 1000, 5000, 10000];
const RATE_PRESETS = [100, 500, 1000, 5000];

export function SimulationControls() {
  const workload = useConfigStore((s) => s.workload);
  const setWorkload = useConfigStore((s) => s.setWorkload);

  return (
    <div className="panel sim-controls">
      <div className="panel-header">
        <h2>Simulation Workload</h2>
      </div>

      <label className="control-label">
        Instruments: <strong>{workload.instrumentCount.toLocaleString()}</strong>
      </label>
      <div className="preset-row">
        {INSTRUMENT_PRESETS.map((n) => (
          <button
            key={n}
            className={workload.instrumentCount === n ? "chip chip--active" : "chip"}
            onClick={() => setWorkload({ instrumentCount: n })}
          >
            {n.toLocaleString()}
          </button>
        ))}
      </div>

      <label className="control-label">
        Updates/sec: <strong>{workload.updatesPerSec.toLocaleString()}</strong>
      </label>
      <div className="preset-row">
        {RATE_PRESETS.map((n) => (
          <button
            key={n}
            className={workload.updatesPerSec === n ? "chip chip--active" : "chip"}
            onClick={() => setWorkload({ updatesPerSec: n })}
          >
            {n.toLocaleString()}
          </button>
        ))}
      </div>
      <input
        type="range"
        min={50}
        max={8000}
        step={50}
        value={workload.updatesPerSec}
        onChange={(e) => setWorkload({ updatesPerSec: Number(e.target.value) })}
      />

      <label className="control-label">
        Burst size: <strong>{workload.burstSize}</strong>
      </label>
      <input
        type="range"
        min={1}
        max={20}
        step={1}
        value={workload.burstSize}
        onChange={(e) => setWorkload({ burstSize: Number(e.target.value) })}
      />

      <label className="control-label">Event mix</label>
      <div className="mix-row">
        <span>Quote {(workload.eventMix.quote * 100).toFixed(0)}%</span>
        <span>Trade {(workload.eventMix.trade * 100).toFixed(0)}%</span>
        <span>Book {(workload.eventMix.book * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}
