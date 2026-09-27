from __future__ import annotations

import asyncio
import json
import logging

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .adapters.binance_adapter import BinanceAdapter
from .simulator import MarketSimulator, SimConfig
from .ws_manager import ClientConnection

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("market-lab")

app = FastAPI(title="Realtime Market Performance Lab - Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/config/defaults")
async def config_defaults():
    """
    Static-ish reference data (workload presets, sector list) - a good
    fit for TanStack Query on the frontend: fetched once, cached, and
    NOT part of the realtime WebSocket stream. Mixing this into the
    WebSocket pipeline would be a category error - it doesn't change
    tick-by-tick, so it shouldn't compete for the same batching/backpressure
    machinery that's tuned for high-frequency market data.
    """
    return {
        "instrumentPresets": [100, 1000, 5000, 10000],
        "ratePresets": [100, 500, 1000, 5000],
        "sectors": ["TECH", "FIN", "ENERGY", "HLTH", "CONS", "IND", "MAT", "UTIL", "RE", "COMM"],
    }


DEFAULT_BINANCE_SYMBOLS = ["btcusdt", "ethusdt", "solusdt", "bnbusdt", "xrpusdt"]


@app.websocket("/ws/market")
async def market_ws(websocket: WebSocket):
    """
    Client connects, then optionally sends one JSON config message:

        {"mode": "simulation", "instrumentCount": 1000, "updatesPerSec": 1000,
         "burstSize": 4, "eventMix": {"quote": 0.7, "trade": 0.2, "book": 0.1}}

    or

        {"mode": "binance", "symbols": ["btcusdt", "ethusdt"]}

    A later config message with the same mode adjusts the running
    workload live (e.g. dragging the "updates/sec" slider in the UI)
    without reconnecting.
    """
    await websocket.accept()
    conn = ClientConnection(websocket)
    conn.start()

    simulator: MarketSimulator | None = None
    binance: BinanceAdapter | None = None

    async def teardown():
        if simulator:
            simulator.stop()
        if binance:
            binance.stop()
        conn.stop()

    try:
        # wait for initial config (with a sane default if the client sends nothing)
        try:
            raw = await asyncio.wait_for(websocket.receive_text(), timeout=2.0)
            cfg_msg = json.loads(raw)
        except (asyncio.TimeoutError, WebSocketDisconnect):
            cfg_msg = {"mode": "simulation"}

        async def apply_config(cfg_msg: dict):
            nonlocal simulator, binance
            mode = cfg_msg.get("mode", "simulation")

            if mode == "simulation":
                cfg = SimConfig(
                    instrument_count=int(cfg_msg.get("instrumentCount", 500)),
                    updates_per_sec=float(cfg_msg.get("updatesPerSec", 500)),
                    burst_size=int(cfg_msg.get("burstSize", 1)),
                    event_mix=cfg_msg.get("eventMix", {"quote": 0.7, "trade": 0.2, "book": 0.1}),
                    volatility=float(cfg_msg.get("volatility", 0.0006)),
                )
                if simulator is None:
                    simulator = MarketSimulator(cfg, out_queue=None)  # type: ignore[arg-type]
                    simulator.push = conn.push  # type: ignore[attr-defined]
                    # simulator writes directly via conn.push instead of an
                    # intermediate queue - see _wire_simulator below
                    _wire_simulator(simulator, conn)
                    simulator.start()
                    for evt in simulator.snapshot_events():
                        conn.push(evt)
                else:
                    simulator.update_config(cfg)

            elif mode == "binance":
                symbols = cfg_msg.get("symbols", DEFAULT_BINANCE_SYMBOLS)
                if binance is None:
                    binance = BinanceAdapter(symbols, emit=conn.push)
                    binance.start()

        await apply_config(cfg_msg)

        # subsequent messages: live reconfiguration
        while True:
            raw = await websocket.receive_text()
            try:
                cfg_msg = json.loads(raw)
                await apply_config(cfg_msg)
            except json.JSONDecodeError:
                continue

    except WebSocketDisconnect:
        log.info("client disconnected")
    finally:
        await teardown()


def _wire_simulator(simulator: MarketSimulator, conn: ClientConnection) -> None:
    """
    MarketSimulator was designed against an asyncio.Queue interface so it
    can be unit-tested in isolation; here we adapt it to push straight
    into the per-connection pipeline instead, avoiding a redundant queue
    hop between the simulator and the coalescing layer.
    """
    class _DirectQueue:
        def put_nowait(self, item):
            conn.push(item)

    simulator.out_queue = _DirectQueue()  # type: ignore[assignment]
