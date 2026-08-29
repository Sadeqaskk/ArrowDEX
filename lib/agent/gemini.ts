// lib/agent/gemini.ts
// Server-only. Uses GEMINI_API_KEY — never expose this to the client.

const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export const AGENT_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "swap",
        description: "Swap one token for another on ArrowDEX.",
        parameters: {
          type: "object",
          properties: {
            fromToken: { type: "string", enum: ["USDC", "EURC", "cirBTC", "WUSDC", "ARROW"] },
            toToken: { type: "string", enum: ["USDC", "EURC", "cirBTC", "WUSDC", "ARROW"] },
            amount: { type: "string", description: "Human-readable amount, e.g. '100'" },
          },
          required: ["fromToken", "toToken", "amount"],
        },
      },
      {
        name: "bridge",
        description: "Bridge USDC between chains via Circle CCTP.",
        parameters: {
          type: "object",
          properties: {
            fromChain: { type: "string", enum: ["Arc", "Ethereum Sepolia", "Base Sepolia"] },
            // FIXED: was an unconstrained string — Gemini could return any
            // text here. Now matches fromChain's enum so the model's own
            // output is reliable, on top of route.ts's SUPPORTED_BRIDGE_CHAINS check.
            toChain: { type: "string", enum: ["Arc", "Ethereum Sepolia", "Base Sepolia"] },
            amount: { type: "string" },
          },
          required: ["fromChain", "toChain", "amount"],
        },
      },
      {
        name: "getPrice",
        description: "Get the current price for a trading pair.",
        parameters: {
          type: "object",
          properties: { pair: { type: "string", enum: ["WUSDC/ARROW", "USDC/EURC", "USDC/cirBTC"] } },
          required: ["pair"],
        },
      },
      {
        name: "addLiquidity",
        description: "Add liquidity to a pool.",
        parameters: {
          type: "object",
          properties: {
            pair: { type: "string", enum: ["WUSDC/ARROW", "USDC/EURC"] },
            amountA: { type: "string" },
            amountB: { type: "string" },
          },
          required: ["pair", "amountA", "amountB"],
        },
      },
      {
        name: "removeLiquidity",
        description: "Remove liquidity from a pool.",
        parameters: {
          type: "object",
          properties: {
            pair: { type: "string", enum: ["WUSDC/ARROW", "USDC/EURC"] },
            amount: { type: "string", description: "LP token amount to remove" },
          },
          required: ["pair", "amount"],
        },
      },
      {
        name: "vaultAction",
        description: "Stake into, withdraw from, or exit the vault.",
        parameters: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["stake", "withdraw", "exit"] },
            amount: { type: "string", description: "Required for stake/withdraw, omit for exit" },
          },
          required: ["action"],
        },
      },
      {
        name: "getActivity",
        description: "Get the user's activity/transactions on a given date.",
        parameters: {
          type: "object",
          properties: { date: { type: "string", description: "ISO date, e.g. 2026-08-27" } },
          required: ["date"],
        },
      },
      {
        name: "getDocs",
        description: "User wants the ArrowDEX documentation link.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "getLeaderboardPosition",
        description: "Get the user's own rank, volume, and fees paid.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "getTotalVolume",
        description: "Get ArrowDEX's current total/24h trading volume.",
        parameters: { type: "object", properties: {} },
      },
    ],
  },
];

export async function callGemini(userMessage: string, history: { role: string; text: string }[] = []) {
  const contents = [
    ...history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
    { role: "user", parts: [{ text: userMessage }] },
  ];

  const res = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      tools: AGENT_TOOLS,
      toolConfig: { functionCallingConfig: { mode: "AUTO" } },
      systemInstruction: {
        // FIXED: the old instruction told the model to "call the tool
        // anyway" and then, one sentence later, "do NOT call a tool" for
        // the exact same case — genuinely contradictory. route.ts already
        // guards every unsupported combo itself (cirBTC, non-Arc/Sepolia
        // bridge chains, USDC/cirBTC chart) and returns a clean "coming
        // soon" reply, so the model doesn't need to gate anything — it can
        // always call the tool that matches user intent and let the
        // backend decide what's actually supported.
        parts: [{
          text: `You are the ArrowDEX AI agent. Route the user's request to the correct tool whenever it matches one of the available functions — including requests for unsupported tokens, chains, or pairs (e.g. cirBTC, bridge chains outside Arc/Ethereum Sepolia/Base Sepolia). The backend already handles unsupported combinations and will reply with a "coming soon" message, so you should never withhold a tool call on that basis.
If the request doesn't match any tool (general question, advice, "what do you recommend"), answer directly in plain text as a knowledgeable DeFi assistant — do not call a tool.`,
        }],
      },
    }),
  });

  if (!res.ok) throw new Error(`Gemini API error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];

  const functionCall = parts.find((p: any) => p.functionCall)?.functionCall;
  const text = parts.find((p: any) => p.text)?.text;

  return { functionCall, text };
}