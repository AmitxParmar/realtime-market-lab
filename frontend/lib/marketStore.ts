import { create } from "zustand";
import type { InstrumentRow, MarketEvent, TradeEvent } from "./types";

const MAX_TRADE_FEED = 300;

export type MoverEntry = { symbol: string; changePct: number };

type MarketState = {
  instrumentsById: Record<string, InstrumentRow>;
  order: string[]; // stable id list for the virtualizer; only changes on universe resize
  tradeFeed: TradeEvent[];
  selectedSymbol: string | null;

  // worker-computed derived stats (see workers/stats.worker.ts)
  topGainers: MoverEntry[];
  topLosers: MoverEntry[];

  // counters, reset every second by the metrics hook
  eventsAppliedThisSecond: number;

  setUniverse: (rows: InstrumentRow[]) => void;
  applyEvents: (events: MarketEvent[]) => { touchedSymbols: string[] };
  setSelected: (symbol: string) => void;
  setMovers: (gainers: MoverEntry[], losers: MoverEntry[]) => void;
  resetCounter: () => number;
};

function emptyRow(symbol: string): InstrumentRow {
  return {
    symbol,
    name: symbol,
    price: 0,
    prevPrice: 0,
    bid: 0,
    bidQty: 0,
    ask: 0,
    askQty: 0,
    changePct: 0,
    volume: 0,
    lastUpdateTs: 0,
  };
}

export const useMarketStore = create<MarketState>((set, get) => ({
  instrumentsById: {},
  order: [],
  tradeFeed: [],
  selectedSymbol: null,
  topGainers: [],
  topLosers: [],
  eventsAppliedThisSecond: 0,

  setUniverse: (rows) => {
    const instrumentsById: Record<string, InstrumentRow> = {};
    const order: string[] = [];
    for (const r of rows) {
      instrumentsById[r.symbol] = r;
      order.push(r.symbol);
    }
    set({
      instrumentsById,
      order,
      selectedSymbol: get().selectedSymbol ?? order[0] ?? null,
    });
  },

  // The hot path. Called once per flush (rAF tick, batch window, or per
  // event in "naive" mode) with however many events accumulated. Mutates
  // only the symbols that were actually touched, producing new object
  // references for exactly those rows - this is what lets row components
  // use a plain selector and still avoid re-rendering on every tick.
  applyEvents: (events) => {
    const current = get().instrumentsById;
    const patched: Record<string, InstrumentRow> = {};
    let trades: TradeEvent[] | null = null;

    for (const evt of events) {
      const existing = patched[evt.s] ?? current[evt.s] ?? emptyRow(evt.s);

      switch (evt.t) {
        case "snapshot":
          patched[evt.s] = {
            ...existing,
            name: evt.name,
            price: evt.p,
            prevPrice: evt.p,
            volume: evt.vol,
            lastUpdateTs: evt.ts,
          };
          break;
        case "quote":
          patched[evt.s] = {
            ...existing,
            prevPrice: existing.price,
            price: evt.p,
            bid: evt.bp,
            bidQty: evt.bq,
            ask: evt.ap,
            askQty: evt.aq,
            changePct: evt.chg,
            volume: evt.vol,
            lastUpdateTs: evt.ts,
          };
          break;
        case "trade":
          patched[evt.s] = {
            ...existing,
            prevPrice: existing.price,
            price: evt.p,
            lastUpdateTs: evt.ts,
          };
          (trades ??= []).push(evt);
          break;
        case "book":
          patched[evt.s] = {
            ...existing,
            book: { bids: evt.bids, asks: evt.asks },
            lastUpdateTs: evt.ts,
          };
          break;
      }
    }

    const touchedSymbols = Object.keys(patched);
    if (touchedSymbols.length === 0) return { touchedSymbols };

    set((state) => ({
      instrumentsById: { ...state.instrumentsById, ...patched },
      eventsAppliedThisSecond: state.eventsAppliedThisSecond + events.length,
      tradeFeed: trades
        ? [...trades.reverse(), ...state.tradeFeed].slice(0, MAX_TRADE_FEED)
        : state.tradeFeed,
    }));

    return { touchedSymbols };
  },

  setSelected: (symbol) => set({ selectedSymbol: symbol }),
  setMovers: (topGainers, topLosers) => set({ topGainers, topLosers }),

  resetCounter: () => {
    const n = get().eventsAppliedThisSecond;
    set({ eventsAppliedThisSecond: 0 });
    return n;
  },
}));

/** Selective-subscription hook: a row component using this only re-renders
 *  when *its own* row object reference changes - not on every store update. */
export function useInstrumentRow(symbol: string | null): InstrumentRow | undefined {
  return useMarketStore((s) => (symbol ? s.instrumentsById[symbol] : undefined));
}
