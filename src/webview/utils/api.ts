// Webview 侧类型化消息封装（解题 / 动作 / 分支）。
import {
  ConversationMessage,
  Difficulty,
  MenuActionId,
  SolutionBranch,
} from '../../shared/types';
import { newRequestId, postMessage } from '../vscodeApi';

export function postSolve(problem: string): void {
  postMessage({ type: 'solve', problem });
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
