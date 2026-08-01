# Deploying the Liquidity Pool Contracts (Remix)

Two files, in `contracts/`:
- `ArrowPool.sol` — the actual AMM pool (constant-product, 0.30% fee). You never deploy this directly.
- `ArrowFactory.sol` — deploys pools on demand. **This is the one you deploy.**

## Steps

1. Go to [remix.ethereum.org](https://remix.ethereum.org)
2. Create a new folder, upload both `ArrowPool.sol` and `ArrowFactory.sol` into it (same folder — the Factory imports the Pool via a relative path).
3. Go to the **Solidity Compiler** tab:
   - Compiler version: **0.8.20** or higher
   - Click **Compile ArrowFactory.sol** (this automatically compiles ArrowPool.sol too, since it's imported)
   - Remix will auto-fetch the OpenZeppelin imports from GitHub the first time — this needs an internet connection in your browser, but no local npm install.
4. Go to the **Deploy & Run Transactions** tab:
   - Environment: **Injected Provider - MetaMask** (make sure MetaMask is set to whichever testnet you're deploying to — Arc Testnet, Ethereum Sepolia, or Base Sepolia)
   - Contract: select **ArrowFactory**
   - Click **Deploy**, confirm in MetaMask
5. Once deployed, copy the **factory contract address** — send it to me along with which network you deployed to.

## Creating your first pool

Still in Remix, under the deployed ArrowFactory instance:
1. Call `createPool(tokenA, tokenB)` with two ERC-20 token addresses — e.g. the testnet USDC address on that chain, and whatever second token you're pairing it with.
2. This returns (and emits an event with) the new pool's address. You can also read it back anytime via `getPool(tokenA, tokenB)`.
3. Send me that pool address too — I'll wire the frontend's Liquidity Pools page to call `addLiquidity`, `removeLiquidity`, and read live reserves from it.

## If compilation fails on the ReentrancyGuard import

OpenZeppelin moved `ReentrancyGuard.sol` from `security/` to `utils/` in their v5 release. `ArrowPool.sol` uses the current path:

```solidity
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
```

If Remix resolves an older OpenZeppelin version and this path fails, change that one line to:

```solidity
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
```

## What I need back from you to wire up the frontend

- Network deployed to (Arc Testnet / Ethereum Sepolia / Base Sepolia)
- ArrowFactory contract address
- At least one pool address (from `createPool`) + the two token addresses used
- The ABI for both contracts (Remix → Solidity Compiler tab → click the contract → copy the ABI, or just re-share the .sol files, I can derive it)
