"""
Configurable synthetic market data workload generator.

Design notes
------------
At the top end of the requested range (10,000 instruments x 5,000+
updates/sec) you cannot afford one asyncio task per instrument - that's
10k+ scheduled coroutines fighting for the event loop just to move a
float. Instead this uses a single scheduling loop ("the heartbeat") that
wakes up on a fixed tick, computes how many events are owed this tick
based on the configured rate, and samples that many instruments to
mutate. This keeps the generator's own overhead roughly O(events/tick)
instead of O(instruments), which is what lets the *frontend* be the
actual bottleneck under test - the whole point of this project.
"""
from __future__ import annotations

import asyncio
import random
import time
from dataclasses import dataclass, field

from .schema import BookEvent, BookLevel, NormalizedEvent, QuoteEvent, SnapshotEvent, TradeEvent

TICK_SECONDS = 0.02  # 50 ticks/sec heartbeat - fine enough grain for smooth pacing


@dataclass
class SimConfig:
    instrument_count: int = 500
    updates_per_sec: float = 500
    burst_size: int = 1          # events emitted back-to-back per "owed" unit (spiky traffic)
    event_mix: dict[str, float] = field(
        default_factory=lambda: {"quote": 0.7, "trade": 0.2, "book": 0.1}
    )
    volatility: float = 0.0006   # per-event price jitter, as a fraction of price


@dataclass
class Instrument:
    symbol: str
    name: str
    price: float
    open: float
    high: float
    low: float
    volume: float = 0.0
    spread_bps: float = 2.0


SECTORS = ["TECH", "FIN", "ENERGY", "HLTH", "CONS", "IND", "MAT", "UTIL", "RE", "COMM"]


def _make_instruments(n: int) -> list[Instrument]:
    instruments: list[Instrument] = []
    for i in range(n):
        sector = SECTORS[i % len(SECTORS)]
        symbol = f"{sector}{i:05d}"
        base_price = round(random.uniform(5, 2000), 2)
        instruments.append(
            Instrument(
                symbol=symbol,
                name=f"{sector} Synthetic {i}",
                price=base_price,
                open=base_price,
                high=base_price,
                low=base_price,
                spread_bps=random.uniform(1, 8),
            )
        )
    return instruments


class MarketSimulator:
    """Runs the heartbeat loop and pushes normalized events onto a queue."""

    def __init__(self, config: SimConfig, out_queue: asyncio.Queue[NormalizedEvent]):
        self.config = config
        self.out_queue = out_queue
        self.instruments = _make_instruments(config.instrument_count)
        self._task: asyncio.Task | None = None
        self._running = False
        self._owed = 0.0  # fractional event credit accumulated between ticks

    def snapshot_events(self) -> list[SnapshotEvent]:
        now = time.time() * 1000
        return [
            SnapshotEvent(
                t="snapshot",
                s=inst.symbol,
                ts=now,
                name=inst.name,
                p=inst.price,
                open=inst.open,
                high=inst.high,
                low=inst.low,
                vol=inst.volume,
            )
            for inst in self.instruments
        ]

    def update_config(self, config: SimConfig) -> None:
        resize = config.instrument_count != self.config.instrument_count
        self.config = config
        if resize:
            self.instruments = _make_instruments(config.instrument_count)

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._run())

    def stop(self) -> None:
        self._running = False
        if self._task:
            self._task.cancel()

    async def _run(self) -> None:
        try:
            while self._running:
                t0 = time.perf_counter()
                self._owed += self.config.updates_per_sec * TICK_SECONDS
                n_events = int(self._owed)
                self._owed -= n_events

                # burst_size groups events into back-to-back chunks per
                # sampled instrument, simulating bursty exchange traffic
                # (e.g. a cluster of fills) rather than perfectly smooth output.
                remaining = n_events
                while remaining > 0:
                    chunk = min(self.config.burst_size, remaining)
                    inst = random.choice(self.instruments)
                    for _ in range(chunk):
                        evt = self._mutate(inst)
                        try:
                            self.out_queue.put_nowait(evt)
                        except asyncio.QueueFull:
                            pass  # producer-side backpressure: drop rather than block the heartbeat
                    remaining -= chunk

                elapsed = time.perf_counter() - t0
                await asyncio.sleep(max(0.0, TICK_SECONDS - elapsed))
        except asyncio.CancelledError:
            pass

    def _mutate(self, inst: Instrument) -> NormalizedEvent:
        kind = random.choices(
            population=list(self.config.event_mix.keys()),
            weights=list(self.config.event_mix.values()),
        )[0]

        jitter = 1 + random.uniform(-self.config.volatility, self.config.volatility)
        inst.price = max(0.01, round(inst.price * jitter, 4))
        inst.high = max(inst.high, inst.price)
        inst.low = min(inst.low, inst.price)
        now = time.time() * 1000

        if kind == "trade":
            qty = round(random.uniform(1, 500), 2)
            inst.volume += qty
            return TradeEvent(
                t="trade",
                s=inst.symbol,
                ts=now,
                p=inst.price,
                q=qty,
                side=random.choice(["buy", "sell"]),
            )

        if kind == "book":
            spread = inst.price * (inst.spread_bps / 10_000)
            bids = [
                BookLevel(p=round(inst.price - spread * (i + 1), 4), q=round(random.uniform(1, 300), 2))
                for i in range(5)
            ]
            asks = [
                BookLevel(p=round(inst.price + spread * (i + 1), 4), q=round(random.uniform(1, 300), 2))
                for i in range(5)
            ]
            return BookEvent(t="book", s=inst.symbol, ts=now, bids=bids, asks=asks)

        spread = inst.price * (inst.spread_bps / 10_000)
        chg = ((inst.price - inst.open) / inst.open) * 100 if inst.open else 0.0
        return QuoteEvent(
            t="quote",
            s=inst.symbol,
            ts=now,
            p=inst.price,
            bp=round(inst.price - spread / 2, 4),
            bq=round(random.uniform(1, 500), 2),
            ap=round(inst.price + spread / 2, 4),
            aq=round(random.uniform(1, 500), 2),
            chg=round(chg, 3),
            vol=round(inst.volume, 2),
        )
