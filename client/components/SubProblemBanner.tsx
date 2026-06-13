// 子问题分组横幅：在多子问题场景中，作为步骤分组的分隔标识。
import React from 'react';
import { MarkdownView } from '../render/MarkdownView';

export interface SubProblemBannerProps {
  index: number;
  label: string;
  text: string;
  status: 'pending' | 'solving' | 'done';
}

export const SubProblemBanner: React.FC<SubProblemBannerProps> = ({ index, label, text, status }) => {
  const statusClass =
    status === 'solving' ? 'sub-problem-solving' : status === 'done' ? 'sub-problem-done' : '';

  return (
    <div className={`sub-problem-banner ${statusClass}`} id={`sub-banner-${index}`}>
      <div className="sub-problem-banner-head">
        <span className="sub-problem-banner-label">
          {status === 'solving' && <span className="spinner sub-problem-spinner" />}
          {status === 'done' && <span className="codicon codicon-check" />}
          子问题 {label}
        </span>
      </div>
      <div className="sub-problem-banner-text">
        <MarkdownView content={text} />
      </div>
    </div>
  );
};
