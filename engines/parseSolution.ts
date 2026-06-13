// 从模型返回中解析 JSON 解题方案；容错处理代码块包裹与多余文本。
import { normalizeSteps } from '../shared/normalizeStep';
import { Phase, Solution, SolutionStep, SubAnswer } from '../shared/types';
import { sanitizeLatexJson } from './jsonSanitizer';

export { normalizeSolutionStep, normalizeSteps } from '../shared/normalizeStep';

/** 从文本中提取可解析的 JSON 对象；多代码块时优先取含 steps 的块。 */
function extractSolutionJson(raw: string): Record<string, unknown> | null {
  const fenced: string[] = [];
  const re = /```(?:json)?\s*([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    fenced.push(m[1].trim());
  }

  const candidates = fenced.length > 0 ? fenced : [raw.trim()];
  let fallback: Record<string, unknown> | null = null;

  for (const candidate of candidates) {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) {
      continue;
    }
    try {
      const jsonText = sanitizeLatexJson(candidate.slice(start, end + 1));
      const obj = JSON.parse(jsonText) as Record<string, unknown>;
      if (Array.isArray(obj.steps)) {
        return obj;
      }
      if (!fallback) {
        fallback = obj;
      }
    } catch {
      // try next block
    }
  }
  return fallback;
}

/** 从模型返回中解析 JSON 解题方案。 */
export function parseSolution(raw: string, problem: string): Solution {
  const obj = extractSolutionJson(raw);
  if (!obj) {
    throw new Error(
      '无法解析 AI 返回的解题方案（JSON 格式错误）。可尝试重试或切换到 mock 引擎。'
    );
  }
  const steps = normalizeSteps(obj.steps);
  const subAnswers = parseSubAnswers(obj.subAnswers);
  return {
    problem: (typeof obj.problem === 'string' ? obj.problem : undefined) || problem,
    finalAnswer: typeof obj.finalAnswer === 'string' ? obj.finalAnswer : undefined,
    steps,
    subAnswers: subAnswers.length > 0 ? subAnswers : undefined,
  };
}

function parseSubAnswers(raw: unknown): SubAnswer[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null && typeof item.id === 'number'
    )
    .map((item) => ({
      id: Number(item.id),
      label: typeof item.label === 'string' ? item.label : `（${item.id}）`,
      answer: typeof item.answer === 'string' ? item.answer : '',
    }));
}

/** 从阶段 JSON 中解析该阶段的步骤列表。 */
export function parsePhaseSteps(raw: string, phase: Phase): SolutionStep[] {
  const obj = extractSolutionJson(raw);
  if (!obj || !Array.isArray(obj.steps)) {
    return [];
  }
  return normalizeSteps(obj.steps, phase);
}
