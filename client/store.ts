// 使用 Zustand 管理 Webview 全局状态：题目、步骤、阶段、选中、动作结果、UI 设置等。
import { create } from 'zustand';
import {
  ActionResultMeta,
  ConversationThread,
  Difficulty,
  LearningEntry,
  MenuActionId,
  MicroStep,
  Phase,
  PHASE_ORDER,
  Solution,
  SolutionBranch,
  SolutionStep,
  SubGoal,
} from '../shared/types';
import { normalizeSteps } from '../shared/normalizeStep';
import { ACTION_TITLES, buildActionTitle, routeAction } from './actions/actionRouter';
import { newRequestId, postMessage, showToast } from './transport';

/** 一条动作结果卡片（解释 / 验算 / 对比等）。 */
export interface ActionResult {
  requestId: string;
  stepId: string;
  action: MenuActionId;
  title: string;
  content: string;
  meta?: ActionResultMeta;
  status: 'streaming' | 'done' | 'error' | 'cancelled';
  question?: string;
  selectedText?: string;
  difficultyAtCreation?: Difficulty;
}

/** 历史记录条目。 */
export interface HistoryEntry {
  id: string;
  label: string;
  time: number;
}

/** 状态快照（用于真撤销）。 */
export interface StateSnapshot {
  id: string;
  label: string;
  time: number;
  steps: SolutionStep[];
  results: ActionResult[];
  branches: SolutionBranch[];
  threads: Record<string, ConversationThread>;
  activeBranchId: string | null;
  selectedStepId: string | null;
  completedPhases: Phase[];
}

/** 一道题的完整会话快照（用于举一反三「完整解答」的逐层回退与缓存恢复）。 */
export interface SessionSnapshot {
  problem: string;
  solution: Solution | null;
  steps: SolutionStep[];
  results: ActionResult[];
  selectedStepId: string | null;
  currentPhase: Phase;
  completedPhases: Phase[];
  interactedPhases: Phase[];
  viewedPhases: Phase[];
  branches: SolutionBranch[];
  activeBranchId: string | null;
  threads: Record<string, ConversationThread>;
  subGoalsMermaid: string | null;
  subGoals: SubGoal[];
  showFinalAnswer: boolean;
  restateConfirmed: boolean;
  activeBreakdown: ActionResultMeta['breakdown'] | null;
  currentSubProblemIndex: number | null;
  subProblems: { index: number; label: string; text: string }[];
  subProblemStatus: Record<number, 'pending' | 'solving' | 'done'>;
  selectedSubProblemIndex: number | null;
  flagged: string[];
  expandedSubSteps: string[];
}

export type ViewMode = 'list' | 'mindmap';

interface PolyaState {
  problem: string;
  inputProblem: string;
  solution: Solution | null;
  steps: SolutionStep[];
  currentPhase: Phase;
  completedPhases: Phase[];
  selectedStepId: string | null;
  results: ActionResult[];
  flagged: string[];
  expandedSubSteps: string[];
  difficulty: Difficulty;
  teacherMode: boolean;
  engineId: string;
  viewMode: ViewMode;
  inputCollapsed: boolean;
  globalAskOpen: boolean;
  solving: boolean;
  solveError: string | null;
  history: HistoryEntry[];
  threads: Record<string, ConversationThread>;
  branches: SolutionBranch[];
  activeBranchId: string | null;
  snapshots: StateSnapshot[];
  subGoalsMermaid: string | null;
  difficultyRefreshPrompt: string | null;
  interactedPhases: Phase[];
  viewedPhases: Phase[];
  showFinalAnswer: boolean;
  pendingAskStepId: string | null;
  pendingAskPrefill: string;
  restateConfirmed: boolean;
  learnings: LearningEntry[];
  subGoals: SubGoal[];
  activeBreakdown: ActionResultMeta['breakdown'] | null;
  solvingPhase: Phase | null;
  solvingChunk: string;
  compareSnapshotId: string | null;
  difficultyResubmitPrompt: boolean;
  /** 当前正在处理的子问题索引（1-based，多子问题时使用）。 */
  currentSubProblemIndex: number | null;
  /** 检测到的子问题列表。 */
  subProblems: { index: number; label: string; text: string }[];
  /** 子问题求解状态。 */
  subProblemStatus: Record<number, 'pending' | 'solving' | 'done'>;
  /** 用户当前选中查看的子问题索引（1-based），null 表示查看全部。 */
  selectedSubProblemIndex: number | null;
  /** 举一反三「完整解答」导航栈：每进入一层变式题解答入栈一层，可逐层回退。 */
  sessionStack: SessionSnapshot[];
  /** 已解答题目的会话缓存（按题面文本键控），回退或重进时直接恢复，不再请求 AI。 */
  sessionCache: Record<string, SessionSnapshot>;

