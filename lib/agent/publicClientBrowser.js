// lib/agent/publicClientBrowser.js
// Client-safe read client — separate from lib/agent/priceServer.ts's
// server-only publicClient, since ARC_RPC_URL (no NEXT_PUBLIC_ prefix) is
// undefined in the browser.
import { createPublicClient, http } from "viem";

let _client;

// FIXED: this used to build the client as a top-level export, which calls
// viem's createPublicClient() at MODULE IMPORT TIME. viem's http()
// transport throws UrlRequiredError immediately if the URL is undefined —
// not lazily on first request. Because this file is imported transitively
// by agent/page.jsx (page.jsx -> useAgentChat.js -> executeAction.js ->
// this file), a missing or stale NEXT_PUBLIC_ARC_RPC_URL crashed on import
// and, with no error boundary around the route, rendered a blank page
// instead of an error message.
//
// Building it lazily means: if the env var is missing, only the specific
// action that actually needs an on-chain read throws — the page itself
// still renders, and you get a real error message instead of a blank screen.
export function getBrowserPublicClient() {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_ARC_RPC_URL;
    if (!url) {
      throw new Error(
        "NEXT_PUBLIC_ARC_RPC_URL is not set. Add it to .env.local (and to your Vercel project's env vars for deployed builds), then restart `next dev` — Next.js inlines NEXT_PUBLIC_ vars into the client bundle at build time, so a running dev server won't pick up a var you just added."
      );
    }
    _client = createPublicClient({ transport: http(url) });
  }
  return _client;
}