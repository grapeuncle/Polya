// 根据环境变量构造对应的解题引擎实例。
import { AppConfig } from '../shared/appConfig';
import { ISolverEngine } from './ISolverEngine';
import { MockSolverEngine } from './MockSolverEngine';
import { LLMSolverEngine } from './LLMSolverEngine';

/** 创建当前配置对应的引擎；失败时回退到 Mock 并打日志。 */
export async function createEngine(config: AppConfig): Promise<ISolverEngine> {
  const engine = config.engine;

  if (engine === 'mock') {
    return new MockSolverEngine();
  }

  const apiKey = config.apiKey;
  try {
    if (engine === 'openai') {
      return new LLMSolverEngine({
        provider: 'openai',
        apiKey,
        baseUrl: config.openai.baseUrl,
        model: config.openai.model,
      });
    }
    if (engine === 'anthropic') {
      return new LLMSolverEngine({
        provider: 'anthropic',
        apiKey,
        baseUrl: config.anthropic.baseUrl,
        model: config.anthropic.model,
      });
    }
    if (engine === 'deepseek') {
      return new LLMSolverEngine({
        provider: 'deepseek',
        apiKey,
        baseUrl: config.deepseek.baseUrl,
        model: config.deepseek.model,
      });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[polya] 引擎初始化失败：${msg}，已切换为 Mock。`);
    return new MockSolverEngine();
  }

  return new MockSolverEngine();
}
