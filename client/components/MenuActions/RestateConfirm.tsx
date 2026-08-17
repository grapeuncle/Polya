// 重述确认交互。
import React from 'react';
import { MarkdownView } from '../../render/MarkdownView';
import { usePolyaStore } from '../../store';

export const RestateConfirm: React.FC<{ content: string; stepId: string }> = ({
  content,
  stepId,
}) => {
  const setPendingAsk = usePolyaStore((s) => s.setPendingAsk);
  const setRestateConfirmed = usePolyaStore((s) => s.setRestateConfirmed);
  const confirmed = usePolyaStore((s) => s.restateConfirmed);

  return (
    <div className="restate-confirm">
      <MarkdownView content={content} />
      {confirmed ? (
        <div className="restate-done">
          <span className="codicon codicon-check" /> 已确认理解一致
        </div>
      ) : (
        <div className="restate-actions">
          <button className="primary" onClick={() => setRestateConfirmed(true)}>
            理解一致
          </button>
          <button onClick={() => setPendingAsk(stepId, '我对题目理解还有疑问：')}>
            仍有疑问
          </button>
        </div>
      )}
    </div>
  );
};
