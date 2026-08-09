'use client';

import { useState, useEffect, useCallback } from 'react';

// Fetch + parse JSON, but don't choke on an HTML error page (e.g. Next.js dev's
// 500 overlay) — surface the real status/text instead of a cryptic
// "Unexpected token '<'" that hides what actually broke.
async function fetchJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Server returned non-JSON (status ${res.status}) — check the terminal for the real error`);
  }
  if (!res.ok) throw new Error(json?.error || `Request failed (status ${res.status})`);
  return json;
}

export const CATEGORIES = [
  { key: 'overall', label: 'Overall' },
  { key: 'swap_bridge', label: 'Swap & Bridge' },
  { key: 'pool', label: 'Liquidity Pool' },
  { key: 'vault', label: 'Vault' },
];

export function useLeaderboardTop(category, limit = 50) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTop = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await fetchJson(`/api/leaderboard/top?category=${category}&limit=${limit}`);
      setRows(json.results || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [category, limit]);

  useEffect(() => {
    fetchTop();
  }, [fetchTop]);

  return { rows, loading, error, refetch: fetchTop };
}

export function useLeaderboardOverview() {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const json = await fetchJson('/api/leaderboard/overview');
        const row = Array.isArray(json) ? json[0] : json;
        if (!cancelled) setOverview(row || null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { overview, loading, error };
}

export function useWalletStats(address) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!address) {
      setStats(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const json = await fetchJson(`/api/leaderboard/wallet/${address}`);
        if (!cancelled) setStats(json);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  return { stats, loading, error };
}