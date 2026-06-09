// 内存会话存储（开发环境）。
import { randomUUID } from 'crypto';
import { AppConfig } from '../shared/appConfig';
import { SessionPrefs, SolverService } from './SolverService';

const sessions = new Map<string, SolverService>();

export function createSession(
  appConfig: AppConfig,
  prefs?: Partial<SessionPrefs>
): { sessionId: string; service: SolverService } {
  const sessionId = randomUUID();
  const service = new SolverService(appConfig);
  sessions.set(sessionId, service);
  void service.init(prefs);
  return { sessionId, service };
}

export function getSession(sessionId: string): SolverService | undefined {
  return sessions.get(sessionId);
}

export function deleteSession(sessionId: string): void {
  const s = sessions.get(sessionId);
  s?.dispose();
  sessions.delete(sessionId);
}
