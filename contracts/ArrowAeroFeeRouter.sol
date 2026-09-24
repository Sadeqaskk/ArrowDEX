// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ArrowAeroFeeRouter
/// @notice Thin, non-custodial wrapper used by the ArrowDEX swap page on Arc Mainnet.
///         In ONE atomic transaction it:
///           1. pulls the user's input token,
///           2. sends `feeBps` (default 0.05%) of it to the ArrowDEX treasury,
///           3. swaps the remainder through the Aero (Slipstream) SwapRouter,
///           4. delivers the output token straight to the user.
///         The contract never holds user funds between transactions, and the swap
///         recipient is always `msg.sender`, so output can never be redirected.
///
/// @dev    The Aero router is assumed to expose the Slipstream `SwapRouter` interface
///         (tickSpacing-based `exactInputSingle` / path-based `exactInput`). The
///         constructor checks `router.factory()` against the Aero CL factory so a wrong
///         address cannot be wired in by mistake. VERIFY the struct layouts below
///         against the verified router source on explorer.arc.io before deploying.

interface IERC20Like {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
}

interface IAeroSwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        int24 tickSpacing;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    function factory() external view returns (address);

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);

    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);
}

contract ArrowAeroFeeRouter {
    // ─── Config ─────────────────────────────────────────────────────────────
    uint256 public constant MAX_FEE_BPS = 50; // hard cap: 0.50%
    uint256 private constant BPS = 10_000;

    IAeroSwapRouter public immutable router;

    address public owner;
    address public treasury;
    uint256 public feeBps; // 5 = 0.05%

    uint256 private _locked = 1;

    // ─── Events ─────────────────────────────────────────────────────────────
    event Swapped(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 feeAmount,
        uint256 amountOut
    );
    event TreasuryUpdated(address indexed treasury);
    event FeeUpdated(uint256 feeBps);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ─── Modifiers ──────────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    modifier nonReentrant() {
        require(_locked == 1, "REENTRANCY");
        _locked = 2;
        _;
        _locked = 1;
    }

    constructor(address router_, address treasury_, address expectedFactory_, uint256 feeBps_) {
        require(router_ != address(0) && treasury_ != address(0), "ZERO_ADDRESS");
        require(feeBps_ <= MAX_FEE_BPS, "FEE_TOO_HIGH");
        // Fail closed if this is not the Aero router for the expected CL factory.
        require(IAeroSwapRouter(router_).factory() == expectedFactory_, "ROUTER_FACTORY_MISMATCH");

        router = IAeroSwapRouter(router_);
        treasury = treasury_;
        feeBps = feeBps_;
        owner = msg.sender;

        emit OwnershipTransferred(address(0), msg.sender);
        emit TreasuryUpdated(treasury_);
        emit FeeUpdated(feeBps_);
    }

    // ─── Swaps ──────────────────────────────────────────────────────────────

    /// @notice Single-pool swap. `amountIn` is the GROSS amount (fee included).
    function swapSingle(
        address tokenIn,
        address tokenOut,
        int24 tickSpacing,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline
    ) external nonReentrant returns (uint256 amountOut) {
        (uint256 fee, uint256 net) = _collect(tokenIn, amountIn);
        _approveRouter(tokenIn, net);

        amountOut = router.exactInputSingle(
            IAeroSwapRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                tickSpacing: tickSpacing,
                recipient: msg.sender,
                deadline: deadline,
                amountIn: net,
                amountOutMinimum: minAmountOut,
                sqrtPriceLimitX96: 0
            })
        );

        _approveRouter(tokenIn, 0);
        emit Swapped(msg.sender, tokenIn, tokenOut, amountIn, fee, amountOut);
    }

    /// @notice Multi-hop swap. `path` = tokenA | int24 tickSpacing | tokenB | int24 | tokenC ...
    ///         (packed, 20 + 23n bytes). `amountIn` is the GROSS amount (fee included).
    function swapPath(bytes calldata path, uint256 amountIn, uint256 minAmountOut, uint256 deadline)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        require(path.length >= 43 && (path.length - 20) % 23 == 0, "BAD_PATH");
        address tokenIn = address(bytes20(path[0:20]));
        address tokenOut = address(bytes20(path[path.length - 20:path.length]));

        (uint256 fee, uint256 net) = _collect(tokenIn, amountIn);
        _approveRouter(tokenIn, net);

        amountOut = router.exactInput(
            IAeroSwapRouter.ExactInputParams({
                path: path,
                recipient: msg.sender,
                deadline: deadline,
                amountIn: net,
                amountOutMinimum: minAmountOut
            })
        );

        _approveRouter(tokenIn, 0);
        emit Swapped(msg.sender, tokenIn, tokenOut, amountIn, fee, amountOut);
    }

    // ─── Admin ──────────────────────────────────────────────────────────────

    function setTreasury(address treasury_) external onlyOwner {
        require(treasury_ != address(0), "ZERO_ADDRESS");
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setFeeBps(uint256 feeBps_) external onlyOwner {
        require(feeBps_ <= MAX_FEE_BPS, "FEE_TOO_HIGH");
        feeBps = feeBps_;
        emit FeeUpdated(feeBps_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ZERO_ADDRESS");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Recover tokens that were sent to this contract by mistake.
    function rescueToken(address token, address to, uint256 amount) external onlyOwner {
        _safeTransfer(token, to, amount);
    }

    // ─── Internals ──────────────────────────────────────────────────────────

    function _collect(address tokenIn, uint256 amountIn) internal returns (uint256 fee, uint256 net) {
        require(amountIn > 0, "ZERO_AMOUNT");
        fee = (amountIn * feeBps) / BPS;
        net = amountIn - fee;

        _safeTransferFrom(tokenIn, msg.sender, address(this), amountIn);
        if (fee > 0) _safeTransfer(tokenIn, treasury, fee);
    }

    function _approveRouter(address token, uint256 amount) internal {
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20Like.approve.selector, address(router), amount));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "APPROVE_FAILED");
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(IERC20Like.transfer.selector, to, amount));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "TRANSFER_FAILED");
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20Like.transferFrom.selector, from, to, amount));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "TRANSFER_FROM_FAILED");
    }
}
