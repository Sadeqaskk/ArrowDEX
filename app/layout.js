import '../styles/globals.css';
import { WalletProvider } from '../lib/WalletContext';
import { NotificationProvider } from '../components/NotificationProvider';
import { DesktopModeProvider } from '../components/DesktopModeContext';

export const metadata = {
  title: 'Arrow DEX — Cross-Chain Exchange',
  description: 'Swap, bridge,Vult and Factory,Chart and stake USDC across ARC Testnet, Ethereum Sepolia, and Base Sepolia.',
  icons: {
    icon: '/fonts/tokens/arrow.png',
    shortcut: '/fonts/tokens/arrow.png',
    apple: '/fonts/tokens/arrow.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <DesktopModeProvider>
          <WalletProvider>
            <NotificationProvider>{children}</NotificationProvider>
          </WalletProvider>
        </DesktopModeProvider>
      </body>
    </html>
  );
}