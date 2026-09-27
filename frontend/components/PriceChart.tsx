"use client";

import { useEffect, useRef } from "react";
import { useMarketStore } from "@/lib/marketStore";

const MAX_POINTS = 240; // ~ a few minutes of ticks at typical rates

/**
 * Deliberately bypasses React for the actual drawing. Subscribing a
 * <Line> chart's data prop to every price tick for the selected symbol
 * would mean a React re-render per tick just for this one panel; instead
 * we subscribe directly to the Zustand store outside React (store.subscribe),
 * push into a plain ring buffer, and redraw an imperative <canvas> once
 * per animation frame. React only re-renders this component when the
 * SELECTED SYMBOL changes, not on every price update.
 */
export function PriceChart() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bufferRef = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);
  const selectedSymbol = useMarketStore((s) => s.selectedSymbol);

  useEffect(() => {
    bufferRef.current = [];
    dirtyRef.current = true;

    const unsubscribe = useMarketStore.subscribe((state) => {
      if (!selectedSymbol) return;
      const row = state.instrumentsById[selectedSymbol];
      if (!row) return;
      const buf = bufferRef.current;
      if (buf[buf.length - 1] !== row.price) {
        buf.push(row.price);
        if (buf.length > MAX_POINTS) buf.shift();
        dirtyRef.current = true;
      }
    });

    const draw = () => {
      const canvas = canvasRef.current;
      if (canvas && dirtyRef.current) {
        dirtyRef.current = false;
        renderSparkline(canvas, bufferRef.current);
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      unsubscribe();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [selectedSymbol]);

  return (
    <div className="panel price-chart">
      <div className="panel-header">
        <h2>Price Chart</h2>
        <span className="pill">{selectedSymbol ?? "—"}</span>
      </div>
      <canvas ref={canvasRef} className="chart-canvas" width={640} height={220} />
    </div>
  );
}

function renderSparkline(canvas: HTMLCanvasElement, points: number[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 640;
  const cssH = canvas.clientHeight || 220;
  if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  if (points.length < 2) return;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = cssW / (MAX_POINTS - 1);
  const startX = cssW - (points.length - 1) * stepX;

  ctx.beginPath();
  points.forEach((p, i) => {
    const x = startX + i * stepX;
    const y = cssH - ((p - min) / range) * (cssH - 20) - 10;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  const up = (points[points.length - 1] ?? 0) >= (points[0] ?? 0);
  ctx.strokeStyle = up ? "#22c55e" : "#ef4444";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.lineTo(startX + (points.length - 1) * stepX, cssH);
  ctx.lineTo(startX, cssH);
  ctx.closePath();
  ctx.fillStyle = up ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)";
  ctx.fill();
}
