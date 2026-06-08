// 渲染单条动作结果（解释、验算、对比、可视化等），支持流式打字效果与关闭。
import React from 'react';
import { ActionResult, usePolyaStore } from '../store';
import { MarkdownView } from '../render/MarkdownView';

export const ResultCard: React.FC<{ result: ActionResult }> = ({ result }) => {
  const dismiss = usePolyaStore((s) => s.dismissResult);
  const kind = result.meta?.kind ?? 'text';

  return (
    <div className={`result-card kind-${kind} status-${result.status}`}>
      <div className="result-head">
        <span className="result-title">
          {result.meta?.title ?? result.title}
          {result.status === 'streaming' && <span className="typing-dot" />}
        </span>
        <button className="icon-btn" title="关闭" onClick={() => dismiss(result.requestId)}>
          <span className="codicon codicon-close" />
        </button>
      </div>
      <div className="result-body">
        {result.status === 'error' ? (
          <div className="result-error">
            <span className="codicon codicon-warning" /> {result.content || '请求失败'}
          </div>
        ) : result.content ? (
          <MarkdownView content={result.content} />
        ) : (
          <div className="result-loading">正在生成…</div>
        )}
      </div>
    </div>
  );
};
