// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ArrowPool.sol";

/**
 * @title ArrowFactory
 * @notice Deploys and tracks one ArrowPool per unique token pair. This is
 * the contract you deploy and interact with first — it creates individual
 * ArrowPool contracts on demand rather than you deploying pools by hand.
 *
 * Deploy via Remix:
 * 1. Compiler: 0.8.20+, same EVM version as your target chain (Arc Testnet /
 *    Ethereum Sepolia / Base Sepolia are all standard EVM — no special
 *    settings needed).
 * 2. This file imports ArrowPool.sol via a relative path — make sure both
 *    files are in the same Remix workspace folder.
 * 3. No constructor arguments — just deploy.
 * 4. To create your first pool: call createPool(tokenA, tokenB) with your
 *    two ERC-20 token addresses (e.g. your testnet USDC address and
 *    whatever second token you're pairing it with).
 * 5. Save the returned pool address — that's what the frontend needs to
 *    call addLiquidity / removeLiquidity / swap on.
 */
contract ArrowFactory {
    mapping(address => mapping(address => address)) public getPool;
    address[] public allPools;

    event PoolCreated(address indexed token0, address indexed token1, address pool, uint256 poolIndex);

    function createPool(address tokenA, address tokenB) external returns (address pool) {
        require(tokenA != tokenB, "ArrowFactory: IDENTICAL_ADDRESSES");
        require(tokenA != address(0) && tokenB != address(0), "ArrowFactory: ZERO_ADDRESS");

        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        require(getPool[token0][token1] == address(0), "ArrowFactory: POOL_EXISTS");

        pool = address(new ArrowPool(token0, token1));
        getPool[token0][token1] = pool;
        getPool[token1][token0] = pool; // reverse lookup, so order never matters when querying

        allPools.push(pool);
        emit PoolCreated(token0, token1, pool, allPools.length);
    }

    function allPoolsLength() external view returns (uint256) {
        return allPools.length;
    }
}
