'use client';

import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { createWalletClient, custom } from 'viem';
import { getChainByChainId } from './chains';
import { setActiveProvider, clearActiveProvider } from './activeProvider';
import { getWalletConnectProvider, resetWalletConnectProvider } from './walletconnect';
import { useInjectedWallets } from './eip6963';
import WalletModal from '../components/WalletModal';

const WalletContext = createContext(null);
const NETWORK_MODE_KEY = 'arrowdex:networkMode';

export function WalletProvider({ children }) {
  const [address, setAddress] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [walletName, setWalletName] = useState(null);
  const [providerRef, setProviderRef] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState(null);

  // Which chain set the app is browsing — 'testnet' (default) or 'mainnet'.
  // This is independent of what network the connected wallet happens to be
  // on; it just decides which CHAINS list the dashboard/swap/bridge pages
  // read from. Persisted so a refresh doesn't silently drop you back to
  // testnet mid-session.
  const [networkMode, setNetworkModeState] = useState('testnet');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(NETWORK_MODE_KEY);
      if (saved === 'testnet' || saved === 'mainnet') setNetworkModeState(saved);
    } catch { /* localStorage unavailable — default to testnet */ }
  }, []);

  const setNetworkMode = useCallback((mode) => {
    if (mode !== 'testnet' && mode !== 'mainnet') return;
    setNetworkModeState(mode);
    try {
      window.localStorage.setItem(NETWORK_MODE_KEY, mode);
    } catch { /* storage full/unavailable — mode just won't persist */ }
  }, []);

  const injectedWallets = useInjectedWallets();

  const bindProviderEvents = useCallback((provider) => {
    function handleAccountsChanged(accounts) {
      setAddress(accounts.length > 0 ? accounts[0] : null);
    }
    function handleChainChanged(idRaw) {
      const id = typeof idRaw === 'string' && idRaw.startsWith('0x') ? parseInt(idRaw, 16) : Number(idRaw);
      setChainId(id);
    }
    provider.on?.('accountsChanged', handleAccountsChanged);
    provider.on?.('chainChanged', handleChainChanged);
  }, []);

  const connectInjected = useCallback(async (walletDetail) => {
    setConnecting(true);
    setConnectError(null);
    try {
      const provider = walletDetail.provider;
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      const hexChainId = await provider.request({ method: 'eth_chainId' });

      setActiveProvider(provider);
      setProviderRef(provider);
      setAddress(accounts[0]);
      setChainId(parseInt(hexChainId, 16));
      setWalletName(walletDetail.info.name);
      bindProviderEvents(provider);
      setModalOpen(false);
    } catch (err) {
      console.error('Injected wallet connection failed:', err);
      setConnectError(err.message || 'Connection rejected.');
    } finally {
      setConnecting(false);
    }
  }, [bindProviderEvents]);

  const connectWalletConnect = useCallback(async () => {
    setConnecting(true);
    setConnectError(null);
    try {
      const provider = await getWalletConnectProvider();
      await provider.connect();

      setActiveProvider(provider);
      setProviderRef(provider);
      setAddress(provider.accounts[0]);
      setChainId(provider.chainId);
      setWalletName('WalletConnect');
      bindProviderEvents(provider);
      setModalOpen(false);
    } catch (err) {
      console.error('WalletConnect connection failed:', err);
      setConnectError(err.message || 'WalletConnect connection failed.');
    } finally {
      setConnecting(false);
    }
  }, [bindProviderEvents]);

  const disconnect = useCallback(async () => {
    try {
      if (walletName === 'WalletConnect' && providerRef?.disconnect) {
        await providerRef.disconnect();
        resetWalletConnectProvider();
      }
    } catch (err) {
      console.error('Error during disconnect:', err);
    }
    clearActiveProvider();
    setProviderRef(null);
    setAddress(null);
    setChainId(null);
    setWalletName(null);
  }, [walletName, providerRef]);

  const currentChain = chainId ? getChainByChainId(chainId) : null;

  // True when the wallet is connected to a live chain that belongs to the
  // OTHER mode than the one the app is currently browsing (e.g. app is set
  // to testnet, wallet is actually on Ethereum mainnet). Pages can use this
  // to warn before submitting a transaction on the wrong network.
  const chainModeMismatch = !!(currentChain && currentChain.mode !== networkMode);

  const walletClient = useMemo(() => {
    if (!providerRef || !address) return null;
    return createWalletClient({
      account: address,
      transport: custom(providerRef),
    });
  }, [providerRef, address]);

  const value = {
    address,
    chainId,
    isConnected: !!address,
    currentChain,
    network: currentChain ? currentChain.name : chainId ? `Unknown chain (${chainId})` : 'Not connected',
    walletName,
    walletClient,
    networkMode,
    setNetworkMode,
    chainModeMismatch,
    connect: () => { setConnectError(null); setModalOpen(true); },
    disconnect,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
      <WalletModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        injectedWallets={injectedWallets}
        onSelectInjected={connectInjected}
        onSelectWalletConnect={connectWalletConnect}
        connecting={connecting}
        error={connectError}
      />
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return ctx;
}