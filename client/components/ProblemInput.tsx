// 题目输入区：可折叠，支持输入题目并提交求解，提供示例题目。
import React from 'react';
import { usePolyaStore } from '../store';

// 上海卷风格中上难度三角函数大题（仿真题，非考据原题；含两小问，可演示多子问题求解）
const SAMPLES = [
  '已知函数 f(x) = 2sin x·cos x + 2√3·cos^2 x - √3（x∈R）。（1）求函数 f(x) 的最小正周期和单调递增区间；（2）当 x∈[0, π/2] 时，若方程 f(x) = t 有两个不同的实数解，求实数 t 的取值范围',
];

export const ProblemInput: React.FC = () => {
  const inputProblem = usePolyaStore((s) => s.inputProblem);
  const setInputProblem = usePolyaStore((s) => s.setInputProblem);
  const submitProblem = usePolyaStore((s) => s.submitProblem);
  const collapsed = usePolyaStore((s) => s.inputCollapsed);
  const setCollapsed = usePolyaStore((s) => s.setInputCollapsed);
  const solving = usePolyaStore((s) => s.solving);

  if (collapsed) {
    return (
      <div className="problem-input collapsed">
        <button className="link-btn" onClick={() => setCollapsed(false)}>
          <span className="codicon codicon-chevron-right" /> 展开题目输入区
        </button>
      </div>
    );
  }

  return (
    <div className="problem-input">
      <div className="panel-title">
        <span><span className="codicon codicon-edit" /> 题目输入</span>
        <button className="icon-btn" title="折叠" onClick={() => setCollapsed(true)}>
          <span className="codicon codicon-chevron-left" />
        </button>
      </div>
      <textarea
        className="problem-textarea"
        placeholder="在此输入数学题目，支持 LaTeX（如 x^2 - 5x + 6 = 0）"
        value={inputProblem}
        onChange={(e) => setInputProblem(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            submitProblem(inputProblem);
          }
        }}
      />
      <button
        className="primary solve-btn"
        disabled={solving || !inputProblem.trim()}
        onClick={() => submitProblem(inputProblem)}
      >
        {solving ? '求解中…' : '开始求解 (⌘/Ctrl+Enter)'}
      </button>

      <div className="samples">
        <div className="samples-title">示例题目：</div>
        {SAMPLES.map((s) => (
          <button
            key={s}
            className="sample-chip"
            onClick={() => {
              setInputProblem(s);
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
};
