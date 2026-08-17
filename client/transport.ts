// 前后端通信层：替代 vscode postMessage，使用 REST + SSE。
import {
  ConversationMessage,
  Difficulty,
  ExtToWebviewMessage,
  MenuActionId,
  SolutionBranch,
  WebviewToExtMessage,
} from '../shared/types';

const API = '/api';

let sessionId: string | null = null;
const handlers = new Set<(msg: ExtToWebviewMessage) => void>();
/** 当前正在进行的解题 SSE 连接的 AbortController，用于中断举一反三解答。 */
let solveAbortController: AbortController | null = null;

const PREFS_KEY = 'polya.prefs';

export function loadPrefs(): { difficulty: Difficulty; teacherMode: boolean } {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    /* ignore */
  }
  return { difficulty: 'standard', teacherMode: false };
}

/** 从 public/imported-prefs.json 应用 Cursor 插件导入的偏好（仅 localStorage 为空时）。 */
async function applyImportedPrefsIfNeeded(): Promise<void> {
  if (localStorage.getItem(PREFS_KEY)) {
    return;
  }
  try {
    const res = await fetch('/imported-prefs.json');
    if (!res.ok) {
      return;
    }
    const data = (await res.json()) as { difficulty?: Difficulty; teacherMode?: boolean };
    if (data.difficulty || data.teacherMode !== undefined) {
      savePrefs({ difficulty: data.difficulty, teacherMode: data.teacherMode });
    }
  } catch {
    /* ignore */
  }
}

export function savePrefs(prefs: { difficulty?: Difficulty; teacherMode?: boolean }): void {
  const cur = loadPrefs();
  const next = { ...cur, ...prefs };
  localStorage.setItem(PREFS_KEY, JSON.stringify(next));
}

export function getSessionId(): string | null {
  return sessionId;
}

export function onEvent(handler: (msg: ExtToWebviewMessage) => void): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

function dispatch(msg: ExtToWebviewMessage): void {
  for (const h of handlers) {
    h(msg);
  }
}

export function newRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sessionHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (sessionId) {
    h['X-Session-Id'] = sessionId;
  }
  return h;
}

/** 创建会话并触发 init 事件（等价 ready + init）。 */
export async function initSession(): Promise<void> {
  await applyImportedPrefsIfNeeded();
  const prefs = loadPrefs();
  const res = await fetch(`${API}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prefs),
  });
  if (!res.ok) {
    throw new Error(`会话创建失败：${res.status}`);
  }
  const data = (await res.json()) as {
    sessionId: string;
    init: { difficulty: Difficulty; teacherMode: boolean; engine: string };
  };
  sessionId = data.sessionId;
  dispatch({
    type: 'init',
    difficulty: data.init.difficulty,
    teacherMode: data.init.teacherMode,
    engine: data.init.engine,
  });

  const params = new URLSearchParams(window.location.search);
  const problem = params.get('problem');
  if (problem?.trim()) {
    postSolve(problem.trim());
  }
}

async function consumeSse(res: Response): Promise<void> {
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`请求失败（${res.status}）：${text}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = 'message';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        if (data) {
          try {
            const msg = JSON.parse(data) as ExtToWebviewMessage;
            dispatch(msg);
          } catch {
            console.warn('[transport] 无法解析 SSE', currentEvent, data);
          }
        }
      }
    }
  }
}

export function postMessage(msg: WebviewToExtMessage): void {
  switch (msg.type) {
    case 'solve':
      postSolve(msg.problem);
      break;
    case 'action':
      void postActionSse(msg);
      break;
    case 'globalAsk':
      void postGlobalAskSse(msg);
      break;
    case 'continueBranch':
      void postContinueBranchSse(msg);
      break;
    case 'cancelAction':
      void postCancel(msg.requestId);
      break;
    case 'cancelSolve':
      abortSolve();
      break;
    case 'reportState':
      void postReportState(msg.completedPhases);
      break;
    case 'setDifficulty':
      savePrefs({ difficulty: msg.difficulty });
      void patchSession({ difficulty: msg.difficulty });
      void apiSetDifficulty(msg.difficulty);
      break;
    case 'solveSubProblem':
      void postSolveSubProblemSse(msg);
      break;
    case 'copy':
    case 'info':
    case 'error':
    case 'ready':
    case 'requestState':
      break;
    default:
      break;
  }
}

