// 顶部阶段进度导航条：四个圆点，可点击跳转（切换时提示可能需要重新审题）。
import React from 'react';
import { PHASE_META, PHASE_ORDER, Phase } from '../../shared/types';
import { usePolyaStore } from '../store';

export const PhaseNav: React.FC = () => {
  const currentPhase = usePolyaStore((s) => s.currentPhase);
  const completedPhases = usePolyaStore((s) => s.completedPhases);
  const setPhase = usePolyaStore((s) => s.setPhase);
  const steps = usePolyaStore((s) => s.steps);
  const selectStep = usePolyaStore((s) => s.selectStep);

  const jump = (p: Phase) => {
    setPhase(p);
    // 跳转到该阶段的第一个步骤
    const first = steps.find((s) => s.phase === p);
    if (first) {
      selectStep(first.id);
      document.getElementById(`step-anchor-${first.id}`)?.scrollIntoView({ behavior: 'smooth' });
    }
    if (p !== currentPhase) {
      // 友好提示：阶段切换可能需要重新审题
      const hint = document.getElementById('phase-hint');
      if (hint) {
        hint.classList.add('show');
        setTimeout(() => hint.classList.remove('show'), 2600);
      }
    }
  };

  return (
    <div className="phase-nav">
      <div className="phase-track">
        {PHASE_ORDER.map((p, i) => {
          const isCurrent = p === currentPhase;
          const isDone = completedPhases.includes(p);
          return (
            <React.Fragment key={p}>
              <button
                className={`phase-node ${isCurrent ? 'current' : ''} ${isDone ? 'done' : ''}`}
                onClick={() => jump(p)}
                title={PHASE_META[p].subtitle}
              >
                <span className="phase-dot">{isDone ? '✓' : i + 1}</span>
                <span className="phase-label">
                  {PHASE_META[p].emoji} {PHASE_META[p].title}
                </span>
              </button>
              {i < PHASE_ORDER.length - 1 && <span className="phase-line" />}
            </React.Fragment>
          );
        })}
      </div>
      <div id="phase-hint" className="phase-hint">
        切换阶段后，建议回顾前序步骤，必要时重新审题。
      </div>
    </div>
  );
};
