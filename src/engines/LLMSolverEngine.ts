// 调用真实大模型（OpenAI / Anthropic 兼容接口）的解题引擎，支持流式响应。
// 使用全局 fetch（Node 18+ / VS Code 内置）。
import { ISolverEngine, StreamHandlers } from './ISolverEngine';
import {
  MenuActionId,
  Solution,
  SolutionStep,
  SolverContext,
} from '../shared/types';
import {
  SYSTEM_PROMPT,
  buildActionPrompt,
  buildGlobalAskPrompt,
  buildSolutionPrompt,
} from './prompts';

export type LLMProvider = 'openai' | 'anthropic';

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
      throw new Error('未配置 API 密钥。请运行命令「Polya: 设置 API 密钥」或在设置中填写。');
    }
  }

  async generateSolution(problem: string, ctx: SolverContext): Promise<Solution> {
    const prompt = buildSolutionPrompt(problem, ctx.difficulty);
    let raw = '';
    await this.streamChat(SYSTEM_PROMPT, prompt, {
      onChunk: (c) => {
        raw += c;
      },
    });
    return parseSolution(raw, problem);
  }

  async explainStep(
    action: MenuActionId,
    stepId: string,
    ctx: SolverContext,
    handlers: StreamHandlers,
    question?: string
  ): Promise<void> {
    const step = findStep(ctx.steps, stepId);
    if (!step) {
      throw new Error('找不到对应的步骤。');
    }
    const prompt = buildActionPrompt(action, step, ctx, question);
    await this.streamChat(SYSTEM_PROMPT, prompt, handlers);
  }

  async checkStep(stepId: string, ctx: SolverContext, handlers: StreamHandlers): Promise<void> {
    return this.explainStep('verify', stepId, ctx, handlers);
  }

  async globalAsk(question: string, ctx: SolverContext, handlers: StreamHandlers): Promise<void> {
    const prompt = buildGlobalAskPrompt(question, ctx);
    await this.streamChat(SYSTEM_PROMPT, prompt, handlers);
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

/** 从模型返回中解析 JSON 解题方案；容错处理代码块包裹与多余文本。 */
function parseSolution(raw: string, problem: string): Solution {
  let text = raw.trim();
  // 去除 ```json ... ``` 包裹。
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    text = fence[1].trim();
  }
  // 截取第一个 { 到最后一个 }。
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    text = text.slice(start, end + 1);
  }
  try {
    const obj = JSON.parse(text);
    const steps: SolutionStep[] = Array.isArray(obj.steps) ? obj.steps : [];
    steps.forEach((s, i) => {
      if (!s.id) {
        s.id = `s${i + 1}`;
      }
      if (!s.metadata) {
        s.metadata = {};
      }
    });
    return {
      problem: obj.problem || problem,
      finalAnswer: obj.finalAnswer,
      steps,
    };
  } catch (e) {
    throw new Error(
      '无法解析 AI 返回的解题方案（JSON 格式错误）。可尝试重试或切换到 mock 引擎。'
    );
  }
}
