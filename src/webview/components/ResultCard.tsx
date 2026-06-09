// 渲染单条动作结果（解释、验算、对比、可视化等），支持流式、取消、重试与 RichUI。
import React from 'react';
import { Mermaid } from '../render/Mermaid';
import { MarkdownView } from '../render/MarkdownView';
import { VizRenderer } from '../render/GeometrySvg';
import { ActionResult, usePolyaStore } from '../store';
import { ComparisonView } from './MenuActions/ComparisonView';
import { MicroStepList } from './MenuActions/MicroStepList';
import { ParamExplorer } from './MenuActions/ParamExplorer';
import { PracticeLoader } from './MenuActions/PracticeLoader';
import { ProblemBreakdown } from './MenuActions/ProblemBreakdown';
import { RestateConfirm } from './MenuActions/RestateConfirm';
import { TheoremCheck } from './MenuActions/TheoremCheck';
import { VariantLoader } from './MenuActions/VariantLoader';

function shouldCollapseInTeacherMode(content: string, teacherMode: boolean): boolean {
  if (!teacherMode) {
    return false;
  }
  return /最终答案|答案要点|正确答案|解为|x=|y=/i.test(content);
}

function HighlightedContent({
  content,
  highlights,
}: {
  content: string;
  highlights?: NonNullable<ActionResult['meta']>['highlights'];
}) {
  if (!highlights?.length) {
    return <MarkdownView content={content} />;
  }
  const lines = content.split('\n');
  return (
    <div className="highlighted-content">
      {lines.map((line, i) => {
        const hl = highlights.find((h) => h.target === 'line' && h.lineIndex === i);
        return (
          <div key={i} className={hl ? 'hl-line warn' : 'hl-line'}>
            {hl && <span className="hl-msg">{hl.message}</span>}
            <MarkdownView content={line} />
          </div>
        );
      })}
    </div>
  );
}

export const ResultCard: React.FC<{ result: ActionResult }> = ({ result }) => {
  const dismiss = usePolyaStore((s) => s.dismissResult);
  const cancelAction = usePolyaStore((s) => s.cancelAction);
  const refreshResult = usePolyaStore((s) => s.refreshResult);
  const addLearning = usePolyaStore((s) => s.addLearning);
  const teacherMode = usePolyaStore((s) => s.teacherMode);
  const kind = result.meta?.kind ?? 'text';
  const [expanded, setExpanded] = React.useState(
    !shouldCollapseInTeacherMode(result.content, teacherMode)
  );

  const renderBody = () => {
    if (result.status === 'error') {
      return (
        <div className="result-error">
          <span className="codicon codicon-warning" /> {result.content || '请求失败'}
          <button className="primary retry-btn" onClick={() => refreshResult(result.requestId)}>
            重试
          </button>
        </div>
      );
    }
    if (result.status === 'cancelled') {
      return <div className="result-cancelled">已取消</div>;
    }
    if (!result.content && result.status === 'streaming') {
      return <div className="result-loading">正在生成…</div>;
    }

    if (teacherMode && !expanded) {
      return (
        <button className="link-btn" onClick={() => setExpanded(true)}>
          点击展开（教师模式）
        </button>
      );
    }

    if (result.meta?.breakdown?.sentences?.length) {
      return (
        <ProblemBreakdown
          sentences={result.meta.breakdown.sentences}
          intro={result.content}
        />
      );
    }

    if (result.meta?.microSteps && result.meta.microSteps.length > 0) {
      return (
        <MicroStepList
          steps={result.meta.microSteps}
          intro={result.content}
          stepId={result.stepId}
        />
      );
    }

    if (result.meta?.theoremCheck && result.meta.theoremCheck.length > 0) {
      return (
        <TheoremCheck items={result.meta.theoremCheck} intro={result.content} />
      );
    }

    if (result.meta?.variantProblem) {
      return (
        <VariantLoader
          problem={result.meta.variantProblem}
          note={result.meta.variantNote}
          intro={result.content}
        />
      );
    }

    if (result.meta?.viz && (result.meta.viz.kind === 'svg' || result.meta.viz.kind === 'table')) {
      return (
        <>
          {result.content && <MarkdownView content={result.content} />}
          <VizRenderer viz={result.meta.viz} />
        </>
      );
    }

    if (result.meta?.viz?.kind === 'mermaid' && result.meta.viz.mermaid) {
      return (
        <>
          {result.content && <MarkdownView content={result.content} />}
          <Mermaid code={result.meta.viz.mermaid} />
        </>
      );
    }

    if (result.meta?.comparison) {
      return <ComparisonView spec={result.meta.comparison} fallback={result.content} />;
    }

    if (result.meta?.params && result.meta.params.length > 0) {
      return (
        <ParamExplorer
          params={result.meta.params}
          intro={result.content}
          stepId={result.stepId}
        />
      );
    }

    if (result.meta?.practiceProblem) {
      return (
        <PracticeLoader problem={result.meta.practiceProblem} intro={result.content} />
      );
    }

    if (kind === 'restate' && result.status === 'done') {
      return <RestateConfirm content={result.content} stepId={result.stepId} />;
    }

    if (result.meta?.highlights?.length) {
      return <HighlightedContent content={result.content} highlights={result.meta.highlights} />;
    }

    return result.content ? <MarkdownView content={result.content} /> : null;
  };

  return (
    <div className={`result-card kind-${kind} status-${result.status}`}>
      <div className="result-head">
        <span className="result-title">
          {result.meta?.title ?? result.title}
          {result.status === 'streaming' && <span className="typing-dot" />}
        </span>
        <div className="result-actions">
          {result.status === 'streaming' && (
            <button
              className="icon-btn"
              title="取消"
              onClick={() => cancelAction(result.requestId)}
            >
              <span className="codicon codicon-debug-stop" />
            </button>
          )}
          {result.status === 'done' && result.action === 'takeaway' && result.content && (
            <button
              className="icon-btn"
              title="收藏要点"
              onClick={() => addLearning(result.content, result.stepId)}
            >
              <span className="codicon codicon-star-empty" />
            </button>
          )}
          {result.status === 'done' && result.difficultyAtCreation && (
            <button
              className="icon-btn"
              title="按当前难度刷新"
              onClick={() => refreshResult(result.requestId)}
            >
              <span className="codicon codicon-refresh" />
            </button>
          )}
          <button className="icon-btn" title="关闭" onClick={() => dismiss(result.requestId)}>
            <span className="codicon codicon-close" />
          </button>
        </div>
      </div>
      <div className="result-body">{renderBody()}</div>
    </div>
  );
};
