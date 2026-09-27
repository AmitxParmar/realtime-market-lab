"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useConfigStore } from "@/lib/configStore";
import { useMarketStore, useInstrumentRow } from "@/lib/marketStore";
import { useMetricsStore } from "@/lib/metricsStore";
import type { InstrumentRow } from "@/lib/types";
import clsx from "clsx";

const ROW_HEIGHT = 32;
const NAIVE_MODE_CAP = 300; // rendering thousands of un-virtualized DOM rows will genuinely hang the tab

function formatPct(v: number) {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

/** Row subscribed via a fine-grained selector: only re-renders when
 *  ITS row object changes reference (see marketStore.applyEvents). */
const SelectiveRow = memo(function SelectiveRow({
  symbol,
  onSelect,
  selected,
}: {
  symbol: string;
  onSelect: (s: string) => void;
  selected: boolean;
}) {
  const row = useInstrumentRow(symbol);
  return <RowView row={row} symbol={symbol} onSelect={onSelect} selected={selected} />;
});

/** Row subscribed to the WHOLE map - included so the "selective
 *  subscriptions OFF" scenario has something real to measure against.
 *  Every applyEvents() call re-renders every one of these rows. */
function NonSelectiveRow({
  symbol,
  onSelect,
  selected,
}: {
  symbol: string;
  onSelect: (s: string) => void;
  selected: boolean;
}) {
  const row = useMarketStore((s) => s.instrumentsById[symbol]);
  return <RowView row={row} symbol={symbol} onSelect={onSelect} selected={selected} />;
}

function RowView({
  row,
  symbol,
  onSelect,
  selected,
}: {
  row: InstrumentRow | undefined;
  symbol: string;
  onSelect: (s: string) => void;
  selected: boolean;
}) {
  if (!row) return <div className="wl-row wl-row--empty" style={{ height: ROW_HEIGHT }} />;
  const up = row.price >= row.prevPrice;
  return (
    <div
      className={clsx("wl-row", selected && "wl-row--selected")}
      style={{ height: ROW_HEIGHT }}
      onClick={() => onSelect(symbol)}
    >
      <span className="wl-cell wl-cell--symbol">{row.symbol}</span>
      <span className={clsx("wl-cell wl-cell--price", up ? "flash-up" : "flash-down")}>
        {row.price.toFixed(2)}
      </span>
      <span className="wl-cell">{row.bid.toFixed(2)}</span>
      <span className="wl-cell">{row.ask.toFixed(2)}</span>
      <span className={clsx("wl-cell", row.changePct >= 0 ? "text-up" : "text-down")}>
        {formatPct(row.changePct)}
      </span>
      <span className="wl-cell wl-cell--vol">{row.volume.toFixed(0)}</span>
    </div>
  );
}

export function Watchlist() {
  const order = useMarketStore((s) => s.order);
  const selectedSymbol = useMarketStore((s) => s.selectedSymbol);
  const setSelected = useMarketStore((s) => s.setSelected);
  const virtualized = useConfigStore((s) => s.virtualized);
  const selective = useConfigStore((s) => s.selectiveSubscriptions);

  const [query, setQuery] = useState("");
  const parentRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    const base = q ? order.filter((s) => s.includes(q)) : order;
    return virtualized ? base : base.slice(0, NAIVE_MODE_CAP);
  }, [order, query, virtualized]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const renderedRowCount = virtualized ? virtualItems.length : filtered.length;

  useEffect(() => {
    useMetricsStore.getState().set({ renderedRows: renderedRowCount });
  }, [renderedRowCount]);

  const Row = selective ? SelectiveRow : NonSelectiveRow;

  return (
    <div className="panel watchlist">
      <div className="panel-header">
        <h2>Watchlist</h2>
        <input
          className="search-input"
          placeholder="Search symbol..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="pill">{filtered.length.toLocaleString()} instruments</span>
      </div>

      <div className="wl-header-row">
        <span className="wl-cell wl-cell--symbol">Symbol</span>
        <span className="wl-cell wl-cell--price">Last</span>
        <span className="wl-cell">Bid</span>
        <span className="wl-cell">Ask</span>
        <span className="wl-cell">Chg%</span>
        <span className="wl-cell wl-cell--vol">Volume</span>
      </div>

      {virtualized ? (
        <div ref={parentRef} className="wl-scroll">
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualItems.map((vi) => {
              const symbol = filtered[vi.index];
              if (!symbol) return null;
              return (
                <div
                  key={symbol}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  <Row symbol={symbol} onSelect={setSelected} selected={symbol === selectedSymbol} />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="wl-scroll wl-scroll--naive">
          {filtered.map((symbol) => (
            <Row key={symbol} symbol={symbol} onSelect={setSelected} selected={symbol === selectedSymbol} />
          ))}
          {order.length > NAIVE_MODE_CAP && (
            <div className="wl-naive-notice">
              Naive mode caps rendering at {NAIVE_MODE_CAP} un-virtualized rows to keep the tab
              alive - the point of this scenario is to feel the difference, not to crash the demo.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
