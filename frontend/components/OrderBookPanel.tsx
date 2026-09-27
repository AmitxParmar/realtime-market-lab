"use client";

import { useMarketStore, useInstrumentRow } from "@/lib/marketStore";

export function OrderBookPanel() {
  const selectedSymbol = useMarketStore((s) => s.selectedSymbol);
  const row = useInstrumentRow(selectedSymbol);
  const book = row?.book;

  const maxQty = book
    ? Math.max(...book.bids.map((b) => b.q), ...book.asks.map((a) => a.q), 1)
    : 1;

  return (
    <div className="panel order-book">
      <div className="panel-header">
        <h2>Order Book</h2>
        <span className="pill">{selectedSymbol ?? "—"}</span>
      </div>
      {!book ? (
        <div className="empty-state">Waiting for book data…</div>
      ) : (
        <div className="ob-grid">
          <div className="ob-side">
            {book.asks
              .slice()
              .reverse()
              .map((lvl, i) => (
                <div key={`a-${i}`} className="ob-row ob-row--ask">
                  <div className="ob-bar ob-bar--ask" style={{ width: `${(lvl.q / maxQty) * 100}%` }} />
                  <span className="ob-price">{lvl.p.toFixed(2)}</span>
                  <span className="ob-qty">{lvl.q.toFixed(0)}</span>
                </div>
              ))}
          </div>
          <div className="ob-spread">
            Spread {book.asks[0] && book.bids[0] ? (book.asks[0].p - book.bids[0].p).toFixed(4) : "—"}
          </div>
          <div className="ob-side">
            {book.bids.map((lvl, i) => (
              <div key={`b-${i}`} className="ob-row ob-row--bid">
                <div className="ob-bar ob-bar--bid" style={{ width: `${(lvl.q / maxQty) * 100}%` }} />
                <span className="ob-price">{lvl.p.toFixed(2)}</span>
                <span className="ob-qty">{lvl.q.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
