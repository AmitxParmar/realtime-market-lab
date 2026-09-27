"use client";

import { useMarketStore } from "@/lib/marketStore";
import { useConfigStore } from "@/lib/configStore";
import clsx from "clsx";

export function TopMovers() {
  const gainers = useMarketStore((s) => s.topGainers);
  const losers = useMarketStore((s) => s.topLosers);
  const setSelected = useMarketStore((s) => s.setSelected);
  const workerOffload = useConfigStore((s) => s.workerOffload);

  return (
    <div className="panel top-movers">
      <div className="panel-header">
        <h2>Top Movers</h2>
        <span className="pill">{workerOffload ? "worker" : "main thread"}</span>
      </div>
      <div className="movers-grid">
        <div>
          <h3 className="movers-title movers-title--up">Gainers</h3>
          {gainers.map((m) => (
            <div key={m.symbol} className="mover-row" onClick={() => setSelected(m.symbol)}>
              <span>{m.symbol}</span>
              <span className="text-up">+{m.changePct.toFixed(2)}%</span>
            </div>
          ))}
        </div>
        <div>
          <h3 className={clsx("movers-title", "movers-title--down")}>Losers</h3>
          {losers.map((m) => (
            <div key={m.symbol} className="mover-row" onClick={() => setSelected(m.symbol)}>
              <span>{m.symbol}</span>
              <span className="text-down">{m.changePct.toFixed(2)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
