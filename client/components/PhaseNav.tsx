// 顶部阶段进度导航条：四个圆点，可点击跳转（切换时提示可能需要重新审题）。
// 多子问题时，按当前选中的子问题过滤步骤范围。
import React from 'react';
import { PHASE_META, PHASE_ORDER, Phase } from '../../shared/types';
import { usePolyaStore } from '../store';

export const PhaseNav: React.FC = () => {
  const currentPhase = usePolyaStore((s) => s.currentPhase);
  const completedPhases = usePolyaStore((s) => s.completedPhases);
  const setPhase = usePolyaStore((s) => s.setPhase);
  const steps = usePolyaStore((s) => s.steps);
  const selectStep = usePolyaStore((s) => s.selectStep);
  const selectedSubProblemIndex = usePolyaStore((s) => s.selectedSubProblemIndex);
  const subProblems = usePolyaStore((s) => s.subProblems);

  /** 判断一个阶段在当前子问题范围内是否已完成。 */
  const isPhaseDone = (p: Phase): boolean => {
    if (subProblems.length <= 1 || selectedSubProblemIndex == null) {
      return completedPhases.includes(p);
    }
    // 限定在当前子问题的步骤范围内判断
    const subSteps = steps.filter((s) => s.subProblemIndex === selectedSubProblemIndex);
    return subSteps.some((s) => s.phase === p) && completedPhases.includes(p);
  };

  const jump = (p: Phase) => {
    setPhase(p);
    // 跳转到该阶段在当前子问题内的第一个步骤
    const candidates =
      subProblems.length > 1 && selectedSubProblemIndex != null
        ? steps.filter((s) => s.subProblemIndex === selectedSubProblemIndex)
        : steps;
    const first = candidates.find((s) => s.phase === p);
    if (first) {
      selectStep(first.id);
      document.getElementById(`step-anchor-${first.id}`)?.scrollIntoView({ behavior: 'smooth' });
    }
    if (p !== currentPhase) {
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
          const isDone = isPhaseDone(p);
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
