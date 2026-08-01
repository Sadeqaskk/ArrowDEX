import { NAV_ITEMS } from '../components/Sidebar';
import { CHAIN_LIST } from './chains';
import { TOKENS } from './swapConfig';

const SETTINGS_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 000 1.8l.1.1a2 2 0 01-2.7 2.7l-.1-.1a1.7 1.7 0 00-1.8 0 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8 0l-.1.1a2 2 0 01-2.7-2.7l.1-.1a1.7 1.7 0 000-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 000-1.8l-.1-.1a2 2 0 012.7-2.7l.1.1a1.7 1.7 0 001.8 0h0a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8 0l.1-.1a2 2 0 012.7 2.7l-.1.1a1.7 1.7 0 000 1.8v0a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" />
  </svg>
);

// Sidebar's NAV_ITEMS doesn't include Settings (it's rendered separately as
// a footer link), so it's added here manually to keep search complete.
const EXTRA_PAGES = [
  { href: '/settings', label: 'Settings', icon: SETTINGS_ICON },
];

// NAV_ITEMS currently has two entries pointing at /pools ("Pools" and
// "Liquidity Pools") — deduped here by href so search doesn't show the same
// destination twice. The sidebar itself is untouched.
const ALL_PAGES = [...NAV_ITEMS, ...EXTRA_PAGES].filter(
  (item, index, arr) => arr.findIndex((i) => i.href === item.href) === index
);

const PAGE_KEYWORDS = {
  '/': ['dashboard', 'home', 'portfolio', 'overview', 'balance'],
  '/swap': ['swap', 'trade', 'exchange', 'convert'],
  '/bridge': ['bridge', 'cctp', 'cross-chain', 'transfer'],
  '/pools': ['pool', 'liquidity', 'lp', 'add liquidity'],
  '/vaults': ['vault', 'stake', 'staking', 'earn', 'rewards', 'apr'],
  '/activity': ['activity', 'history', 'transactions', 'txs'],
  '/docs': ['docs', 'documentation', 'faq', 'help', 'about'],
  '/settings': ['settings', 'wallet', 'network', 'preferences', 'disconnect'],
};

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export function isAddress(query) {
  return ADDRESS_PATTERN.test(query.trim());
}

export function searchAll(query) {
  const q = query.trim().toLowerCase();
  if (!q) return { pages: [], tokens: [], chains: [], address: null };

  if (isAddress(query)) {
    return { pages: [], tokens: [], chains: [], address: query.trim() };
  }

  const pages = ALL_PAGES.filter((item) => {
    const keywords = PAGE_KEYWORDS[item.href] || [];
    return item.label.toLowerCase().includes(q) || keywords.some((k) => k.includes(q));
  }).map((item) => ({ href: item.href, label: item.label, icon: item.icon }));

  const tokens = (TOKENS || []).filter((t) =>
    t.symbol?.toLowerCase().includes(q) || t.name?.toLowerCase().includes(q)
  );

  const chains = CHAIN_LIST.filter((c) => c.name.toLowerCase().includes(q));

  return { pages, tokens, chains, address: null };
}