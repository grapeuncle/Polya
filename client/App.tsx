// 主布局：顶部阶段导航、左侧题目输入与侧边栏、主区域步骤列表 / 思维导图。
import React, { useEffect } from 'react';
import { initSession, onEvent } from './transport';
import { usePolyaStore } from './store';
import { PhaseNav } from './components/PhaseNav';
import { ProblemInput } from './components/ProblemInput';
import { StepCard } from './components/StepCard';
import { Sidebar } from './components/Sidebar';
import { MindMap } from './components/MindMap';
import { GlobalAsk } from './components/GlobalAsk';
import { ResultCard } from './components/ResultCard';
import { BranchTree } from './components/BranchTree';
import { ProblemBreakdown } from './components/MenuActions/ProblemBreakdown';
import { SnapshotCompare } from './components/SnapshotCompare';
import { PHASE_META } from '../shared/types';
import { Toast } from './components/Toast';
import { MarkdownView } from './render/MarkdownView';
import { SubProblemNav } from './components/SubProblemNav';
import { SubProblemBanner } from './components/SubProblemBanner';

export const App: React.FC = () => {
  const initFromExt = usePolyaStore((s) => s.initFromExt);
  const onSolutionStart = usePolyaStore((s) => s.onSolutionStart);
  const onSolutionPhaseStart = usePolyaStore((s) => s.onSolutionPhaseStart);
  const onSolutionPhaseSteps = usePolyaStore((s) => s.onSolutionPhaseSteps);
  const onSolutionPhaseChunk = usePolyaStore((s) => s.onSolutionPhaseChunk);
  const onSolution = usePolyaStore((s) => s.onSolution);
  const onBranchStepsAppended = usePolyaStore((s) => s.onBranchStepsAppended);
  const onSolveError = usePolyaStore((s) => s.onSolveError);
  const onSubProblemSteps = usePolyaStore((s) => s.onSubProblemSteps);
  const onSubProblemError = usePolyaStore((s) => s.onSubProblemError);
  const onSubProblemStart = usePolyaStore((s) => s.onSubProblemStart);
  const onSubProblemComplete = usePolyaStore((s) => s.onSubProblemComplete);
  const onActionStart = usePolyaStore((s) => s.onActionStart);
  const onActionChunk = usePolyaStore((s) => s.onActionChunk);
  const onActionEnd = usePolyaStore((s) => s.onActionEnd);
  const onActionError = usePolyaStore((s) => s.onActionError);
  const onActionCancelled = usePolyaStore((s) => s.onActionCancelled);
  const confirmDifficultyRefresh = usePolyaStore((s) => s.confirmDifficultyRefresh);
  const onSymbolicCheck = usePolyaStore((s) => s.onSymbolicCheck);
  const setViewMode = usePolyaStore((s) => s.setViewMode);
  const setShowFinalAnswer = usePolyaStore((s) => s.setShowFinalAnswer);
  const submitProblem = usePolyaStore((s) => s.submitProblem);

  useEffect(() => {
    const dispose = onEvent((msg) => {
      switch (msg.type) {
        case 'init':
          initFromExt(msg.difficulty, msg.teacherMode, msg.engine);
          break;
        case 'solutionStart':
          onSolutionStart(msg.problem);
          break;
        case 'solutionPhaseStart':
          onSolutionPhaseStart(msg.phase);
          break;
        case 'solutionPhaseSteps':
          onSolutionPhaseSteps(msg.phase, msg.steps);
          break;
        case 'solutionPhaseChunk':
          onSolutionPhaseChunk(msg.phase, msg.chunk);
          break;
        case 'solutionHeartbeat':
          // heartbeat handled internally by the engine; UI can optionally show elapsed time
          break;
        case 'solution':
          onSolution(msg.solution);
          break;
        case 'symbolicCheck':
          onSymbolicCheck(msg.warnings, msg.checkedSteps);
          break;
        case 'branchStepsAppended':
          onBranchStepsAppended(msg.branchId, msg.steps);
          break;
        case 'solveError':
          onSolveError(msg.message);
          break;
        case 'subProblemSteps':
          onSubProblemSteps(msg.requestId, msg.index, msg.steps);
          break;
        case 'subProblemError':
          onSubProblemError(msg.requestId, msg.index, msg.message);
          break;
        case 'subProblemStart':
          onSubProblemStart(msg.index, msg.label, msg.subProblem);
          break;
        case 'subProblemComplete':
          onSubProblemComplete(msg.index, msg.finalAnswer);
          break;
        case 'subProblemPhaseSteps':
          // Multi-sub-problem phase steps come through solutionPhaseSteps
          onSolutionPhaseSteps(msg.phase, msg.steps);
          break;
        case 'actionStart':
          onActionStart(msg.requestId, msg.action, msg.stepId);
          break;
        case 'actionChunk':
          onActionChunk(msg.requestId, msg.chunk);
          break;
        case 'actionEnd':
          onActionEnd(msg.requestId, msg.meta);
          break;
        case 'actionError':
          onActionError(msg.requestId, msg.message);
          break;
        case 'actionCancelled':
          onActionCancelled(msg.requestId);
          break;
        case 'difficultyChanged':
          usePolyaStore.setState({ difficulty: msg.difficulty });
          break;
      }
    });
    void initSession().catch((e) => {
      console.error('[polya] 会话初始化失败', e);
      onSolveError(e instanceof Error ? e.message : String(e));
    });
    const onBodyClick = (e: MouseEvent) => {
      const el = e.target as Element;
      if (
        el.closest('.step-card, .floating-menu, .selection-toolbar, .phase-nav, .sidebar, .mindmap, .sub-problem-nav')
      ) {
        return;
      }
      usePolyaStore.getState().selectStep(null);
    };
    document.body.addEventListener('click', onBodyClick);
    return () => {
      dispose();
      document.body.removeEventListener('click', onBodyClick);
    };
  }, []);

  const solving = usePolyaStore((s) => s.solving);
  const solveError = usePolyaStore((s) => s.solveError);
  const viewMode = usePolyaStore((s) => s.viewMode);
  const problem = usePolyaStore((s) => s.problem);
  const solution = usePolyaStore((s) => s.solution);
  const showFinalAnswer = usePolyaStore((s) => s.showFinalAnswer);
  const teacherMode = usePolyaStore((s) => s.teacherMode);
  const difficultyRefreshPrompt = usePolyaStore((s) => s.difficultyRefreshPrompt);
  const difficultyResubmitPrompt = usePolyaStore((s) => s.difficultyResubmitPrompt);
  const solvingPhase = usePolyaStore((s) => s.solvingPhase);
  const solvingChunk = usePolyaStore((s) => s.solvingChunk);
  const currentSubProblemIndex = usePolyaStore((s) => s.currentSubProblemIndex);
  const subProblems = usePolyaStore((s) => s.subProblems);
  const subProblemStatus = usePolyaStore((s) => s.subProblemStatus);
  const selectedSubProblemIndex = usePolyaStore((s) => s.selectedSubProblemIndex);
  const activeBreakdown = usePolyaStore((s) => s.activeBreakdown);
  const restateConfirmed = usePolyaStore((s) => s.restateConfirmed);
  const steps = usePolyaStore((s) => s.steps);
  const branches = usePolyaStore((s) => s.branches);
  const activeBranchId = usePolyaStore((s) => s.activeBranchId);
  const results = usePolyaStore((s) => s.results);

  const displaySteps = React.useMemo(() => {
    if (!activeBranchId) {
      return steps;
    }
    const branch = branches.find((b) => b.id === activeBranchId);
    if (!branch) {
      return steps;
    }
    const idx = steps.findIndex((s) => s.id === branch.parentStepId);
    if (idx < 0) {
      return [...steps, ...branch.alternativeSteps];
    }
    return [...steps.slice(0, idx + 1), ...branch.alternativeSteps];
  }, [steps, branches, activeBranchId]);

  /** 按子问题分组后的步骤列表，每组含 { subProblemIndex, label, text, status, steps, startIndex }。 */
  const groupedSteps = React.useMemo(() => {
    const hasSubs = subProblems.length > 0;
    if (!hasSubs) {
      // 无子问题场景：全部步骤归为一组
      return [{ key: '__global__', subProblemIndex: null as number | null, steps: displaySteps, startIndex: 0 }];
    }
    const groups: {
      key: string;
      subProblemIndex: number | null;
      label?: string;
      text?: string;
      status?: 'pending' | 'solving' | 'done';
      steps: typeof displaySteps;
      startIndex: number;
    }[] = [];
    let globalIdx = 0;
    const remaining = new Set(displaySteps.map((s) => s.id));

    for (const sub of subProblems) {
      const subSteps = displaySteps.filter((s) => s.subProblemIndex === sub.index);
      for (const s of subSteps) {
        remaining.delete(s.id);
      }
      groups.push({
        key: `sub-${sub.index}`,
        subProblemIndex: sub.index,
        label: sub.label,
        text: sub.text,
        status: subProblemStatus[sub.index] || 'pending',
        steps: subSteps,
        startIndex: globalIdx,
      });
      globalIdx += subSteps.length;
    }

    // 未标记子问题的步骤归入一组（放在最后）
    if (remaining.size > 0) {
      const unlabeled = displaySteps.filter((s) => remaining.has(s.id));
      groups.push({
        key: '__unlabeled__',
        subProblemIndex: null,
        steps: unlabeled,
        startIndex: globalIdx,
      });
    }

    return groups;
  }, [displaySteps, subProblems, subProblemStatus]);

  const globalResults = React.useMemo(
    () => results.filter((r) => r.stepId === '__global__'),
    [results]
  );

  return (
    <div className="app">
      <Toast />
      <header className="app-header">
        <div className="app-brand">
          <span className="codicon codicon-mortar-board" /> Polya 数学辅导
        </div>
        <div className="view-toggle">
          <button
            className={viewMode === 'list' ? 'active' : ''}
            onClick={() => setViewMode('list')}
          >
            <span className="codicon codicon-list-ordered" /> 步骤
          </button>
          <button
            className={viewMode === 'mindmap' ? 'active' : ''}
            onClick={() => setViewMode('mindmap')}
          >
            <span className="codicon codicon-type-hierarchy" /> 思维导图
          </button>
        </div>
      </header>

      <PhaseNav />

      {difficultyRefreshPrompt && (
        <div className="diff-refresh-banner">
          {difficultyRefreshPrompt}
          <button className="primary" onClick={() => confirmDifficultyRefresh(true, false)}>
            刷新解释
          </button>
          {difficultyResubmitPrompt && (
            <button className="primary" onClick={() => confirmDifficultyRefresh(true, true)}>
              重新求解
            </button>
          )}
          <button onClick={() => confirmDifficultyRefresh(false)}>暂不</button>
        </div>
      )}

      <div className="app-body">
        <div className="left-col">
          <ProblemInput />
          <Sidebar />
        </div>

        <main className="main-col">
          {problem && (
            <div className="problem-banner">
              题目：
              <MarkdownView content={problem} className="problem-banner-content" raw />
              {restateConfirmed && (
                <span className="restate-badge">
                  <span className="codicon codicon-check" /> 已确认理解
                </span>
              )}
            </div>
          )}

          <SubProblemNav />

          {activeBreakdown?.sentences?.length ? (
            <div className="breakdown-banner">
              <div className="breakdown-banner-title">题干拆解</div>
              <ProblemBreakdown sentences={activeBreakdown.sentences} />
            </div>
          ) : null}

          <SnapshotCompare />
          <BranchTree />

          {solving && (
            <div className="solving-indicator">
              <span className="spinner" />{' '}
              {solvingPhase
                ? `正在生成「${PHASE_META[solvingPhase].title}」阶段…`
                : '正在按波利亚四阶段拆解题目…'}
              {solvingChunk && (
                <details className="streaming-preview">
                  <summary>查看实时生成内容</summary>
                  <div className="streaming-content">
                    <MarkdownView content={solvingChunk} />
                  </div>
                </details>
              )}
            </div>
          )}

          {solveError && (
            <div className="error-banner">
              <span className="codicon codicon-error" /> {solveError}
              <button className="primary" onClick={() => submitProblem(problem)}>
                重试
              </button>
            </div>
          )}

          {!solving && !solveError && displaySteps.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">🧮</div>
              <h2>欢迎使用 Polya 数学辅导</h2>
              <p>在左侧输入一道数学题，我会按照波利亚四阶段拆解，并支持逐步追问、验算、可视化与生成同类练习。</p>
            </div>
          )}

          {viewMode === 'list' ? (
            <div className="step-list">
              {groupedSteps.map((group) => (
                <React.Fragment key={group.key}>
                  {group.label && (
                    <SubProblemBanner
                      index={group.subProblemIndex!}
                      label={group.label}
                      text={group.text!}
                      status={group.status!}
                    />
                  )}
                  {group.steps.map((step, i) => (
                    <div id={`step-anchor-${step.id}`} key={step.id}>
                      <StepCard step={step} index={i} />
                    </div>
                  ))}
                  {/* 子问题最终答案 */}
                  {group.subProblemIndex != null &&
                    solution?.subSolutions?.find((ss) => ss.index === group.subProblemIndex)
                      ?.finalAnswer &&
                    (showFinalAnswer || !teacherMode) && (
                      <div className="final-answer">
                        <span className="codicon codicon-check-all" />{' '}
                        第 {group.subProblemIndex} 问答案：
                        <MarkdownView
                          content={
                            solution.subSolutions.find(
                              (ss) => ss.index === group.subProblemIndex
                            )!.finalAnswer!
                          }
                          className="final-answer-content"
                        />
                      </div>
                    )}
                </React.Fragment>
              ))}
              {solution?.finalAnswer && (showFinalAnswer || !teacherMode) && (
                <div className="final-answer">
                  <span className="codicon codicon-check-all" /> 最终答案：
                  <MarkdownView content={solution.finalAnswer} className="final-answer-content" />
                </div>
              )}
              {solution?.finalAnswer && teacherMode && !showFinalAnswer && (
                <button className="link-btn final-reveal" onClick={() => setShowFinalAnswer(true)}>
                  显示最终答案（教师模式）
                </button>
              )}
            </div>
          ) : (
            <MindMap />
          )}

          {globalResults.length > 0 && (
            <div className="global-results">
              <div className="side-title">全局提问结果</div>
              {globalResults.map((r) => (
                <ResultCard key={r.requestId} result={r} />
              ))}
            </div>
          )}
        </main>
      </div>

      <GlobalAsk />
    </div>
  );
};
