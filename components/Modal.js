'use client';

export default function Modal({ open, onClose, closeable = true, children }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={closeable ? onClose : undefined}
      />
      <div className="relative glass hero-ring w-full max-w-[480px] p-8 max-h-[85vh] overflow-y-auto">
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
