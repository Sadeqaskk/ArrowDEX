import AppShell from '../../components/AppShell';
import { CHAIN_LIST } from '../../lib/chains';

const FAQ = [
  {
    q: 'What is Arrow DEX?',
    a: 'Arrow DEX is a real, working cross-chain exchange — bridge USDC across Arc Testnet, Ethereum Sepolia, and Base Sepolia, swap USDC ⇄ EURC, provide liquidity, and stake ARROW-LP for real ARROW rewards. Every number on every page comes from an actual deployed contract, not a mock.',
  },
  {
    q: 'How does bridging actually work?',
    a: 'Arrow DEX uses Circle\u2019s Cross-Chain Transfer Protocol (CCTP) — a native burn-and-mint mechanism, not a wrapped-token bridge. USDC is burned on the source chain, Circle\u2019s attestation service verifies the burn, and the equivalent amount is minted natively on the destination chain. There is no synthetic or wrapped USDC at any point.',
  },
  {
    q: 'Why does bridging need 4 steps?',
    a: 'Approve authorizes the CCTP contract to move your USDC. Burn destroys it on the source chain and emits a message. Attestation is Circle validating that burn actually happened. Mint submits that attestation on the destination chain to release the equivalent USDC there.',
  },
  {
    q: 'Is Swap live?',
    a: 'Yes — real swaps between USDC and EURC through the ArrowSwap contract on Arc Testnet, priced by an on-chain constant-product formula with a 0.30% fee. cirBTC support is planned next.',
  },
  {
    q: 'Are Liquidity Pools live?',
    a: 'Yes — the WUSDC/ARROW pool is a real constant-product AMM. Add or remove liquidity any time; every LP token represents a real, redeemable share of the pool\u2019s reserves.',
  },
  {
    q: 'Is staking/Vaults live?',
    a: 'Yes — stake ARROW-LP in the ArrowVault contract to earn real ARROW rewards, streamed continuously with no lock period. Withdraw or claim whenever you want.',
  },
  {
    q: 'Do I need real funds?',
    a: 'No — everything runs on public testnets. Get free testnet USDC and gas from faucet.circle.com before you start.',
  },
  {
    q: 'Have the contracts been audited?',
    a: 'Not yet — they follow well-understood, standard patterns (Uniswap V2-style AMM, Synthetix-style staking) but are unaudited testnet code. Treat them accordingly and never point real funds at them.',
  },
];

const ROADMAP = [
  {
    title: 'Lending & Borrowing',
    desc: 'Supply assets to earn interest, or post collateral to borrow against it — the piece that turns Arrow from an exchange into a full credit market.',
  },
  {
    title: 'Yield Farming, expanded',
    desc: 'More reward pools beyond ARROW-LP, with multiple simultaneous reward tokens and time-boosted emission curves for long-term liquidity providers.',
  },
  {
    title: 'More pools, more pairs',
    desc: 'cirBTC support, additional stable pairs, and routing across multiple pools so a swap can hop through liquidity instead of needing one direct pair.',
  },
  {
    title: 'Independent security audit',
    desc: 'Every contract — pool, vault, swap — reviewed by an outside firm before any real-value deployment is ever considered.',
  },
  {
    title: 'Governance',
    desc: 'ARROW holders eventually deciding fee tiers, reward emissions, and which pools get liquidity incentives — the protocol run by the people using it.',
  },
];

