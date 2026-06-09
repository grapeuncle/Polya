// 负责创建/管理 Webview 面板，并在扩展主进程与 Webview 之间转发消息。
import * as vscode from 'vscode';
import { ISolverEngine, StreamHandlers } from './engines/ISolverEngine';
import { createEngine } from './engines/factory';
import {
  ConversationMessage,
  Difficulty,
  ExtToWebviewMessage,
  Phase,
  SolutionBranch,
  SolutionStep,
  SolverContext,
  WebviewToExtMessage,
} from './shared/types';

export class PanelManager {
  public static current: PanelManager | undefined;
  private static readonly viewType = 'polyaSolver';

  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private engine!: ISolverEngine;

  /** 当前会话保存的题目与步骤，用于构建携带完整上下文的请求。 */
  private problem = '';
  private steps: SolutionStep[] = [];
  private completedPhases: Phase[] = [];
  /** 正在进行的请求，用于取消。 */
  private inflight = new Map<string, AbortController>();
  /** 来自 webview 的对话线程快照（按 stepId / __global__）。 */
  private threadSnapshots = new Map<string, ConversationMessage[]>();

  private constructor(
    private readonly context: vscode.ExtensionContext,
    panel: vscode.WebviewPanel
  ) {
    this.panel = panel;
    this.panel.webview.html = this.getHtml(panel.webview);

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewToExtMessage) => this.handleMessage(msg),
      null,
      this.disposables
    );
  }

  /** 打开（或聚焦已存在的）面板。 */
  public static async createOrShow(
    context: vscode.ExtensionContext,
    initialProblem?: string
  ): Promise<void> {
    const column = vscode.ViewColumn.One;
    if (PanelManager.current) {
      PanelManager.current.panel.reveal(column);
      if (initialProblem) {
        PanelManager.current.startSolve(initialProblem);
      }
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      PanelManager.viewType,
      'Polya 数学辅导',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
      }
    );
    PanelManager.current = new PanelManager(context, panel);
    PanelManager.current.pendingProblem = initialProblem;
  }

  private pendingProblem?: string;

  /** 暴露给命令：开始求解某个题目。 */
  public startSolve(problem: string): void {
    this.post({ type: 'solutionStart', problem });
    this.solve(problem);
  }

  private async handleMessage(msg: WebviewToExtMessage): Promise<void> {
    switch (msg.type) {
      case 'ready': {
        this.engine = await createEngine(this.context);
        const cfg = vscode.workspace.getConfiguration('polyaSolver');
        this.post({
          type: 'init',
          difficulty: cfg.get<Difficulty>('difficulty', 'standard'),
          teacherMode: cfg.get<boolean>('teacherMode', false),
          engine: this.engine.id,
        });
        if (this.pendingProblem) {
          this.startSolve(this.pendingProblem);
          this.pendingProblem = undefined;
        }
        break;
      }
      case 'solve':
        this.startSolve(msg.problem);
        break;
      case 'continueBranch':
        await this.runContinueBranch(msg);
        break;
      case 'action':
        await this.runAction(msg);
        break;
      case 'globalAsk':
        await this.runGlobalAsk(msg.requestId, msg.question, msg.threadMessages);
        break;
      case 'setDifficulty':
        await vscode.workspace
          .getConfiguration('polyaSolver')
          .update('difficulty', msg.difficulty, vscode.ConfigurationTarget.Global);
        this.post({ type: 'difficultyChanged', difficulty: msg.difficulty });
        break;
      case 'cancelAction': {
        const ctrl = this.inflight.get(msg.requestId);
        if (ctrl) {
          ctrl.abort();
          this.inflight.delete(msg.requestId);
          this.post({ type: 'actionCancelled', requestId: msg.requestId });
        }
        break;
      }
      case 'reportState':
        this.completedPhases = msg.completedPhases;
        break;
      case 'copy':
        await vscode.env.clipboard.writeText(msg.text);
        vscode.window.setStatusBarMessage('Polya：已复制到剪贴板', 2000);
        break;
      case 'info':
        vscode.window.showInformationMessage(msg.message);
        break;
      case 'error':
        vscode.window.showErrorMessage(msg.message);
        break;
    }
  }

  private async solve(problem: string): Promise<void> {
    this.problem = problem;
    this.steps = [];
    try {
      if (!this.engine) {
        this.engine = await createEngine(this.context);
      }
      const ctx = this.buildContext();
      const solution = await this.engine.generateSolutionStreaming(problem, ctx, {
        onPhaseStart: (phase) => this.post({ type: 'solutionPhaseStart', phase }),
        onPhaseSteps: (phase, steps) => {
          this.steps = [...this.steps, ...steps];
          this.post({ type: 'solutionPhaseSteps', phase, steps });
        },
        onComplete: (sol) => {
          this.steps = sol.steps;
          this.post({ type: 'solution', solution: sol });
        },
      });
      this.steps = solution.steps;
    } catch (e: any) {
      this.post({ type: 'solveError', message: e?.message ?? String(e) });
    }
  }

  private async runAction(msg: Extract<WebviewToExtMessage, { type: 'action' }>): Promise<void> {
    const { requestId, action, stepId, question, selectedText, threadMessages } = msg;
    if (threadMessages) {
      this.threadSnapshots.set(stepId, threadMessages);
    }
    // 纯前端动作（复制/标记）不会发到这里，这里只处理需要引擎的动作。
    const controller = new AbortController();
    this.inflight.set(requestId, controller);
    const handlers: StreamHandlers = {
      onChunk: (chunk) => this.post({ type: 'actionChunk', requestId, chunk }),
      onMeta: (meta) => this.post({ type: 'actionEnd', requestId, meta }),
      signal: controller.signal,
    };
    this.post({ type: 'actionStart', requestId, action, stepId });
    try {
      if (!this.engine) {
        this.engine = await createEngine(this.context);
      }
      const ctx = this.buildContext(stepId, undefined, selectedText);
      // onMeta 会提前发一次 actionEnd 携带 meta；这里结束再补发一次以收尾。
      let meta;
      const wrapped: StreamHandlers = {
        ...handlers,
        onMeta: (m) => {
          meta = m;
        },
      };
      if (action === 'verify') {
        await this.engine.checkStep(stepId, ctx, wrapped);
      } else {
        await this.engine.explainStep(action, stepId, ctx, wrapped, question, selectedText);
      }
      this.post({ type: 'actionEnd', requestId, meta });
    } catch (e: any) {
      if (e?.name === 'AbortError' || controller.signal.aborted) {
        this.post({ type: 'actionCancelled', requestId });
      } else {
        this.post({ type: 'actionError', requestId, message: e?.message ?? String(e) });
      }
    } finally {
      this.inflight.delete(requestId);
    }
  }

  private async runContinueBranch(
    msg: Extract<WebviewToExtMessage, { type: 'continueBranch' }>
  ): Promise<void> {
    const { branchId, requestId } = msg;
    const controller = new AbortController();
    this.inflight.set(requestId, controller);
    try {
      if (!this.engine) {
        this.engine = await createEngine(this.context);
      }
      const ctx = this.buildContext(undefined, msg.branch);
      const steps = await this.engine.continueBranch(branchId, ctx, {
        signal: controller.signal,
        onChunk: () => {},
      });
      this.post({ type: 'branchStepsAppended', branchId, steps });
    } catch (e: any) {
      if (e?.name !== 'AbortError' && !controller.signal.aborted) {
        this.post({ type: 'actionError', requestId, message: e?.message ?? String(e) });
      }
    } finally {
      this.inflight.delete(requestId);
    }
  }

  private async runGlobalAsk(
    requestId: string,
    question: string,
    threadMessages?: ConversationMessage[]
  ): Promise<void> {
    if (threadMessages) {
      this.threadSnapshots.set('__global__', threadMessages);
    }
    const controller = new AbortController();
    this.inflight.set(requestId, controller);
    this.post({ type: 'actionStart', requestId, action: 'ask', stepId: '__global__' });
    try {
      if (!this.engine) {
        this.engine = await createEngine(this.context);
      }
      const ctx = this.buildContext();
      let meta;
      await this.engine.globalAsk(question, ctx, {
        onChunk: (chunk) => this.post({ type: 'actionChunk', requestId, chunk }),
        onMeta: (m) => {
          meta = m;
        },
        signal: controller.signal,
      });
      this.post({ type: 'actionEnd', requestId, meta });
    } catch (e: any) {
      if (e?.name === 'AbortError' || controller.signal.aborted) {
        this.post({ type: 'actionCancelled', requestId });
      } else {
        this.post({ type: 'actionError', requestId, message: e?.message ?? String(e) });
      }
    } finally {
      this.inflight.delete(requestId);
    }
  }

  private buildContext(
    focusedStepId?: string,
    activeBranch?: SolutionBranch,
    focusedSelection?: string
  ): SolverContext {
    const cfg = vscode.workspace.getConfiguration('polyaSolver');
    const focusedStep = focusedStepId
      ? findStepInTree(this.steps, focusedStepId)
      : undefined;
    const currentPhase = focusedStep?.phase ?? 'understanding';
    const threads: SolverContext['conversationThreads'] = {};
    for (const [key, messages] of this.threadSnapshots) {
      threads[key] = { stepId: key, messages };
    }
    return {
      problem: this.problem,
      difficulty: cfg.get<Difficulty>('difficulty', 'standard'),
      phaseState: { currentPhase, completedPhases: this.completedPhases },
      steps: this.steps,
      focusedStep,
      teacherMode: cfg.get<boolean>('teacherMode', false),
      conversationThreads: threads,
      activeBranch,
      focusedSelection,
    };
  }

  private post(msg: ExtToWebviewMessage): void {
    this.panel.webview.postMessage(msg);
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js')
    );
    const katexCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'media', 'katex.min.css')
    );
    const codiconCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'media', 'codicon.css')
    );
    const mermaidUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'media', 'mermaid.min.js')
    );
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} https: data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource} data:`,
      `script-src 'nonce-${nonce}' https://cdn.jsdelivr.net`,
      `connect-src https:`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${katexCssUri}" />
  <link rel="stylesheet" href="${codiconCssUri}" />
  <title>Polya 数学辅导</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${mermaidUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  public dispose(): void {
    PanelManager.current = undefined;
    for (const c of this.inflight.values()) {
      c.abort();
    }
    this.inflight.clear();
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function findStepInTree(steps: SolutionStep[], id: string): SolutionStep | undefined {
  for (const s of steps) {
    if (s.id === id) {
      return s;
    }
    if (s.subSteps) {
      const f = findStepInTree(s.subSteps, id);
      if (f) {
        return f;
      }
    }
  }
  return undefined;
}
