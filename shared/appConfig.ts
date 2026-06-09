// 应用配置类型（服务端从 .env 加载，引擎工厂消费）。
export interface AppConfig {
  engine: string;
  apiKey: string;
  openai: { baseUrl: string; model: string };
  anthropic: { baseUrl: string; model: string };
  deepseek: { baseUrl: string; model: string };
  port: number;
  staticDir?: string;
}
