// 主布局：顶部阶段导航、左侧题目输入与侧边栏、主区域步骤列表 / 思维导图。
import React, { useEffect } from 'react';
import { onMessage, postMessage } from './vscodeApi';
import { usePolyaStore } from './store';
import { PhaseNav } from './components/PhaseNav';
import { ProblemInput } from './components/ProblemInput';
import { StepCard } from './components/StepCard';
import { Sidebar } from './components/Sidebar';
import { MindMap } from './components/MindMap';
import { GlobalAsk } from './components/GlobalAsk';
import { ResultCard } from './components/ResultCard';

export const App: React.FC = () => {
  const store = usePolyaStore();

  // 订阅扩展主进程消息，分发到 store。
  useEffect(() => {
    const dispose = onMessage((msg) => {
      switch (msg.type) {
        case 'init':
          store.initFromExt(msg.difficulty, msg.teacherMode, msg.engine);
          break;
        case 'solutionStart':
          store.onSolutionStart(msg.problem);
          break;
        case 'solution':
          store.onSolution(msg.solution);
          break;
        case 'solveError':
          store.onSolveError(msg.message);
          break;
        case 'actionStart':
          store.onActionStart(msg.requestId, msg.action, msg.stepId);
          break;
        case 'actionChunk':
          store.onActionChunk(msg.requestId, msg.chunk);
          break;
        case 'actionEnd':
          store.onActionEnd(msg.requestId, msg.meta);
          break;
        case 'actionError':
          store.onActionError(msg.requestId, msg.message);
          break;
        case 'difficultyChanged':
          usePolyaStore.setState({ difficulty: msg.difficulty });
          break;
      }
    });
    postMessage({ type: 'ready' });
    // 点击空白处取消选中
    const onBodyClick = () => usePolyaStore.getState().selectStep(null);
    document.body.addEventListener('click', onBodyClick);
    return () => {
      dispose();
      document.body.removeEventListener('click', onBodyClick);
    };
  }, []);

  const { steps, solving, solveError, viewMode, problem, solution } = store;
  const globalResults = store.results.filter((r) => r.stepId === '__global__');

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          <span className="codicon codicon-mortar-board" /> Polya 数学辅导
        </div>
        <div className="view-toggle">
          <button
            className={viewMode === 'list' ? 'active' : ''}
            onClick={() => store.setViewMode('list')}
          >
            <span className="codicon codicon-list-ordered" /> 步骤
          </button>
          <button
            className={viewMode === 'mindmap' ? 'active' : ''}
            onClick={() => store.setViewMode('mindmap')}
          >
            <span className="codicon codicon-type-hierarchy" /> 思维导图
          </button>
        </div>
      </header>

      <PhaseNav />

      <div className="app-body">
        <div className="left-col">
          <ProblemInput />
          <Sidebar />
        </div>

        <main className="main-col">
          {problem && (
            <div className="problem-banner">
              <span className="codicon codicon-symbol-numeric" /> 题目：{problem}
            </div>
          )}

          {solving && (
            <div className="solving-indicator">
              <span className="spinner" /> 正在按波利亚四阶段拆解题目…
            </div>
          )}

          {solveError && (
            <div className="error-banner">
              <span className="codicon codicon-error" /> {solveError}
              <button className="primary" onClick={() => store.submitProblem(problem)}>
                重试
              </button>
            </div>
          )}

          {!solving && !solveError && steps.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">🧮</div>
              <h2>欢迎使用 Polya 数学辅导</h2>
              <p>在左侧输入一道数学题，我会按照波利亚四阶段拆解，并支持逐步追问、验算、可视化与生成同类练习。</p>
            </div>
          )}

          {viewMode === 'list' ? (
            <div className="step-list">
              {steps.map((step, i) => (
                <div id={`step-anchor-${step.id}`} key={step.id}>
                  <StepCard step={step} index={i} />
                </div>
              ))}
              {solution?.finalAnswer && (
                <div className="final-answer">
                  <span className="codicon codicon-check-all" /> 最终答案：
                  <code>{solution.finalAnswer}</code>
                </div>
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
