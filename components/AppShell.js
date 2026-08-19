'use client';

import Sidebar from './Sidebar';
import Topbar from './Topbar';
import MobileTabBar from './MobileTabBar';
import DesktopScaledView from './DesktopScaledView';
import { useDesktopMode } from './DesktopModeContext';

export default function AppShell({ children }) {
  const { forced } = useDesktopMode();

  return (
    <DesktopScaledView active={forced}>
      <div className={`flex flex-col ${forced ? 'grid grid-cols-[88px_1fr]' : 'md:grid md:grid-cols-[88px_1fr]'} min-h-screen`}>
        <Sidebar forceVisible={forced} />
        <main
          className={`px-4 sm:px-6 md:px-12 pt-5 md:pt-9 max-w-[1440px] w-full ${
            forced ? 'pb-9' : 'pb-[calc(84px+env(safe-area-inset-bottom))] md:pb-[70px]'
          }`}
        >
          <Topbar forceDesktop={forced} />
          {children}
        </main>
        {/* The bottom tab bar and the desktop sidebar are two different
            navigation systems for the same screens — never show both. */}
        {!forced && <MobileTabBar />}
      </div>
    </DesktopScaledView>
  );
}