'use client';

import { useState, useEffect } from 'react';

function detectLegacyProviderName(provider) {
  if (provider.isRabby) return 'Rabby Wallet';
  if (provider.isMetaMask) return 'MetaMask';
  if (provider.isCoinbaseWallet) return 'Coinbase Wallet';
  return 'Browser Wallet';
}

/**
 * Detects every injected wallet extension via EIP-6963 (the real standard
 * MetaMask, Rabby, Coinbase Wallet, and others use to announce themselves
 * without overwriting window.ethereum). Falls back to a single legacy
 * window.ethereum entry if no EIP-6963 announcements arrive — covers older
 * wallet versions that don't support the standard yet.
 */
export function useInjectedWallets() {
  const [wallets, setWallets] = useState([]);

  useEffect(() => {
    function onAnnounce(event) {
      setWallets((prev) => {
        if (prev.some((w) => w.info.uuid === event.detail.info.uuid)) return prev;
        return [...prev, event.detail];
      });
    }

    window.addEventListener('eip6963:announceProvider', onAnnounce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    const legacyFallbackTimer = setTimeout(() => {
      setWallets((prev) => {
        if (prev.length > 0 || !window.ethereum) return prev;
        return [{
          info: { uuid: 'legacy', name: detectLegacyProviderName(window.ethereum), icon: null, rdns: 'legacy' },
          provider: window.ethereum,
        }];
      });
    }, 300);

    return () => {
      window.removeEventListener('eip6963:announceProvider', onAnnounce);
      clearTimeout(legacyFallbackTimer);
    };
  }, []);

  return wallets;
}