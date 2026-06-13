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

/** 在显示模式下，若公式含 \\\\ 且未包裹在已知环境中，自动加 aligned 以支持换行。 */
function wrapDisplayMath(tex: string): string {
  const trimmed = tex.trim();
  // 如果已有 \begin{...} 环境，不重复包裹
  if (/^\\begin\{/.test(trimmed)) {
    return tex;
  }
  // 含换行符则包裹进 aligned 环境
  if (/\\\\/.test(trimmed)) {
    return `\\begin{aligned}\n${trimmed}\n\\end{aligned}`;
  }
  return tex;
}

/** 用 KaTeX 渲染单个公式，出错时回退为原始文本。 */
function renderTex(tex: string, display: boolean): string {
  try {
    const sanitized = display ? wrapDisplayMath(tex) : tex;
    return katex.renderToString(sanitized, {
      displayMode: display,
      throwOnError: false,
      strict: false,
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

/**
 * 对文本做智能分段预处理（在 Markdown 渲染前调用）：
 * - 子问题编号（如 （1）（2））前插入段落分隔，后追加全角空格缩进
 *
 * 实现细节：先保护 $...$ / $$...$$ / \(...\) / \[...\] 数学公式，避免公式内的标点被误拆分；
 * 再进行文本变换；最后还原公式。
 */
export function preprocessText(input: string): string {
  if (!input) return input;

  const protectedMath: string[] = [];

  // 保护块级公式 $$...$$
  let text = input.replace(/\$\$([\s\S]+?)\$\$/g, (m) => {
    protectedMath.push(m);
    return `@@PM${protectedMath.length - 1}@@`;
  });

  // 保护行内公式 $...$（沿用 extractMath 的匹配策略）
  text = text.replace(/(^|[^\\])\$([^$\n]+?)\$/g, (m, pre: string) => {
    protectedMath.push(m);
    return `${pre}@@PM${protectedMath.length - 1}@@`;
  });

  // 保护 \(...\) 与 \[...\]
  text = text.replace(/\\\(([\s\S]+?)\\\)/g, (m) => {
    protectedMath.push(m);
    return `@@PM${protectedMath.length - 1}@@`;
  });
  text = text.replace(/\\\[([\s\S]+?)\\\]/g, (m) => {
    protectedMath.push(m);
    return `@@PM${protectedMath.length - 1}@@`;
  });

  // 子问题编号：（\d+）前插入空行，后追加两个全角空格缩进。
  //    仅当编号前是句号/问号/感叹号/行首时才处理，避免行内引用误触发。
  text = text.replace(
    /(^|[。！？\n])\s*（(\d+)）(?=\S)/gm,
    '$1\n\n（$2）\u3000\u3000'
  );

  // 还原数学公式
  text = text.replace(/@@PM(\d+)@@/g, (_m, idx: string) => {
    return protectedMath[Number(idx)] ?? '';
  });

  return text;
}

/** 为缺少 $ 包裹的纯 LaTeX 片段补全行内定界符，保留非公式文本不变。 */
export function normalizeMathInput(input: string): string {
  const s = input.trim();
  if (!s) {
    return s;
  }
  // 已有标准定界符，无需处理。
  if (/\$\$[\s\S]+\$\$/.test(s) || /\$[^$\n]+\$/.test(s)) {
    return s;
  }
  if (/\\\([\s\S]+?\\\)/.test(s) || /\\\[[\s\S]+?\\\]/.test(s)) {
    return s;
  }
  // 检测到原始 LaTeX 命令或上下标，将每个 LaTeX 片段单独包裹，避免整段文字
  // 进入数学模式导致中文等非公式字符被 KaTeX 拒绝。
  if (/\\[a-zA-Z]+|[_^{}]/.test(s) && !/<[a-z]/i.test(s)) {
    // 匹配 LaTeX 命令（\name{...}...）以及独立的上下标 {pattern}
    return s.replace(
      /(\\[a-zA-Z]+(?:\{[^{}]*\})*|[_^]\{[^{}]*\})/g,
      '$$$1$'
    );
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
    const preprocessed = preprocessText(normalized);
    const { text, tokens } = extractMath(preprocessed);
    let html = marked.parse(text, { async: false }) as string;
    for (const t of tokens) {
      html = html.replace(t.placeholder, renderTex(t.tex, t.display));
    }
    return html;
  } catch {
    return `<p>${escapeHtml(input)}</p>`;
  }
}

/** 渲染 Markdown（含 LaTeX），不做任何智能分段预处理，严格遵循 Markdown 原文语义。 */
export function renderMarkdownRaw(input: string): string {
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
