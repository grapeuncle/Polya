// 子问题横向导航栏：在题目横幅下方，按解题进度逐步显示标签。
import React from 'react';
import { usePolyaStore } from '../store';

export const SubProblemNav: React.FC = () => {
  const subProblems = usePolyaStore((s) => s.subProblems);
  const subProblemStatus = usePolyaStore((s) => s.subProblemStatus);
  const selectedSubProblemIndex = usePolyaStore((s) => s.selectedSubProblemIndex);
  const setSelectedSubProblem = usePolyaStore((s) => s.setSelectedSubProblem);

  if (subProblems.length <= 1) {
    return null;
  }

  return (
    <div className="sub-problem-nav">
      <span className="sub-problem-nav-label">子问题：</span>
      <div className="sub-problem-tabs">
        {subProblems.map((sub) => {
          const status = subProblemStatus[sub.index] || 'pending';
          const isSelected = selectedSubProblemIndex === sub.index;
          return (
            <button
              key={sub.index}
              className={`sub-problem-tab ${isSelected ? 'active' : ''} sub-problem-tab-${status}`}
              onClick={() =>
                setSelectedSubProblem(isSelected ? null : sub.index)
              }
              title={sub.text.slice(0, 60)}
            >
              {status === 'solving' && <span className="spinner sub-problem-tab-spinner" />}
              {status === 'done' && <span className="codicon codicon-check sub-problem-tab-check" />}
              {status === 'pending' && (
                <span className="sub-problem-tab-dot" />
              )}
              {sub.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
