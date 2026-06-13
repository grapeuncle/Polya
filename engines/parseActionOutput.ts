// 从 AI 输出文本中解析结构化 meta（VizSpec、ComparisonSpec、ParamSpec 等）。
import {
  ActionResultMeta,
  ComparisonSpec,
  MenuActionId,
  ParamSpec,
  SolutionStep,
  VizSpec,
} from '../shared/types';
import { sanitizeLatexJson } from './jsonSanitizer';

interface ParsedJsonBlock {
  type:
    | 'viz'
    | 'comparison'
    | 'params'
    | 'practice'
    | 'branch'
    | 'breakdown'
    | 'microSteps'
    | 'highlights'
    | 'theoremCheck'
    | 'subGoals'
    | 'variant'
    | 'unknown';
  data: unknown;
}

/** 提取所有 ```json ... ``` 块并尝试解析。 */
function extractJsonBlocks(text: string): ParsedJsonBlock[] {
  const blocks: ParsedJsonBlock[] = [];
  const re = /```json\s*([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    try {
      const jsonText = sanitizeLatexJson(m[1].trim());
      const data = JSON.parse(jsonText);
      blocks.push(classifyJson(data));
    } catch {
      blocks.push({ type: 'unknown', data: null });
    }
  }
  return blocks;
}

function classifyJson(data: unknown): ParsedJsonBlock {
  if (!data || typeof data !== 'object') {
    return { type: 'unknown', data };
  }
  const obj = data as Record<string, unknown>;
  // 始终保留完整 JSON 对象，便于同一响应块携带多种结构化字段。
  if (obj.kind === 'svg' || obj.kind === 'mermaid' || obj.kind === 'table') {
    return { type: 'viz', data: obj };
  }
  if (Array.isArray(obj.params)) {
    return { type: 'params', data: obj };
  }
  if (Array.isArray(obj.columns) && Array.isArray(obj.rows)) {
    return { type: 'comparison', data: obj };
  }
  if (typeof obj.practiceProblem === 'string') {
    return { type: 'practice', data: obj };
  }
  if (Array.isArray(obj.branchSteps)) {
    return { type: 'branch', data: obj };
  }
  if (obj.breakdown && typeof obj.breakdown === 'object') {
    return { type: 'breakdown', data: obj };
  }
  if (Array.isArray(obj.microSteps)) {
    return { type: 'microSteps', data: obj };
  }
  if (Array.isArray(obj.highlights)) {
    return { type: 'highlights', data: obj };
  }
  if (Array.isArray(obj.theoremCheck)) {
    return { type: 'theoremCheck', data: obj };
  }
  if (Array.isArray(obj.subGoals)) {
    return { type: 'subGoals', data: obj };
  }
  if (typeof obj.variantProblem === 'string') {
    return { type: 'variant', data: obj };
  }
  if (obj.viz) {
    return { type: 'viz', data: obj };
  }
  if (obj.comparison) {
    return { type: 'comparison', data: obj };
  }
  return { type: 'unknown', data: obj };
}

function asRecord(data: unknown): Record<string, unknown> {
  return (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
}

/** 从 Markdown 表格解析 ComparisonSpec。 */
export function parseMarkdownTable(text: string): ComparisonSpec | undefined {
  const lines = text.split('\n').filter((l) => l.trim().startsWith('|'));
  if (lines.length < 2) {
    return undefined;
  }
  const parseRow = (line: string) =>
    line
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c && !/^[-:]+$/.test(c));
  const columns = parseRow(lines[0]);
  const rows = lines.slice(2).map(parseRow).filter((r) => r.length > 0);
  if (columns.length === 0 || rows.length === 0) {
    return undefined;
  }
  return { columns, rows };
}

/** 提取 mermaid 代码块。 */
function extractMermaid(text: string): string | undefined {
  const m = text.match(/```mermaid\s*([\s\S]*?)```/);
  return m ? m[1].trim() : undefined;
}

const WARNING_PATTERNS =
  /错误|不正确|有误|不符合|验算失败|计算错误|warning|❌|✗|不对/i;

const VERIFY_ACTIONS: MenuActionId[] = ['verify', 'checkCalculation', 'verifyAnswer'];

const COMPARISON_ACTIONS: MenuActionId[] = ['alternatives', 'allSolutions', 'branchAlternative'];

/**
 * 根据动作类型与完整输出文本，生成 ActionResultMeta。
 * 同时返回 strip 后的展示文本（移除 JSON 尾块）。
 */
export function parseActionOutput(
  action: MenuActionId,
  rawText: string
): { meta: ActionResultMeta; displayText: string } {
  const jsonBlocks = extractJsonBlocks(rawText);
  let displayText = rawText.replace(/```json\s*[\s\S]*?```/g, '').trim();

  const meta: ActionResultMeta = {};

  for (const block of jsonBlocks) {
    if (!block.data) {
      continue;
    }
    const obj = asRecord(block.data);
    switch (block.type) {
      case 'viz': {
        const viz = (obj.viz ?? obj) as VizSpec;
        meta.viz = viz;
        meta.kind = viz.kind === 'svg' ? 'svg' : viz.kind === 'table' ? 'text' : 'mermaid';
        break;
      }
      case 'comparison': {
        const comparison = (obj.comparison ?? obj) as ComparisonSpec;
        meta.comparison = comparison;
        meta.kind = 'comparison';
        break;
      }
      case 'params':
        meta.params = obj.params as ParamSpec[];
        break;
      case 'practice':
        meta.practiceProblem = obj.practiceProblem as string;
        meta.kind = 'practice';
        break;
      case 'branch':
        meta.branchSteps = obj.branchSteps as SolutionStep[];
        meta.branchLabel = (obj.branchLabel as string) ?? '另解';
        meta.kind = 'comparison';
        break;
      case 'breakdown':
        meta.breakdown = obj.breakdown as ActionResultMeta['breakdown'];
        meta.kind = 'text';
        break;
      case 'microSteps':
        meta.microSteps = obj.microSteps as ActionResultMeta['microSteps'];
        break;
      case 'highlights':
        meta.highlights = obj.highlights as ActionResultMeta['highlights'];
        meta.kind = 'warning';
        break;
      case 'theoremCheck':
        meta.theoremCheck = obj.theoremCheck as ActionResultMeta['theoremCheck'];
        break;
      case 'subGoals':
        meta.subGoals = obj.subGoals as ActionResultMeta['subGoals'];
        if (!meta.kind) {
          meta.kind = 'mermaid';
        }
        break;
      case 'variant':
        meta.variantProblem = obj.variantProblem as string;
        meta.variantNote = obj.variantNote as string | undefined;
        meta.kind = 'practice';
        break;
      default:
        break;
    }
    applyLooseMeta(obj, meta);
  }

  const mermaid = extractMermaid(displayText);
  if (mermaid && !meta.viz) {
    meta.viz = { kind: 'mermaid', mermaid };
    meta.kind = 'mermaid';
  }

  if (!meta.comparison && COMPARISON_ACTIONS.includes(action)) {
    const table = parseMarkdownTable(displayText);
    if (table) {
      meta.comparison = table;
      meta.kind = 'comparison';
    }
  }

  if (action === 'visualize' && !meta.viz && mermaid) {
    meta.viz = { kind: 'mermaid', mermaid };
    meta.kind = 'mermaid';
  }

  if (action === 'generatePractice' && !meta.practiceProblem) {
    const pm = displayText.match(/(?:题目|练习)[：:]\s*(.+?)(?:\n|$)/);
    if (pm) {
      meta.practiceProblem = pm[1].trim();
      meta.kind = 'practice';
    }
  }

  if (action === 'restate') {
    meta.kind = 'restate';
  }

  if (VERIFY_ACTIONS.includes(action) && (WARNING_PATTERNS.test(rawText) || meta.highlights?.length)) {
    meta.kind = 'warning';
  }

  if (action === 'breakdown' && !meta.breakdown) {
    meta.kind = 'text';
  }

  if (action === 'generalize' && !meta.variantProblem) {
    const vm = displayText.match(/变式题[：:]\s*(.+?)(?:\n|$)/);
    if (vm) {
      meta.variantProblem = vm[1].trim();
      meta.kind = 'practice';
    }
  }

  if (!meta.kind) {
    meta.kind = 'text';
  }

  return { meta, displayText };
}

function applyLooseMeta(obj: Record<string, unknown>, meta: ActionResultMeta): void {
  if (obj.breakdown && !meta.breakdown) {
    meta.breakdown = obj.breakdown as ActionResultMeta['breakdown'];
  }
  if (Array.isArray(obj.microSteps) && !meta.microSteps) {
    meta.microSteps = obj.microSteps as ActionResultMeta['microSteps'];
  }
  if (Array.isArray(obj.highlights) && !meta.highlights) {
    meta.highlights = obj.highlights as ActionResultMeta['highlights'];
    meta.kind = 'warning';
  }
  if (Array.isArray(obj.theoremCheck) && !meta.theoremCheck) {
    meta.theoremCheck = obj.theoremCheck as ActionResultMeta['theoremCheck'];
  }
  if (Array.isArray(obj.subGoals) && !meta.subGoals) {
    meta.subGoals = obj.subGoals as ActionResultMeta['subGoals'];
  }
}
