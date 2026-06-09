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
import { newRequestId, postMessage, showToast } from './api/transport';

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
  compareSnapshotId: string | null;
  difficultyResubmitPrompt: boolean;

  setInputProblem: (v: string) => void;
  submitProblem: (problem: string) => void;
  onSolutionStart: (problem: string) => void;
  onSolutionPhaseStart: (phase: Phase) => void;
  onSolutionPhaseSteps: (phase: Phase, steps: SolutionStep[]) => void;
  onSolution: (s: Solution) => void;
  onSolveError: (msg: string) => void;
  onBranchStepsAppended: (branchId: string, steps: SolutionStep[]) => void;
  selectStep: (id: string | null) => void;
  setPhase: (p: Phase) => void;
  toggleSubSteps: (id: string) => void;
  runAction: (action: MenuActionId, stepId: string, question?: string, selectedText?: string) => void;
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
}

const MAX_BRANCHES = 3;
const MAX_SNAPSHOTS = 30;

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
  compareSnapshotId: null,
  difficultyResubmitPrompt: false,

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
    }),

  onSolutionPhaseStart: (phase) => set({ solvingPhase: phase }),

  onSolutionPhaseSteps: (phase, newSteps) => {
    const steps = normalizeSteps(newSteps, phase);
    set((s) => ({
      steps: [...s.steps, ...steps],
      currentPhase: phase,
      solvingPhase: phase,
    }));
    get().markPhaseViewed(phase);
  },

  onSolution: (s) => {
    const steps = normalizeSteps(s.steps);
    set({
      solution: { ...s, steps },
      steps,
      solving: false,
      solvingPhase: null,
      showFinalAnswer: !get().teacherMode,
    });
    get().recomputeCompletedPhases();
    get().addHistory(`求解题目：${s.problem.slice(0, 20)}`);
  },

  onSolveError: (msg) => set({ solving: false, solvingPhase: null, solveError: msg }),

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

  selectStep: (id) => {
    set({ selectedStepId: id });
    if (id) {
      const step = findStep(get().steps, id);
      if (step) {
        set({ currentPhase: step.phase });
        get().markPhaseInteracted(step.phase);
        get().markPhaseViewed(step.phase);
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
    });
    get().addHistory(`全局提问：${question.slice(0, 16)}`);
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
