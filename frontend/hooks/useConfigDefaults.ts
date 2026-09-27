"use client";

import { useQuery } from "@tanstack/react-query";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type ConfigDefaults = {
  instrumentPresets: number[];
  ratePresets: number[];
  sectors: string[];
};

async function fetchDefaults(): Promise<ConfigDefaults> {
  const res = await fetch(`${API_URL}/api/config/defaults`);
  if (!res.ok) throw new Error(`Failed to load config defaults: ${res.status}`);
  return res.json();
}

/**
 * Reference/config data, not realtime market data - this is the "where
 * appropriate" case for TanStack Query in this project. It's fetched
 * once, cached for the session, and refetched only on manual invalidation.
 * Realtime ticks never go through React Query; they go through the
 * WebSocket + Zustand pipeline in lib/wsClient.ts and lib/marketStore.ts.
 */
export function useConfigDefaults() {
  return useQuery({ queryKey: ["config-defaults"], queryFn: fetchDefaults });
}