  setInputProblem: (v: string) => void;
  submitProblem: (problem: string) => void;
  onSolutionStart: (problem: string) => void;
  onSolutionPhaseStart: (phase: Phase) => void;
  onSolutionPhaseSteps: (phase: Phase, steps: SolutionStep[]) => void;
  onSolutionPhaseChunk: (phase: Phase, chunk: string) => void;
  onSolution: (s: Solution) => void;
  onSolveError: (msg: string) => void;
  onSubProblemSteps: (requestId: string, index: number, steps: SolutionStep[]) => void;
  onSubProblemError: (requestId: string, index: number, message: string) => void;
  onBranchStepsAppended: (branchId: string, steps: SolutionStep[]) => void;
  selectStep: (id: string | null) => void;
  setPhase: (p: Phase) => void;
  toggleSubSteps: (id: string) => void;
  runAction: (action: MenuActionId, stepId: string, question?: string, selectedText?: string) => void;
  runSubProblem: (index: number, subProblem: string) => string;
  runGlobalAsk: (question: string) => void;
  toggleFlag: (stepId: string) => void;
  copyStep: (stepId: string) => void;
  setDifficulty: (d: Difficulty) => void;
  confirmDifficultyRefresh: (yes: boolean, resubmit?: boolean) => void;
  setRestateConfirmed: (v: boolean) => void;
  addLearning: (content: string, stepId?: string) => void;
  markPhaseViewed: (phase: Phase) => void;
  continueBranch: (branchId: string) => void;
  setCompareSnapshot: (id: string | null) => void;
  getStepWarning: (stepId: string) => boolean;
  refreshResult: (requestId: string) => void;
  setViewMode: (m: ViewMode) => void;
  setInputCollapsed: (v: boolean) => void;
  setGlobalAskOpen: (v: boolean) => void;
  setShowFinalAnswer: (v: boolean) => void;
  setPendingAsk: (stepId: string | null, prefill?: string) => void;
  initFromExt: (d: Difficulty, teacherMode: boolean, engine: string) => void;
  onActionStart: (requestId: string, action: MenuActionId, stepId: string) => void;
  onActionChunk: (requestId: string, chunk: string) => void;
  onActionEnd: (requestId: string, meta?: ActionResultMeta) => void;
  onActionError: (requestId: string, message: string) => void;
  onActionCancelled: (requestId: string) => void;
  cancelAction: (requestId: string) => void;
  dismissResult: (requestId: string) => void;
  addHistory: (label: string) => void;
  undoLast: () => void;
  pushSnapshot: (label: string) => void;
  setActiveBranch: (branchId: string | null) => void;
  addBranch: (branch: SolutionBranch) => void;
  appendThreadMessage: (stepId: string, role: 'user' | 'assistant', content: string) => void;
  getDisplaySteps: () => SolutionStep[];
  markPhaseInteracted: (phase: Phase) => void;
  recomputeCompletedPhases: () => void;
  onSubProblemStart: (index: number, label: string, subProblem: string) => void;
  onSubProblemComplete: (index: number, finalAnswer?: string) => void;
  setSelectedSubProblem: (index: number | null) => void;
  /** 解答举一反三变式题：当前会话入栈并缓存，命中缓存则直接恢复，否则重新求解。 */
  solveVariantProblem: (problem: string) => void;
  /** 返回上一题：恢复栈顶会话；当前已解答会话写入缓存。 */
  goBackSession: () => void;
}

const MAX_BRANCHES = 3;
const MAX_SNAPSHOTS = 30;
const MAX_SESSION_STACK = 10;
const MAX_SESSION_CACHE = 20;

