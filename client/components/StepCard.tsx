// 单个解题步骤卡片：点击高亮、展开浮动菜单、划词工具条、显示元信息、子步骤与动作结果。

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { PHASE_META, SolutionStep } from '../../shared/types';

import { usePolyaStore } from '../store';

import { MarkdownView } from '../render/MarkdownView';

import { FloatingMenu } from './FloatingMenu';

import { ResultCard } from './ResultCard';

import { SelectionToolbar } from './SelectionToolbar';

import { getTextSelectionInContainer } from '../utils/selection';



interface CardSelection {

  text: string;

  rect: DOMRect;

}



export const StepCard: React.FC<{ step: SolutionStep; index: number }> = ({ step, index }) => {

  const cardRef = useRef<HTMLDivElement>(null);

  const [selection, setSelection] = useState<CardSelection | null>(null);

  const selected = usePolyaStore((s) => s.selectedStepId === step.id);

  const selectStep = usePolyaStore((s) => s.selectStep);

  const flagged = usePolyaStore((s) => s.flagged.includes(step.id));

  const teacherMode = usePolyaStore((s) => s.teacherMode);

  const expanded = usePolyaStore((s) => s.expandedSubSteps.includes(step.id));

  const toggleSubSteps = usePolyaStore((s) => s.toggleSubSteps);

  const results = usePolyaStore(
    useShallow((s) => s.results.filter((r) => r.stepId === step.id))
  );

  const hasWarning = usePolyaStore((s) => s.getStepWarning(step.id));

  const symbolicWarnings = usePolyaStore((s) => s.symbolicWarnings[step.id]);

  const hasSymbolicWarning = (symbolicWarnings?.length ?? 0) > 0;



  const meta = step.metadata;

  const phaseMeta = PHASE_META[step.phase];



  const detectSelection = useCallback(() => {

    const card = cardRef.current;

    if (!card) {

      return;

    }

    const found = getTextSelectionInContainer(card);

    setSelection(found);

  }, []);



  const closeSelection = useCallback(() => {

    setSelection(null);

  }, []);



  useEffect(() => {
    const onSelectionChange = () => {
      const card = cardRef.current;
      if (!card) {
        return;
      }
      setSelection(getTextSelectionInContainer(card));
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);



  useEffect(() => {

    const mainCol = cardRef.current?.closest('.main-col');

    if (!mainCol || !selection) {

      return;

    }

    const onScroll = () => setSelection(null);

    mainCol.addEventListener('scroll', onScroll, { passive: true });

    return () => mainCol.removeEventListener('scroll', onScroll);

  }, [selection]);

  useEffect(() => {
    if (!selection) {
      return;
    }
    const onDocClick = (e: MouseEvent) => {
      const el = e.target as Element;
      if (!el.closest('.step-card') && !el.closest('.selection-toolbar')) {
        setSelection(null);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [selection]);

  return (

    <div

      ref={cardRef}

      className={`step-card ${selected ? 'selected' : ''} ${flagged ? 'flagged' : ''} ${hasWarning || hasSymbolicWarning ? 'step-warning' : ''}`}

      onMouseUp={(e) => {

        e.stopPropagation();

        // 延迟一帧，确保浏览器完成选区更新

        requestAnimationFrame(detectSelection);

      }}

      onClick={(e) => {

        e.stopPropagation();

        const card = cardRef.current;

        const hasTextSelection = card ? getTextSelectionInContainer(card) : null;

        if (hasTextSelection) {

          selectStep(step.id);

          setSelection(hasTextSelection);

          return;

        }

        closeSelection();

        selectStep(selected ? null : step.id);

      }}

    >

      <div className="step-head">

        <span className="step-index">{index + 1}</span>

        <span className="step-phase-badge" title={phaseMeta.subtitle}>

          {phaseMeta.emoji} {phaseMeta.title}

        </span>

        {flagged && <span className="flag-badge codicon codicon-bookmark" title="疑难步骤" />}

        {hasSymbolicWarning && (

          <span className="symbolic-warn-badge codicon codicon-error" title="后台符号校验发现矛盾" />

        )}

      </div>



      <div className="step-content">

        <MarkdownView content={step.content} />

      </div>



      {hasSymbolicWarning && (

        <div className="symbolic-warn" onClick={(e) => e.stopPropagation()}>

          <div className="symbolic-warn-title">

            <span className="codicon codicon-error" /> 符号校验发现 {symbolicWarnings.length} 处可证明的矛盾

          </div>

          <ul>

            {symbolicWarnings.map((w, i) => (

              <li key={i}>

                <code>{w.expression}</code> —— {w.detail}

              </li>

            ))}

          </ul>

          <div className="symbolic-warn-tip">这是 mathjs 客观校验结果（与 AI 无关），请点击「检验这一步」复核。</div>

        </div>

      )}



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



      {Array.isArray(step.subSteps) && step.subSteps.length > 0 && (

        <div className="substeps">

          <button

            className="link-btn"

            type="button"

            onMouseDown={(e) => e.stopPropagation()}

            onMouseUp={(e) => e.stopPropagation()}

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

                <div key={sub.id || `${step.id}-sub-${i}`} className="substep">

                  <span className="substep-index">{index + 1}.{i + 1}</span>

                  <MarkdownView content={sub.content} />

                </div>

              ))}

            </div>

          )}

        </div>

      )}



      {selected && <FloatingMenu step={step} />}



      {selection && (

        <SelectionToolbar

          stepId={step.id}

          selectedText={selection.text}

          anchorRect={selection.rect}

          onClose={closeSelection}

        />

      )}



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

