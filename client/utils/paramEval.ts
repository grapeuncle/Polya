// 安全参数表达式求值：仅支持白名单数学运算。
const GREEK: Record<string, string> = {
  Δ: 'Delta',
  δ: 'delta',
  π: 'PI',
};

/** 将 expression 中的 {name} 替换为数值并求值（若可解析为单值）。 */
export function substituteParams(expression: string, values: Record<string, number>): string {
  let out = expression;
  for (const [name, val] of Object.entries(values)) {
    out = out.replace(new RegExp(`\\{${name}\\}`, 'g'), String(val));
  }
  return out;
}

/** 尝试从表达式片段中提取数值结果（如 Δ=25-4c 中的 25-4*6）。 */
export function tryEvalNumeric(expr: string, values: Record<string, number>): number | null {
  let s = substituteParams(expr, values);
  for (const [g, lat] of Object.entries(GREEK)) {
    s = s.replace(new RegExp(g, 'g'), lat);
  }
  // 提取最后一个 = 后的算术部分，或整段中的算术子式
  const eqParts = s.split('=');
  const candidate = (eqParts.length > 1 ? eqParts[eqParts.length - 1] : s).trim();
  const mathPart = candidate.replace(/[^0-9+\-*/().^%\s]/g, '').trim();
  if (!mathPart || !/^[\d\s+\-*/().^]+$/.test(mathPart)) {
    return null;
  }
  try {
    const normalized = mathPart.replace(/\^/g, '**');
    // eslint-disable-next-line no-new-func
    const fn = new Function(`"use strict"; return (${normalized});`);
    const result = fn();
    return typeof result === 'number' && Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

/** 格式化预览：替换占位符并附加数值结果（若有）。 */
export function formatParamPreview(expression: string, values: Record<string, number>): string {
  const text = substituteParams(expression, values);
  const num = tryEvalNumeric(expression, values);
  if (num !== null) {
    return `${text} \\Rightarrow ${num}`;
  }
  return text;
}
