'use client';

import AppShell from '../../components/AppShell';
import TradingChart from '../../components/TradingChart';

export default function ChartPage() {
  return (
    <AppShell>
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <div className="card-label mb-2">Markets</div>
          <h1 className="text-[28px] font-bold">Live Markets</h1>
          <p className="text-dim text-sm mt-1.5">Real-time on-chain price action for ArrowDEX pools.</p>
        </div>
        <TradingChart />
      </div>
    </AppShell>
  );
}