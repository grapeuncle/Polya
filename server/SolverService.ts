// 会话级解题服务：由原 PanelManager 逻辑演化，通过回调推送 ExtToWebviewMessage 事件。
import { ISolverEngine, StreamHandlers } from '../engines/ISolverEngine';
import { createEngine } from '../engines/factory';
import {
  formatSymbolicVerification,
  SymbolicVerification,
  verifyEquations,
} from '../engines/symbolicVerifier';
import {
  ActionResultMeta,
  ConversationMessage,
  Difficulty,
  ExtToWebviewMessage,
  MenuActionId,
  Phase,
  SolutionBranch,
  SolutionStep,
  SolverContext,
  WebviewToExtMessage,
} from '../shared/types';
import { AppConfig } from '../shared/appConfig';

/** 需要符号引擎客观兜底的「验证类」动作。 */
const SYMBOLIC_VERIFY_ACTIONS = new Set<MenuActionId>(['verify', 'checkCalculation', 'verifyAnswer']);

export interface SessionPrefs {
  difficulty: Difficulty;
  teacherMode: boolean;
}

export class SolverService {
  private engine!: ISolverEngine;
  private problem = '';
  private steps: SolutionStep[] = [];
  private completedPhases: Phase[] = [];
  private inflight = new Map<string, AbortController>();
  private threadSnapshots = new Map<string, ConversationMessage[]>();
  private prefs: SessionPrefs = { difficulty: 'standard', teacherMode: false };

  onEvent: (msg: ExtToWebviewMessage) => void = () => {};

  constructor(private readonly appConfig: AppConfig) {}

  get engineId(): string {
    return this.engine?.id ?? 'mock';
  }

  async init(prefs?: Partial<SessionPrefs>): Promise<void> {
    if (prefs?.difficulty) {
      this.prefs.difficulty = prefs.difficulty;
    }
    if (prefs?.teacherMode !== undefined) {
      this.prefs.teacherMode = prefs.teacherMode;
    }
    this.engine = await createEngine(this.appConfig);
  }

  updatePrefs(prefs: Partial<SessionPrefs>): void {
    if (prefs.difficulty) {
      this.prefs.difficulty = prefs.difficulty;
    }
    if (prefs.teacherMode !== undefined) {
      this.prefs.teacherMode = prefs.teacherMode;
    }
  }

  getInitPayload() {
    return {
      difficulty: this.prefs.difficulty,
      teacherMode: this.prefs.teacherMode,
      engine: this.engineId,
    };
  }

  async handleMessage(msg: WebviewToExtMessage): Promise<void> {
    switch (msg.type) {
      case 'solve':
        this.startSolve(msg.problem);
        break;
      case 'continueBranch':
        await this.runContinueBranch(msg);
        break;
      case 'action':
        await this.runAction(msg);
        break;
      case 'globalAsk':
        await this.runGlobalAsk(msg.requestId, msg.question, msg.threadMessages);
        break;
      case 'setDifficulty':
        this.prefs.difficulty = msg.difficulty;
        this.emit({ type: 'difficultyChanged', difficulty: msg.difficulty });
        break;
      case 'cancelAction': {
        const ctrl = this.inflight.get(msg.requestId);
        if (ctrl) {
          ctrl.abort();
          this.inflight.delete(msg.requestId);
          this.emit({ type: 'actionCancelled', requestId: msg.requestId });
        }
        break;
      }
      case 'reportState':
        this.completedPhases = msg.completedPhases;
        break;
      case 'solveSubProblem':
        await this.runSubProblem(msg);
        break;
      default:
        break;
    }
  }

  async startSolve(problem: string): Promise<void> {
    this.emit({ type: 'solutionStart', problem });
    await this.solve(problem);
  }

  private async solve(problem: string): Promise<void> {
    this.problem = problem;
    this.steps = [];
    let currentPhase: Phase = 'understanding';
    const startedAt = Date.now();
    const heartbeatTimer = setInterval(() => {
      this.emit({ type: 'solutionHeartbeat', phase: currentPhase, elapsedMs: Date.now() - startedAt });
    }, 30000);
    try {
      if (!this.engine) {
        this.engine = await createEngine(this.appConfig);
      }
      const ctx = this.buildContext();
      const solution = await this.engine.generateSolutionStreaming(problem, ctx, {
        onSubProblemStart: (index, label, subProblem) => {
          this.emit({ type: 'subProblemStart', index, label, subProblem });
        },
        onPhaseStart: (phase) => {
          currentPhase = phase;
          this.emit({ type: 'solutionPhaseStart', phase });
        },
        onPhaseSteps: (phase, steps) => {
          this.steps = [...this.steps, ...steps];
          this.emit({ type: 'solutionPhaseSteps', phase, steps });
        },
        onPhaseChunk: (phase, chunk) => {
          this.emit({ type: 'solutionPhaseChunk', phase, chunk });
        },
        onSubProblemComplete: (index, finalAnswer) => {
          this.emit({ type: 'subProblemComplete', index, finalAnswer });
        },
        onComplete: (sol) => {
          this.steps = sol.steps;
          this.emit({ type: 'solution', solution: sol });
        },
      });
      this.steps = solution.steps;
      this.runBackgroundSymbolicCheck();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.emit({ type: 'solveError', message });
    } finally {
      clearInterval(heartbeatTimer);
    }
  }

