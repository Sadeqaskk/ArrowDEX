'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, ColorType } from 'lightweight-charts';
import { getSupabaseBrowser } from '@/lib/supabase/browser';
import { PAIRS, INTERVALS } from '@/lib/chartConfig';

const THEME = {
  bg: '#0A0A10',        // panel
  border: '#1C1B26',    // derived, subtle hairline against panel
  accent: '#8B7FFF',    // indigo.bright — the signature line
  glow: '#B98CFF',      // violetglow — pulse accent
  up: '#5FE0A8',        // success
  down: '#FF6B7A',      // danger
  text: '#F2F1F7',      // ivory
  muted: '#7B7A8C',      // dim
};

function toChartCandle(row) {
  return {
    time: Math.floor(new Date(row.bucket_start).getTime() / 1000),
    open: Number(row.open), high: Number(row.high),
    low: Number(row.low), close: Number(row.close),
  };
}

function toChartVolume(row) {
  const up = Number(row.close) >= Number(row.open);
  return {
    time: Math.floor(new Date(row.bucket_start).getTime() / 1000),
    value: Number(row.volume),
    color: up ? `${THEME.up}4D` : `${THEME.down}4D`,
  };
}

export default function TradingChart() {
  const [pair, setPair] = useState(PAIRS[0]);
  const [interval, setIntervalKey] = useState('1h');
  const [lastPrice, setLastPrice] = useState(null);
  const [pulse, setPulse] = useState(false);

  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: THEME.bg },
        textColor: THEME.muted,
        fontFamily: "'JetBrains Mono', monospace",
      },
      grid: { vertLines: { color: THEME.border }, horzLines: { color: THEME.border } },
      rightPriceScale: { borderColor: THEME.border },
      timeScale: { borderColor: THEME.border, timeVisible: true },
      crosshair: {
        vertLine: { color: THEME.accent, width: 1, style: 3 },
        horzLine: { color: THEME.accent, width: 1, style: 3 },
      },
      autoSize: true,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: THEME.up, downColor: THEME.down, borderVisible: false,
      wickUpColor: THEME.up, wickDownColor: THEME.down,
      priceLineColor: THEME.accent, priceLineWidth: 1,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' }, priceScaleId: '',
    }, 1);
    chart.panes()[1]?.setHeight(90);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    return () => chart.remove();
  }, []);

  const loadCandles = useCallback(async () => {
    const res = await fetch(`/api/candles?pool=${pair.poolKey}&interval=${interval}&limit=500`);
    const json = await res.json();
    if (!json.candles?.length) return;
    candleSeriesRef.current.setData(json.candles.map(toChartCandle));
    volumeSeriesRef.current.setData(json.candles.map(toChartVolume));
    setLastPrice(Number(json.candles[json.candles.length - 1].close));
    chartRef.current.timeScale().fitContent();
  }, [pair, interval]);

  useEffect(() => { loadCandles(); }, [loadCandles]);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    const channel = sb
      .channel(`swaps-${pair.poolKey}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'events', filter: 'event_type=eq.swap' },
        () => { loadCandles(); setPulse(true); setTimeout(() => setPulse(false), 900); }
      )
      .subscribe();
    return () => sb.removeChannel(channel);
  }, [pair, loadCandles]);

  return (
    <div className="bg-panel border border-white/5 rounded-card overflow-hidden shadow-glow">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5 font-sans">
        <div className="flex items-center gap-5">
          <div className="flex gap-1.5">
            {PAIRS.map((p) => (
              <button
                key={p.poolKey}
                onClick={() => setPair(p)}
                className={`px-3.5 py-1.5 rounded-lg text-[13px] font-semibold border transition-colors ${
                  p.poolKey === pair.poolKey
                    ? 'border-indigo-bright bg-indigo-bright/10 text-indigo-bright'
                    : 'border-white/10 text-dim hover:text-ivory'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div
            className="font-mono text-xl font-semibold text-ivory transition-[text-shadow] duration-500"
            style={{ textShadow: pulse ? `0 0 14px ${THEME.glow}` : 'none' }}
          >
            {lastPrice !== null ? lastPrice.toFixed(6) : '—'}
            <span className="text-xs text-dim ml-1.5">{pair.quote}</span>
          </div>
        </div>

        <div className="flex gap-1 font-mono">
          {INTERVALS.map((i) => (
            <button
              key={i.key}
              onClick={() => setIntervalKey(i.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                i.key === interval ? 'bg-white/10 text-ivory' : 'text-dim hover:text-ivory'
              }`}
            >
              {i.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={containerRef} className="w-full h-[520px]" />
    </div>
  );
}