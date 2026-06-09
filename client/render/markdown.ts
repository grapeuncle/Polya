// 将含 LaTeX 的 Markdown 文本渲染为 HTML：先保护数学公式，再交给 marked，最后用 KaTeX 渲染公式。
import { marked } from 'marked';
import katex from 'katex';

interface MathToken {
  placeholder: string;
  tex: string;
  display: boolean;
}

/** 提取 $$...$$ 与 $...$ 公式，替换为占位符，避免被 Markdown 破坏。 */
function extractMath(input: string): { text: string; tokens: MathToken[] } {
  const tokens: MathToken[] = [];
  let idx = 0;
  // 先处理块级 $$...$$。
  let text = input.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex) => {
    const placeholder = `@@MATHBLOCK${idx}@@`;
    tokens.push({ placeholder, tex: tex.trim(), display: true });
    idx++;
    return placeholder;
  });
  // 再处理行内 $...$（避免匹配跨行与转义的 \$）。
  text = text.replace(/(^|[^\\])\$([^$\n]+?)\$/g, (_m, pre, tex) => {
    const placeholder = `@@MATHINLINE${idx}@@`;
    tokens.push({ placeholder, tex: tex.trim(), display: false });
    idx++;
    return `${pre}${placeholder}`;
  });
  // 支持 \(...\) 与 \[...\] 定界符。
  text = text.replace(/\\\(([\s\S]+?)\\\)/g, (_m, tex) => {
    const placeholder = `@@MATHINLINE${idx}@@`;
    tokens.push({ placeholder, tex: tex.trim(), display: false });
    idx++;
    return placeholder;
  });
  text = text.replace(/\\\[([\s\S]+?)\\\]/g, (_m, tex) => {
    const placeholder = `@@MATHBLOCK${idx}@@`;
    tokens.push({ placeholder, tex: tex.trim(), display: true });
    idx++;
    return placeholder;
  });
  return { text, tokens };
}

/** 用 KaTeX 渲染单个公式，出错时回退为原始文本。 */
function renderTex(tex: string, display: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode: display,
      throwOnError: false,
      output: 'html',
    });
  } catch {
    return `<code>${escapeHtml(tex)}</code>`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

marked.setOptions({ breaks: true, gfm: true });

/** 为缺少 $ 包裹的纯 LaTeX 补全行内定界符，便于最终答案等字段渲染。 */
export function normalizeMathInput(input: string): string {
  const s = input.trim();
  if (!s) {
    return s;
  }
  if (/\$\$[\s\S]+\$\$/.test(s) || /\$[^$\n]+\$/.test(s)) {
    return s;
  }
  if (/\\\([\s\S]+?\\\)/.test(s) || /\\\[[\s\S]+?\\\]/.test(s)) {
    return s;
  }
  if (/\\[a-zA-Z]+|[_^{}]/.test(s) && !/<[a-z]/i.test(s)) {
    return `$${s}$`;
  }
  return s;
}

/** 渲染 Markdown（含 LaTeX）为安全 HTML 字符串。 */
export function renderMarkdown(input: string): string {
  if (!input) {
    return '';
  }
  try {
    const normalized = normalizeMathInput(input);
    const { text, tokens } = extractMath(normalized);
    let html = marked.parse(text, { async: false }) as string;
    for (const t of tokens) {
      html = html.replace(t.placeholder, renderTex(t.tex, t.display));
    }
    return html;
  } catch {
    return `<p>${escapeHtml(input)}</p>`;
  }
}

/** 从 Markdown 文本中提取首个 mermaid 代码块（若有）。 */
export function extractMermaid(input: string): { mermaid?: string; rest: string } {
  const match = input.match(/```mermaid\s*([\s\S]*?)```/);
  if (!match) {
    return { rest: input };
  }
  const rest = input.replace(match[0], '').trim();
  return { mermaid: match[1].trim(), rest };
}
