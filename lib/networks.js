// Central place to define selectable networks.
// Add a new network here and it shows up in the NetworkSelector automatically.

export const NETWORKS = [
  {
    id: 'arc-testnet',
    label: 'Arc Testnet',
    tag: 'Live',
    disabled: false,
  },
  {
    id: 'arc-mainnet',
    label: 'Arc Mainnet',
    tag: 'Soon',
    disabled: true, // flip to false once mainnet actually launches
  },
];