export default function DocsPage() {
  return (
    <AppShell>
      <div className="max-w-[760px] mx-auto">
        <div className="mb-8 sm:mb-10">
          <div className="card-label mb-2">Documentation</div>
          <h1 className="text-2xl sm:text-[28px] font-bold">How Arrow DEX Works</h1>
          <p className="text-dim text-sm mt-1.5">
            Everything here reflects what&apos;s actually built and live today. Nothing on this page is aspirational — the roadmap section at the bottom is clearly marked as what&apos;s next, not what exists.
          </p>

          <a
            href="https://arrowdexdocs.vercel.app/"
            target="_blank"
            rel="noreferrer"
            className="group relative mt-5 flex items-center justify-between gap-3 overflow-hidden rounded-[16px] border border-indigo-bright/30 bg-gradient-to-br from-indigo-bright/15 via-indigo/10 to-transparent p-4 sm:p-5 transition-all hover:border-indigo-bright/60 hover:shadow-glow"
          >
            <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            <div className="flex items-center gap-3 min-w-0 relative z-10">
              <div className="w-10 h-10 rounded-[12px] bg-gradient-to-br from-indigo-bright to-indigo flex items-center justify-center flex-shrink-0 shadow-glow">
                <BookIcon className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-sm text-ivory">Full Arrow DEX Docs</div>
                <div className="text-[11px] text-dim mt-0.5 font-mono truncate">arrowdexdocs.vercel.app</div>
              </div>
            </div>
            <span className="relative z-10 flex items-center gap-1.5 text-indigo-bright text-xs font-semibold flex-shrink-0 transition-transform group-hover:translate-x-1">
              Open
              <ArrowIcon className="w-3.5 h-3.5" />
            </span>
          </a>
        </div>

        <section className="glass p-5 sm:p-7 mb-6">
          <h2 className="text-lg font-bold mb-4">What We&apos;re Building</h2>
          <div className="space-y-4 text-sm text-dim leading-relaxed">
            <p>
              Arrow DEX started as a question: what does it actually take to build a real, functioning
              decentralized exchange — not a mockup, not a pitch deck, but contracts that hold real value,
              a frontend that reads real chain state, and transactions that really settle on-chain?
            </p>
            <p>
              Every piece here was built and deployed, one real step at a time: a constant-product AMM pool
              holding real reserves, a staking vault streaming real rewards every block, a swap contract
              pricing trades against live liquidity, and a bridge moving real USDC across three different
              networks using Circle&apos;s own CCTP infrastructure — no shortcuts, no placeholder data,
              no <span className="text-ivory">&quot;coming soon&quot;</span> where a real number could go instead.
            </p>
            <p className="text-ivory font-medium">
              That&apos;s the standard this project holds itself to: if it&apos;s on the page, it&apos;s real.
              If it&apos;s not real yet, the page says so.
            </p>
          </div>
        </section>

        <section className="glass p-5 sm:p-7 mb-6">
          <h2 className="text-lg font-bold mb-4">Supported Networks</h2>
          <div className="space-y-3">
            {CHAIN_LIST.map((c) => (
              <div key={c.key} className="flex items-center justify-between gap-3 p-4 bg-white/[0.02] border border-white/5 rounded-[14px]">
                <div className="min-w-0">
                  <div className="font-bold text-sm">{c.name}</div>
                  <div className="text-[11px] text-dim mt-1 font-mono">
                    Chain ID {c.chainId} · CCTP Domain {c.cctpDomain}
                  </div>
                </div>
                <a href={c.explorer} target="_blank" rel="noreferrer" className="text-indigo-bright text-xs font-semibold flex-shrink-0">
                  Explorer →
                </a>
              </div>
            ))}
          </div>
        </section>

        <section className="glass p-5 sm:p-7 mb-6">
          <h2 className="text-lg font-bold mb-4">The Bridge Flow (Live)</h2>
          <ol className="space-y-4">
            {[
              ['Approve', 'Your wallet authorizes Circle\u2019s TokenMessenger contract to spend the USDC amount you\u2019re bridging.'],
              ['Burn', 'A depositForBurn transaction destroys that USDC on the source chain and records the destination domain and recipient.'],
              ['Attestation', 'Circle\u2019s Iris API observes the burn and, once finalized, produces a signed attestation. Arrow DEX polls this automatically.'],
              ['Mint', 'The attestation is submitted to the destination chain\u2019s MessageTransmitter contract, which mints the equivalent USDC to your wallet.'],
            ].map(([title, desc], i) => (
              <li key={title} className="flex gap-4">
                <div className="w-7 h-7 rounded-full bg-indigo/15 text-indigo-bright font-mono text-sm flex items-center justify-center flex-shrink-0">{i + 1}</div>
                <div>
                  <div className="font-bold text-sm">{title}</div>
                  <div className="text-sm text-dim mt-1 leading-relaxed">{desc}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="glass p-5 sm:p-7 mb-6">
          <h2 className="text-lg font-bold mb-4">Getting Started</h2>
          <ol className="space-y-3 text-sm text-dim leading-relaxed list-decimal list-inside">
            <li>Install MetaMask, Rabby, or any wallet extension — or skip that and use WalletConnect from your phone.</li>
            <li>Get free testnet USDC and gas from <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="text-indigo-bright">faucet.circle.com</a>.</li>
            <li>Click <strong className="text-ivory">Connect Wallet</strong> on any Arrow DEX page.</li>
            <li>Bridge funds in, swap between assets, add liquidity, or stake ARROW-LP — all four are real and live today.</li>
            <li>Approve the wallet prompts as they appear — each corresponds to one real on-chain step.</li>
          </ol>
        </section>

        <section className="glass p-5 sm:p-7 mb-6">
          <h2 className="text-lg font-bold mb-1">What&apos;s Next</h2>
          <p className="text-xs text-dim mb-5">Roadmap — not built yet, marked clearly as vision, not fact.</p>
          <div className="space-y-4">
            {ROADMAP.map((item) => (
              <div key={item.title} className="flex gap-3">
                <div className="w-2 h-2 rounded-full bg-indigo-bright mt-2 flex-shrink-0" />
                <div>
                  <div className="font-bold text-sm text-ivory">{item.title}</div>
                  <div className="text-sm text-dim mt-1 leading-relaxed">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="glass p-5 sm:p-7 mb-6">
          <h2 className="text-lg font-bold mb-4">FAQ</h2>
          <div className="space-y-5">
            {FAQ.map((item) => (
              <div key={item.q}>
                <div className="font-bold text-sm mb-1.5">{item.q}</div>
                <div className="text-sm text-dim leading-relaxed">{item.a}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="glass p-5 sm:p-7">
          <h2 className="text-lg font-bold mb-4">Built By</h2>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-[14px] bg-gradient-to-br from-indigo-bright via-indigo to-[#3a2fb8] flex items-center justify-center font-extrabold text-white text-lg flex-shrink-0">
              S
            </div>
            <div className="min-w-0">
              <div className="font-bold text-sm text-ivory">Sadik</div>
              <div className="text-xs text-dim mt-0.5">Founder & Builder, Arrow DEX</div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5 mt-5">
            <a
              href="https://x.com/0xsadik0"
              target="_blank"
              rel="noreferrer"
              className="flex-1 flex items-center justify-center gap-2 border border-white/10 hover:border-indigo-bright/40 rounded-[12px] py-3 text-sm font-semibold text-ivory transition-all"
            >
              <XIcon className="w-4 h-4" />
              @0xsadik0
            </a>
            <a
              href="https://x.com/ArrowDEX1"
              target="_blank"
              rel="noreferrer"
              className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-br from-indigo-bright to-indigo rounded-[12px] py-3 text-sm font-semibold text-white shadow-glow transition-all"
            >
              <XIcon className="w-4 h-4" />
              @ArrowDEX1
            </a>
          </div>
          <p className="text-[11px] text-dim mt-4 leading-relaxed text-center">
            Built one real contract at a time. Follow along for what&apos;s next.
          </p>
        </section>

      </div>
    </AppShell>
  );
}

function XIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function BookIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function ArrowIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M7 17L17 7" />
      <path d="M7 7h10v10" />
    </svg>
  );
}