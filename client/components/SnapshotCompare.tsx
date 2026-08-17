// 快照与当前状态轻量对比。
import React from 'react';
import { usePolyaStore } from '../store';

export const SnapshotCompare: React.FC = () => {
  const compareId = usePolyaStore((s) => s.compareSnapshotId);
  const setCompare = usePolyaStore((s) => s.setCompareSnapshot);
  const snapshots = usePolyaStore((s) => s.snapshots);
  const steps = usePolyaStore((s) => s.steps);
  const problem = usePolyaStore((s) => s.problem);
  const solution = usePolyaStore((s) => s.solution);

  if (!compareId) {
    return null;
  }
  const snap = snapshots.find((s) => s.id === compareId);
  if (!snap) {
    return null;
  }

  return (
    <div className="snapshot-compare">
      <div className="sc-head">
        <span>与快照对比：{snap.label}</span>
        <button className="icon-btn" onClick={() => setCompare(null)}>
          <span className="codicon codicon-close" />
        </button>
      </div>
      <div className="sc-grid">
        <div className="sc-col">
          <div className="sc-title">快照（{new Date(snap.time).toLocaleTimeString('zh-CN')}）</div>
          <div className="sc-body">
            <div>步骤数：{snap.steps.length}</div>
            <div>结果数：{snap.results.length}</div>
            <ul>
              {snap.steps.slice(0, 6).map((st) => (
                <li key={st.id}>{st.content.slice(0, 48)}…</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="sc-col">
          <div className="sc-title">当前</div>
          <div className="sc-body">
            <div>题目：{problem.slice(0, 40)}</div>
            <div>步骤数：{steps.length}</div>
            {solution?.finalAnswer && <div>答案：{solution.finalAnswer}</div>}
            <ul>
              {steps.slice(0, 6).map((st) => (
                <li key={st.id}>{st.content.slice(0, 48)}…</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
