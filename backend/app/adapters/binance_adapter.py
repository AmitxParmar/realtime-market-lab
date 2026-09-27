"""
Binance combined-stream adapter.

Connects to Binance's public WebSocket, subscribes to bookTicker (best
bid/ask) and trade streams for a configurable symbol list, and normalizes
both into our internal NormalizedEvent schema so the frontend is fully
decoupled from the exchange's wire format. This is the "external API ->
normalization" half of the pipeline described in the architecture doc;
the simulator is a drop-in replacement for this same interface.

Note: this talks to a real external service and is disabled by default
(mode=simulation). It requires outbound network access to
stream.binance.com, which may not be permitted in every deployment
environment - that's expected, simulation mode is the primary demo path.
"""
from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable

import orjson
import websockets

from ..schema import NormalizedEvent, QuoteEvent, TradeEvent

BINANCE_WS_BASE = "wss://stream.binance.com:9443/stream"

EmitFn = Callable[[NormalizedEvent], Awaitable[None] | None]


class BinanceAdapter:
    def __init__(self, symbols: list[str], emit: EmitFn):
        """
        symbols: lowercase Binance symbols, e.g. ["btcusdt", "ethusdt"]
        emit: callback invoked with each normalized event
        """
        self.symbols = [s.lower() for s in symbols]
        self.emit = emit
        self._task: asyncio.Task | None = None
        self._running = False

    def _stream_url(self) -> str:
        streams = []
        for s in self.symbols:
            streams.append(f"{s}@bookTicker")
            streams.append(f"{s}@trade")
        return f"{BINANCE_WS_BASE}?streams={'/'.join(streams)}"

    def start(self) -> None:
        self._running = True
        self._task = asyncio.create_task(self._run())

    def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()

    async def _run(self) -> None:
        backoff = 1.0
        while self._running:
            try:
                async with websockets.connect(self._stream_url(), ping_interval=20) as ws:
                    backoff = 1.0
                    async for raw in ws:
                        if not self._running:
                            break
                        self._handle_message(raw)
            except asyncio.CancelledError:
                return
            except Exception:
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)

    def _handle_message(self, raw: str | bytes) -> None:
        msg = orjson.loads(raw)
        data = msg.get("data", {})
        event_type = data.get("e")
        now = time.time() * 1000

        normalized: NormalizedEvent | None = None
        if "b" in data and "a" in data and event_type is None:
            # bookTicker payload: {u,s,b,B,a,A}
            normalized = QuoteEvent(
                t="quote",
                s=data["s"],
                ts=now,
                p=float(data["b"]),  # approximation: mid unavailable without last price
                bp=float(data["b"]),
                bq=float(data["B"]),
                ap=float(data["a"]),
                aq=float(data["A"]),
                chg=0.0,
                vol=0.0,
            )
        elif event_type == "trade":
            normalized = TradeEvent(
                t="trade",
                s=data["s"],
                ts=now,
                p=float(data["p"]),
                q=float(data["q"]),
                side="sell" if data.get("m") else "buy",
            )

        if normalized is not None:
            result = self.emit(normalized)
            if asyncio.iscoroutine(result):
                asyncio.create_task(result)