export function postSolve(problem: string): void {
  // 先中止上一次可能还在进行的求解
  abortSolve();
  void (async () => {
    const controller = new AbortController();
    solveAbortController = controller;
    try {
      const res = await fetch(`${API}/solve`, {
        method: 'POST',
        headers: { ...sessionHeaders(), 'X-Solve-Id': '1' },
        body: JSON.stringify({ problem }),
        signal: controller.signal,
      });
      await consumeSse(res);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        // 用户主动中断求解，无需报错
        return;
      }
      throw e;
    } finally {
      if (solveAbortController === controller) {
        solveAbortController = null;
      }
    }
  })().catch((e) => {
    console.error('[transport] solve SSE 连接异常', e);
    dispatch({ type: 'solveError', message: e instanceof Error ? e.message : String(e) });
  });
}

/** 中止当前正在进行的解题 SSE 连接（用于举一反三暂停）。 */
export function abortSolve(): void {
  if (solveAbortController) {
    solveAbortController.abort();
    solveAbortController = null;
  }
}

async function postActionSse(
  msg: Extract<WebviewToExtMessage, { type: 'action' }>
): Promise<void> {
  const res = await fetch(`${API}/action`, {
    method: 'POST',
    headers: sessionHeaders(),
    body: JSON.stringify(msg),
  });
  await consumeSse(res);
}

async function postGlobalAskSse(
  msg: Extract<WebviewToExtMessage, { type: 'globalAsk' }>
): Promise<void> {
  const res = await fetch(`${API}/global-ask`, {
    method: 'POST',
    headers: sessionHeaders(),
    body: JSON.stringify(msg),
  });
  await consumeSse(res);
}

async function postContinueBranchSse(
  msg: Extract<WebviewToExtMessage, { type: 'continueBranch' }>
): Promise<void> {
  const res = await fetch(`${API}/continue-branch`, {
    method: 'POST',
    headers: sessionHeaders(),
    body: JSON.stringify(msg),
  });
  await consumeSse(res);
}

async function postSolveSubProblemSse(
  msg: Extract<WebviewToExtMessage, { type: 'solveSubProblem' }>
): Promise<void> {
  const res = await fetch(`${API}/solve-subproblem`, {
    method: 'POST',
    headers: sessionHeaders(),
    body: JSON.stringify(msg),
  });
  await consumeSse(res);
}

export async function postCancel(requestId: string): Promise<void> {
  await fetch(`${API}/cancel`, {
    method: 'POST',
    headers: sessionHeaders(),
    body: JSON.stringify({ requestId }),
  });
}

async function postReportState(completedPhases: import('../shared/types').Phase[]): Promise<void> {
  await fetch(`${API}/report-state`, {
    method: 'POST',
    headers: sessionHeaders(),
    body: JSON.stringify({ completedPhases }),
  });
}

async function apiSetDifficulty(difficulty: Difficulty): Promise<void> {
  await fetch(`${API}/set-difficulty`, {
    method: 'POST',
    headers: sessionHeaders(),
    body: JSON.stringify({ difficulty }),
  });
}

async function patchSession(prefs: {
  difficulty?: Difficulty;
  teacherMode?: boolean;
}): Promise<void> {
  if (!sessionId) {
    return;
  }
  await fetch(`${API}/session`, {
    method: 'PATCH',
    headers: sessionHeaders(),
    body: JSON.stringify(prefs),
  });
}

export function postAction(
  action: MenuActionId,
  stepId: string,
  options?: {
    question?: string;
    selectedText?: string;
    threadMessages?: ConversationMessage[];
  }
): string {
  const requestId = newRequestId();
  postMessage({
    type: 'action',
    requestId,
    action,
    stepId,
    question: options?.question,
    selectedText: options?.selectedText,
    threadMessages: options?.threadMessages,
  });
  return requestId;
}

export function postContinueBranch(branchId: string, branch: SolutionBranch): string {
  const requestId = newRequestId();
  postMessage({ type: 'continueBranch', branchId, requestId, branch });
  return requestId;
}

export function postSetDifficulty(difficulty: Difficulty): void {
  postMessage({ type: 'setDifficulty', difficulty });
}

/** 对单小问发起独立求解。返回 requestId 用于取消和结果匹配。 */
export function postSolveSubProblem(index: number, subProblem: string): string {
  const requestId = newRequestId();
  postMessage({ type: 'solveSubProblem', requestId, index, subProblem });
  return requestId;
}

/** 复制文本到剪贴板。 */
export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

/** 显示 Toast（App 监听 polya-toast 事件）。 */
export function showToast(type: 'info' | 'error', message: string): void {
  window.dispatchEvent(new CustomEvent('polya-toast', { detail: { type, message } }));
}
