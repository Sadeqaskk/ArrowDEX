'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import { getChainByChainId } from './chains';
import { setActiveProvider, clearActiveProvider } from './activeProvider';
import { getWalletConnectProvider, resetWalletConnectProvider } from './walletconnect';
import { useInjectedWallets } from './eip6963';
import WalletModal from '../components/WalletModal';

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const [address, setAddress] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [walletName, setWalletName] = useState(null);
  const [providerRef, setProviderRef] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState(null);

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

  const value = {
    address,
    chainId,
    isConnected: !!address,
    currentChain,
    network: currentChain ? currentChain.name : chainId ? `Unknown chain (${chainId})` : 'Not connected',
    walletName,
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