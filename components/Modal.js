'use client';

import { useState, useRef } from 'react';

const DISMISS_THRESHOLD = 120; // px of downward drag before a swipe counts as "close"

export default function Modal({ open, onClose, closeable = true, children }) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startYRef = useRef(0);

  if (!open) return null;

  function handleTouchStart(e) {
    if (!closeable) return;
    startYRef.current = e.touches[0].clientY;
    setDragging(true);
  }

  function handleTouchMove(e) {
    if (!dragging) return;
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta > 0) setDragY(delta);
  }

  function handleTouchEnd() {
    if (!dragging) return;
    setDragging(false);
    if (dragY > DISMISS_THRESHOLD) {
      onClose();
    }
    setDragY(0);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={closeable ? onClose : undefined}
      />
      <div
        className={`relative glass hero-ring w-full sm:max-w-[480px] p-6 sm:p-8 max-h-[88vh] sm:max-h-[85vh] overflow-y-auto rounded-t-[28px] sm:rounded-[24px] rounded-b-none sm:rounded-b-[24px] pt-3 sm:pt-8 ${
          dragging ? '' : 'transition-transform duration-200 ease-out'
        }`}
        style={{
          transform: `translateY(${dragY}px)`,
          paddingBottom: 'max(env(safe-area-inset-bottom), 1.5rem)',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle — mobile only, signals "swipe down to close" the way
            every native iOS/Android sheet does */}
        {closeable && (
          <div className="sm:hidden flex justify-center pb-4 -mt-1 touch-none">
            <span className="w-9 h-1.5 rounded-full bg-white/15" />
          </div>
        )}

        {closeable && (
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-dim hover:text-ivory transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        )}
        {children}
      </div>
    </div>
  );
}