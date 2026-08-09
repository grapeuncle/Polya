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
    // 推理模型（deepseek-v4-flash 等）会在 JSON 前输出含 LaTeX 的推理文本，
    // 如 \sqrt{3}、\frac{a}{b} 中的 { } 会干扰 indexOf('{') 定位。
    // 优先用 "steps" 键名锚定 JSON 对象起始位置。
    const stepsMatch = candidate.match(/\{\s*"steps"\s*:/);
    const start = stepsMatch?.index != null
      ? stepsMatch.index
      : candidate.indexOf('{');
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
      // 若以 "steps" 锚定仍失败，回退到普通 indexOf('{') 再试一次
      if (stepsMatch?.index != null) {
        const fallbackStart = candidate.indexOf('{');
        if (fallbackStart >= 0 && fallbackStart !== stepsMatch.index) {
          try {
            const jsonText2 = sanitizeLatexJson(candidate.slice(fallbackStart, end + 1));
            const obj2 = JSON.parse(jsonText2) as Record<string, unknown>;
            if (Array.isArray(obj2.steps)) {
              return obj2;
            }
            if (!fallback) {
              fallback = obj2;
            }
          } catch {
            // ignore
          }
        }
      }
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
  if (obj && Array.isArray(obj.steps)) {
    return normalizeSteps(obj.steps, phase);
  }
  // 推理模型（如 deepseek-v4-flash）可能不输出 JSON 包装，而是直接在推理文本中给出步骤内容。
  // 此时将整段原始文本包装为一个步骤，确保 UI 仍能逐阶段展示。
  const trimmed = raw.trim();
  if (trimmed.length > 0) {
    return normalizeSteps(
      [
        {
          id: `${phase}-raw-1`,
          phase,
          content: trimmed,
          metadata: {},
        },
      ],
      phase
    );
  }
  return [];
}
