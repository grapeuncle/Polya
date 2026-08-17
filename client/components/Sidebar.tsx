// 侧边栏：难度调节、疑难步骤、学习要点、操作历史与撤销。
import React from 'react';
import { DIFFICULTY_LABEL, Difficulty } from '../../shared/types';
import { findStep, usePolyaStore } from '../store';

const DIFFS: Difficulty[] = ['concise', 'standard', 'detailed'];

export const Sidebar: React.FC = () => {
  const difficulty = usePolyaStore((s) => s.difficulty);
  const setDifficulty = usePolyaStore((s) => s.setDifficulty);
  const flagged = usePolyaStore((s) => s.flagged);
  const learnings = usePolyaStore((s) => s.learnings);
  const steps = usePolyaStore((s) => s.steps);
  const history = usePolyaStore((s) => s.history);
  const undoLast = usePolyaStore((s) => s.undoLast);
  const selectStep = usePolyaStore((s) => s.selectStep);
  const engineId = usePolyaStore((s) => s.engineId);
  const snapshots = usePolyaStore((s) => s.snapshots);
  const setCompareSnapshot = usePolyaStore((s) => s.setCompareSnapshot);
  const restateConfirmed = usePolyaStore((s) => s.restateConfirmed);

  return (
    <aside className="sidebar">
      <section className="side-section">
        <div className="side-title">难度调节</div>
        <input
          type="range"
          min={0}
          max={2}
          step={1}
          value={DIFFS.indexOf(difficulty)}
          onChange={(e) => setDifficulty(DIFFS[Number(e.target.value)])}
        />
        <div className="diff-labels">
          {DIFFS.map((d) => (
            <span key={d} className={d === difficulty ? 'active' : ''}>
              {DIFFICULTY_LABEL[d]}
            </span>
          ))}
        </div>
        <div className="engine-tag">引擎：{engineId}</div>
        {restateConfirmed && (
          <div className="side-hint ok">
            <span className="codicon codicon-check" /> 已确认理解题目
          </div>
        )}
      </section>

      <section className="side-section">
        <div className="side-title">疑难步骤（{flagged.length}）</div>
        {flagged.length === 0 ? (
          <div className="side-empty">点击步骤菜单中的「标记疑难」收藏难点。</div>
        ) : (
          <ul className="flag-list">
            {flagged.map((id) => {
              const st = findStep(steps, id);
              return (
                <li key={id}>
                  <button className="link-btn" onClick={() => selectStep(id)}>
                    {st ? st.content.slice(0, 24) : id}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="side-section">
        <div className="side-title">学习要点（{learnings.length}）</div>
        {learnings.length === 0 ? (
          <div className="side-empty">在「这道题教会我们」结果中点击收藏。</div>
        ) : (
          <ul className="learning-list">
            {learnings.slice(0, 8).map((l) => (
              <li key={l.id}>
                <div className="learning-content">{l.content.slice(0, 60)}…</div>
                {l.stepId && (
                  <button className="link-btn" onClick={() => selectStep(l.stepId!)}>
                    定位步骤
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="side-section">
        <div className="side-title">
          操作历史
          <button className="link-btn undo" onClick={undoLast} title="撤销到上一快照">
            <span className="codicon codicon-discard" /> 撤销
          </button>
        </div>
        {snapshots.length > 0 && (
          <div className="snapshot-hint">
            可撤销 {snapshots.length} 个快照
            {snapshots[0] && (
              <button
                className="link-btn"
                onClick={() => setCompareSnapshot(snapshots[0].id)}
              >
                与最新对比
              </button>
            )}
          </div>
        )}
        <ul className="history-list">
          {history.slice(0, 12).map((h) => (
            <li key={h.id}>
              <span className="history-time">
                {new Date(h.time).toLocaleTimeString('zh-CN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              {h.label}
            </li>
          ))}
          {history.length === 0 && <li className="side-empty">暂无操作。</li>}
        </ul>
      </section>
    </aside>
  );
};
