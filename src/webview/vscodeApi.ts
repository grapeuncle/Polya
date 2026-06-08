// 封装 acquireVsCodeApi：提供向扩展主进程发送消息、持久化状态的能力。
import { ExtToWebviewMessage, WebviewToExtMessage } from '../shared/types';

interface VsCodeApi {
  postMessage(msg: unknown): void;
  getState(): any;
  setState(state: any): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

// acquireVsCodeApi 只能调用一次，缓存其结果。
const vscode: VsCodeApi = acquireVsCodeApi();

export function postMessage(msg: WebviewToExtMessage): void {
  vscode.postMessage(msg);
}

/** 订阅来自扩展主进程的消息。 */
export function onMessage(handler: (msg: ExtToWebviewMessage) => void): () => void {
  const listener = (event: MessageEvent) => handler(event.data as ExtToWebviewMessage);
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

/** 生成一个简单的请求 ID。 */
export function newRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
