"use client";

import { Profiler, type ReactNode } from "react";
import { commitCounter } from "@/hooks/usePerfMetrics";

/**
 * Wraps the dashboard in React's built-in Profiler API purely to count
 * commits/sec for the perf panel - onRender fires once per commit for
 * the wrapped subtree, which is exactly the "React commits/sec" metric
 * the requirements ask for, without needing the separate (heavier)
 * react-devtools profiling API.
 */
export function CommitProbe({ children }: { children: ReactNode }) {
  return (
    <Profiler id="dashboard" onRender={() => (commitCounter.count += 1)}>
      {children}
    </Profiler>
  );
}
