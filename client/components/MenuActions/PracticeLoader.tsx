// 同类练习一键跳转。
import React from 'react';
import { MarkdownView } from '../../render/MarkdownView';
import { usePolyaStore } from '../../store';

export const PracticeLoader: React.FC<{ problem: string; intro?: string }> = ({
  problem,
  intro,
}) => {
  const setInputProblem = usePolyaStore((s) => s.setInputProblem);
  const submitProblem = usePolyaStore((s) => s.submitProblem);
  const setInputCollapsed = usePolyaStore((s) => s.setInputCollapsed);

  return (
    <div className="practice-loader">
      {intro && <MarkdownView content={intro} />}
      <div className="practice-problem">
        <strong>练习题：</strong>
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
        开始练习
      </button>
    </div>
  );
};
