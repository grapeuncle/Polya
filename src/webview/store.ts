// 使用 Zustand 管理 Webview 全局状态：题目、步骤、阶段、选中、动作结果、UI 设置等。
import { create } from 'zustand';
import {
  ActionResultMeta,
  Difficulty,
  MenuActionId,
  Phase,
  PHASE_ORDER,
  Solution,
  SolutionStep,
} from '../shared/types';
import { newRequestId, postMessage } from './vscodeApi';

/** 一条动作结果卡片（解释 / 验算 / 对比等）。 */
export interface ActionResult {
  requestId: string;
  stepId: string;
  action: MenuActionId;
  title: string;
  content: string;
  meta?: ActionResultMeta;
  status: 'streaming' | 'done' | 'error';
}

/** 历史记录条目。 */
export interface HistoryEntry {
  id: string;
  label: string;
  time: number;
}

export type ViewMode = 'list' | 'mindmap';

interface PolyaState {
  // 数据
  problem: string;
  inputProblem: string;
  solution: Solution | null;
  steps: SolutionStep[];
  // 阶段
  currentPhase: Phase;
  completedPhases: Phase[];
  // 选中与结果
  selectedStepId: string | null;
  results: ActionResult[]; // 所有动作结果（按 stepId 过滤展示）
  flagged: string[]; // 疑难步骤 id
  expandedSubSteps: string[]; // 展开了子步骤的 step id
  // UI 设置
  difficulty: Difficulty;
  teacherMode: boolean;
  engineId: string;
  viewMode: ViewMode;
  inputCollapsed: boolean;
  globalAskOpen: boolean;
  // 状态
  solving: boolean;
  solveError: string | null;
  history: HistoryEntry[];

  // ===== Actions =====
  setInputProblem: (v: string) => void;
  submitProblem: (problem: string) => void;
  onSolutionStart: (problem: string) => void;
  onSolution: (s: Solution) => void;
  onSolveError: (msg: string) => void;
  selectStep: (id: string | null) => void;
  setPhase: (p: Phase) => void;
  toggleSubSteps: (id: string) => void;
  runAction: (action: MenuActionId, stepId: string, question?: string) => void;
  runGlobalAsk: (question: string) => void;
  toggleFlag: (stepId: string) => void;
  copyStep: (stepId: string) => void;
  setDifficulty: (d: Difficulty) => void;
  setViewMode: (m: ViewMode) => void;
  setInputCollapsed: (v: boolean) => void;
  setGlobalAskOpen: (v: boolean) => void;
  initFromExt: (d: Difficulty, teacherMode: boolean, engine: string) => void;
  // 流式结果处理
  onActionStart: (requestId: string, action: MenuActionId, stepId: string) => void;
  onActionChunk: (requestId: string, chunk: string) => void;
  onActionEnd: (requestId: string, meta?: ActionResultMeta) => void;
  onActionError: (requestId: string, message: string) => void;
  dismissResult: (requestId: string) => void;
  addHistory: (label: string) => void;
  undoLast: () => void;
}

const ACTION_TITLES: Partial<Record<MenuActionId, string>> = {
  explain: '解释这一步',
  objective: '这一步的目的',
  why: '为什么这样做',
  detail: '详细推导',
  alternatives: '替代方法对比',
  verify: '检验结果',
  ask: '追问解答',
  breakdown: '拆解题干',
  visualize: '可视化',
  restate: '重述题目',
  keyInfo: '关键信息',
  similarProblem: '类似题目',
  strategyOrigin: '思路来源',
  failedPaths: '失败路径',
  relatedModel: '相关题型',
  subGoals: '子目标',
  guessThenProve: '先猜后证',
  expandAlgebra: '代数细节',
  checkCalculation: '计算检查',
  theoremUsed: '所用定理',
  tweakParams: '参数影响',
  branchAlternative: '另解延续',
  verifyAnswer: '验证答案',
  allSolutions: '全部解法',
  generalize: '推广变式',
  takeaway: '收获总结',
  generatePractice: '同类练习',
};

