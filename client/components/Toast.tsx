// 轻量 Toast 提示（替代 VS Code showInformationMessage）。
import React, { useEffect, useState } from 'react';

interface ToastState {
  type: 'info' | 'error';
  message: string;
}

export const Toast: React.FC = () => {
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ToastState>).detail;
      if (detail?.message) {
        setToast(detail);
      }
    };
    window.addEventListener('polya-toast', handler);
    return () => window.removeEventListener('polya-toast', handler);
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) {
    return null;
  }

  return (
    <div className={`polya-toast polya-toast-${toast.type}`} role="status">
      {toast.message}
    </div>
  );
};
