'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, ColorType } from 'lightweight-charts';
import { getSupabaseBrowser } from '@/lib/supabase/browser';
import { PAIRS, INTERVALS } from '@/lib/chartConfig';

const THEME = {
  bg: '#0A0A10',
  border: '#1C1B26',
  accent: '#8B7FFF',
  glow: '#B98CFF',
  up: '#5FE0A8',
  down: '#FF6B7A',
  text: '#F2F1F7',
  muted: '#7B7A8C',
};

function toChartCandle(row) {
  return {
    time: Math.floor(new Date(row.bucket_start).getTime() / 1000),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err) {
  const msg = (err && err.message) || '';
  return msg.includes('request limit reached') || msg.includes('rate limit') || msg.includes('429');
}

function fmtPrice(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n < 1 ? n.toFixed(6) : n.toFixed(4);
}

function fmtCompact(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
}

// Fetch with retry/backoff for transient RPC/API rate limits.
async function fetchCandles(pool, interval, limit) {
  const maxAttempts = 4;
  let attempt = 0;
  while (true) {
    try {
      const res = await fetch(`/api/candles?pool=${pool}&interval=${interval}&limit=${limit}`);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        const err = new Error(body || `Request failed (${res.status})`);
        err.status = res.status;
        throw err;
      }
      const json = await res.json();
      return json.candles || [];
    } catch (err) {
      attempt += 1;
      const rateLimited = isRateLimitError(err) || err.status === 429;
      if (rateLimited && attempt < maxAttempts) {
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      throw err;
    }
  }
}

export default function TradingChart() {
  const [pair, setPair] = useState(PAIRS[0]);
  const [interval, setIntervalKey] = useState('1h');
  const [lastPrice, setLastPrice] = useState(null);
  const [pulse, setPulse] = useState(false);
  const [pulseDir, setPulseDir] = useState('up');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [live, setLive] = useState('connecting'); // connecting | live | offline

  const [stats24h, setStats24h] = useState(null); // { changePct, changeAbs, high, low, volume }
  const [hover, setHover] = useState(null); // OHLC legend data from crosshair

  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const lastCandleRef = useRef(null);
  const lastVolumeRef = useRef(null);
  const loadIdRef = useRef(0);

  // ---- chart lifecycle ----
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
      upColor: THEME.up,
      downColor: THEME.down,
      borderVisible: false,
      wickUpColor: THEME.up,
      wickDownColor: THEME.down,
      priceLineColor: THEME.accent,
      priceLineWidth: 1,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    }, 1);
    chart.panes()[1]?.setHeight(90);

    // OHLC legend: follow the crosshair, fall back to the latest bar.
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time) {
        setHover(lastCandleRef.current ? { ...lastCandleRef.current, live: true } : null);
        return;
      }
      const bar = param.seriesData.get(candleSeries);
      if (bar) setHover({ ...bar, live: false });
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    return () => chart.remove();
  }, []);

  // ---- full history load (pair or interval change, manual refresh) ----
  const loadCandles = useCallback(async ({ silent } = {}) => {
    const loadId = ++loadIdRef.current;
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const candles = await fetchCandles(pair.poolKey, interval, 500);
      if (loadId !== loadIdRef.current) return; // stale response — pair/interval changed mid-flight

      if (!candles.length) {
        candleSeriesRef.current.setData([]);
        volumeSeriesRef.current.setData([]);
        lastCandleRef.current = null;
        setLastPrice(null);
        setError('No trades yet for this pool at this interval.');
        return;
      }

      const chartCandles = candles.map(toChartCandle);
      const chartVolumes = candles.map(toChartVolume);
      candleSeriesRef.current.setData(chartCandles);
      volumeSeriesRef.current.setData(chartVolumes);

      const lastBar = chartCandles[chartCandles.length - 1];
      lastCandleRef.current = lastBar;
      lastVolumeRef.current = chartVolumes[chartVolumes.length - 1];
      setLastPrice(lastBar.close);
      chartRef.current.timeScale().fitContent();
    } catch (err) {
      if (loadId !== loadIdRef.current) return;
      console.error(err);
      setError(
        isRateLimitError(err)
          ? 'The data feed is rate-limiting requests right now. Retrying shortly — you can also hit Refresh.'
          : err.message || 'Failed to load chart data.'
      );
    } finally {
      if (loadId === loadIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [pair, interval]);

  useEffect(() => { loadCandles(); }, [loadCandles]);

  // ---- 24h stats: independent of chart interval, always a true 24h window ----
  const load24hStats = useCallback(async () => {
    try {
      const candles = await fetchCandles(pair.poolKey, '1h', 25);
      if (candles.length < 2) { setStats24h(null); return; }
      const closes = candles.map((c) => Number(c.close));
      const highs = candles.map((c) => Number(c.high));
      const lows = candles.map((c) => Number(c.low));
      const volumes = candles.map((c) => Number(c.volume));
      const first = closes[0];
      const last = closes[closes.length - 1];
      setStats24h({
        changeAbs: last - first,
        changePct: first ? ((last - first) / first) * 100 : 0,
        high: Math.max(...highs),
        low: Math.min(...lows),
        volume: volumes.reduce((a, b) => a + b, 0),
      });
    } catch (err) {
      // Non-fatal — the main chart error banner already covers hard failures.
      console.error('24h stats failed:', err);
    }
  }, [pair]);

  useEffect(() => { load24hStats(); }, [load24hStats]);

  // ---- incremental realtime updates: patch the last bar, never reset the viewport ----
  const applyLatestCandle = useCallback(async () => {
    try {
      const candles = await fetchCandles(pair.poolKey, interval, 2);
      if (!candles.length) return;
      const latest = toChartCandle(candles[candles.length - 1]);
      const latestVol = toChartVolume(candles[candles.length - 1]);

      const prevClose = lastCandleRef.current?.close ?? latest.close;
      candleSeriesRef.current.update(latest);
      volumeSeriesRef.current.update(latestVol);
      lastCandleRef.current = latest;
      lastVolumeRef.current = latestVol;

      setLastPrice(latest.close);
      setPulseDir(latest.close >= prevClose ? 'up' : 'down');
      setPulse(true);
      setTimeout(() => setPulse(false), 900);
    } catch (err) {
      console.error('Live update failed:', err);
    }
    load24hStats();
  }, [pair, interval, load24hStats]);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    setLive('connecting');
    const channel = sb
      .channel(`swaps-${pair.poolKey}`)
      .on('postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'events',
          // Scoped to this pool — without this, a trade on any other pool
          // would trigger a refetch here too. Adjust `pool_address` if your
          // events table uses a different column name for the pool.
          filter: `event_type=eq.swap,pool_address=eq.${pair.poolKey}`,
        },
        () => { applyLatestCandle(); }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setLive('live');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setLive('offline');
      });
    return () => sb.removeChannel(channel);
  }, [pair, applyLatestCandle]);

  const legend = hover || (lastCandleRef.current ? { ...lastCandleRef.current, live: true } : null);
  const legendUp = legend ? legend.close >= legend.open : true;

  return (
    <div className="bg-panel border border-white/5 rounded-card overflow-hidden shadow-glow">
      {/* Header: pair, price, 24h stats, live status */}
      <div className="flex flex-wrap items-center justify-between gap-y-3 px-5 py-3.5 border-b border-white/5 font-sans">
        <div className="flex items-center gap-5 flex-wrap">
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

          <div className="flex items-baseline gap-2">
            <div
              className={`font-mono text-xl font-semibold transition-[text-shadow] duration-500 ${
                pulse ? (pulseDir === 'up' ? 'text-success' : 'text-danger') : 'text-ivory'
              }`}
              style={{ textShadow: pulse ? `0 0 14px ${THEME.glow}` : 'none' }}
            >
              {lastPrice !== null ? fmtPrice(lastPrice) : '—'}
            </div>
            <span className="text-xs text-dim">{pair.quote}</span>
          </div>

          {stats24h && (
            <div
              className={`font-mono text-[13px] font-semibold px-2 py-1 rounded-md ${
                stats24h.changePct >= 0 ? 'text-success bg-success/10' : 'text-danger bg-danger/10'
              }`}
            >
              {stats24h.changePct >= 0 ? '+' : ''}
              {stats24h.changePct.toFixed(2)}%
            </div>
          )}

          <div className="hidden md:flex items-center gap-4 font-mono text-[11.5px] text-dim">
            <div>
              <span className="block text-[10px] uppercase tracking-wide opacity-70">24h High</span>
              <span className="text-ivory">{stats24h ? fmtPrice(stats24h.high) : '—'}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wide opacity-70">24h Low</span>
              <span className="text-ivory">{stats24h ? fmtPrice(stats24h.low) : '—'}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-wide opacity-70">24h Vol</span>
              <span className="text-ivory">{stats24h ? fmtCompact(stats24h.volume) : '—'}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[11px] font-mono">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                live === 'live' ? 'bg-success animate-pulse' : live === 'connecting' ? 'bg-dim' : 'bg-danger'
              }`}
            />
            <span className={live === 'offline' ? 'text-danger' : 'text-dim'}>
              {live === 'live' ? 'Live' : live === 'connecting' ? 'Connecting…' : 'Offline'}
            </span>
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

          <button
            onClick={() => loadCandles({ silent: true })}
            disabled={refreshing || loading}
            className="text-xs text-indigo-bright font-semibold disabled:opacity-40"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-5 mt-3 text-[13px] text-danger bg-danger/10 border border-danger/25 rounded-[12px] px-3.5 py-2.5">
          {error}
        </div>
      )}

      {/* Chart */}
      <div className="relative w-full h-[520px]">
        {legend && !error && (
          <div className="absolute top-3 left-3 z-10 font-mono text-[11.5px] leading-relaxed bg-black/40 backdrop-blur-sm rounded-lg px-3 py-2 pointer-events-none">
            <span className="text-dim mr-2">{pair.label}</span>
            <span className={legendUp ? 'text-success' : 'text-danger'}>
              O<span className="text-ivory ml-1 mr-2">{fmtPrice(legend.open)}</span>
              H<span className="text-ivory ml-1 mr-2">{fmtPrice(legend.high)}</span>
              L<span className="text-ivory ml-1 mr-2">{fmtPrice(legend.low)}</span>
              C<span className="text-ivory ml-1">{fmtPrice(legend.close)}</span>
            </span>
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-panel/60 backdrop-blur-[1px]">
            <span className="w-6 h-6 rounded-full border-2 border-indigo-bright border-t-transparent animate-spin" />
          </div>
        )}

        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  );
} 