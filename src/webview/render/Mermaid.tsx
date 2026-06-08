// 渲染 Mermaid 图：从 CDN 动态加载 mermaid（保持插件体积小），失败时回退显示源码。
import React, { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    mermaid?: any;
  }
}

let loaderPromise: Promise<any> | null = null;

/** 动态加载 mermaid（仅加载一次）。 */
function loadMermaid(): Promise<any> {
  if (window.mermaid) {
    return Promise.resolve(window.mermaid);
  }
  if (loaderPromise) {
    return loaderPromise;
  }
  loaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
    script.onload = () => {
      if (window.mermaid) {
        window.mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' });
        resolve(window.mermaid);
      } else {
        reject(new Error('mermaid 加载失败'));
      }
    };
    script.onerror = () => reject(new Error('无法从 CDN 加载 mermaid'));
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
    loadMermaid()
      .then(async (mermaid) => {
        if (cancelled || !ref.current) {
          return;
        }
        const id = `mmd-${renderSeq++}`;
        try {
          const { svg } = await mermaid.render(id, code);
          if (!cancelled && ref.current) {
            ref.current.innerHTML = svg;
          }
        } catch (e: any) {
          if (!cancelled) {
            setError(e?.message ?? '渲染失败');
          }
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e?.message ?? '加载失败');
        }
      });
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
