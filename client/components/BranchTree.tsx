// 解法分支 Tab 切换 + 沿分支继续。
import React from 'react';
import { usePolyaStore } from '../store';

export const BranchTree: React.FC = () => {
  const branches = usePolyaStore((s) => s.branches);
  const activeBranchId = usePolyaStore((s) => s.activeBranchId);
  const setActiveBranch = usePolyaStore((s) => s.setActiveBranch);
  const continueBranch = usePolyaStore((s) => s.continueBranch);

  if (branches.length === 0) {
    return null;
  }

  return (
    <div className="branch-tree">
      <span className="branch-label">解法路径：</span>
      <button
        className={`branch-tab ${activeBranchId === null ? 'active' : ''}`}
        onClick={() => setActiveBranch(null)}
      >
        主路径
      </button>
      {branches.map((b) => (
        <button
          key={b.id}
          className={`branch-tab ${activeBranchId === b.id ? 'active' : ''}`}
          onClick={() => setActiveBranch(b.id)}
          title={`从步骤 ${b.parentStepId} 分叉`}
        >
          {b.label}
        </button>
      ))}
      {activeBranchId && (
        <button
          className="link-btn branch-continue"
          onClick={() => continueBranch(activeBranchId)}
        >
          <span className="codicon codicon-debug-continue" /> 沿此分支继续
        </button>
      )}
    </div>
  );
};
