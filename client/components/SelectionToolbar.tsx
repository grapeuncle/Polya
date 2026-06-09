// 划词迷你工具条：解释划选 / 提问划选。
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { calcToolbarPosition } from '../utils/selection';
import { usePolyaStore } from '../store';

export interface SelectionToolbarProps {
  stepId: string;
  selectedText: string;
  anchorRect: DOMRect;
  onClose: () => void;
}

export const SelectionToolbar: React.FC<SelectionToolbarProps> = ({
  stepId,
  selectedText,
  anchorRect,
  onClose,
}) => {
  const runAction = usePolyaStore((s) => s.runAction);
  const selectStep = usePolyaStore((s) => s.selectStep);
  const [askOpen, setAskOpen] = useState(false);
  const [askText, setAskText] = useState('');

  const pos = calcToolbarPosition(anchorRect, askOpen ? 280 : 200, askOpen ? 120 : 36);

  const handleExplain = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectStep(stepId);
    runAction('explain', stepId, undefined, selectedText);
    onClose();
  };

  const handleAskOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    selectStep(stepId);
    setAskOpen(true);
    setAskText(`关于「${selectedText.slice(0, 40)}${selectedText.length > 40 ? '…' : ''}」：`);
  };

  const submitAsk = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (askText.trim()) {
      runAction('ask', stepId, askText.trim(), selectedText);
      onClose();
    }
  };

  const toolbar = (
    <div
      className={`selection-toolbar ${askOpen ? 'selection-toolbar-ask' : ''}`}
      style={{ top: pos.top, left: pos.left }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {!askOpen ? (
        <div className="selection-toolbar-row">
          <button className="selection-btn" title="解释划选片段" onClick={handleExplain}>
            <span className="codicon codicon-comment" aria-hidden="true" />
            解释划选
          </button>
          <button className="selection-btn" title="针对划选片段提问" onClick={handleAskOpen}>
            <span className="codicon codicon-mention" aria-hidden="true" />
            提问划选
          </button>
          <button className="selection-btn selection-btn-close" title="关闭" onClick={onClose}>
            <span className="codicon codicon-close" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="selection-ask-box">
          <textarea
            value={askText}
            autoFocus
            placeholder="输入你对划选片段的疑问…"
            onChange={(e) => setAskText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                submitAsk(e as unknown as React.MouseEvent);
              }
              if (e.key === 'Escape') {
                onClose();
              }
            }}
          />
          <div className="selection-ask-actions">
            <button className="primary" onClick={submitAsk}>
              提问
            </button>
            <button onClick={() => setAskOpen(false)}>返回</button>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(toolbar, document.body);
};
