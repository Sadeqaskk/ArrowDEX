// components/RouteEngineToggle.js
//
// Drop-in toggle for the existing /swap page: lets the user switch between
// "ArrowSwap Engine" (direct pool, your current behavior) and
// "ArrowRouter — Best Price" (routed through ArrowRouter, quotes the best
// available pool/path). Purely additive — does not change any existing
// swap logic; you control what happens on each mode via the onModeChange
// callback and by choosing which quote/execute function to call.
//
// USAGE (inside your existing swap page):
//
//   import RouteEngineToggle from "@/components/RouteEngineToggle";
//   import { getBestRoute, bpsToPercent } from "@/lib/arrowRouterClient";
//
//   const [engineMode, setEngineMode] = useState("direct"); // "direct" | "router"
//   const [route, setRoute] = useState(null);
//   const [routeLoading, setRouteLoading] = useState(false);
//
//   useEffect(() => {
//     if (engineMode !== "router" || !amountIn) return;
//     setRouteLoading(true);
//     getBestRoute(publicClient, { tokenIn, tokenOut, amountIn })
//       .then(setRoute)
//       .finally(() => setRouteLoading(false));
//   }, [engineMode, amountIn, tokenIn, tokenOut]);
//
//   <RouteEngineToggle
//     mode={engineMode}
//     onModeChange={setEngineMode}
//     route={route}
//     loading={routeLoading}
//     tokenInSymbol="USDC"
//     tokenOutSymbol="EURC"
//     directRate="1 USDC = 0.378778 EURC"
//   />

import { useEffect, useState } from "react";

const TOKEN_LABELS = {
  // Extend as needed — used only for display in the route trace.
  default: (address) => `${address.slice(0, 4)}…${address.slice(-4)}`,
};

function shortLabel(addr, knownSymbols = {}) {
  return knownSymbols[addr?.toLowerCase?.()] || TOKEN_LABELS.default(addr || "");
}

