// SSE 辅助：将 ExtToWebviewMessage 推送到 HTTP 响应流。
import { Response } from 'express';
import { ExtToWebviewMessage } from '../shared/types';

export function initSse(res: Response): (msg: ExtToWebviewMessage) => void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  return (msg: ExtToWebviewMessage) => {
    res.write(`event: ${msg.type}\n`);
    res.write(`data: ${JSON.stringify(msg)}\n\n`);
  };
}

export function endSse(res: Response): void {
  res.end();
}
