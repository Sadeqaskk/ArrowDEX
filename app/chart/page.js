import TradingChart from '@/components/TradingChart';

export default function ChartPage() {
  return (
    <main className="min-h-screen bg-black px-4 py-8 md:px-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="space-y-1">
          <h1 className="font-sans text-2xl font-bold text-ivory">Markets</h1>
          <p className="font-sans text-sm text-dim">Live on-chain price action for ArrowDEX pools.</p>
        </div>
        <TradingChart />
      </div>
    </main>
  );
}s