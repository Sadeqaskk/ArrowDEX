'use client';

import Sidebar from './Sidebar';
import Topbar from './Topbar';
import MobileTabBar from './MobileTabBar';

export default function AppShell({ children }) {
  return (
    <div className="flex flex-col md:grid md:grid-cols-[88px_1fr] min-h-screen">
      <Sidebar />
      <main
        className="px-4 sm:px-6 md:px-12 pt-5 md:pt-9 pb-[calc(84px+env(safe-area-inset-bottom))] md:pb-[70px] max-w-[1440px] w-full"
      >
        <Topbar />
        {children}
      </main>
      <MobileTabBar />
    </div>
  );
}