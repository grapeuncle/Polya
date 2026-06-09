// 推广变式题一键加载。
import React from 'react';
import { MarkdownView } from '../../render/MarkdownView';
import { usePolyaStore } from '../../store';

export const VariantLoader: React.FC<{
  problem: string;
  note?: string;
  intro?: string;
}> = ({ problem, note, intro }) => {
  const setInputProblem = usePolyaStore((s) => s.setInputProblem);
  const submitProblem = usePolyaStore((s) => s.submitProblem);
  const setInputCollapsed = usePolyaStore((s) => s.setInputCollapsed);

  return (
    <div className="variant-loader">
      {intro && <MarkdownView content={intro} />}
      {note && (
        <div className="variant-note">
          <strong>相对原题：</strong>
          {note}
        </div>
      )}
      <div className="variant-problem">
        <strong>变式题：</strong>
        {problem}
      </div>
      <button
        className="primary"
        onClick={() => {
          setInputProblem(problem);
          setInputCollapsed(false);
          submitProblem(problem);
        }}
      >
        加载变式题
      </button>
    </div>
  );
};
