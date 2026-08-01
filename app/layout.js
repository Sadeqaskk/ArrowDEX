import '../styles/globals.css';
import { WalletProvider } from '../lib/WalletContext';

export const metadata = {
  title: 'Arrow DEX — Cross-Chain Exchange',
  description: 'Swap, bridge, and stake USDC across ARC Testnet, Ethereum Sepolia, and Base Sepolia.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