/** 捕获当前会话的完整快照。 */
function captureSession(s: PolyaState): SessionSnapshot {
  return {
    problem: s.problem,
    solution: s.solution,
    steps: s.steps,
    results: s.results,
    selectedStepId: s.selectedStepId,
    currentPhase: s.currentPhase,
    completedPhases: s.completedPhases,
    interactedPhases: s.interactedPhases,
    viewedPhases: s.viewedPhases,
    branches: s.branches,
    activeBranchId: s.activeBranchId,
    threads: s.threads,
    subGoalsMermaid: s.subGoalsMermaid,
    subGoals: s.subGoals,
    showFinalAnswer: s.showFinalAnswer,
    restateConfirmed: s.restateConfirmed,
    activeBreakdown: s.activeBreakdown,
    currentSubProblemIndex: s.currentSubProblemIndex,
    subProblems: s.subProblems,
    subProblemStatus: s.subProblemStatus,
    selectedSubProblemIndex: s.selectedSubProblemIndex,
    flagged: s.flagged,
    expandedSubSteps: s.expandedSubSteps,
  };
}

/** 由会话快照还原出的状态字段（同时复位求解/提示类瞬态）。 */
function restoreSessionFields(snap: SessionSnapshot): Partial<PolyaState> {
  return {
    problem: snap.problem,
    solution: snap.solution,
    steps: snap.steps,
    results: snap.results,
    selectedStepId: snap.selectedStepId,
    currentPhase: snap.currentPhase,
    completedPhases: snap.completedPhases,
    interactedPhases: snap.interactedPhases,
    viewedPhases: snap.viewedPhases,
    branches: snap.branches,
    activeBranchId: snap.activeBranchId,
    threads: snap.threads,
    subGoalsMermaid: snap.subGoalsMermaid,
    subGoals: snap.subGoals,
    showFinalAnswer: snap.showFinalAnswer,
    restateConfirmed: snap.restateConfirmed,
    activeBreakdown: snap.activeBreakdown,
    currentSubProblemIndex: snap.currentSubProblemIndex,
    subProblems: snap.subProblems,
    subProblemStatus: snap.subProblemStatus,
    selectedSubProblemIndex: snap.selectedSubProblemIndex,
    flagged: snap.flagged,
    expandedSubSteps: snap.expandedSubSteps,
    solving: false,
    solvingPhase: null,
    solvingChunk: '',
    solveError: null,
    inputCollapsed: true,
    snapshots: [],
    compareSnapshotId: null,
    difficultyRefreshPrompt: null,
    difficultyResubmitPrompt: false,
    pendingAskStepId: null,
    pendingAskPrefill: '',
    globalAskOpen: false,
  };
}

/** 写入会话缓存（按题面键控，超出上限时淘汰最早写入项）。 */
function cacheSession(
  cache: Record<string, SessionSnapshot>,
  snap: SessionSnapshot
): Record<string, SessionSnapshot> {
  if (!snap.problem) {
    return cache;
  }
  const next = { ...cache, [snap.problem]: snap };
  const keys = Object.keys(next);
  if (keys.length > MAX_SESSION_CACHE) {
    delete next[keys[0]];
  }
  return next;
}

function computeCompletedPhases(
  steps: SolutionStep[],
  viewedPhases: Phase[],
  results: ActionResult[]
): Phase[] {
  const done: Phase[] = [];
  for (const p of PHASE_ORDER) {
    const phaseSteps = steps.filter((s) => s.phase === p);
    if (phaseSteps.length === 0) {
      continue;
    }
    const hasViewed = viewedPhases.includes(p);
    const hasAction = phaseSteps.some((s) =>
      results.some((r) => r.stepId === s.id && r.status === 'done')
    );
    if (hasViewed || hasAction) {
      done.push(p);
    }
  }
  return done;
}

function microStepsToSubSteps(micro: MicroStep[], phase: Phase): SolutionStep[] {
  return micro.map((m, i) => ({
    id: m.id || `micro-${i + 1}`,
    phase,
    content: `**${m.label}**${m.op ? `（${m.op}）` : ''}：${typeof m.content === 'string' ? m.content : String(m.content ?? '')}`,
    metadata: {},
  }));
}

