// Mirrors backend/app/schema.py exactly. Kept in one file, hand-synced -
// for a bigger system this would be generated from the Pydantic models,
// but for this project's scope a shared source of truth in one place is
// the pragmatic choice.

export type QuoteEvent = {
  t: "quote";
  s: string;
  ts: number;
  p: number;
  bp: number;
  bq: number;
  ap: number;
  aq: number;
  chg: number;
  vol: number;
};

export type TradeEvent = {
  t: "trade";
  s: string;
  ts: number;
  p: number;
  q: number;
  side: "buy" | "sell";
};

export type BookLevel = { p: number; q: number };

export type BookEvent = {
  t: "book";
  s: string;
  ts: number;
  bids: BookLevel[];
  asks: BookLevel[];
};

export type SnapshotEvent = {
  t: "snapshot";
  s: string;
  ts: number;
  name: string;
  p: number;
  open: number;
  high: number;
  low: number;
  vol: number;
};

export type MarketEvent = QuoteEvent | TradeEvent | BookEvent | SnapshotEvent;

export type ServerFrame = {
  type: "batch" | "snapshot";
  ts: number;
  events: MarketEvent[];
  serverStats: {
    events_in: number;
    events_out: number;
    frames_sent: number;
    dropped: number;
    queue_depth: number;
  };
};

// Client-side normalized row: the single object each Watchlist row
// component subscribes to. Rebuilt (new reference) only for symbols
// touched in a given flush, so untouched rows never re-render.
export type InstrumentRow = {
  symbol: string;
  name: string;
  price: number;
  prevPrice: number;
  bid: number;
  bidQty: number;
  ask: number;
  askQty: number;
  changePct: number;
  volume: number;
  book?: { bids: BookLevel[]; asks: BookLevel[] };
  lastUpdateTs: number;
};

export type SimMode = "simulation" | "binance";

export type SimWorkloadConfig = {
  mode: SimMode;
  instrumentCount: number;
  updatesPerSec: number;
  burstSize: number;
  eventMix: { quote: number; trade: number; book: number };
  volatility: number;
  symbols?: string[];
};

export type RenderScenario = "naive" | "batched" | "raf" | "worker-offload";