export default function RouteEngineToggle({
  mode,
  onModeChange,
  route,
  loading,
  tokenInSymbol = "TOKEN",
  tokenOutSymbol = "TOKEN",
  directRate,
  directAmountOut,
  knownSymbols = {},
}) {
  const [scanStep, setScanStep] = useState(0);
  const hopCount = route?.path?.length ? route.path.length - 1 : 0;

  // Drives the gold "scan line" trace while a router quote is loading.
  useEffect(() => {
    if (!loading) {
      setScanStep(0);
      return;
    }
    const totalSteps = Math.max(hopCount, 1) + 1;
    let step = 0;
    const id = setInterval(() => {
      step = (step + 1) % totalSteps;
      setScanStep(step);
    }, 260);
    return () => clearInterval(id);
  }, [loading, hopCount]);

  const routedAmountOut = route?.amountOut;
  const isBetter =
    routedAmountOut != null &&
    directAmountOut != null &&
    routedAmountOut > directAmountOut;

  const improvementPct =
    isBetter && directAmountOut > 0n
      ? (Number(routedAmountOut - directAmountOut) / Number(directAmountOut)) * 100
      : 0;

  return (
    <div className="aer-wrap">
      <div className="aer-toggle" role="tablist" aria-label="Swap execution engine">
        <button
          role="tab"
          aria-selected={mode === "direct"}
          className={`aer-tab ${mode === "direct" ? "aer-tab--active" : ""}`}
          onClick={() => onModeChange("direct")}
        >
          <span className="aer-dot aer-dot--muted" />
          ArrowSwap Engine
        </button>
        <button
          role="tab"
          aria-selected={mode === "router"}
          className={`aer-tab ${mode === "router" ? "aer-tab--active" : ""}`}
          onClick={() => onModeChange("router")}
        >
          <span className={`aer-dot ${mode === "router" ? "aer-dot--live" : "aer-dot--muted"}`} />
          ArrowRouter — Best Price
        </button>
      </div>

      {mode === "router" && (
        <div className="aer-panel">
          <div className="aer-panel-head">
            <span className="aer-label">
              {loading ? "Scanning liquidity…" : "Best route found"}
            </span>
            {!loading && route?.path?.length > 0 && (
              <span className="aer-badge">
                {hopCount} {hopCount === 1 ? "hop" : "hops"}
              </span>
            )}
          </div>

          <div className="aer-trace">
            {(route?.path?.length ? route.path : [tokenInSymbol, tokenOutSymbol]).map(
              (node, i, arr) => {
                const label =
                  typeof node === "string" && node.length <= 12
                    ? node
                    : shortLabel(node, knownSymbols);
                const isLast = i === arr.length - 1;
                const lit = loading ? i <= scanStep : true;
                return (
                  <div className="aer-trace-segment" key={i}>
                    <div className={`aer-node ${lit ? "aer-node--lit" : ""}`}>
                      <span className="aer-node-label">{label}</span>
                    </div>
                    {!isLast && (
                      <div className="aer-connector">
                        <div
                          className={`aer-connector-fill ${
                            loading ? (i < scanStep ? "aer-connector-fill--on" : "") : "aer-connector-fill--on"
                          }`}
                        />
                      </div>
                    )}
                  </div>
                );
              }
            )}
          </div>

          {!loading && route?.pools?.length > 0 && (
            <div className="aer-pools">
              {route.pools.map((pool, i) => (
                <span className="aer-pool-tag" key={pool + i}>
                  via {shortLabel(pool, knownSymbols)}
                </span>
              ))}
            </div>
          )}

          {!loading && route?.priceImpactBps != null && (
            <div className="aer-metrics">
              <div className="aer-metric">
                <span className="aer-metric-label">Price impact</span>
                <span
                  className={`aer-metric-value ${
                    Number(route.priceImpactBps) > 300 ? "aer-metric-value--warn" : ""
                  }`}
                >
                  {(Number(route.priceImpactBps) / 100).toFixed(2)}%
                </span>
              </div>
              {isBetter && (
                <div className="aer-metric aer-metric--best">
                  <span className="aer-metric-label">vs. direct</span>
                  <span className="aer-metric-value aer-metric-value--best">
                    +{improvementPct.toFixed(2)}% better
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .aer-wrap {
          --gold: #e3b54f;
          --gold-dim: #a9791a;
          --teal: #35d0a0;
          --bg: #0d0f13;
          --surface: #111319;
          --surface-2: #15171d;
          --border: #23262e;
          --text: #f5f3ee;
          --text-dim: #8b8d96;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: var(--text);
        }

        .aer-toggle {
          display: flex;
          gap: 4px;
          padding: 4px;
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 12px;
          margin-bottom: 10px;
        }

        .aer-tab {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 12px;
          background: transparent;
          border: none;
          border-radius: 9px;
          color: var(--text-dim);
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.01em;
          cursor: pointer;
          transition: background 0.18s ease, color 0.18s ease;
        }

        .aer-tab--active {
          background: var(--surface-2);
          color: var(--text);
          box-shadow: inset 0 0 0 1px var(--border);
        }

        .aer-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .aer-dot--muted {
          background: var(--text-dim);
          opacity: 0.5;
        }

        .aer-dot--live {
          background: var(--gold);
          box-shadow: 0 0 0 3px rgba(227, 181, 79, 0.18);
        }

        .aer-panel {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 16px;
        }

        .aer-panel-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 14px;
        }

        .aer-label {
          font-size: 12px;
          color: var(--text-dim);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        .aer-badge {
          font-family: "IBM Plex Mono", ui-monospace, monospace;
          font-size: 11px;
          color: var(--gold);
          background: rgba(227, 181, 79, 0.1);
          border: 1px solid rgba(227, 181, 79, 0.25);
          padding: 2px 8px;
          border-radius: 999px;
        }

        .aer-trace {
          display: flex;
          align-items: center;
          margin-bottom: 12px;
        }

        .aer-trace-segment {
          display: flex;
          align-items: center;
          flex: 1;
        }

        .aer-trace-segment:last-child {
          flex: 0;
        }

        .aer-node {
          flex-shrink: 0;
          padding: 6px 12px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--surface-2);
          transition: border-color 0.3s ease, box-shadow 0.3s ease;
        }

        .aer-node--lit {
          border-color: var(--gold);
          box-shadow: 0 0 12px rgba(227, 181, 79, 0.25);
        }

        .aer-node-label {
          font-family: "IBM Plex Mono", ui-monospace, monospace;
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
        }

        .aer-connector {
          flex: 1;
          height: 1px;
          background: var(--border);
          margin: 0 6px;
          position: relative;
          overflow: hidden;
          min-width: 20px;
        }

        .aer-connector-fill {
          position: absolute;
          inset: 0;
          background: var(--gold);
          transform: scaleX(0);
          transform-origin: left;
          transition: transform 0.35s ease;
        }

        .aer-connector-fill--on {
          transform: scaleX(1);
        }

        .aer-pools {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 12px;
        }

        .aer-pool-tag {
          font-family: "IBM Plex Mono", ui-monospace, monospace;
          font-size: 11px;
          color: var(--text-dim);
          background: var(--surface-2);
          border: 1px solid var(--border);
          padding: 3px 9px;
          border-radius: 999px;
        }

        .aer-metrics {
          display: flex;
          gap: 20px;
          padding-top: 12px;
          border-top: 1px solid var(--border);
        }

        .aer-metric {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .aer-metric-label {
          font-size: 11px;
          color: var(--text-dim);
        }

        .aer-metric-value {
          font-family: "IBM Plex Mono", ui-monospace, monospace;
          font-size: 13px;
          font-weight: 600;
        }

        .aer-metric-value--warn {
          color: #e0824a;
        }

        .aer-metric-value--best {
          color: var(--teal);
        }

        .aer-metric--best {
          padding-left: 20px;
          border-left: 1px solid var(--border);
        }
      `}</style>
    </div>
  );
}