// REST + SSE API 路由。
import { Router, Request, Response } from 'express';
import { AppConfig } from '../config';
import { createSession, getSession } from '../sessionStore';
import { endSse, initSse } from '../sse';
import { Difficulty, ExtToWebviewMessage, WebviewToExtMessage } from '../../shared/types';
import { SolverService } from '../SolverService';

/** 题目最大长度（字符数），防止超长输入超出 LLM 上下文窗口。 */
const MAX_PROBLEM_LENGTH = 5000;

function resolveSessionId(req: Request): string | undefined {
  return (
    (req.headers['x-session-id'] as string) ||
    (req.body?.sessionId as string) ||
    undefined
  );
}

function requireSession(req: Request, res: Response): SolverService | null {
  const sessionId = resolveSessionId(req);
  if (!sessionId) {
    res.status(400).json({ error: '缺少 sessionId（Header X-Session-Id 或 body.sessionId）' });
    return null;
  }
  const service = getSession(sessionId);
  if (!service) {
    res.status(404).json({ error: '会话不存在或已过期' });
    return null;
  }
  return service;
}

/** 绑定 SSE 发射器，执行异步任务，终止事件后关闭流。 */
async function runSseTask(
  res: Response,
  service: SolverService,
  task: () => Promise<void>
): Promise<void> {
  const emit = initSse(res);
  const prev = service.onEvent;
  let ended = false;
  const finish = () => {
    if (!ended) {
      ended = true;
      service.onEvent = prev;
      endSse(res);
    }
  };
  service.onEvent = (msg: ExtToWebviewMessage) => {
    emit(msg);
  };
  try {
    await task();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    emit({ type: 'solveError', message });
    finish();
  } finally {
    if (!ended) {
      finish();
    }
  }
}

export function createApiRouter(appConfig: AppConfig): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  router.post('/session', async (req, res) => {
    const difficulty = (req.body?.difficulty as Difficulty) ?? 'standard';
    const teacherMode = Boolean(req.body?.teacherMode);
    const { sessionId, service } = createSession(appConfig, { difficulty, teacherMode });
    await service.init({ difficulty, teacherMode });
    res.json({
      sessionId,
      init: service.getInitPayload(),
    });
  });

  router.patch('/session', (req, res) => {
    const service = requireSession(req, res);
    if (!service) {
      return;
    }
    service.updatePrefs({
      difficulty: req.body?.difficulty,
      teacherMode: req.body?.teacherMode,
    });
    res.json({ ok: true, init: service.getInitPayload() });
  });

  router.post('/report-state', async (req, res) => {
    const service = requireSession(req, res);
    if (!service) {
      return;
    }
    await service.handleMessage({
      type: 'reportState',
      completedPhases: req.body.completedPhases ?? [],
    });
    res.json({ ok: true });
  });

  router.post('/solve', async (req, res) => {
    const service = requireSession(req, res);
    if (!service) {
      return;
    }
    const problem = req.body?.problem as string;
    if (!problem?.trim()) {
      res.status(400).json({ error: '缺少 problem' });
      return;
    }
    if (problem.length > MAX_PROBLEM_LENGTH) {
      res.status(400).json({ error: `题目过长（${problem.length} 字符），最多允许 ${MAX_PROBLEM_LENGTH} 字符。` });
      return;
    }
    await runSseTask(res, service, () => service.startSolve(problem.trim()));
  });

  router.post('/action', async (req, res) => {
    const service = requireSession(req, res);
    if (!service) {
      return;
    }
    const body = req.body;
    if (!body.requestId || !body.action || !body.stepId) {
      res.status(400).json({ error: '缺少 action 必要字段' });
      return;
    }
    const msg: Extract<WebviewToExtMessage, { type: 'action' }> = {
      type: 'action',
      requestId: body.requestId,
      action: body.action,
      stepId: body.stepId,
      question: body.question,
      selectedText: body.selectedText,
      threadMessages: body.threadMessages,
    };
    await runSseTask(res, service, () => service.handleMessage(msg));
  });

  router.post('/global-ask', async (req, res) => {
    const service = requireSession(req, res);
    if (!service) {
      return;
    }
    const { requestId, question, threadMessages } = req.body;
    if (!requestId || !question) {
      res.status(400).json({ error: '缺少 requestId 或 question' });
      return;
    }
    await runSseTask(res, service, () =>
      service.handleMessage({ type: 'globalAsk', requestId, question, threadMessages })
    );
  });

  router.post('/continue-branch', async (req, res) => {
    const service = requireSession(req, res);
    if (!service) {
      return;
    }
    const { branchId, requestId, branch } = req.body;
    if (!branchId || !requestId || !branch) {
      res.status(400).json({ error: '缺少 continue-branch 必要字段' });
      return;
    }
    await runSseTask(res, service, () =>
      service.handleMessage({ type: 'continueBranch', branchId, requestId, branch })
    );
  });

  router.post('/cancel', async (req, res) => {
    const service = requireSession(req, res);
    if (!service) {
      return;
    }
    const requestId = req.body?.requestId as string;
    if (!requestId) {
      res.status(400).json({ error: '缺少 requestId' });
      return;
    }
    await service.handleMessage({ type: 'cancelAction', requestId });
    res.json({ ok: true });
  });

  router.post('/set-difficulty', async (req, res) => {
    const service = requireSession(req, res);
    if (!service) {
      return;
    }
    const difficulty = req.body?.difficulty as Difficulty;
    if (!difficulty) {
      res.status(400).json({ error: '缺少 difficulty' });
      return;
    }
    await service.handleMessage({ type: 'setDifficulty', difficulty });
    res.json({ ok: true });
  });

  router.post('/solve-subproblem', async (req, res) => {
    const service = requireSession(req, res);
    if (!service) {
      return;
    }
    const { requestId, index, subProblem } = req.body;
    if (!requestId || index == null || !subProblem?.trim()) {
      res.status(400).json({ error: '缺少 requestId、index 或 subProblem' });
      return;
    }
    await runSseTask(res, service, () =>
      service.handleMessage({ type: 'solveSubProblem', requestId, index, subProblem: subProblem.trim() })
    );
  });

  return router;
}
