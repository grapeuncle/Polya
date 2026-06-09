/**
 * 解析器与工具函数 corner case 测试。
 * 用法：node scripts/test-corner-cases.mjs
 */
import esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

let passed = 0;
let failed = 0;

function ok(name, detail = '') {
  passed++;
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  failed++;
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

function assert(name, cond, detail = '') {
  if (cond) ok(name, detail);
  else fail(name, detail);
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

/** 用 esbuild 打包测试入口，动态 import 解析模块。 */
async function loadParsers() {
  const outfile = path.join(root, 'dist', '_test-parsers.cjs');
  await esbuild.build({
    entryPoints: [path.join(root, 'scripts', '_parsers-entry.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
  });
  return import(pathToFileURL(outfile).href);
}

function testParseSolution({ parseSolution, parsePhaseSteps, normalizeSolutionStep }) {
  section('parseSolution corner cases');

  const fenced = parseSolution(
    '说明文字\n```json\n{"problem":"p","finalAnswer":"$1$","steps":[{"id":"s1","phase":"understanding","content":"c"}]}\n```',
    'fallback'
  );
  assert('fenced JSON', fenced.steps.length === 1 && fenced.finalAnswer === '$1$');

  const raw = parseSolution(
    '前缀 {"problem":"p","steps":[{"content":"c"}]} 后缀',
    'fallback'
  );
  assert('裸 JSON + 前后缀', raw.steps.length === 1 && raw.steps[0].id === 's1');

  const noSteps = parseSolution('{"problem":"p"}', 'fb');
  assert('无 steps 数组', noSteps.steps.length === 0 && noSteps.problem === 'p');

  let threw = false;
  try {
    parseSolution('not json at all', 'fb');
  } catch {
    threw = true;
  }
  assert('无效 JSON 抛错', threw);

  const multiFence = parseSolution(
    '```json\n{"note":"wrong"}\n```\n```json\n{"problem":"p","steps":[{"content":"ok"}]}\n```',
    'fb'
  );
  assert(
    '多个 JSON 块取含 steps 的块',
    multiFence.steps.length === 1 && multiFence.steps[0].content === 'ok',
    `steps=${multiFence.steps.length}`
  );

  const phaseSteps = parsePhaseSteps(
    '```json\n{"steps":[{"content":"phase step"}]}\n```',
    'devising'
  );
  assert(
    'parsePhaseSteps 补全 phase/id',
    phaseSteps.length === 1 &&
      phaseSteps[0].phase === 'devising' &&
      phaseSteps[0].id === 'devising-1'
  );

  const badPhase = parsePhaseSteps('garbage', 'understanding');
  assert('parsePhaseSteps 解析失败返回空', badPhase.length === 0);

  const multiPhase = parsePhaseSteps(
    '```json\n{"meta":"skip"}\n```\n```json\n{"steps":[{"content":"real"}]}\n```',
    'carrying-out'
  );
  assert(
    'parsePhaseSteps 多 JSON 块取含 steps',
    multiPhase.length === 1 && multiPhase[0].content === 'real'
  );

  const badSub = parseSolution(
    '{"problem":"p","steps":[{"id":"s1","phase":"carrying-out","content":"main","subSteps":[{"content":42},{"content":"ok"}]}]}',
    'fb'
  );
  assert(
    'subSteps 非字符串 content 规范化',
    badSub.steps[0].subSteps?.length === 2 &&
      badSub.steps[0].subSteps[0].content === '42' &&
      badSub.steps[0].subSteps[0].id === 's1-sub1',
    JSON.stringify(badSub.steps[0].subSteps)
  );

  const nested = normalizeSolutionStep(
    { id: 'root', content: 'r', subSteps: [{ content: 'a', subSteps: [{ content: 'b' }] }] },
    'fallback',
    'understanding'
  );
  assert(
    'normalizeSolutionStep 嵌套子步骤补 id',
    nested?.subSteps?.[0]?.id === 'root-sub1' &&
      nested?.subSteps?.[0]?.subSteps?.[0]?.content === 'b',
    JSON.stringify(nested)
  );
}

function testParseActionOutput({ parseActionOutput, parseMarkdownTable }) {
  section('parseActionOutput corner cases');

  const multi = parseActionOutput(
    'explain',
    '正文\n```json\n{"kind":"svg","svg":{"width":100,"height":100,"elements":[]}}\n```\n```json\n{"columns":["A","B"],"rows":[["1","2"]]}\n```'
  );
  assert(
    '多 JSON 块：viz + comparison',
    multi.meta.viz?.kind === 'svg' && multi.meta.comparison?.columns?.length === 2
  );
  assert('displayText 移除 JSON 块', !multi.displayText.includes('```json'));

  const nested = parseActionOutput(
    'visualize',
    '图\n```json\n{"viz":{"kind":"mermaid","mermaid":"graph LR; A-->B"}}\n```'
  );
  assert('嵌套 viz 字段', nested.meta.viz?.kind === 'mermaid');

  const warn = parseActionOutput('verify', '验算结果不正确，请检查');
  assert('验算警告 kind=warning', warn.meta.kind === 'warning');

  const practice = parseActionOutput('generatePractice', '同类练习\n题目：求解 x^2=4');
  assert('generatePractice 正则兜底', practice.meta.practiceProblem?.includes('x^2'));

  const variant = parseActionOutput('generalize', '变式\n变式题：若 a=2 则如何？');
  assert('generalize 正则兜底', variant.meta.variantProblem?.includes('a=2'));

  const mermaidBlock = parseActionOutput(
    'subGoals',
    '子目标\n```mermaid\nflowchart LR\n  A-->B\n```'
  );
  assert('独立 mermaid 代码块', mermaidBlock.meta.viz?.mermaid?.includes('flowchart'));

  const table = parseMarkdownTable('| 方法 | 优点 |\n| --- | --- |\n| A | 快 |');
  assert('Markdown 表格', table?.columns?.length === 2 && table?.rows?.[0]?.[0] === 'A');

  const badTable = parseMarkdownTable('无表格');
  assert('无效表格返回 undefined', badTable === undefined);

  const altTable = parseActionOutput(
    'alternatives',
    '| 法 | 说明 |\n| --- | --- |\n| 因式分解 | 快 |'
  );
  assert('alternatives 动作解析 Markdown 表', altTable.meta.comparison?.rows?.length === 1);

  const combined = parseActionOutput(
    'breakdown',
    '拆解\n```json\n{"breakdown":{"sentences":[{"text":"求x","role":"goal"}]},"microSteps":[{"id":"m1","label":"列式","content":"..."}]}\n```'
  );
  assert(
    '同一 JSON 块含 breakdown + microSteps',
    combined.meta.breakdown?.sentences?.length === 1 && combined.meta.microSteps?.length === 1
  );
}

function testParamEval({ tryEvalNumeric, substituteParams, formatParamPreview }) {
  section('paramEval corner cases');

  assert('substituteParams 多占位符', substituteParams('{a}+{b}', { a: 1, b: 2 }) === '1+2');
  assert('希腊字母 Δ', tryEvalNumeric('Δ = 25 - 4*{c}', { c: 6 }) === 1);
  assert('负数', tryEvalNumeric('= (-3) + 5', {}) === 2);
  assert('括号嵌套', tryEvalNumeric('= (2+3)*4', {}) === 20);
  assert('除法', tryEvalNumeric('= 10/4', {}) === 2.5);
  assert('非数值返回 null', tryEvalNumeric('hello world', {}) === null);
  assert('除零返回 null', tryEvalNumeric('= 1/0', {}) === null);

  const preview = formatParamPreview('x^2 + {c}', { c: 3 });
  assert('formatParamPreview 含替换', preview.includes('3'));
}

function testRouteActionGuard() {
  section('actionRouter corner cases');

  function findStep(steps, id) {
    for (const s of steps) {
      if (s.id === id) return s;
      if (s.subSteps) {
        const f = findStep(s.subSteps, id);
        if (f) return f;
      }
    }
    return undefined;
  }

  /** 模拟 routeAction 的步骤缺失守卫（与 actionRouter.ts 同步）。 */
  function guardMissingStep(action, stepId, steps, sel) {
    const step = findStep(steps, stepId);
    if (!step && action !== 'ask' && action !== 'copy') {
      return { handled: true, error: true };
    }
    if (action === 'copy' && sel?.trim()) {
      return { handled: true, copy: true };
    }
    return { handled: false };
  }

  const r1 = guardMissingStep('explain', 'gone', []);
  assert('步骤不存在时拦截引擎', r1.handled && r1.error);

  const r2 = guardMissingStep('copy', 'gone', [], '划选片段');
  assert('copy 无步骤但有划选仍放行', r2.handled && r2.copy);
}

function testStoreLogic({ findStep, phaseProgress, computeCompletedPhases }) {
  section('store 逻辑 corner cases');

  const steps = [
    { id: 's1', phase: 'understanding', content: 'a', metadata: {} },
    {
      id: 's2',
      phase: 'devising',
      content: 'b',
      metadata: {},
      subSteps: [{ id: 'sub1', phase: 'devising', content: 'sub', metadata: {} }],
    },
  ];
  assert('findStep 子步骤', findStep(steps, 'sub1')?.content === 'sub');
  assert('findStep 不存在', findStep(steps, 'nope') === undefined);
  assert('phaseProgress 空', phaseProgress([]) === 0);
  assert('phaseProgress 全完成', phaseProgress(['understanding', 'devising', 'carrying-out', 'looking-back']) === 1);

  const completed = computeCompletedPhases(
    steps,
    ['understanding'],
    [{ stepId: 's2', status: 'done', action: 'explain' }]
  );
  assert(
    'completedPhases：viewed 或 action',
    completed.includes('understanding') && completed.includes('devising'),
    completed.join(',')
  );
}

async function main() {
  console.log('Polya corner case 测试\n');
  const parsers = await loadParsers();
  testParseSolution(parsers);
  testParseActionOutput(parsers);
  testParamEval(parsers);
  testRouteActionGuard();
  testStoreLogic(parsers);

  section('汇总');
  console.log(`  通过: ${passed}  失败: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
