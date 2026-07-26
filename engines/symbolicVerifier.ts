// 符号计算校验层：为「检验 / 检查计算 / 验证答案」类动作提供不依赖 LLM 的客观兜底。
// 基于 mathjs 对步骤文本中的等式做恒等化简与数值抽样，输出确定性结论。
// 设计原则：任何异常都被吞掉并降级为 unknown，绝不抛错、绝不阻塞主流程。
import * as math from 'mathjs';

export type SymbolicVerdict = 'verified' | 'consistent' | 'conditional' | 'contradiction' | 'unknown';

export interface SymbolicCheck {
  /** 原始等式（LaTeX 或纯文本）。 */
  expression: string;
  verdict: SymbolicVerdict;
  /** 人类可读的判定说明。 */
  detail: string;
}

export interface SymbolicVerification {
  checks: SymbolicCheck[];
  verifiedCount: number;
  contradictionCount: number;
}

/** 单次最多校验的等式数量，避免长步骤拖慢响应。 */
const MAX_EQUATIONS = 6;
const NUMERIC_SAMPLES = 3;
const REL_TOL = 1e-6;

/** 视为函数/常量而非变量的符号。 */
const RESERVED_SYMBOLS = new Set([
  'pi', 'e', 'i', 'Infinity',
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
  'asin', 'acos', 'atan',
  'log', 'log10', 'ln', 'exp', 'sqrt', 'abs', 'min', 'max',
]);

interface Equation {
  raw: string;
  lhs: string;
  rhs: string;
}

/** 从 Markdown / LaTeX 文本中抽取候选等式。 */
export function extractEquations(content: string): Equation[] {
  const out: Equation[] = [];
  const seen = new Set<string>();

  // 1) $...$ / $$...$$ 段
  const latexSegs = content.match(/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g) ?? [];
  for (const seg of latexSegs) {
    pushCandidates(seg.replace(/^\$\$?|\$\$?$/g, ''), out, seen);
  }

  // 2) 纯文本行中的 A = B（去除 Markdown 强调与行内代码）
  for (const line of content.split('\n')) {
    if (out.length >= MAX_EQUATIONS) {
      break;
    }
    // 先剥离 $...$ 段（已由 LaTeX 通道处理），避免正则吃进 LaTeX 碎片
    const clean = line
      .replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g, ' ')
      .replace(/\*\*/g, '')
      .replace(/`[^`]*`/g, '');
    if (!clean.includes('=')) {
      continue;
    }
    const m = clean.match(/([0-9A-Za-z+\-*/^().\s]+)\s*=\s*([0-9A-Za-z+\-*/^().\s]+)/);
    if (m) {
      pushCandidates(`${m[1]}=${m[2]}`, out, seen);
    }
  }

  return out;
}

function pushCandidates(text: string, out: Equation[], seen: Set<string>): void {
  for (const seg of text.split(/\\\\|\n/)) {
    const s = seg.trim();
    if (!s.includes('=')) {
      continue;
    }
    // 含不等号、近似号或中文的表达式跳过
    if (/[<>≠≈≥≤]/.test(s) || /[\u4e00-\u9fff]/.test(s)) {
      continue;
    }
    const parts = s.split('=').map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) {
      continue;
    }
    // 链式等式 a = b = c → 逐对验证
    for (let i = 0; i + 1 < parts.length && out.length < MAX_EQUATIONS; i++) {
      const lhs = parts[i];
      const rhs = parts[i + 1];
      const key = `${lhs}=${rhs}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push({ raw: key, lhs, rhs });
    }
  }
}

