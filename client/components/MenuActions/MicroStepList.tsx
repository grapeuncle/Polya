// 可点击代数微步骤列表。
import React, { useState } from 'react';
import { MicroStep } from '../../../shared/types';
import { MarkdownView } from '../../render/MarkdownView';
import { usePolyaStore } from '../../store';

export const MicroStepList: React.FC<{
  steps: MicroStep[];
  intro?: string;
  stepId: string;
}> = ({ steps, intro, stepId }) => {
  const [openId, setOpenId] = useState<string | null>(steps[0]?.id ?? null);
  const setPendingAsk = usePolyaStore((s) => s.setPendingAsk);
  const selectStep = usePolyaStore((s) => s.selectStep);

  return (
    <div className="micro-step-list">
      {intro && <MarkdownView content={intro} />}
      <ol className="micro-steps">
        {steps.map((m, i) => (
          <li key={m.id} className={openId === m.id ? 'open' : ''}>
            <button
              className="micro-step-head"
              onClick={() => {
                setOpenId(openId === m.id ? null : m.id);
                selectStep(stepId);
              }}
            >
              <span className="micro-index">{i + 1}</span>
              <span className="micro-label">{m.label}</span>
              {m.op && <span className="micro-op">{m.op}</span>}
            </button>
            {openId === m.id && (
              <div className="micro-step-body">
                <MarkdownView content={m.content} />
                <button
                  className="link-btn"
                  onClick={() => setPendingAsk(stepId, `关于「${m.label}」这一步：`)}
                >
                  追问此操作
                </button>
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
};
