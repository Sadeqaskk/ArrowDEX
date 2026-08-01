// Tracks whichever wallet provider is actually connected (MetaMask, Rabby,
// WalletConnect, etc.) so every part of the app sends transactions through
// the right one — not always window.ethereum.
let _activeProvider = null;

export function setActiveProvider(provider) {
  _activeProvider = provider;
}

export function getActiveProvider() {
  if (_activeProvider) return _activeProvider;
  if (typeof window !== 'undefined' && window.ethereum) return window.ethereum; // fallback for pages loaded before connect
  return null;
}

export function clearActiveProvider() {
  _activeProvider = null;
}