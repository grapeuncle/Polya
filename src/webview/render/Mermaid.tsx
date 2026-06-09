// 渲染 Mermaid 图：优先使用 Panel 注入的本地脚本，CDN 作 fallback。
import React, { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    mermaid?: {
      initialize: (cfg: object) => void;
      render: (id: string, code: string) => Promise<{ svg: string }>;
    };
  }
}

let loaderPromise: Promise<void> | null = null;

function loadMermaid(): Promise<void> {
  if (window.mermaid) {
    window.mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });
    return Promise.resolve();
  }
  if (loaderPromise) {
    return loaderPromise;
  }
  loaderPromise = new Promise((resolve, reject) => {
    const waitForInjected = () => {
      if (window.mermaid) {
        window.mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });
        resolve();
        return true;
      }
      return false;
    };
    if (waitForInjected()) {
      return;
    }
    const existing = document.querySelector('script[data-polya-mermaid]');
    if (existing) {
      existing.addEventListener('load', () => waitForInjected() || resolve());
      existing.addEventListener('error', () => reject(new Error('mermaid 加载失败')));
      setTimeout(() => waitForInjected() || undefined, 300);
      return;
    }
    const script = document.createElement('script');
    script.dataset.polyaMermaid = '1';
    script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
    script.onload = () => {
      if (window.mermaid) {
        window.mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });
        resolve();
      } else {
        reject(new Error('mermaid 未就绪'));
      }
    };
    script.onerror = () => reject(new Error('无法加载 mermaid'));
    document.head.appendChild(script);
  });
  return loaderPromise;
}

let renderSeq = 0;

export const Mermaid: React.FC<{ code: string }> = ({ code }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        await loadMermaid();
        if (cancelled || !ref.current || !window.mermaid) {
          return;
        }
        const id = `mmd-${renderSeq++}`;
        const { svg } = await window.mermaid.render(id, code);
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '渲染失败');
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <div className="mermaid-fallback">
        <div className="mermaid-error">图形渲染失败（{error}），以下为源码：</div>
        <pre>{code}</pre>
      </div>
    );
  }
  return <div className="mermaid-container" ref={ref} />;
};
