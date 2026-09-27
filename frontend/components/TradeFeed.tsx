"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMarketStore } from "@/lib/marketStore";
import clsx from "clsx";

const ROW_HEIGHT = 26;

export function TradeFeed() {
  const trades = useMarketStore((s) => s.tradeFeed);
  const parentRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: trades.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  return (
    <div className="panel trade-feed">
      <div className="panel-header">
        <h2>Trade Feed</h2>
        <span className="pill">{trades.length} events</span>
      </div>
      <div ref={parentRef} className="wl-scroll">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const trade = trades[vi.index];
            if (!trade) return null;
            return (
              <div
                key={`${trade.s}-${trade.ts}-${vi.index}`}
                className={clsx("tf-row", trade.side === "buy" ? "tf-row--buy" : "tf-row--sell")}
                style={{
                  height: ROW_HEIGHT,
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vi.start}px)`,
                }}
              >
                <span className="tf-symbol">{trade.s}</span>
                <span className="tf-price">{trade.p.toFixed(2)}</span>
                <span className="tf-qty">{trade.q.toFixed(1)}</span>
                <span className="tf-side">{trade.side.toUpperCase()}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