export const usePolyaStore = create<PolyaState>((set, get) => ({
  problem: '',
  inputProblem: '',
  solution: null,
  steps: [],
  currentPhase: 'understanding',
  completedPhases: [],
  selectedStepId: null,
  results: [],
  flagged: [],
  expandedSubSteps: [],
  difficulty: 'standard',
  teacherMode: false,
  engineId: 'mock',
  viewMode: 'list',
  inputCollapsed: false,
  globalAskOpen: false,
  solving: false,
  solveError: null,
  history: [],

  setInputProblem: (v) => set({ inputProblem: v }),

  submitProblem: (problem) => {
    if (!problem.trim()) {
      return;
    }
    postMessage({ type: 'solve', problem });
    get().onSolutionStart(problem);
  },

  onSolutionStart: (problem) =>
    set({
      problem,
      solving: true,
      solveError: null,
      solution: null,
      steps: [],
      results: [],
      selectedStepId: null,
      currentPhase: 'understanding',
      completedPhases: [],
      inputCollapsed: true,
    }),

  onSolution: (s) => {
    const phases = Array.from(new Set(s.steps.map((st) => st.phase)));
    set({
      solution: s,
      steps: s.steps,
      solving: false,
      completedPhases: phases.filter((p) => p !== 'looking-back'),
    });
    get().addHistory(`求解题目：${s.problem.slice(0, 20)}`);
  },

  onSolveError: (msg) => set({ solving: false, solveError: msg }),

  selectStep: (id) => {
    set({ selectedStepId: id });
    if (id) {
      const step = findStep(get().steps, id);
      if (step) {
        set({ currentPhase: step.phase });
      }
    }
  },

  setPhase: (p) => set({ currentPhase: p }),

  toggleSubSteps: (id) => {
    const cur = get().expandedSubSteps;
    set({
      expandedSubSteps: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    });
  },

  runAction: (action, stepId, question) => {
    const requestId = newRequestId();
    // 立刻插入一个 streaming 占位结果，提升响应感。
    const title = ACTION_TITLES[action] ?? action;
    set((s) => ({
      results: [
        ...s.results,
        { requestId, stepId, action, title, content: '', status: 'streaming' as const },
      ],
    }));
    postMessage({ type: 'action', requestId, action, stepId, question });
    get().addHistory(`${title}（步骤 ${stepId}）`);
  },

  runGlobalAsk: (question) => {
    const requestId = newRequestId();
    set((s) => ({
      results: [
        ...s.results,
        {
          requestId,
          stepId: '__global__',
          action: 'ask',
          title: `全局提问：${question.slice(0, 16)}`,
          content: '',
          status: 'streaming' as const,
        },
      ],
      globalAskOpen: false,
    }));
    postMessage({ type: 'globalAsk', requestId, question });
    get().addHistory(`全局提问：${question.slice(0, 16)}`);
  },

  toggleFlag: (stepId) => {
    const cur = get().flagged;
    set({ flagged: cur.includes(stepId) ? cur.filter((x) => x !== stepId) : [...cur, stepId] });
  },

  copyStep: (stepId) => {
    const step = findStep(get().steps, stepId);
    if (step) {
      postMessage({ type: 'copy', text: step.content });
    }
  },

  setDifficulty: (d) => {
    set({ difficulty: d });
    postMessage({ type: 'setDifficulty', difficulty: d });
  },

  setViewMode: (m) => set({ viewMode: m }),
  setInputCollapsed: (v) => set({ inputCollapsed: v }),
  setGlobalAskOpen: (v) => set({ globalAskOpen: v }),

  initFromExt: (d, teacherMode, engine) =>
    set({ difficulty: d, teacherMode, engineId: engine }),

  onActionStart: (requestId, action, stepId) =>
    set((s) => {
      // 占位已在 runAction 中创建；若不存在（极少数）则补建。
      if (s.results.some((r) => r.requestId === requestId)) {
        return {};
      }
      return {
        results: [
          ...s.results,
          {
            requestId,
            stepId,
            action,
            title: ACTION_TITLES[action] ?? action,
            content: '',
            status: 'streaming' as const,
          },
        ],
      };
    }),

  onActionChunk: (requestId, chunk) =>
    set((s) => ({
      results: s.results.map((r) =>
        r.requestId === requestId ? { ...r, content: r.content + chunk } : r
      ),
    })),

  onActionEnd: (requestId, meta) =>
    set((s) => ({
      results: s.results.map((r) =>
        r.requestId === requestId
          ? { ...r, status: 'done' as const, meta: meta ?? r.meta }
          : r
      ),
    })),

  onActionError: (requestId, message) =>
    set((s) => ({
      results: s.results.map((r) =>
        r.requestId === requestId
          ? { ...r, status: 'error' as const, content: r.content || message }
          : r
      ),
    })),

  dismissResult: (requestId) =>
    set((s) => ({ results: s.results.filter((r) => r.requestId !== requestId) })),

  addHistory: (label) =>
    set((s) => ({
      history: [{ id: newRequestId(), label, time: Date.now() }, ...s.history].slice(0, 50),
    })),

  undoLast: () =>
    set((s) => {
      // 撤销：移除最近一条结果（若有），并移除一条历史。
      const results = s.results.slice(0, -1);
      const history = s.history.slice(1);
      return { results, history };
    }),
}));

/** 在步骤树（含子步骤）中查找。 */
export function findStep(steps: SolutionStep[], id: string): SolutionStep | undefined {
  for (const s of steps) {
    if (s.id === id) {
      return s;
    }
    if (s.subSteps) {
      const f = findStep(s.subSteps, id);
      if (f) {
        return f;
      }
    }
  }
  return undefined;
}

/** 计算阶段进度（0~1）。 */
export function phaseProgress(completed: Phase[]): number {
  return completed.length / PHASE_ORDER.length;
}
