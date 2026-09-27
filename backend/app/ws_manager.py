"""
Per-connection outbound pipeline: batching + coalescing + backpressure.

The simulator (or an external adapter) can produce far more events per
second than any browser tab should receive as individual WebSocket
frames - sending 5,000 tiny JSON frames/sec is itself a bottleneck
(syscalls, JS event loop wakeups) independent of whatever the frontend
does with the data. So the server does the first round of aggregation:

  * QUOTE and BOOK events are *coalesced*: only the latest value per
    symbol is kept between flushes, because a stale mid-tick quote is
    worthless once a newer one exists for the same symbol.
  * TRADE events are *append-only* (each is a real print - you can't
    coalesce a fill), but capped per-flush so one hot symbol can't
    starve the frame.
  * The connection is flushed on a fixed interval (server-side batching),
    producing one WebSocket message containing an array of events
    instead of N messages.
  * If the outbound asyncio.Queue on the way IN to this manager backs up
    beyond a threshold (client can't keep up / slow network), we drop
    the oldest queued raw events rather than growing memory unboundedly
    - explicit backpressure instead of an unbounded buffer.
"""
from __future__ import annotations

import asyncio
import time

import orjson
from fastapi import WebSocket

from .schema import NormalizedEvent

FLUSH_INTERVAL_S = 0.05     # server-side batch window (20 flushes/sec)
MAX_TRADES_PER_FLUSH = 500  # cap trade log growth within one flush window
MAX_INBOUND_QUEUE = 20_000  # backpressure threshold on the raw event queue


class ClientConnection:
    def __init__(self, ws: WebSocket):
        self.ws = ws
        self.inbound: asyncio.Queue[NormalizedEvent] = asyncio.Queue(maxsize=MAX_INBOUND_QUEUE)
        self._quotes: dict[str, NormalizedEvent] = {}
        self._books: dict[str, NormalizedEvent] = {}
        self._trades: list[NormalizedEvent] = []
        self._flush_task: asyncio.Task | None = None
        self._drain_task: asyncio.Task | None = None
        self._alive = True

        # metrics exposed to the frontend perf panel
        self.stats = {
            "events_in": 0,
            "events_out": 0,
            "frames_sent": 0,
            "dropped": 0,
            "queue_depth": 0,
        }

    def start(self) -> None:
        self._flush_task = asyncio.create_task(self._flush_loop())
        self._drain_task = asyncio.create_task(self._drain_loop())

    def stop(self) -> None:
        self._alive = False
        for t in (self._flush_task, self._drain_task):
            if t:
                t.cancel()

    def push(self, event: NormalizedEvent) -> None:
        """Called by the producer (simulator/adapter). Non-blocking."""
        try:
            self.inbound.put_nowait(event)
        except asyncio.QueueFull:
            # explicit backpressure: drop the incoming event rather than
            # letting the queue (and memory) grow unbounded
            self.stats["dropped"] += 1

    async def _drain_loop(self) -> None:
        """Pulls raw events off the inbound queue and coalesces them."""
        try:
            while self._alive:
                evt = await self.inbound.get()
                self.stats["events_in"] += 1
                self.stats["queue_depth"] = self.inbound.qsize()
                t = evt["t"]
                if t == "quote":
                    self._quotes[evt["s"]] = evt
                elif t == "book":
                    self._books[evt["s"]] = evt
                elif t == "trade":
                    if len(self._trades) < MAX_TRADES_PER_FLUSH:
                        self._trades.append(evt)
                    else:
                        self.stats["dropped"] += 1
                elif t == "snapshot":
                    # snapshots bypass coalescing - sent immediately as their own frame
                    await self._send_frame([evt], frame_type="snapshot")
        except asyncio.CancelledError:
            pass

    async def _flush_loop(self) -> None:
        try:
            while self._alive:
                await asyncio.sleep(FLUSH_INTERVAL_S)
                batch = list(self._quotes.values()) + list(self._books.values()) + self._trades
                self._quotes.clear()
                self._books.clear()
                self._trades = []
                if not batch:
                    continue
                await self._send_frame(batch, frame_type="batch")
        except asyncio.CancelledError:
            pass

    async def _send_frame(self, events: list[NormalizedEvent], frame_type: str) -> None:
        self.stats["events_out"] += len(events)
        self.stats["frames_sent"] += 1
        payload = {
            "type": frame_type,
            "ts": time.time() * 1000,
            "events": events,
            "serverStats": self.stats,
        }
        try:
            await self.ws.send_bytes(orjson.dumps(payload))
        except Exception:
            self._alive = False
