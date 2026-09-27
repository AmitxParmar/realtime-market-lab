"""
Normalized market event schema.

Every source (simulator, Binance adapter, Alpaca adapter) emits events in
this shape so the frontend never needs to know where the data came from.
Kept intentionally flat + small: this crosses the wire thousands of times
per second, so field names are short and there is no nesting beyond one
level.
"""
from __future__ import annotations

from enum import Enum
from typing import Literal, TypedDict


class EventType(str, Enum):
    QUOTE = "quote"      # bid/ask update
    TRADE = "trade"      # executed trade / tape print
    BOOK = "book"        # order book delta (top-N levels)
    SNAPSHOT = "snapshot"  # full instrument snapshot (on subscribe)


class QuoteEvent(TypedDict):
    t: Literal["quote"]
    s: str        # symbol
    ts: float     # server-side epoch ms
    p: float      # last price
    bp: float     # best bid price
    bq: float     # best bid qty
    ap: float     # best ask price
    aq: float     # best ask qty
    chg: float    # % change from session open
    vol: float    # cumulative session volume


class TradeEvent(TypedDict):
    t: Literal["trade"]
    s: str
    ts: float
    p: float
    q: float
    side: Literal["buy", "sell"]


class BookLevel(TypedDict):
    p: float
    q: float


class BookEvent(TypedDict):
    t: Literal["book"]
    s: str
    ts: float
    bids: list[BookLevel]
    asks: list[BookLevel]


class SnapshotEvent(TypedDict):
    t: Literal["snapshot"]
    s: str
    ts: float
    name: str
    p: float
    open: float
    high: float
    low: float
    vol: float


NormalizedEvent = QuoteEvent | TradeEvent | BookEvent | SnapshotEvent
