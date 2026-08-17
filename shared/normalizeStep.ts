import { Phase, SolutionStep, StepMetadata } from './types';

const MAX_SUBSTEP_DEPTH = 8;

function toMarkdownContent(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value == null) {
    return '';
  }
  return String(value);
}

/** 规范化单条步骤（含子步骤 id、content 类型、嵌套深度）。 */
export function normalizeSolutionStep(
  raw: unknown,
  fallbackId: string,
  fallbackPhase: Phase,
  depth = 0
): SolutionStep | null {
  if (!raw || typeof raw !== 'object' || depth > MAX_SUBSTEP_DEPTH) {
    return null;
  }
  const s = raw as Record<string, unknown>;
  const phase = (typeof s.phase === 'string' ? s.phase : fallbackPhase) as Phase;
  const step: SolutionStep = {
    id: typeof s.id === 'string' && s.id ? s.id : fallbackId,
    phase,
    content: toMarkdownContent(s.content),
    metadata: (s.metadata && typeof s.metadata === 'object' ? s.metadata : {}) as StepMetadata,
  };
  if (typeof s.rawLatex === 'string') {
    step.rawLatex = s.rawLatex;
  }
  if (typeof s.subProblemIndex === 'number') {
    step.subProblemIndex = s.subProblemIndex;
  }
  if (s.subSteps != null) {
    const subs = Array.isArray(s.subSteps) ? s.subSteps : [];
    const normalized = subs
      .map((sub, i) =>
        normalizeSolutionStep(sub, `${step.id}-sub${i + 1}`, phase, depth + 1)
      )
      .filter((x): x is SolutionStep => x != null);
    if (normalized.length > 0) {
      step.subSteps = normalized;
    }
  }
  return step;
}

export function normalizeSteps(rawSteps: unknown, phase?: Phase): SolutionStep[] {
  if (!Array.isArray(rawSteps)) {
    return [];
  }
  return rawSteps
    .map((s, i) =>
      normalizeSolutionStep(s, phase ? `${phase}-${i + 1}` : `s${i + 1}`, phase ?? 'understanding')
    )
    .filter((x): x is SolutionStep => x != null);
}