/** LaTeX 尽力归一化为 mathjs 可解析表达式；无法支持时返回 null。 */
export function latexToMathjs(input: string): string | null {
  try {
    let s = input.trim();
    if (!s) {
      return null;
    }
    // 不等号 / 近似号不支持
    if (/\\(geq?|leq?|neq?|approx|equiv|propto|sim|ll|gg)\b/.test(s)) {
      return null;
    }
    s = s.replace(/\\text\s*\{[^}]*\}/g, '');
    s = s.replace(/\\mathrm\s*\{([^}]*)\}/g, '$1');
    s = s.replace(/\\operatorname\s*\{([^}]*)\}/g, '$1');
    s = s.replace(/\\left|\\right/g, '');
    s = s.replace(/\\!/g, '');
    s = s.replace(/\\[,;:]/g, ' ');
    s = s.replace(/\\ /g, ' ');
    s = s.replace(/\\displaystyle/g, '');
    // \frac / \dfrac / \tfrac → ((a)/(b))，迭代处理嵌套
    for (let i = 0; i < 6; i++) {
      const next = s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '(($1)/($2))');
      if (next === s) {
        break;
      }
      s = next;
    }
    // \sqrt{x} → sqrt(x)，迭代处理嵌套
    for (let i = 0; i < 6; i++) {
      const next = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, 'sqrt($1)');
      if (next === s) {
        break;
      }
      s = next;
    }
    s = s.replace(/\\cdot|\\times|\\ast/g, '*');
    s = s.replace(/\\div/g, '/');
    s = s.replace(/\\pi/g, ' pi ');
    s = s.replace(/\\infty|\\infinity/gi, 'Infinity');
    s = s.replace(/\\(sin|cos|tan|cot|sec|csc|exp|min|max|abs)\b/g, '$1');
    s = s.replace(/\\ln\b/g, 'log');
    s = s.replace(/\\lg\b/g, 'log10');
    s = s.replace(/\\log\b/g, 'log');
    // x^{2} → x^(2)
    for (let i = 0; i < 6; i++) {
      const next = s.replace(/\^\s*\{([^{}]*)\}/g, '^($1)');
      if (next === s) {
        break;
      }
      s = next;
    }
    // 剩余花括号 → 圆括号
    s = s.replace(/\{/g, '(').replace(/\}/g, ')');
    // 仍有未识别的 LaTeX 命令 → 放弃
    if (/\\/.test(s)) {
      return null;
    }
    // 空表达式或只含符号分隔
    if (!/[0-9A-Za-z]/.test(s)) {
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

function collectSymbols(nodes: math.MathNode[]): string[] {
  const set = new Set<string>();
  for (const n of nodes) {
    n.traverse((node, _path, parent) => {
      if (math.isSymbolNode(node)) {
        const name = node.name;
        if (RESERVED_SYMBOLS.has(name)) {
          return;
        }
        // 函数名（如自定义 f(x) 中的 f）不算变量
        if (parent && math.isFunctionNode(parent)) {
          return;
        }
        set.add(name);
      }
    });
  }
  return [...set];
}

/** 生成确定性的采样值：避开 0/1 等平凡点，且不同变量取不同值。 */
function sampleValue(symbol: string, round: number): number {
  const base = [2, 3, 5, 7, 4, 6, 8, 9];
  const idx = (symbol.charCodeAt(0) + symbol.length * 3 + round * 2) % base.length;
  return base[idx] + round * 0.5;
}

function checkEquality(eq: Equation): SymbolicCheck {
  const lhs = latexToMathjs(eq.lhs);
  const rhs = latexToMathjs(eq.rhs);
  if (!lhs || !rhs) {
    return { expression: eq.raw, verdict: 'unknown', detail: '表达式超出符号引擎解析范围' };
  }
  // 单侧孤立变量（如 x = 2、t = x+1）属于取值/定义声明，需结合上下文，不做判定
  if (/^[A-Za-z]\w*$/.test(lhs.trim()) || /^[A-Za-z]\w*$/.test(rhs.trim())) {
    return { expression: eq.raw, verdict: 'unknown', detail: '属于变量取值或定义，需结合上下文验证' };
  }

  let lhsNode: math.MathNode;
  let rhsNode: math.MathNode;
  try {
    lhsNode = math.parse(lhs);
    rhsNode = math.parse(rhs);
  } catch {
    return { expression: eq.raw, verdict: 'unknown', detail: '表达式解析失败' };
  }

  // 1) 严格恒等：rationalize（展开多项式）与 simplify 双通道化简 lhs - rhs
  const diffForms: math.MathNode[] = [];
  try {
    diffForms.push(math.rationalize(`(${lhs})-(${rhs})`));
  } catch {
    // rationalize 不支持该表达式，忽略
  }
  try {
    diffForms.push(math.simplify(`(${lhs})-(${rhs})`));
  } catch {
    // simplify 失败，忽略
  }
  for (const diff of diffForms) {
    if (diff.toString() === '0') {
      return { expression: eq.raw, verdict: 'verified', detail: '符号化简恒等（严格成立）' };
    }
  }
  for (const diff of diffForms) {
    if (math.isConstantNode(diff)) {
      const v = Number(diff.value);
      if (Number.isFinite(v) && v !== 0) {
        return { expression: eq.raw, verdict: 'contradiction', detail: `两边相差常数 ${diff.toString()}，必然不成立` };
      }
    }
  }

  // 2) 数值校验
  const symbols = collectSymbols([lhsNode, rhsNode]);
  if (symbols.length === 0) {
    try {
      const l = Number(math.evaluate(lhs));
      const r = Number(math.evaluate(rhs));
      if (!Number.isFinite(l) || !Number.isFinite(r)) {
        return { expression: eq.raw, verdict: 'unknown', detail: '数值结果非有限值' };
      }
      const tol = REL_TOL * Math.max(1, Math.abs(l), Math.abs(r));
      return Math.abs(l - r) <= tol
        ? { expression: eq.raw, verdict: 'verified', detail: '数值验证成立' }
        : { expression: eq.raw, verdict: 'contradiction', detail: `数值不等：左 = ${l}，右 = ${r}` };
    } catch {
      return { expression: eq.raw, verdict: 'unknown', detail: '数值求值失败' };
    }
  }

  let agree = 0;
  let disagree = 0;
  for (let i = 0; i < NUMERIC_SAMPLES; i++) {
    const scope: Record<string, number> = {};
    for (const sym of symbols) {
      scope[sym] = sampleValue(sym, i);
    }
    try {
      const l = Number(math.evaluate(lhs, scope));
      const r = Number(math.evaluate(rhs, scope));
      if (!Number.isFinite(l) || !Number.isFinite(r)) {
        continue;
      }
      const tol = REL_TOL * Math.max(1, Math.abs(l), Math.abs(r));
      if (Math.abs(l - r) <= tol) {
        agree++;
      } else {
        disagree++;
      }
    } catch {
      // 该采样点无效（如除零），跳过
    }
  }
  if (agree > 0 && disagree === 0) {
    return { expression: eq.raw, verdict: 'consistent', detail: `数值抽样一致（${agree} 组样本，非严格证明）` };
  }
  if (agree === 0 && disagree === 0) {
    return { expression: eq.raw, verdict: 'unknown', detail: '无有效采样点，无法判定' };
  }
  // 含变量等式抽样不符时，无法区分「展开/变形错误」与「待解方程」（如 x-2=0 仅在 x=2 成立）。
  // 矛盾判定必须可证明，此处只能降级为中性的条件等式提示，绝不误报。
  return {
    expression: eq.raw,
    verdict: 'conditional',
    detail: `非恒等式：仅特定取值成立（${disagree} 组样本不符；若为待解方程或约束条件属正常）`,
  };
}

/** 对步骤内容做符号校验。任何顶层异常均返回空结果。 */
export function verifyEquations(content: string): SymbolicVerification {
  const empty: SymbolicVerification = { checks: [], verifiedCount: 0, contradictionCount: 0 };
  try {
    if (!content?.trim()) {
      return empty;
    }
    const equations = extractEquations(content);
    const checks: SymbolicCheck[] = [];
    for (const eq of equations) {
      try {
        const c = checkEquality(eq);
        // unknown 不展示，避免噪音
        if (c.verdict !== 'unknown') {
          checks.push(c);
        }
      } catch {
        // 单条失败不影响整体
      }
    }
    return {
      checks,
      verifiedCount: checks.filter((c) => c.verdict === 'verified' || c.verdict === 'consistent').length,
      contradictionCount: checks.filter((c) => c.verdict === 'contradiction').length,
    };
  } catch {
    return empty;
  }
}

const VERDICT_ICON: Record<SymbolicVerdict, string> = {
  verified: '✅',
  consistent: '🟡',
  conditional: '🔵',
  contradiction: '❌',
  unknown: '➖',
};

/** 渲染为 Markdown 段落，直接插入结果卡片头部。无有效校验时返回空串。 */
export function formatSymbolicVerification(v: SymbolicVerification): string {
  if (v.checks.length === 0) {
    return '';
  }
  const lines = v.checks.map(
    (c) => `- ${VERDICT_ICON[c.verdict]} \`${c.expression}\` —— ${c.detail}`
  );
  const conditionalCount = v.checks.filter((c) => c.verdict === 'conditional').length;
  const summary =
    v.contradictionCount > 0
      ? `发现 **${v.contradictionCount} 处矛盾**，请优先核对！`
      : `${v.verifiedCount} 个等式通过客观校验` +
        (conditionalCount > 0 ? `，${conditionalCount} 个为条件等式（如待解方程，属正常）` : '') +
        '。';
  return [
    `> 🧮 **符号引擎客观校验**（mathjs，与 AI 无关）：${summary}`,
    '>',
    ...lines.map((l) => `> ${l}`),
    '',
    '_以下为 AI 参考分析_',
  ].join('\n');
}
