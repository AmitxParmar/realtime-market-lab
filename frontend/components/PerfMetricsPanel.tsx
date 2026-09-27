"use client";

import { useMetricsStore } from "@/lib/metricsStore";
import clsx from "clsx";

function Metric({
  label,
  value,
  unit,
  warn,
}: {
  label: string;
  value: string | number;
  unit?: string;
  warn?: boolean;
}) {
  return (
    <div className={clsx("metric", warn && "metric--warn")}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">
        {value}
        {unit && <span className="metric-unit">{unit}</span>}
      </span>
    </div>
  );
}

export function PerfMetricsPanel() {
  const m = useMetricsStore();

  return (
    <div className="panel perf-panel">
      <div className="panel-header">
        <h2>Performance</h2>
      </div>
      <div className="metric-grid">
        <Metric label="Messages/sec" value={m.messagesPerSec.toLocaleString()} />
        <Metric label="UI updates/sec" value={m.uiUpdatesPerSec.toLocaleString()} />
        <Metric label="FPS" value={m.fps} warn={m.fps < 50} unit="fps" />
        <Metric label="Dropped frames" value={m.droppedFrames} warn={m.droppedFrames > 0} />
        <Metric label="React commits/sec" value={m.reactCommitsPerSec} />
        <Metric label="Rendered rows" value={m.renderedRows.toLocaleString()} />
        <Metric label="WS latency" value={m.wsLatencyMs} unit="ms" warn={m.wsLatencyMs > 150} />
        <Metric
          label="Memory"
          value={m.memoryMB ?? "n/a"}
          unit={m.memoryMB !== null ? "MB" : undefined}
        />
        <Metric label="Client buffer" value={m.bufferDepth.toLocaleString()} warn={m.bufferDepth > 5000} />
      </div>
      {m.memoryMB === null && (
        <p className="perf-note">
          Memory usage requires performance.memory, which is only exposed in Chromium-based
          browsers.
        </p>
      )}
    </div>
  );
}
