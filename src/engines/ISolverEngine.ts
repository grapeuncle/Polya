// 解题引擎接口抽象。所有具体引擎（Mock / OpenAI / Anthropic）都实现该接口。
import {
  ActionResultMeta,
  MenuActionId,
  Solution,
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

export interface ISolverEngine {
  /** 引擎标识，用于 UI 显示当前使用的引擎。 */
  readonly id: string;

  /** 生成完整的波利亚四阶段解题方案。 */
  generateSolution(problem: string, ctx: SolverContext): Promise<Solution>;

  /**
   * 解释某个步骤（如"解释这一步""为什么这样做"等）。
   * 通过 StreamHandlers 流式输出，返回 Promise 在结束时 resolve。
   */
  explainStep(
    action: MenuActionId,
    stepId: string,
    ctx: SolverContext,
    handlers: StreamHandlers,
    question?: string
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
}