function updateStepInTree(steps: SolutionStep[], stepId: string, patch: Partial<SolutionStep>): SolutionStep[] {
  return steps.map((s) => {
    if (s.id === stepId) {
      return { ...s, ...patch };
    }
    if (s.subSteps) {
      return { ...s, subSteps: updateStepInTree(s.subSteps, stepId, patch) };
    }
    return s;
  });
}

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
  threads: {},
  branches: [],
  activeBranchId: null,
  snapshots: [],
  subGoalsMermaid: null,
  difficultyRefreshPrompt: null,
  interactedPhases: [],
  showFinalAnswer: false,
  pendingAskStepId: null,
  pendingAskPrefill: '',
  viewedPhases: [],
  restateConfirmed: false,
  learnings: [],
  subGoals: [],
  activeBreakdown: null,
  solvingPhase: null,
  solvingChunk: '',
  compareSnapshotId: null,
  difficultyResubmitPrompt: false,
  currentSubProblemIndex: null,
  subProblems: [],
  subProblemStatus: {},
  selectedSubProblemIndex: null,
  sessionStack: [],
  sessionCache: {},

  setInputProblem: (v) => set({ inputProblem: v }),

  pushSnapshot: (label) => {
    const s = get();
    const snap: StateSnapshot = {
      id: newRequestId(),
      label,
      time: Date.now(),
      steps: s.steps,
      results: s.results,
      branches: s.branches,
      threads: s.threads,
      activeBranchId: s.activeBranchId,
      selectedStepId: s.selectedStepId,
      completedPhases: s.completedPhases,
    };
    set((st) => ({ snapshots: [snap, ...st.snapshots].slice(0, MAX_SNAPSHOTS) }));
  },

  submitProblem: (problem) => {
    if (!problem.trim()) {
      return;
    }
    get().pushSnapshot('求解前');
    // 输入新题目时清空举一反三导航；重试当前题（题面相同）则保留导航栈
    if (problem !== get().problem) {
      set({ sessionStack: [], sessionCache: {} });
    }
    postMessage({ type: 'solve', problem });
    get().onSolutionStart(problem);
  },

  solveVariantProblem: (problemText) => {
    const text = problemText.trim();
    if (!text || get().solving) {
      return;
    }
    // 当前会话入栈；若已解答完成则写入缓存，供回退/重进时直接恢复
    const cur = captureSession(get());
    set((s) => ({
      sessionStack: [...s.sessionStack, cur].slice(-MAX_SESSION_STACK),
      sessionCache: cur.solution ? cacheSession(s.sessionCache, cur) : s.sessionCache,
    }));
    const cached = get().sessionCache[text];
    if (cached) {
      set(restoreSessionFields(cached));
      postMessage({ type: 'reportState', completedPhases: cached.completedPhases });
      get().addHistory(`打开缓存的变式题解答：${text.slice(0, 20)}`);
      showToast('info', 'Polya：已从缓存恢复该变式题的解答，无需重新求解。');
      return;
    }
    postMessage({ type: 'solve', problem: text });
    get().onSolutionStart(text);
  },

  goBackSession: () => {
    const s = get();
    if (s.solving || s.sessionStack.length === 0) {
      return;
    }
    const cur = captureSession(s);
    const prev = s.sessionStack[s.sessionStack.length - 1];
    set((st) => ({
      sessionStack: st.sessionStack.slice(0, -1),
      sessionCache: cur.solution ? cacheSession(st.sessionCache, cur) : st.sessionCache,
      ...restoreSessionFields(prev),
    }));
    postMessage({ type: 'reportState', completedPhases: prev.completedPhases });
    get().addHistory(`返回上一题：${prev.problem.slice(0, 20)}`);
  },

  onSolutionStart: (problem) =>
    set({
      problem,
      solving: true,
      solvingChunk: '',
      solveError: null,
      solution: null,
      steps: [],
      results: [],
      selectedStepId: null,
      currentPhase: 'understanding',
      completedPhases: [],
      interactedPhases: [],
      viewedPhases: [],
      branches: [],
      activeBranchId: null,
      threads: {},
      subGoalsMermaid: null,
      subGoals: [],
      showFinalAnswer: false,
      snapshots: [],
      inputCollapsed: true,
      restateConfirmed: false,
      learnings: [],
      activeBreakdown: null,
      solvingPhase: null,
      compareSnapshotId: null,
      currentSubProblemIndex: null,
      subProblems: [],
      subProblemStatus: {},
      selectedSubProblemIndex: null,
    }),

  onSolutionPhaseStart: (phase) => set({ solvingPhase: phase }),

  onSolutionPhaseSteps: (phase, newSteps) => {
    const steps = normalizeSteps(newSteps, phase);
    set((s) => ({
      steps: [...s.steps, ...steps],
      currentPhase: phase,
      solvingPhase: phase,
      solvingChunk: '',
    }));
    get().markPhaseViewed(phase);
  },

  onSolutionPhaseChunk: (_phase, chunk) => {
    set((s) => ({ solvingChunk: s.solvingChunk + chunk }));
  },

  onSolution: (s) => {
    const steps = normalizeSteps(s.steps);
    set({
      solution: { ...s, steps },
      steps,
      solving: false,
      solvingPhase: null,
      solvingChunk: '',
      showFinalAnswer: !get().teacherMode,
    });
    get().recomputeCompletedPhases();
    get().addHistory(`求解题目：${s.problem.slice(0, 20)}`);
  },

  onSolveError: (msg) => set({ solving: false, solvingPhase: null, solveError: msg }),

  onSubProblemSteps: (requestId, index, newSteps) => {
    const normSteps = normalizeSteps(newSteps, 'carrying-out');
    set((s) => ({
      results: s.results.map((r) =>
        r.requestId === requestId
          ? {
              ...r,
              status: 'done' as const,
              content: normSteps.map((ns) => ns.content).join('\n\n'),
              meta: { kind: 'text', title: `第 ${index} 小问解答` },
            }
          : r
      ),
    }));
    get().addHistory(`独立求解第 ${index} 小问`);
  },

  onSubProblemError: (requestId, _index, message) =>
    set((s) => ({
      results: s.results.map((r) =>
        r.requestId === requestId ? { ...r, status: 'error' as const, content: r.content || message } : r
      ),
    })),

  onBranchStepsAppended: (branchId, newSteps) => {
    set((s) => ({
      branches: s.branches.map((b) =>
        b.id === branchId
          ? { ...b, alternativeSteps: [...b.alternativeSteps, ...newSteps] }
          : b
      ),
    }));
    get().addHistory(`分支延续 +${newSteps.length} 步`);
  },

  markPhaseInteracted: (phase) => {
    set((s) => {
      const interactedPhases = s.interactedPhases.includes(phase)
        ? s.interactedPhases
        : [...s.interactedPhases, phase];
      return { interactedPhases };
    });
  },

  markPhaseViewed: (phase) => {
    set((s) => {
      if (s.viewedPhases.includes(phase)) {
        return {};
      }
      const viewedPhases = [...s.viewedPhases, phase];
      const completedPhases = computeCompletedPhases(s.steps, viewedPhases, s.results);
      postMessage({ type: 'reportState', completedPhases });
      return { viewedPhases, completedPhases };
    });
  },

  recomputeCompletedPhases: () => {
    const s = get();
    const completedPhases = computeCompletedPhases(s.steps, s.viewedPhases, s.results);
    set({ completedPhases });
    postMessage({ type: 'reportState', completedPhases });
  },

  onSubProblemStart: (index, label, subProblem) => {
    set((s) => ({
      currentSubProblemIndex: index,
      subProblems: s.subProblems.some((p) => p.index === index)
        ? s.subProblems
        : [...s.subProblems, { index, label, text: subProblem }],
      subProblemStatus: { ...s.subProblemStatus, [index]: 'solving' },
    }));
    get().addHistory(`开始求解第 ${index} 小问：${label}`);
  },

  onSubProblemComplete: (index, _finalAnswer) => {
    set((s) => ({
      currentSubProblemIndex: s.currentSubProblemIndex === index ? null : s.currentSubProblemIndex,
      subProblemStatus: { ...s.subProblemStatus, [index]: 'done' },
    }));
    get().addHistory(`第 ${index} 小问求解完成`);
  },

  setSelectedSubProblem: (index) => {
    set({ selectedSubProblemIndex: index });
    // 滚动到该子问题的横幅位置
    if (index !== null) {
      requestAnimationFrame(() => {
        document
          .getElementById(`sub-banner-${index}`)
          ?.scrollIntoView({ behavior: 'smooth' });
      });
    }
  },

  selectStep: (id) => {
    set({ selectedStepId: id });
    if (id) {
      const step = findStep(get().steps, id);
      if (step) {
        set({ currentPhase: step.phase });
        get().markPhaseInteracted(step.phase);
        get().markPhaseViewed(step.phase);
        // 自动同步选中子问题
        if (step.subProblemIndex != null) {
          set({ selectedSubProblemIndex: step.subProblemIndex });
        }
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

  runAction: (action, stepId, question, selectedText) => {
    get().pushSnapshot(`${ACTION_TITLES[action] ?? action}`);
    const state = get();
    const step = findStep(state.steps, stepId);
    if (step) {
      get().markPhaseInteracted(step.phase);
    }

    routeAction(action, stepId, {
      steps: state.steps,
      results: state.results,
      expandedSubSteps: state.expandedSubSteps,
      toggleSubSteps: (id) => get().toggleSubSteps(id),
      addLocalResult: (result) => {
        set((s) => ({
          results: [
            ...s.results,
            {
              ...result,
              status: result.status ?? 'done',
              difficultyAtCreation: s.difficulty,
            },
          ],
        }));
      },
      addHistory: (label) => get().addHistory(label),
      dispatchEngine: (act, sid, q, sel) => {
        const requestId = newRequestId();
        const title = buildActionTitle(act, sel);
        if (act === 'ask' && q) {
          const threadMsg = sel ? `[划选]「${sel}」\n${q}` : q;
          get().appendThreadMessage(sid, 'user', threadMsg);
        }
        set((s) => ({
          results: [
            ...s.results,
            {
              requestId,
              stepId: sid,
              action: act,
              title,
              content: '',
              status: 'streaming' as const,
              question: q,
              selectedText: sel,
              difficultyAtCreation: s.difficulty,
            },
          ],
        }));
        postMessage({
          type: 'action',
          requestId,
          action: act,
          stepId: sid,
          question: q,
          selectedText: sel,
          threadMessages: get().threads[sid]?.messages ?? [],
          problem: get().problem,
          steps: get().steps,
        });
        get().addHistory(`${title}（步骤 ${sid}）`);
        return requestId;
      },
    }, question, selectedText);
  },

  runGlobalAsk: (question) => {
    get().pushSnapshot('全局提问');
    const requestId = newRequestId();
    get().appendThreadMessage('__global__', 'user', question);
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
          question,
          difficultyAtCreation: s.difficulty,
        },
      ],
      globalAskOpen: false,
    }));
    postMessage({
      type: 'globalAsk',
      requestId,
      question,
      threadMessages: get().threads['__global__']?.messages ?? [],
      problem: get().problem,
      steps: get().steps,
    });
    get().addHistory(`全局提问：${question.slice(0, 16)}`);
  },

  runSubProblem: (index, subProblem) => {
    const rid = newRequestId();
    get().pushSnapshot(`独立求解第 ${index} 小问`);
    set((s) => ({
      results: [
        ...s.results,
        {
          requestId: rid,
          stepId: `__sub_${index}__`,
          action: 'ask' as MenuActionId,
          title: `单独求解第 ${index} 小问`,
          content: '',
          status: 'streaming' as const,
          difficultyAtCreation: s.difficulty,
        },
      ],
    }));
    postMessage({ type: 'solveSubProblem', requestId: rid, index, subProblem });
    get().addHistory(`单独求解第 ${index} 小问`);
    return rid;
  },

  appendThreadMessage: (stepId, role, content) => {
    set((s) => {
      const existing = s.threads[stepId] ?? { stepId, messages: [] };
      const messages = [...existing.messages, { role, content, time: Date.now() }];
      return { threads: { ...s.threads, [stepId]: { stepId, messages } } };
    });
  },

  toggleFlag: (stepId) => {
    const cur = get().flagged;
    set({ flagged: cur.includes(stepId) ? cur.filter((x) => x !== stepId) : [...cur, stepId] });
  },

  copyStep: (stepId) => {
    get().runAction('copy', stepId);
  },

  setDifficulty: (d) => {
    const prev = get().difficulty;
    if (prev === d) {
      return;
    }
    const aiResults = get().results.filter(
      (r) => r.status === 'done' && r.action !== 'copy' && r.action !== 'flag'
    );
    if (aiResults.length > 0 || get().steps.length > 0) {
      set({
        difficulty: d,
        difficultyRefreshPrompt: `已切换为「${d === 'concise' ? '简洁' : d === 'detailed' ? '详解' : '标准'}」模式。选择刷新方式：`,
        difficultyResubmitPrompt: true,
      });
      postMessage({ type: 'setDifficulty', difficulty: d });
    } else {
      set({ difficulty: d });
      postMessage({ type: 'setDifficulty', difficulty: d });
    }
  },

  confirmDifficultyRefresh: (yes, resubmit = false) => {
    const prompt = get().difficultyRefreshPrompt;
    set({ difficultyRefreshPrompt: null, difficultyResubmitPrompt: false });
    if (!yes || !prompt) {
      return;
    }
    if (resubmit) {
      const p = get().problem;
      if (p) {
        get().submitProblem(p);
      }
      return;
    }
    const toRefresh = get().results.filter((r) => r.status === 'done');
    set({ results: get().results.filter((r) => r.status !== 'done' || r.action === 'copy') });
    for (const r of toRefresh) {
      if (r.action === 'copy' || r.action === 'flag') {
        continue;
      }
      get().runAction(r.action, r.stepId, r.question, r.selectedText);
    }
  },

  setRestateConfirmed: (v) => {
    set({ restateConfirmed: v });
    if (v) {
      get().addHistory('已确认理解题目');
      showToast('info', 'Polya：已记录「理解一致」。');
    }
  },

  addLearning: (content, stepId) => {
    const entry: LearningEntry = {
      id: newRequestId(),
      content,
      time: Date.now(),
      stepId,
    };
    set((s) => ({ learnings: [entry, ...s.learnings].slice(0, 30) }));
    get().addHistory('收藏学习要点');
  },

  continueBranch: (branchId) => {
    const branch = get().branches.find((b) => b.id === branchId);
    if (!branch) {
      return;
    }
    const requestId = newRequestId();
    postMessage({ type: 'continueBranch', branchId, requestId, branch });
    get().addHistory('沿分支继续求解');
  },

  setCompareSnapshot: (id) => set({ compareSnapshotId: id }),

  getStepWarning: (stepId) => {
    const verifyActions: MenuActionId[] = ['verify', 'checkCalculation', 'verifyAnswer'];
    return get().results.some(
      (r) =>
        r.stepId === stepId &&
        r.status === 'done' &&
        verifyActions.includes(r.action) &&
        (r.meta?.kind === 'warning' || (r.meta?.highlights?.length ?? 0) > 0)
    );
  },

  refreshResult: (requestId) => {
    const r = get().results.find((x) => x.requestId === requestId);
    if (!r) {
      return;
    }
    get().dismissResult(requestId);
    get().runAction(r.action, r.stepId, r.question, r.selectedText);
  },

  setViewMode: (m) => set({ viewMode: m }),
  setInputCollapsed: (v) => set({ inputCollapsed: v }),
  setGlobalAskOpen: (v) => set({ globalAskOpen: v }),
  setShowFinalAnswer: (v) => set({ showFinalAnswer: v }),
  setPendingAsk: (stepId, prefill = '') =>
    set({ pendingAskStepId: stepId, pendingAskPrefill: prefill }),

  initFromExt: (d, teacherMode, engine) =>
    set({ difficulty: d, teacherMode, engineId: engine, showFinalAnswer: !teacherMode }),

  onActionStart: (requestId, action, stepId) =>
    set((s) => {
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
            difficultyAtCreation: s.difficulty,
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

  onActionEnd: (requestId, meta) => {
    const prev = get().results.find((r) => r.requestId === requestId);
    const finalContent = prev ? stripJsonTail(prev.content) : '';

    if (prev && finalContent) {
      get().appendThreadMessage(prev.stepId, 'assistant', finalContent);
      if (meta?.branchSteps && meta.branchSteps.length > 0) {
        if (get().branches.length >= MAX_BRANCHES) {
          postMessage({
            type: 'info',
            message: `Polya：已达分支上限（${MAX_BRANCHES} 条），请先回顾现有分支。`,
          });
        } else {
          get().addBranch({
            id: newRequestId(),
            parentStepId: prev.stepId,
            label: meta.branchLabel ?? '另解',
            alternativeSteps: meta.branchSteps,
          });
        }
      }
      if (meta?.viz?.mermaid && prev.action === 'subGoals') {
        set({ subGoalsMermaid: meta.viz.mermaid });
      }
      if (meta?.subGoals && meta.subGoals.length > 0) {
        set({ subGoals: meta.subGoals });
      }
      if (meta?.breakdown?.sentences?.length) {
        set({ activeBreakdown: meta.breakdown });
      }
      if (
        meta?.microSteps &&
        meta.microSteps.length > 0 &&
        (prev.action === 'detail' || prev.action === 'expandAlgebra')
      ) {
        const step = findStep(get().steps, prev.stepId);
        if (step) {
          const subSteps = microStepsToSubSteps(meta.microSteps, step.phase);
          set((s) => ({
            steps: updateStepInTree(s.steps, prev.stepId, { subSteps }),
            expandedSubSteps: s.expandedSubSteps.includes(prev.stepId)
              ? s.expandedSubSteps
              : [...s.expandedSubSteps, prev.stepId],
          }));
        }
      }
    }

    if (meta?.viz?.mermaid && meta.viz && !meta.viz.kind) {
      meta = { ...meta, viz: { ...meta.viz, kind: 'mermaid' } };
    }

    set((s) => ({
      results: s.results.map((r) =>
        r.requestId === requestId
          ? { ...r, status: 'done' as const, meta: meta ?? r.meta, content: stripJsonTail(r.content) }
          : r
      ),
    }));
    get().recomputeCompletedPhases();
  },

  onActionError: (requestId, message) =>
    set((s) => ({
      results: s.results.map((r) =>
        r.requestId === requestId
          ? { ...r, status: 'error' as const, content: r.content || message }
          : r
      ),
    })),

  onActionCancelled: (requestId) =>
    set((s) => ({
      results: s.results.map((r) =>
        r.requestId === requestId ? { ...r, status: 'cancelled' as const } : r
      ),
    })),

  cancelAction: (requestId) => {
    postMessage({ type: 'cancelAction', requestId });
  },

  dismissResult: (requestId) =>
    set((s) => ({ results: s.results.filter((r) => r.requestId !== requestId) })),

  addHistory: (label) =>
    set((s) => ({
      history: [{ id: newRequestId(), label, time: Date.now() }, ...s.history].slice(0, 50),
    })),

  undoLast: () => {
    const snaps = get().snapshots;
    if (snaps.length === 0) {
      const s = get();
      set({
        results: s.results.slice(0, -1),
        history: s.history.slice(1),
      });
      return;
    }
    const [latest, ...rest] = snaps;
    set({
      steps: latest.steps,
      results: latest.results,
      branches: latest.branches,
      threads: latest.threads,
      activeBranchId: latest.activeBranchId,
      selectedStepId: latest.selectedStepId,
      completedPhases: latest.completedPhases,
      snapshots: rest,
      history: get().history.slice(1),
    });
  },

  setActiveBranch: (branchId) => {
    get().pushSnapshot('切换分支');
    set({ activeBranchId: branchId });
  },

  addBranch: (branch) => {
    set((s) => ({ branches: [...s.branches, branch], activeBranchId: branch.id }));
  },

  getDisplaySteps: () => {
    const { steps, branches, activeBranchId } = get();
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
  },
}));

/** 从显示文本中移除 JSON 尾块（结构化数据已通过 meta 传递）。 */
function stripJsonTail(content: string): string {
  return content.replace(/```json\s*[\s\S]*?```/g, '').trim();
}

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

export { ACTION_TITLES };
