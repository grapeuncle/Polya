// 解题引擎接口抽象。所有具体引擎（Mock / OpenAI / Anthropic / DeepSeek）都实现该接口。
import {
  ActionResultMeta,
  MenuActionId,
  Phase,
  Solution,
  SolutionStep,
  SolverContext,
} from '../shared/types';

/** 流式回调：每产生一段文本即调用一次 onChunk。 */
export interface StreamHandlers {
  onChunk: (chunk: string) => void;
  /** 可选：返回结构化元信息（用于决定渲染方式）。 */
  onMeta?: (meta: ActionResultMeta) => void;
  /** 取消信号。 */
  signal?: AbortSignal;
}

/** 分阶段解题流式回调。 */
export interface SolutionStreamHandlers {
  /** 开始处理某个子问题（多子问题时每个子问题开始时触发）。 */
  onSubProblemStart?: (index: number, label: string, subProblem: string) => void;
  onPhaseStart: (phase: Phase) => void;
  onPhaseChunk?: (phase: Phase, chunk: string) => void;
  onPhaseSteps: (phase: Phase, steps: SolutionStep[]) => void;
  /** 某个子问题完成时触发（携带该子问题的最终答案）。 */
  onSubProblemComplete?: (index: number, finalAnswer?: string) => void;
  onComplete: (solution: Solution) => void;
  signal?: AbortSignal;
}

export interface ISolverEngine {
  /** 引擎标识，用于 UI 显示当前使用的引擎。 */
  readonly id: string;

  /** 生成完整的波利亚四阶段解题方案。 */
  generateSolution(problem: string, ctx: SolverContext): Promise<Solution>;

  /** 分阶段推送解题步骤（推荐用于 UI 渐进展示）。 */
  generateSolutionStreaming(
    problem: string,
    ctx: SolverContext,
    handlers: SolutionStreamHandlers
  ): Promise<Solution>;

  /** 沿分支继续追加解题步骤。 */
  continueBranch(
    branchId: string,
    ctx: SolverContext,
    handlers: StreamHandlers
  ): Promise<SolutionStep[]>;

  /**
   * 解释某个步骤（如"解释这一步""为什么这样做"等）。
   * 通过 StreamHandlers 流式输出，返回 Promise 在结束时 resolve。
   */
  explainStep(
    action: MenuActionId,
    stepId: string,
    ctx: SolverContext,
    handlers: StreamHandlers,
    question?: string,
    selectedText?: string
  ): Promise<void>;

  /** 检验某个步骤（验算）。复用 explainStep 的流式机制，这里单独暴露以贴合需求接口。 */
  checkStep(
    stepId: string,
    ctx: SolverContext,
    handlers: StreamHandlers
  ): Promise<void>;

  /** 针对整道题的全局提问。 */
  globalAsk(
    question: string,
    ctx: SolverContext,
    handlers: StreamHandlers
  ): Promise<void>;

  /** 对单小问求解（用于大题分小问独立重试）。 */
  solveSubProblem?(
    subProblemIndex: number,
    subProblem: string,
    ctx: SolverContext,
    handlers: StreamHandlers
  ): Promise<SolutionStep[]>;
}
