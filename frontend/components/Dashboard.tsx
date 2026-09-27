"use client";

import dynamic from "next/dynamic";
import { useMarketConnection } from "@/hooks/useMarketConnection";
import { usePerfMetrics } from "@/hooks/usePerfMetrics";
import { CommitProbe } from "./CommitProbe";
import { ScenarioControls } from "./ScenarioControls";
import { SimulationControls } from "./SimulationControls";
import { PerfMetricsPanel } from "./PerfMetricsPanel";

// Code-split the heavier, browser-API-dependent panels out of the main
// bundle. None of these can meaningfully render on the server anyway
// (WebSocket, canvas, ResizeObserver-driven virtualization), so paying
// for their JS only after the shell has painted is a straightforward win
// for first-paint time.
const Watchlist = dynamic(() => import("./Watchlist").then((m) => m.Watchlist), {
  ssr: false,
  loading: () => <PanelSkeleton title="Watchlist" />,
});
const OrderBookPanel = dynamic(() => import("./OrderBookPanel").then((m) => m.OrderBookPanel), {
  ssr: false,
  loading: () => <PanelSkeleton title="Order Book" />,
});
const TradeFeed = dynamic(() => import("./TradeFeed").then((m) => m.TradeFeed), {
  ssr: false,
  loading: () => <PanelSkeleton title="Trade Feed" />,
});
const PriceChart = dynamic(() => import("./PriceChart").then((m) => m.PriceChart), {
  ssr: false,
  loading: () => <PanelSkeleton title="Price Chart" />,
});
const TopMovers = dynamic(() => import("./TopMovers").then((m) => m.TopMovers), {
  ssr: false,
  loading: () => <PanelSkeleton title="Top Movers" />,
});

function PanelSkeleton({ title }: { title: string }) {
  return (
    <div className="panel panel-skeleton">
      <div className="panel-header">
        <h2>{title}</h2>
      </div>
      <div className="skeleton-shimmer" />
    </div>
  );
}

export function Dashboard() {
  const clientRef = useMarketConnection();
  usePerfMetrics(clientRef);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Realtime Market Performance Lab</h1>
        <p>Frontend performance engineering testbed - not a trading product.</p>
      </header>

      <CommitProbe>
        <div className="dashboard-grid">
          <div className="col col--left">
            <ScenarioControls />
            <SimulationControls />
            <PerfMetricsPanel />
          </div>

          <div className="col col--center">
            <Watchlist />
          </div>

          <div className="col col--right">
            <PriceChart />
            <OrderBookPanel />
            <TopMovers />
            <TradeFeed />
          </div>
        </div>
      </CommitProbe>
    </div>
  );
}