  /**
   * 后台静默符号校验：解题完成后自动全量运行。
   * 只有「可证明的矛盾」才推送上卡；verified / conditional 属于正常情况，不打扰学生。
   */
  private runBackgroundSymbolicCheck(): void {
    try {
      const warnings: { stepId: string; expression: string; detail: string }[] = [];
      const walk = (steps: SolutionStep[]): void => {
        for (const s of steps) {
          const v = verifyEquations(s.content);
          for (const c of v.checks) {
            if (c.verdict === 'contradiction') {
              warnings.push({ stepId: s.id, expression: c.expression, detail: c.detail });
            }
          }
          if (s.subSteps?.length) {
            walk(s.subSteps);
          }
        }
      };
      walk(this.steps);
      this.emit({ type: 'symbolicCheck', warnings, checkedSteps: this.steps.length });
    } catch {
      // 后台校验失败静默降级，不影响主流程
    }
  }

  private async runAction(msg: Extract<WebviewToExtMessage, { type: 'action' }>): Promise<void> {
    const { requestId, action, stepId, question, selectedText, threadMessages } = msg;
    if (threadMessages) {
      this.threadSnapshots.set(stepId, threadMessages);
    }
    const controller = new AbortController();
    this.inflight.set(requestId, controller);
    const handlers: StreamHandlers = {
      onChunk: (chunk) => this.emit({ type: 'actionChunk', requestId, chunk }),
      onMeta: (meta) => this.emit({ type: 'actionEnd', requestId, meta }),
      signal: controller.signal,
    };
    this.emit({ type: 'actionStart', requestId, action, stepId });
    try {
      if (!this.engine) {
        this.engine = await createEngine(this.appConfig);
      }
      const ctx = this.buildContext(stepId, undefined, selectedText);
      // 符号引擎客观校验（P0）：先于 AI 输出确定性结论，矛盾时强制 warning。
      let symbolic: SymbolicVerification | null = null;
      if (SYMBOLIC_VERIFY_ACTIONS.has(action) && ctx.focusedStep) {
        try {
          symbolic = verifyEquations(ctx.focusedStep.content);
        } catch {
          symbolic = null;
        }
        const section = symbolic ? formatSymbolicVerification(symbolic) : '';
        if (section) {
          this.emit({ type: 'actionChunk', requestId, chunk: `${section}\n\n---\n\n` });
        }
      }
      let meta: ActionResultMeta | undefined;
      const wrapped: StreamHandlers = {
        ...handlers,
        onMeta: (m) => {
          meta = m;
        },
      };
      if (action === 'verify') {
        await this.engine.checkStep(stepId, ctx, wrapped);
      } else {
        await this.engine.explainStep(action, stepId, ctx, wrapped, question, selectedText);
      }
      if (symbolic && symbolic.contradictionCount > 0) {
        const symbolicHighlights = symbolic.checks
          .filter((c) => c.verdict === 'contradiction')
          .map((c) => ({
            target: 'step' as const,
            message: `符号引擎：${c.expression} —— ${c.detail}`,
          }));
        meta = {
          ...(meta ?? {}),
          kind: 'warning',
          title: meta?.title ?? '符号校验发现矛盾',
          highlights: [...(meta?.highlights ?? []), ...symbolicHighlights],
        };
      }
      this.emit({ type: 'actionEnd', requestId, meta });
    } catch (e: unknown) {
      if (
        (e instanceof Error && e.name === 'AbortError') ||
        controller.signal.aborted
      ) {
        this.emit({ type: 'actionCancelled', requestId });
      } else {
        const message = e instanceof Error ? e.message : String(e);
        this.emit({ type: 'actionError', requestId, message });
      }
    } finally {
      this.inflight.delete(requestId);
    }
  }

