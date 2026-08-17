// 测试入口：导出供 corner case 脚本使用的纯函数。
export { parseSolution, parsePhaseSteps } from '../engines/parseSolution';
export { normalizeSolutionStep, normalizeSteps } from '../shared/normalizeStep';
export { parseActionOutput, parseMarkdownTable } from '../engines/parseActionOutput';
export { tryEvalNumeric, substituteParams, formatParamPreview } from '../client/utils/paramEval';

import { SolutionStep, Phase, MenuActionId } from '../shared/types';
import { PHASE_ORDER } from '../shared/types';

/** 从 store.ts 提取的纯函数（避免打包 zustand）。 */
export function findStep(steps: SolutionStep[], id: string): SolutionStep | undefined {
  for (const s of steps) {
    if (s.id === id) return s;
    if (s.subSteps) {
      const f = findStep(s.subSteps, id);
      if (f) return f;
    }
  }
  return undefined;
}

export function phaseProgress(completed: Phase[]): number {
  return completed.length / PHASE_ORDER.length;
}

interface ActionResultStub {
  stepId: string;
  status: string;
  action: MenuActionId;
}

export function computeCompletedPhases(
  steps: SolutionStep[],
  viewedPhases: Phase[],
  results: ActionResultStub[]
): Phase[] {
  const done: Phase[] = [];
  for (const p of PHASE_ORDER) {
    const phaseSteps = steps.filter((s) => s.phase === p);
    if (phaseSteps.length === 0) continue;
    const hasViewed = viewedPhases.includes(p);
    const hasAction = phaseSteps.some((s) =>
      results.some((r) => r.stepId === s.id && r.status === 'done')
    );
    if (hasViewed || hasAction) done.push(p);
  }
  return done;
}
