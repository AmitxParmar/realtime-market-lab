# Realtime Market Performance Lab

A frontend **performance engineering** testbed dressed up as a market-data dashboard.
The trading UI is the vehicle, not the point — the actual subject is: *how do you
keep a React application responsive when thousands of state-changing events arrive
per second and the visible dataset runs into the thousands of rows?*

Every requirement in the brief maps to a specific, inspectable piece of this repo.
See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the deep dive; this file is setup +
orientation.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router, Turbopack), React 19.2, TypeScript |
| State | Zustand (market data + config + metrics, three separate stores) |
| Server cache | TanStack Query (reference/config data only — **not** realtime ticks) |
| Realtime transport | Native WebSocket, server-side batched frames |
| Compute offload | Web Worker (`workers/stats.worker.ts`) |
| Virtualization | `@tanstack/react-virtual` |
| Backend | FastAPI, `websockets`, `orjson` |
| Infra | Docker + docker-compose |

## Quickstart

### Docker (recommended)

```bash
docker compose up --build
# frontend -> http://localhost:3000
# backend  -> ws://localhost:8000/ws/market
```

### Manual

```bash
# backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# frontend (separate terminal)
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. The dashboard connects in **simulation mode** by
default at 500 instruments / 500 updates-sec — safe defaults that run smoothly on
a laptop. Push the sliders in the "Simulation Workload" panel toward
5,000–10,000 instruments and 5,000+ updates/sec, then watch the **Performance**
panel to see where the current scenario starts to strain.

## What to actually do with this project

1. Open the **Rendering Scenario** panel and start on `naive`. Push updates/sec up.
   Watch FPS collapse and dropped frames climb — this is the baseline every other
   scenario is measured against.
2. Switch to `batched`, then `rAF + selective`, then `rAF + Worker offload` at the
   *same* workload. FPS should recover, `React commits/sec` should drop even
   though `Messages/sec` stays identical — that gap is the entire thesis of the
   project, made visible.
3. Open Chrome DevTools → Performance while running a scenario to correlate the
   in-app metrics panel against the real browser trace (long tasks, GC pauses,
   commit timings).
4. Switch `mode` to `binance` in the WebSocket config (see `backend/app/main.py`)
   to run the same frontend against a live external feed instead of the simulator
   — the frontend code doesn't change at all, because both sources emit the same
   normalized schema.

## Repo layout

```
backend/
  app/
    main.py              FastAPI app, WebSocket endpoint, live reconfiguration
    schema.py             Normalized event schema (shared contract)
    simulator.py           Configurable synthetic workload generator
    ws_manager.py           Per-connection batching / coalescing / backpressure
    adapters/
      binance_adapter.py     Live external feed -> normalized schema

frontend/
  app/                   Next.js App Router entry (layout, page, providers)
  components/            Dashboard panels
  hooks/                 useMarketConnection, usePerfMetrics, useConfigDefaults
  lib/                   marketStore, configStore, metricsStore, wsClient, types
  workers/
    stats.worker.ts        Top-movers ranking, off the main thread
```

## Known limitations (intentional, given project scope)

- The Binance adapter is a functional skeleton (bookTicker + trade normalization)
  but not hardened for production reconnect/resubscribe edge cases — simulation
  mode is the primary, fully-supported demo path.
- Client-side backpressure drops the *oldest* buffered events past a hard cap
  rather than doing anything smarter (e.g. priority-aware dropping by event
  type); see `lib/wsClient.ts` for where to extend this.
- No authentication/authorization anywhere — this is a local performance lab,
  not a deployable product.
