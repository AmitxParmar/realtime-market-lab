# Architecture

## Data flow

```
External Market API (Binance)          Simulator (configurable workload)
          |                                        |
          v                                        v
   BinanceAdapter.normalize()          MarketSimulator._mutate()
          |                                        |
          +--------------------> conn.push() <-----+
                                       |
                          ClientConnection (per WS connection)
                          - coalesce quote/book by symbol (last-value-wins)
                          - append-only trade log, capped per flush
                          - backpressure: drop oldest on inbound overflow
                                       |
                          flush every 50ms -> one JSON frame (array of events)
                                       |
                                 WebSocket (binary frames, orjson)
                                       |
                     ================================================
                                  BROWSER BOUNDARY
                     ================================================
                                       |
                          MarketWebSocketClient (lib/wsClient.ts)
                          - decode frame, record latency sample
                          - push events into a plain array buffer
                          - backpressure: drop oldest past 50k buffered
                                       |
                degrees a scenario picks one of these drain strategies:
                       naive: onFrame -> apply immediately
                       batched: setInterval(100ms) -> drain -> apply
                       raf / worker-offload: requestAnimationFrame -> drain -> apply
                                       |
                          useMarketStore.applyEvents(events)
                          - ONE set() call per drain, immutable patch of
                            only the touched symbols
                                       |
                fan-out via Zustand's built-in subscription model:
                - row components select their own symbol only (selective)
                - PriceChart subscribes outside React entirely (store.subscribe)
                - stats.worker.ts receives a copy for off-thread ranking
```

## Requirement -> implementation map

| Requirement | Where |
|---|---|
| Update batching | `ClientConnection._flush_loop` (server, 50ms), `useMarketConnection` batched/raf drains (client) |
| Throttling/debouncing | Server flush interval + client rAF-aligned drain cap state commits at paint rate regardless of message rate |
| `requestAnimationFrame` | `useMarketConnection` (raf/worker-offload scenarios), `PriceChart` canvas redraw loop, FPS sampler in `usePerfMetrics` |
| Selective state subscriptions | `useInstrumentRow` selector hook; `SelectiveRow` vs `NonSelectiveRow` in `Watchlist.tsx` makes the difference toggleable and measurable |
| Virtualized rendering | `@tanstack/react-virtual` in `Watchlist.tsx` and `TradeFeed.tsx`; togglable via Scenario panel |
| Web Workers for expensive calculations | `workers/stats.worker.ts` computes top-gainers/losers ranking off the main thread; `useMarketConnection` posts drained events to it when `workerOffload` is on |
| WebSocket buffering | Server: `ClientConnection` inbound queue + coalescing maps. Client: `MarketWebSocketClient.buffer` |
| Backpressure handling | Server: `asyncio.Queue(maxsize=...)`, drop-on-full. Client: hard cap on the buffer array, drop-oldest-on-overflow |
| Efficient state normalization | `InstrumentRow` keyed by symbol in a flat `Record`, immutable patch only for touched keys per flush — see `marketStore.applyEvents` |
| Memory management | Capped trade feed (300), capped client buffer (50k), capped worker's tracked-symbol map is bounded by instrument count, virtualization keeps DOM node count independent of dataset size |
| Lazy loading / code splitting | `next/dynamic` with `ssr: false` for every browser-API-dependent panel in `Dashboard.tsx` |
| Messages/sec, UI updates/sec, FPS, dropped frames, React commits/sec, rendered rows, WS latency, memory | All computed in `usePerfMetrics.ts` + `CommitProbe.tsx` (React Profiler), surfaced in `PerfMetricsPanel.tsx` |

## Why three separate Zustand stores

- **`marketStore`** — high-frequency, keyed by symbol, optimized for minimal
  re-render surface area. This is the one under performance pressure.
- **`configStore`** — low-frequency (user drags a slider a few times a session).
  Kept separate so a workload config change doesn't share a notification path
  with tick-by-tick market data.
- **`metricsStore`** — written once/sec by `usePerfMetrics`, read by exactly one
  panel. Isolating it means the perf panel's own re-renders can never be
  confused with — or accidentally throttle — the market data pipeline it's
  trying to measure.

## Why the simulator doesn't use one task per instrument

At 10,000 instruments and 5,000+ updates/sec, spinning up one `asyncio` task per
instrument means the event loop is scheduling 10k+ coroutines to move single
floats around — the generator would become the bottleneck, defeating the point
of a tool meant to stress-test the *frontend*. Instead `MarketSimulator` runs a
single heartbeat loop (`TICK_SECONDS = 0.02`) that computes how many events are
"owed" this tick from the configured rate, and samples that many instruments to
mutate — O(events/tick), not O(instruments).

## Why events are coalesced server-side before they even reach the client buffer

A quote that's already stale by the time it's sent is pure waste — bandwidth,
JSON parse time, and a wasted slot in the client buffer. `ClientConnection`
keeps only the latest quote/book per symbol between flushes and lets trades
accumulate (each one is a real, distinct print). This means the *frontend*
never actually receives the full firehose the simulator generates — which is
realistic: real exchange gateways do the same last-value coalescing for
book/quote streams for exactly this reason.

## Extending this project

- Swap `MAX_TRADE_FEED` / `MAX_CLIENT_BUFFER` and observe the memory metric.
- Add a "priority" field to events and make client-side backpressure drop by
  priority instead of FIFO order.
- Add a second Web Worker for a genuinely expensive calculation (e.g. a rolling
  volatility index across all instruments) to show a worker under real load
  rather than a fast top-N sort.
- Wire `react-devtools-profiler`'s programmatic API in addition to the built-in
  `<Profiler>` for flamegraph-level detail, gated behind a dev-only flag.
