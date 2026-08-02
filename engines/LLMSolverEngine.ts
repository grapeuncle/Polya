// 调用真实大模型（OpenAI / Anthropic / DeepSeek 兼容接口）的解题引擎，支持流式响应。
// 使用全局 fetch（Node 18+ / VS Code 内置）。
import { ISolverEngine, SolutionStreamHandlers, StreamHandlers } from './ISolverEngine';
import {
  MenuActionId,
  Phase,
  PHASE_ORDER,
  Solution,
  SolutionStep,
  SolverContext,
  SubProblemSolution,
} from '../shared/types';
import { detectSubProblems } from '../shared/subProblemDetector';
import { parseActionOutput } from './parseActionOutput';
import { parsePhaseSteps } from './parseSolution';
import {
  SYSTEM_PROMPT,
  buildActionPrompt,
  buildContinueBranchPrompt,
  buildGlobalAskPrompt,
  buildPhaseSolutionPrompt,
  buildSubProblemPhasePrompt,
  buildSubProblemPrompt,
} from './prompts';
import { sanitizeLatexJson } from './jsonSanitizer';

export type LLMProvider = 'openai' | 'anthropic' | 'deepseek';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export class LLMSolverEngine implements ISolverEngine {
  readonly id: string;

  constructor(private config: LLMConfig) {
    this.id = config.provider;
    if (!config.apiKey) {
      throw new Error('未配置 API 密钥。请在服务端 .env 中设置 POLYA_API_KEY。');
    }
  }

  async generateSolution(problem: string, ctx: SolverContext): Promise<Solution> {
    return this.generateSolutionStreaming(problem, ctx, {
      onPhaseStart: () => {},
      onPhaseSteps: () => {},
      onComplete: () => {},
    });
  }

  async generateSolutionStreaming(
    problem: string,
    ctx: SolverContext,
    handlers: SolutionStreamHandlers
  ): Promise<Solution> {
    // 1. 检测是否包含多个子问题
    const subProblems = detectSubProblems(problem);

    if (subProblems.length === 0) {
      // 无子问题，走原来的单题四阶段流程
      return this.solveSingleProblem(problem, ctx, handlers);
    }

    // 2. 依次处理每个子问题：每个子问题独立走完四阶段
    const allSteps: SolutionStep[] = [];
    const subSolutions: SubProblemSolution[] = [];
    const subAnswers: { id: number; label: string; answer: string }[] = [];
    const completedResults: { index: number; label: string; finalAnswer?: string }[] = [];

    for (const sub of subProblems) {
      if (handlers.signal?.aborted) {
        break;
      }

      handlers.onSubProblemStart?.(sub.index, sub.label, sub.text);

      const subSteps: SolutionStep[] = [];
      let subFinalAnswer: string | undefined;

      for (const phase of PHASE_ORDER) {
        if (handlers.signal?.aborted) {
          break;
        }

        handlers.onPhaseStart(phase);

        const prompt = buildSubProblemPhasePrompt(
          problem,
          sub.text,
          sub.index,
          phase,
          ctx.difficulty,
          completedResults,
          subSteps
        );

        let raw = '';
        await this.streamChat(SYSTEM_PROMPT, prompt, {
          onChunk: (c) => {
            raw += c;
            handlers.onPhaseChunk?.(phase, c);
          },
          signal: handlers.signal,
        });

        const phaseSteps = parsePhaseSteps(raw, phase);
        if (phaseSteps.length === 0) {
          continue;
        }

        // 标记步骤属于当前子问题
        for (const s of phaseSteps) {
          s.subProblemIndex = sub.index;
        }

        subSteps.push(...phaseSteps);
        allSteps.push(...phaseSteps);
        handlers.onPhaseSteps(phase, phaseSteps);

        // 尝试从 looking-back 阶段提取 finalAnswer
        if (phase === 'looking-back') {
          try {
            const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
            const jsonText = fence ? fence[1] : raw;
            const start = jsonText.indexOf('{');
            const end = jsonText.lastIndexOf('}');
            if (start >= 0 && end > start) {
              const sanitized = sanitizeLatexJson(jsonText.slice(start, end + 1));
              const obj = JSON.parse(sanitized);
              if (obj.finalAnswer) {
                subFinalAnswer = obj.finalAnswer;
              }
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      // 记录当前子问题的完整结果
      const phasesMap: Partial<Record<Phase, SolutionStep[]>> = {};
      for (const phase of PHASE_ORDER) {
        const ps = subSteps.filter((s) => s.phase === phase);
        if (ps.length > 0) {
          phasesMap[phase] = ps;
        }
      }

      subSolutions.push({
        index: sub.index,
        label: sub.label,
        subProblem: sub.text,
        phases: phasesMap,
        finalAnswer: subFinalAnswer,
      });

      if (subFinalAnswer) {
        subAnswers.push({ id: sub.index, label: sub.label, answer: subFinalAnswer });
      }

      completedResults.push({
        index: sub.index,
        label: sub.label,
        finalAnswer: subFinalAnswer,
      });

      handlers.onSubProblemComplete?.(sub.index, subFinalAnswer);
    }

    // 组装最终结果
    const solution: Solution = {
      problem,
      steps: allSteps,
      subAnswers: subAnswers.length > 0 ? subAnswers : undefined,
      subSolutions: subSolutions.length > 0 ? subSolutions : undefined,
    };
    handlers.onComplete(solution);
    return solution;
  }

  /** 单题四阶段解题（原逻辑，从 generateSolutionStreaming 中抽离）。 */
  private async solveSingleProblem(
    problem: string,
    ctx: SolverContext,
    handlers: SolutionStreamHandlers
  ): Promise<Solution> {
    const allSteps: SolutionStep[] = [];
    let finalAnswer: string | undefined;

    for (const phase of PHASE_ORDER) {
      if (handlers.signal?.aborted) {
        break;
      }
      handlers.onPhaseStart(phase);
      const prompt = buildPhaseSolutionPrompt(problem, phase, ctx.difficulty, allSteps);
      let raw = '';
      await this.streamChat(SYSTEM_PROMPT, prompt, {
        onChunk: (c) => {
          raw += c;
          handlers.onPhaseChunk?.(phase, c);
        },
        signal: handlers.signal,
      });
      const phaseSteps = parsePhaseSteps(raw, phase);
      if (phaseSteps.length === 0) {
        continue;
      }
      allSteps.push(...phaseSteps);
      handlers.onPhaseSteps(phase, phaseSteps);

      try {
        const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
        const jsonText = fence ? fence[1] : raw;
        const start = jsonText.indexOf('{');
        const end = jsonText.lastIndexOf('}');
        if (start >= 0 && end > start) {
          const sanitized = sanitizeLatexJson(jsonText.slice(start, end + 1));
          const obj = JSON.parse(sanitized);
          if (obj.finalAnswer) {
            finalAnswer = obj.finalAnswer;
          }
        }
      } catch {
        // ignore parse errors for finalAnswer
      }
    }

    const solution: Solution = { problem, steps: allSteps, finalAnswer };
    handlers.onComplete(solution);
    return solution;
  }

  async continueBranch(
    _branchId: string,
    ctx: SolverContext,
    handlers: StreamHandlers
  ): Promise<SolutionStep[]> {
    const branchSteps =
      ctx.activeBranch?.alternativeSteps ??
      ctx.steps.filter((s) => s.phase === 'carrying-out').slice(-2);
    const label = ctx.activeBranch?.label ?? '另解分支';
    const prompt = buildContinueBranchPrompt(label, branchSteps, ctx);
    let raw = '';
    await this.streamChat(SYSTEM_PROMPT, prompt, {
      onChunk: (c) => {
        raw += c;
        handlers.onChunk(c);
      },
      signal: handlers.signal,
    });
    const { meta } = parseActionOutput('branchAlternative', raw);
    const steps = meta.branchSteps ?? [];
    if (handlers.onMeta) {
      handlers.onMeta(meta);
    }
    return steps;
  }

  async explainStep(
    action: MenuActionId,
    stepId: string,
    ctx: SolverContext,
    handlers: StreamHandlers,
    question?: string,
    selectedText?: string
  ): Promise<void> {
    const step = findStep(ctx.steps, stepId);
    if (!step) {
      throw new Error('找不到对应的步骤。');
    }
    const prompt = buildActionPrompt(action, step, ctx, question, selectedText);
    await this.streamChatWithMeta(SYSTEM_PROMPT, prompt, action, handlers);
  }

  async checkStep(stepId: string, ctx: SolverContext, handlers: StreamHandlers): Promise<void> {
    return this.explainStep('verify', stepId, ctx, handlers);
  }

  async globalAsk(question: string, ctx: SolverContext, handlers: StreamHandlers): Promise<void> {
    const prompt = buildGlobalAskPrompt(question, ctx);
    await this.streamChatWithMeta(SYSTEM_PROMPT, prompt, 'ask', handlers);
  }

  async solveSubProblem(
    subProblemIndex: number,
    subProblem: string,
    ctx: SolverContext,
    handlers: StreamHandlers
  ): Promise<SolutionStep[]> {
    const prompt = buildSubProblemPrompt(ctx.problem, subProblem, subProblemIndex, ctx.difficulty, ctx.steps);
    let raw = '';
    await this.streamChat(SYSTEM_PROMPT, prompt, {
      onChunk: (c) => {
        raw += c;
        handlers.onChunk(c);
      },
      signal: handlers.signal,
    });
    const steps = parsePhaseSteps(raw, 'carrying-out');
    if (handlers.onMeta) {
      let finalAnswer: string | undefined;
      try {
        const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
        const jsonText = fence ? fence[1] : raw;
        const start = jsonText.indexOf('{');
        const end = jsonText.lastIndexOf('}');
        if (start >= 0 && end > start) {
          const sanitized = sanitizeLatexJson(jsonText.slice(start, end + 1));
          const obj = JSON.parse(sanitized);
          if (obj.finalAnswer) finalAnswer = obj.finalAnswer as string;
        }
      } catch { /* ignore */ }
      handlers.onMeta({
        kind: 'text',
        title: `第 ${subProblemIndex} 小问答案`,
        ...(finalAnswer ? {} : {}),
      });
    }
    return steps;
  }

  /** 流式输出并在结束时解析结构化 meta。 */
  private async streamChatWithMeta(
    system: string,
    user: string,
    action: MenuActionId,
    handlers: StreamHandlers
  ): Promise<void> {
    let raw = '';
    const wrapped: StreamHandlers = {
      ...handlers,
      onChunk: (chunk) => {
        raw += chunk;
        handlers.onChunk(chunk);
      },
    };
    await this.streamChat(system, user, wrapped);
    const { meta } = parseActionOutput(action, raw);
    if (handlers.onMeta) {
      handlers.onMeta(meta);
    }
  }

  /** 根据 provider 分发到对应的流式实现。 */
  private streamChat(system: string, user: string, handlers: StreamHandlers): Promise<void> {
    if (this.config.provider === 'anthropic') {
      return this.streamAnthropic(system, user, handlers);
    }
    return this.streamOpenAI(system, user, handlers);
  }

  /** OpenAI Chat Completions 流式（SSE）。 */
  private async streamOpenAI(system: string, user: string, handlers: StreamHandlers): Promise<void> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        stream: true,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: handlers.signal,
    });
    await this.consumeSSE(res, handlers, (json) => json?.choices?.[0]?.delta?.content);
  }

  /** Anthropic Messages 流式（SSE）。 */
  private async streamAnthropic(
    system: string,
    user: string,
    handlers: StreamHandlers
  ): Promise<void> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}/v1/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: 2048,
        stream: true,
        system,
        messages: [{ role: 'user', content: user }],
      }),
      signal: handlers.signal,
    });
    await this.consumeSSE(res, handlers, (json) =>
      json?.type === 'content_block_delta' ? json?.delta?.text : undefined
    );
  }

  /** 通用 SSE 解析：逐行读取 data: 块，用 extract 提取文本增量。 */
  private async consumeSSE(
    res: Response,
    handlers: StreamHandlers,
    extract: (json: any) => string | undefined
  ): Promise<void> {
    if (!res.ok || !res.body) {
      const text = await safeText(res);
      throw new Error(`AI 请求失败（${res.status}）：${text}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let streaming = true;
    while (streaming) {
      const { done, value } = await reader.read();
      if (done) {
        streaming = false;
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) {
          continue;
        }
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') {
          return;
        }
        try {
          const json = JSON.parse(data);
          const piece = extract(json);
          if (piece) {
            handlers.onChunk(piece);
          }
        } catch {
          // 忽略无法解析的心跳 / 注释行。
        }
      }
    }
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return res.statusText;
  }
}

function findStep(steps: SolutionStep[], id: string): SolutionStep | undefined {
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
