// Central place to define selectable networks.
// Add a new network here and it shows up in the NetworkSelector automatically.
// `mode` maps each entry to a CHAINS_BY_MODE key in ./chains.js.

export const NETWORKS = [
  {
    id: 'arc-testnet',
    mode: 'testnet',
    label: 'Arc Testnet',
    tag: 'Live',
    disabled: false,
  },
  {
    id: 'arc-mainnet',
    mode: 'mainnet',
    label: 'Arc Mainnet',
    tag: 'Live',
    disabled: false,
  },
];