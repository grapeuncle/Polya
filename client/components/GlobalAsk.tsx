// 全局提问浮动按钮：对整道题提问，结果以全局结果卡片展示。
import React, { useState } from 'react';
import { usePolyaStore } from '../store';

export const GlobalAsk: React.FC = () => {
  const open = usePolyaStore((s) => s.globalAskOpen);
  const setOpen = usePolyaStore((s) => s.setGlobalAskOpen);
  const runGlobalAsk = usePolyaStore((s) => s.runGlobalAsk);
  const hasSolution = usePolyaStore((s) => s.steps.length > 0);
  const threads = usePolyaStore((s) => s.threads['__global__']?.messages ?? []);
  const [text, setText] = useState('');

  if (!hasSolution) {
    return null;
  }

  return (
    <>
      <button
        className="global-ask-fab"
        title="对整道题提问"
        onClick={() => setOpen(!open)}
      >
        <span className="codicon codicon-comment-discussion" />
      </button>
      {open && (
        <div className="global-ask-popup">
          <div className="panel-title">全局提问</div>
          {threads.length > 0 && (
            <details className="thread-history">
              <summary>对话历史（{threads.length}）</summary>
              <ul>
                {threads.slice(-4).map((m, i) => (
                  <li key={i}>
                    <strong>{m.role === 'user' ? '我' : '老师'}：</strong>
                    {m.content.slice(0, 100)}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <textarea
            autoFocus
            placeholder="对整道题有疑问？例如：这道题的核心思想是什么？"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text.trim()) {
                runGlobalAsk(text.trim());
                setText('');
              }
            }}
          />
          <div className="ask-actions">
            <button
              className="primary"
              disabled={!text.trim()}
              onClick={() => {
                runGlobalAsk(text.trim());
                setText('');
              }}
            >
              提问
            </button>
            <button onClick={() => setOpen(false)}>关闭</button>
          </div>
        </div>
      )}
    </>
  );
};