  private async runContinueBranch(
    msg: Extract<WebviewToExtMessage, { type: 'continueBranch' }>
  ): Promise<void> {
    const { branchId, requestId } = msg;
    const controller = new AbortController();
    this.inflight.set(requestId, controller);
    try {
      if (!this.engine) {
        this.engine = await createEngine(this.appConfig);
      }
      const ctx = this.buildContext(undefined, msg.branch);
      const steps = await this.engine.continueBranch(branchId, ctx, {
        signal: controller.signal,
        onChunk: () => {},
      });
      this.emit({ type: 'branchStepsAppended', branchId, steps });
    } catch (e: unknown) {
      if (
        !(e instanceof Error && e.name === 'AbortError') &&
        !controller.signal.aborted
      ) {
        const message = e instanceof Error ? e.message : String(e);
        this.emit({ type: 'actionError', requestId, message });
      }
    } finally {
      this.inflight.delete(requestId);
    }
  }

  private async runGlobalAsk(
    requestId: string,
    question: string,
    threadMessages?: ConversationMessage[]
  ): Promise<void> {
    if (threadMessages) {
      this.threadSnapshots.set('__global__', threadMessages);
    }
    const controller = new AbortController();
    this.inflight.set(requestId, controller);
    this.emit({ type: 'actionStart', requestId, action: 'ask', stepId: '__global__' });
    try {
      if (!this.engine) {
        this.engine = await createEngine(this.appConfig);
      }
      const ctx = this.buildContext();
      let meta;
      await this.engine.globalAsk(question, ctx, {
        onChunk: (chunk) => this.emit({ type: 'actionChunk', requestId, chunk }),
        onMeta: (m) => {
          meta = m;
        },
        signal: controller.signal,
      });
      this.emit({ type: 'actionEnd', requestId, meta });
    } catch (e: unknown) {
      if (
        (e instanceof Error && e.name === 'AbortError') ||
        controller.signal.aborted
      ) {
        this.emit({ type: 'actionCancelled', requestId });
      } else {
        const message = e instanceof Error ? e.message : String(e);
        this.emit({ type: 'actionError', requestId, message });
      }
    } finally {
      this.inflight.delete(requestId);
    }
  }

  private async runSubProblem(
    msg: Extract<WebviewToExtMessage, { type: 'solveSubProblem' }>
  ): Promise<void> {
    const { requestId, index, subProblem } = msg;
    const controller = new AbortController();
    this.inflight.set(requestId, controller);
    try {
      if (!this.engine) {
        this.engine = await createEngine(this.appConfig);
      }
      const ctx = this.buildContext();
      let steps: SolutionStep[] = [];
      if (this.engine.solveSubProblem) {
        steps = await this.engine.solveSubProblem(index, subProblem, ctx, {
          onChunk: (_chunk) => { /* chunks handled via SSE */ },
          signal: controller.signal,
        });
      } else {
        // Fallback: use globalAsk to explain this sub-problem
        await this.engine.globalAsk(`请仅解答第 ${index} 小问：${subProblem}`, ctx, {
          onChunk: (chunk) => this.emit({ type: 'actionChunk', requestId, chunk }),
          signal: controller.signal,
        });
        this.emit({ type: 'actionEnd', requestId });
        return;
      }
      this.emit({ type: 'subProblemSteps', requestId, index, steps });
    } catch (e: unknown) {
      if (
        (e instanceof Error && e.name === 'AbortError') ||
        controller.signal.aborted
      ) {
        this.emit({ type: 'actionCancelled', requestId });
      } else {
        const message = e instanceof Error ? e.message : String(e);
        this.emit({ type: 'subProblemError', requestId, index, message });
      }
    } finally {
      this.inflight.delete(requestId);
    }
  }

  private buildContext(
    focusedStepId?: string,
    activeBranch?: SolutionBranch,
    focusedSelection?: string
  ): SolverContext {
    const focusedStep = focusedStepId
      ? findStepInTree(this.steps, focusedStepId)
      : undefined;
    const currentPhase = focusedStep?.phase ?? 'understanding';
    const threads: SolverContext['conversationThreads'] = {};
    for (const [key, messages] of this.threadSnapshots) {
      threads[key] = { stepId: key, messages };
    }
    return {
      problem: this.problem,
      difficulty: this.prefs.difficulty,
      phaseState: { currentPhase, completedPhases: this.completedPhases },
      steps: this.steps,
      focusedStep,
      teacherMode: this.prefs.teacherMode,
      conversationThreads: threads,
      activeBranch,
      focusedSelection,
    };
  }

  private emit(msg: ExtToWebviewMessage): void {
    this.onEvent(msg);
  }

  dispose(): void {
    for (const c of this.inflight.values()) {
      c.abort();
    }
    this.inflight.clear();
  }
}

function findStepInTree(steps: SolutionStep[], id: string): SolutionStep | undefined {
  for (const s of steps) {
    if (s.id === id) {
      return s;
    }
    if (s.subSteps) {
      const f = findStepInTree(s.subSteps, id);
      if (f) {
        return f;
      }
    }
  }
  return undefined;
}
