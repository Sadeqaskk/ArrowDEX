# Arrow DEX

Cross-chain DeFi exchange — bridge USDC across Arc Testnet, Ethereum Sepolia, and Base Sepolia.

## Getting started

```bash
npm install
npm run dev
```

Then open http://localhost:3000

## What's real vs. not, honestly

| Page | Status |
|---|---|
| **Dashboard** (`/`) | **Real.** Pulls actual on-chain USDC + native gas balances across all 3 chains via public RPCs. No mock numbers. |
| **Bridge** (`/bridge`) | **Real.** Live Circle CCTP integration — Approve → Burn → Attestation → Mint, all against real testnet contracts. Pops up as a modal on submit. |
| **Liquidity Pools** (`/pools`) | **Real.** Live constant-product AMM deployed by you on Arc Testnet — add/remove liquidity, real reserves, real LP token balance and pool share, all read/written directly against your deployed `ArrowPool` contract. |
| **Settings** (`/settings`) | **Real.** Real wallet disconnect, real network switching (via MetaMask), preferences persisted to localStorage. |
| **Docs** (`/docs`) | **Real content**, written to reflect exactly what's built — not a placeholder page. |
| **Swap** (`/swap`) | **UI only.** Explicitly excluded from this pass — waiting on your deployed Remix contract (address + ABI) to wire up for real. |
| **Liquidity Pools** (`/pools`) | **Contract written, not yet deployed.** Real AMM contract exists in `contracts/` — deploy it via Remix and send back the addresses to go live. |
| **Vaults** (`/vaults`) | **Paused.** No staking contract exists yet. Honestly marked as unbuilt rather than faked — your call to skip it for now. |
| **Activity** (`/activity`) | **Paused.** Real transaction history needs either an explorer API key or on-chain log scanning — your call to skip it for now. |

## Liquidity Pools — contracts ready to deploy

`contracts/ArrowPool.sol` and `contracts/ArrowFactory.sol` are a real, standard
constant-product AMM (same mechanism as Uniswap V2) — LPs deposit both tokens,
receive LP tokens representing their share, and earn a 0.30% fee on every swap
that routes through the pool. Built on audited OpenZeppelin primitives
(ERC20, ReentrancyGuard), not reinvented from scratch.

**Full deployment steps are in `contracts/DEPLOYING.md`.** Short version:
deploy `ArrowFactory` via Remix, call `createPool(tokenA, tokenB)`, send back
the factory address + pool address + network — the `/pools` page gets wired
to real deposit/withdraw/swap functionality once that's in hand.

## Structure

- `app/page.js` — Dashboard, real balances via `lib/useBalances.js`
- `app/bridge/page.js` — Bridge, real CCTP flow via `lib/cctp.js`, shown in a popup modal (`components/Modal.js`)
- `app/settings/page.js` — real wallet/network management
- `app/docs/page.js` — real documentation content
- `app/swap/page.js` — UI-only, not wired to a contract yet
- `app/vaults/page.js`, `app/activity/page.js` — honest placeholders, paused by request
- `lib/WalletContext.js` — wallet state, now tracks real connected chain and listens for account/network changes in MetaMask
- `lib/chains.js` — real chain configs (RPC URLs, chain IDs, USDC + CCTP contract addresses)
- `lib/cctp.js` — real CCTP bridge logic
- `lib/useBalances.js` — real on-chain balance reads (no mock data)
- `components/PremiumSelector.js` — custom styled dropdown (replaces plain `<select>`)
- `components/Modal.js` — reusable popup modal, used by Bridge

## Bridge — how it actually works

Mirrors Circle's own official quickstart exactly (same contracts, same API):
https://developers.circle.com/cctp/quickstarts/transfer-usdc-ethereum-to-arc

Flow: **Approve → Burn (source chain) → Attestation (Circle's Iris API) → Mint (destination chain)**.
No wrapped tokens — USDC is burned on the source chain and minted natively on the destination chain.

**Before testing it**, you need on the source chain:
- Testnet USDC — get it from https://faucet.circle.com
- Native gas token (Sepolia ETH for Ethereum/Base Sepolia; USDC itself is the gas token on Arc Testnet)

**Known limitation:** `maxFee` in `lib/cctp.js` uses a rough placeholder (`amount / 2000`).
For production, replace this with a live quote from Circle's fee endpoint.

## Liquidity Pools — deployed contracts on Arc Testnet

- `WrappedUSDC` (WUSDC): `0x6eE5a47Ae9F0536675041ed900fD3Ef1AA1Dea18` — wraps Arc's native USDC 1:1 into an ERC-20
- `ArrowToken` (ARROW): `0xf49963fF85418060dD7F8310FEEf3Ce6E37e2561` — testnet ERC-20, open `mint()` for convenience
- `ArrowPool` (WUSDC/ARROW AMM): `0x92318C8845283B9E8A33124Ef4EC520491F826F0` — constant-product pool, 0.30% swap fee

All three were written by Claude and deployed by you via Remix. Addresses live in `lib/poolConfig.js`.
The `ArrowPool` contract is a standard Uniswap V2-style design — real, but not independently audited.
Test with modest amounts.

## Wiring up your own Swap contract

Once your Remix contract is deployed and verified, send:
1. The deployed contract address (per network you deploy to)
2. The contract's ABI (Remix gives you this after compiling)

## Design system

- Near-black base (`#050508`), single indigo-violet accent (`#6C63FF` / `#8B7FFF`)
- Manrope for UI text, JetBrains Mono for all numeric/data display
- "Liquid glass" cards: gradient background + 1px top highlight + backdrop blur
- Signature: rotating conic-gradient border on the hero balance card
