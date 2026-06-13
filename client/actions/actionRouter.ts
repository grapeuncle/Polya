// 动作路由器：本地 metadata 优先，否则委托引擎。
import { MenuActionId, SolutionStep } from '../../shared/types';
import { ActionResult, findStep } from '../store';
import { copyToClipboard, newRequestId } from '../transport';

/** 动作结果标题；划选时附加片段摘要。 */
export function buildActionTitle(action: MenuActionId, selectedText?: string): string {
  const base = ACTION_TITLES[action] ?? action;
  if (!selectedText?.trim()) {
    return base;
  }
  const snippet = selectedText.trim().slice(0, 20) + (selectedText.trim().length > 20 ? '…' : '');
  return `${base}（划选：${snippet}）`;
}

export const ACTION_TITLES: Partial<Record<MenuActionId, string>> = {
  explain: '解释这一步',
  objective: '这一步的目的',
  why: '为什么这样做',
  detail: '详细推导',
  alternatives: '替代方法对比',
  verify: '检验结果',
  ask: '追问解答',
  commonMistake: '常见错误',
  breakdown: '拆解题干',
  visualize: '可视化',
  restate: '重述题目',
  keyInfo: '关键信息',
  similarProblem: '类似题目',
  strategyOrigin: '思路来源',
  failedPaths: '失败路径',
  relatedModel: '相关题型',
  subGoals: '子目标',
  guessThenProve: '先猜后证',
  expandAlgebra: '代数细节',
  checkCalculation: '计算检查',
  theoremUsed: '所用定理',
  tweakParams: '参数影响',
  branchAlternative: '另解延续',
  verifyAnswer: '验证答案',
  allSolutions: '全部解法',
  generalize: '推广变式',
  takeaway: '收获总结',
  generatePractice: '同类练习',
};

export interface RouteActionContext {
  steps: SolutionStep[];
  results: ActionResult[];
  expandedSubSteps: string[];
  toggleSubSteps: (id: string) => void;
  addLocalResult: (result: Omit<ActionResult, 'status'> & { status?: ActionResult['status'] }) => void;
  addHistory: (label: string) => void;
  dispatchEngine: (
    action: MenuActionId,
    stepId: string,
    question?: string,
    selectedText?: string
  ) => string;
}

export interface RouteResult {
  handled: boolean;
  requestId?: string;
}

/** 尝试本地处理动作；返回 handled=true 表示无需调引擎。 */
export function routeAction(
  action: MenuActionId,
  stepId: string,
  ctx: RouteActionContext,
  question?: string,
  selectedText?: string
): RouteResult {
  const step = findStep(ctx.steps, stepId);
  const title = ACTION_TITLES[action] ?? action;

  if (!step && action !== 'ask' && action !== 'copy') {
    const requestId = newRequestId();
    ctx.addLocalResult({
      requestId,
      stepId,
      action,
      title,
      content: '找不到对应的步骤，请重新选中后再试。',
      status: 'error',
    });
    ctx.addHistory(`步骤未找到（${stepId}）`);
    return { handled: true, requestId };
  }

  switch (action) {
    case 'objective': {
      const obj = step?.metadata.objective;
      if (obj) {
        const requestId = newRequestId();
        ctx.addLocalResult({
          requestId,
          stepId,
          action,
          title,
          content: `**这一步的目的**\n\n${obj}`,
          status: 'done',
        });
        ctx.addHistory(`${title}（本地，步骤 ${stepId}）`);
        return { handled: true, requestId };
      }
      break;
    }
    case 'detail': {
      if (step?.subSteps && step.subSteps.length > 0) {
        if (!ctx.expandedSubSteps.includes(stepId)) {
          ctx.toggleSubSteps(stepId);
        }
        const lines = step.subSteps
          .map((sub, i) => `${i + 1}. ${sub.content}`)
          .join('\n\n');
        const requestId = newRequestId();
        ctx.addLocalResult({
          requestId,
          stepId,
          action,
          title,
          content: `**详细推导**（已展开 ${step.subSteps.length} 个子步骤）\n\n${lines}`,
          status: 'done',
        });
        ctx.addHistory(`${title}（本地展开，步骤 ${stepId}）`);
        return { handled: true, requestId };
      }
      break;
    }
    case 'theoremUsed': {
      const th = step?.metadata.theoremApplied;
      if (th) {
        const requestId = newRequestId();
        ctx.addLocalResult({
          requestId,
          stepId,
          action,
          title,
          content: `**用到的定理/公式**\n\n${th}\n\n如需补充前提条件检查，可再次点击或追问。`,
          status: 'done',
        });
        ctx.addHistory(`${title}（本地，步骤 ${stepId}）`);
        return { handled: true, requestId };
      }
      break;
    }
    case 'commonMistake': {
      const cm = step?.metadata.commonMistake;
      if (cm) {
        const requestId = newRequestId();
        ctx.addLocalResult({
          requestId,
          stepId,
          action,
          title,
          content: `**如果做错了会怎样**\n\n${cm}`,
          meta: { kind: 'warning', title: '常见错误' },
          status: 'done',
        });
        ctx.addHistory(`${title}（本地，步骤 ${stepId}）`);
        return { handled: true, requestId };
      }
      break;
    }
    case 'copy': {
      if (selectedText?.trim()) {
        void copyToClipboard(selectedText.trim());
        ctx.addHistory(`复制划选（步骤 ${stepId}）`);
        return { handled: true };
      }
      const stepResults = ctx.results.filter((r) => r.stepId === stepId && r.status === 'done');
      let text = step?.content ?? '';
      if (stepResults.length > 0) {
        text += '\n\n---\n\n' + stepResults.map((r) => `## ${r.title}\n${r.content}`).join('\n\n');
      }
      void copyToClipboard(text);
      ctx.addHistory(`复制（步骤 ${stepId}）`);
      return { handled: true };
    }
    default:
      break;
  }

  const requestId = ctx.dispatchEngine(action, stepId, question, selectedText);
  return { handled: false, requestId };
}
