// 从环境变量读取服务端配置（替代 VS Code settings）。
import 'dotenv/config';
import { AppConfig } from '../shared/appConfig';

export type { AppConfig };

export function loadConfig(): AppConfig {
  return {
    engine: process.env.POLYA_ENGINE ?? 'mock',
    apiKey: process.env.POLYA_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? '',
    openai: {
      baseUrl: process.env.POLYA_OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
      model: process.env.POLYA_OPENAI_MODEL ?? 'gpt-4o-mini',
    },
    anthropic: {
      baseUrl: process.env.POLYA_ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
      model: process.env.POLYA_ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-latest',
    },
    deepseek: {
      baseUrl: process.env.POLYA_DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1',
      model: process.env.POLYA_DEEPSEEK_MODEL ?? 'deepseek-chat',
    },
    port: Number(process.env.PORT ?? 3001),
    staticDir: process.env.STATIC_DIR,
  };
}
