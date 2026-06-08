// 根据 VS Code 配置与 SecretStorage 构造对应的解题引擎实例。
import * as vscode from 'vscode';
import { ISolverEngine } from './ISolverEngine';
import { MockSolverEngine } from './MockSolverEngine';
import { LLMSolverEngine } from './LLMSolverEngine';

export const SECRET_KEY = 'polyaSolver.apiKey';

/** 读取 API 密钥：优先 SecretStorage，其次设置项。 */
export async function getApiKey(context: vscode.ExtensionContext): Promise<string> {
  const fromSecret = await context.secrets.get(SECRET_KEY);
  if (fromSecret) {
    return fromSecret;
  }
  return vscode.workspace.getConfiguration('polyaSolver').get<string>('apiKey', '');
}

/** 创建当前配置对应的引擎；失败时回退到 Mock 并提示。 */
export async function createEngine(
  context: vscode.ExtensionContext
): Promise<ISolverEngine> {
  const cfg = vscode.workspace.getConfiguration('polyaSolver');
  const engine = cfg.get<string>('engine', 'mock');

  if (engine === 'mock') {
    return new MockSolverEngine();
  }

  const apiKey = await getApiKey(context);
  try {
    if (engine === 'openai') {
      return new LLMSolverEngine({
        provider: 'openai',
        apiKey,
        baseUrl: cfg.get<string>('openai.baseUrl', 'https://api.openai.com/v1'),
        model: cfg.get<string>('openai.model', 'gpt-4o-mini'),
      });
    }
    if (engine === 'anthropic') {
      return new LLMSolverEngine({
        provider: 'anthropic',
        apiKey,
        baseUrl: cfg.get<string>('anthropic.baseUrl', 'https://api.anthropic.com'),
        model: cfg.get<string>('anthropic.model', 'claude-3-5-sonnet-latest'),
      });
    }
  } catch (e: any) {
    vscode.window.showWarningMessage(
      `Polya：${e.message ?? '引擎初始化失败'}，已临时切换为内置示例引擎。`
    );
    return new MockSolverEngine();
  }

  return new MockSolverEngine();
}
