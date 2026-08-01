// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ArrowPool
 * @notice A single constant-product (x * y = k) liquidity pool for one token
 * pair, in the same spirit as Uniswap V2's Pair contract. LPs deposit both
 * tokens and receive LP tokens (this contract IS the LP token, via ERC20)
 * representing their share of the pool. Traders pay a 0.30% fee on every
 * swap, which accrues to the pool and therefore to LPs pro-rata.
 *
 * This contract's internal `swap` function is what makes the pool function
 * as an AMM — it is NOT the same thing as Arrow DEX's separate Swap page
 * contract. Liquidity Pools and the standalone Swap feature are two
 * different products that happen to both involve exchanging tokens.
 *
 * Deploy via Remix:
 * 1. Compiler: 0.8.20 or higher, EVM version matching your target chain.
 * 2. Remix resolves the @openzeppelin/contracts imports automatically
 *    (it fetches them from GitHub) — no local install needed.
 * 3. Constructor takes the two token addresses (order doesn't matter —
 *    the Factory below sorts them before deploying).
 * 4. Deploy the Factory (ArrowFactory.sol) instead of this file directly,
 *    then call createPool() — that's the intended entry point.
 */
contract ArrowPool is ERC20, ReentrancyGuard {
    uint256 public constant FEE_BPS = 30; // 0.30%
    uint256 public constant FEE_DENOMINATOR = 10_000;
    uint256 public constant MINIMUM_LIQUIDITY = 1000;
    address private constant DEAD = 0x000000000000000000000000000000000000dEaD;

    address public immutable tokenA;
    address public immutable tokenB;
    address public immutable factory;

    uint256 public reserveA;
    uint256 public reserveB;

    event Mint(address indexed sender, uint256 amountA, uint256 amountB, uint256 liquidity);
    event Burn(address indexed sender, uint256 amountA, uint256 amountB, uint256 liquidity, address indexed to);
    event Swap(address indexed sender, address indexed tokenIn, uint256 amountIn, uint256 amountOut, address indexed to);
    event Sync(uint256 reserveA, uint256 reserveB);

    constructor(address _tokenA, address _tokenB)
        ERC20("Arrow LP Token", "ARROW-LP")
    {
        require(_tokenA != address(0) && _tokenB != address(0), "ArrowPool: ZERO_ADDRESS");
        require(_tokenA != _tokenB, "ArrowPool: IDENTICAL_TOKENS");
        tokenA = _tokenA;
        tokenB = _tokenB;
        factory = msg.sender;
    }

    function getReserves() public view returns (uint256 _reserveA, uint256 _reserveB) {
        return (reserveA, reserveB);
    }

    /// @notice Deposit both tokens to mint LP tokens and provide liquidity.
    /// @param amountADesired Amount of tokenA you want to deposit.
    /// @param amountBDesired Amount of tokenB you want to deposit.
    /// @param amountAMin Minimum tokenA you'll accept (slippage protection).
    /// @param amountBMin Minimum tokenB you'll accept (slippage protection).
    /// @param to Address that receives the minted LP tokens.
    function addLiquidity(
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to
    ) external nonReentrant returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        (uint256 _reserveA, uint256 _reserveB) = getReserves();

        if (_reserveA == 0 && _reserveB == 0) {
            amountA = amountADesired;
            amountB = amountBDesired;
        } else {
            uint256 amountBOptimal = (amountADesired * _reserveB) / _reserveA;
            if (amountBOptimal <= amountBDesired) {
                require(amountBOptimal >= amountBMin, "ArrowPool: INSUFFICIENT_B_AMOUNT");
                amountA = amountADesired;
                amountB = amountBOptimal;
            } else {
                uint256 amountAOptimal = (amountBDesired * _reserveA) / _reserveB;
                require(amountAOptimal <= amountADesired, "ArrowPool: EXCESSIVE_A_AMOUNT");
                require(amountAOptimal >= amountAMin, "ArrowPool: INSUFFICIENT_A_AMOUNT");
                amountA = amountAOptimal;
                amountB = amountBDesired;
            }
        }

        require(IERC20(tokenA).transferFrom(msg.sender, address(this), amountA), "ArrowPool: TRANSFER_A_FAILED");
        require(IERC20(tokenB).transferFrom(msg.sender, address(this), amountB), "ArrowPool: TRANSFER_B_FAILED");

        uint256 _totalSupply = totalSupply();
        if (_totalSupply == 0) {
            liquidity = _sqrt(amountA * amountB) - MINIMUM_LIQUIDITY;
            _mint(DEAD, MINIMUM_LIQUIDITY); // permanently locked, prevents share-price manipulation on an empty pool
        } else {
            liquidity = _min(
                (amountA * _totalSupply) / _reserveA,
                (amountB * _totalSupply) / _reserveB
            );
        }
        require(liquidity > 0, "ArrowPool: INSUFFICIENT_LIQUIDITY_MINTED");
        _mint(to, liquidity);

        _sync();
        emit Mint(msg.sender, amountA, amountB, liquidity);
    }

    /// @notice Burn LP tokens to withdraw your share of both tokens.
    function removeLiquidity(
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to
    ) external nonReentrant returns (uint256 amountA, uint256 amountB) {
        require(balanceOf(msg.sender) >= liquidity, "ArrowPool: INSUFFICIENT_LP_BALANCE");

        uint256 _totalSupply = totalSupply();
        uint256 balanceA = IERC20(tokenA).balanceOf(address(this));
        uint256 balanceB = IERC20(tokenB).balanceOf(address(this));

        amountA = (liquidity * balanceA) / _totalSupply;
        amountB = (liquidity * balanceB) / _totalSupply;
        require(amountA >= amountAMin, "ArrowPool: INSUFFICIENT_A_RETURNED");
        require(amountB >= amountBMin, "ArrowPool: INSUFFICIENT_B_RETURNED");
        require(amountA > 0 && amountB > 0, "ArrowPool: INSUFFICIENT_LIQUIDITY_BURNED");

        _burn(msg.sender, liquidity);
        require(IERC20(tokenA).transfer(to, amountA), "ArrowPool: TRANSFER_A_FAILED");
        require(IERC20(tokenB).transfer(to, amountB), "ArrowPool: TRANSFER_B_FAILED");

        _sync();
        emit Burn(msg.sender, amountA, amountB, liquidity, to);
    }

    /// @notice Swap an exact input amount of one pool token for the other.
    /// @param amountIn Amount of tokenIn you're sending.
    /// @param tokenIn Must be tokenA or tokenB.
    /// @param amountOutMin Minimum output you'll accept (slippage protection).
    /// @param to Address that receives the output token.
    function swap(
        uint256 amountIn,
        address tokenIn,
        uint256 amountOutMin,
        address to
    ) external nonReentrant returns (uint256 amountOut) {
        require(tokenIn == tokenA || tokenIn == tokenB, "ArrowPool: INVALID_TOKEN_IN");
        require(amountIn > 0, "ArrowPool: INSUFFICIENT_INPUT_AMOUNT");

        bool inIsA = tokenIn == tokenA;
        address tokenOut = inIsA ? tokenB : tokenA;
        (uint256 reserveIn, uint256 reserveOut) = inIsA ? (reserveA, reserveB) : (reserveB, reserveA);
        require(reserveIn > 0 && reserveOut > 0, "ArrowPool: NO_LIQUIDITY");

        require(IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn), "ArrowPool: TRANSFER_IN_FAILED");

        uint256 amountInWithFee = amountIn * (FEE_DENOMINATOR - FEE_BPS);
        amountOut = (reserveOut * amountInWithFee) / (reserveIn * FEE_DENOMINATOR + amountInWithFee);
        require(amountOut >= amountOutMin, "ArrowPool: INSUFFICIENT_OUTPUT_AMOUNT");
        require(amountOut < reserveOut, "ArrowPool: INSUFFICIENT_LIQUIDITY");

        require(IERC20(tokenOut).transfer(to, amountOut), "ArrowPool: TRANSFER_OUT_FAILED");

        _sync();
        emit Swap(msg.sender, tokenIn, amountIn, amountOut, to);
    }

    /// @notice Read-only quote for what `swap` would return, given an input amount. Use this to show a live price preview in the UI before submitting a transaction.
    function getAmountOut(uint256 amountIn, address tokenIn) external view returns (uint256 amountOut) {
        require(tokenIn == tokenA || tokenIn == tokenB, "ArrowPool: INVALID_TOKEN_IN");
        bool inIsA = tokenIn == tokenA;
        (uint256 reserveIn, uint256 reserveOut) = inIsA ? (reserveA, reserveB) : (reserveB, reserveA);
        if (reserveIn == 0 || reserveOut == 0) return 0;

        uint256 amountInWithFee = amountIn * (FEE_DENOMINATOR - FEE_BPS);
        amountOut = (reserveOut * amountInWithFee) / (reserveIn * FEE_DENOMINATOR + amountInWithFee);
    }

    /// @dev Resyncs reserves to the pool's actual token balances. Called after every state-changing operation.
    function _sync() private {
        reserveA = IERC20(tokenA).balanceOf(address(this));
        reserveB = IERC20(tokenB).balanceOf(address(this));
        emit Sync(reserveA, reserveB);
    }

    function _min(uint256 x, uint256 y) private pure returns (uint256) {
        return x < y ? x : y;
    }

    /// @dev Babylonian method — standard integer square root, same approach Uniswap V2 uses for initial LP minting.
    function _sqrt(uint256 y) private pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}
