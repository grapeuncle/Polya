// 单个解题步骤卡片：点击高亮、展开浮动菜单、显示元信息、子步骤与动作结果。
import React from 'react';
import { PHASE_META, SolutionStep } from '../../shared/types';
import { usePolyaStore } from '../store';
import { MarkdownView } from '../render/MarkdownView';
import { FloatingMenu } from './FloatingMenu';
import { ResultCard } from './ResultCard';

export const StepCard: React.FC<{ step: SolutionStep; index: number }> = ({ step, index }) => {
  const selected = usePolyaStore((s) => s.selectedStepId === step.id);
  const selectStep = usePolyaStore((s) => s.selectStep);
  const flagged = usePolyaStore((s) => s.flagged.includes(step.id));
  const teacherMode = usePolyaStore((s) => s.teacherMode);
  const expanded = usePolyaStore((s) => s.expandedSubSteps.includes(step.id));
  const toggleSubSteps = usePolyaStore((s) => s.toggleSubSteps);
  const results = usePolyaStore((s) => s.results.filter((r) => r.stepId === step.id));

  const meta = step.metadata;
  const phaseMeta = PHASE_META[step.phase];

  return (
    <div
      className={`step-card ${selected ? 'selected' : ''} ${flagged ? 'flagged' : ''}`}
      onClick={() => selectStep(selected ? null : step.id)}
    >
      <div className="step-head">
        <span className="step-index">{index + 1}</span>
        <span className="step-phase-badge" title={phaseMeta.subtitle}>
          {phaseMeta.emoji} {phaseMeta.title}
        </span>
        {flagged && <span className="flag-badge codicon codicon-bookmark" title="疑难步骤" />}
      </div>

      <div className="step-content">
        <MarkdownView content={step.content} />
      </div>

      {/* 元信息：教师模式下默认折叠关键启发 */}
      {(meta.objective || meta.heuristic || meta.theoremApplied) && (
        <div className="step-meta">
          {meta.objective && (
            <div className="meta-row">
              <span className="meta-label">目的</span>
              <MarkdownView content={meta.objective} />
            </div>
          )}
          {meta.heuristic && (
            <details className="meta-row" open={!teacherMode}>
              <summary className="meta-label">启发 {teacherMode ? '（点击展开）' : ''}</summary>
              <MarkdownView content={meta.heuristic} />
            </details>
          )}
          {meta.theoremApplied && (
            <div className="meta-row">
              <span className="meta-label">定理</span>
              <MarkdownView content={meta.theoremApplied} />
            </div>
          )}
          {meta.commonMistake && (
            <div className="meta-row warn">
              <span className="meta-label">易错</span>
              <MarkdownView content={meta.commonMistake} />
            </div>
          )}
        </div>
      )}

      {/* 子步骤（详细推导） */}
      {step.subSteps && step.subSteps.length > 0 && (
        <div className="substeps">
          <button
            className="link-btn"
            onClick={(e) => {
              e.stopPropagation();
              toggleSubSteps(step.id);
            }}
          >
            <span className={`codicon codicon-${expanded ? 'chevron-down' : 'chevron-right'}`} />
            {expanded ? '收起详细推导' : `展开详细推导（${step.subSteps.length} 步）`}
          </button>
          {expanded && (
            <div className="substep-list">
              {step.subSteps.map((sub, i) => (
                <div key={sub.id} className="substep">
                  <span className="substep-index">{index + 1}.{i + 1}</span>
                  <MarkdownView content={sub.content} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 选中时显示浮动菜单 */}
      {selected && <FloatingMenu step={step} />}

      {/* 该步骤的动作结果卡片 */}
      {results.length > 0 && (
        <div className="result-list" onClick={(e) => e.stopPropagation()}>
          {results.map((r) => (
            <ResultCard key={r.requestId} result={r} />
          ))}
        </div>
      )}
    </div>
  );
};
