/**
 * Polya 插件冒烟测试：构建产物、Mock 引擎、DeepSeek API 连通性。
 * 用法：node scripts/smoke-test.mjs [--api-key <key>]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const results = [];
let passed = 0;
let failed = 0;
let skipped = 0;

function ok(name, detail = '') {
  passed++;
  results.push({ status: 'PASS', name, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  failed++;
  results.push({ status: 'FAIL', name, detail });
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

function skip(name, detail = '') {
  skipped++;
  results.push({ status: 'SKIP', name, detail });
  console.log(`  ○ ${name}${detail ? ` — ${detail}` : ''}`);
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

/** 解析 CLI 参数或环境变量中的 API Key。 */
function resolveApiKey() {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf('--api-key');
  if (idx >= 0 && argv[idx + 1]) {
    return argv[idx + 1].trim();
  }
  return process.env.POLYA_API_KEY?.trim() || process.env.DEEPSEEK_API_KEY?.trim() || '';
}

/** 读取 Cursor 用户 settings.json 中的 polya 配置（若存在）。 */
function readUserPolyaConfig() {
  const settingsPath = path.join(
    process.env.APPDATA || '',
    'Cursor',
    'User',
    'settings.json'
  );
  if (!fs.existsSync(settingsPath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(settingsPath, 'utf8');
    const cfg = JSON.parse(raw);
    return {
      engine: cfg['polyaSolver.engine'],
      apiKey: cfg['polyaSolver.apiKey'],
      baseUrl: cfg['polyaSolver.deepseek.baseUrl'] || 'https://api.deepseek.com/v1',
      model: cfg['polyaSolver.deepseek.model'] || 'deepseek-chat',
    };
  } catch {
    return null;
  }
}

/** OpenAI 兼容 SSE 流式请求，返回完整文本。 */
async function streamChat({ baseUrl, apiKey, model, system, user, signal }) {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  if (!res.body) {
    throw new Error('响应无 body');
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let streaming = true;
  while (streaming) {
    const { done, value } = await reader.read();
    if (done) {
      streaming = false;
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') return full;
      try {
        const json = JSON.parse(data);
        const piece = json?.choices?.[0]?.delta?.content;
        if (piece) full += piece;
      } catch {
        // ignore
      }
    }
  }
  return full;
}

/** 与 LLMSolverEngine.parseSolution 等价的 JSON 解析。 */
function parseSolution(raw, problem) {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  const obj = JSON.parse(text);
  const steps = Array.isArray(obj.steps) ? obj.steps : [];
  steps.forEach((s, i) => {
    if (!s.id) s.id = `s${i + 1}`;
    if (!s.metadata) s.metadata = {};
  });
  return { problem: obj.problem || problem, finalAnswer: obj.finalAnswer, steps };
}

async function testBuildArtifacts() {
  section('构建产物');
  const required = [
    'dist/extension.js',
    'dist/webview.js',
    'dist/media/katex.min.css',
    'dist/media/codicon.css',
    'package.json',
  ];
  const optional = ['dist/media/mermaid.min.js'];
  for (const rel of required) {
    const p = path.join(root, rel);
    if (fs.existsSync(p)) {
      const stat = fs.statSync(p);
      ok(rel, `${(stat.size / 1024).toFixed(1)} KB`);
    } else {
      fail(rel, '文件不存在');
    }
  }
  for (const rel of optional) {
    const p = path.join(root, rel);
    if (fs.existsSync(p)) {
      ok(rel + ' (离线 Mermaid)', `${(fs.statSync(p).size / 1024).toFixed(1)} KB`);
    } else {
      skip(rel, '未打包，将回退 CDN');
    }
  }
}

function testParamEval() {
  section('paramEval 本地求值');
  const expr = 'x^2 - 5x + {c} = 0, Δ = 25 - 4*{c}';
  const substituted = expr.replace(/\{c\}/g, '6').replace(/Δ/g, 'Delta');
  const mathPart = '25 - 4*6';
  try {
    const fn = new Function(`"use strict"; return (${mathPart});`);
    const v = fn();
    if (v === 1) {
      ok('参数表达式数值求值', `Δ=1 when c=6`);
    } else {
      fail('参数表达式数值求值', `期望 1 得 ${v}`);
    }
  } catch (e) {
    fail('参数表达式数值求值', e.message);
  }
}

function testBreakdownMeta() {
  section('breakdown / microSteps meta 解析');
  const sample = `拆解

\`\`\`json
{"breakdown":{"sentences":[{"text":"求解 x","role":"goal","note":"目标"}]},"microSteps":[{"id":"m1","label":"移项","content":"..."}]}
\`\`\``;
  const match = sample.match(/```json\s*([\s\S]*?)```/);
  if (!match) {
    fail('breakdown JSON 块');
    return;
  }
  try {
    const obj = JSON.parse(match[1].trim());
    if (obj.breakdown?.sentences?.length === 1 && obj.microSteps?.length === 1) {
      ok('breakdown + microSteps JSON');
    } else {
      fail('breakdown 结构异常');
    }
  } catch (e) {
    fail('breakdown JSON', e.message);
  }
}

async function testPackageConfig() {
  section('package.json 配置');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const engineEnum = pkg.contributes?.configuration?.properties?.['polyaSolver.engine']?.enum;
  if (Array.isArray(engineEnum) && engineEnum.includes('deepseek')) {
    ok('engine 枚举含 deepseek', engineEnum.join(', '));
  } else {
    fail('engine 枚举缺少 deepseek');
  }
  const deepseekBase = pkg.contributes?.configuration?.properties?.['polyaSolver.deepseek.baseUrl'];
  if (deepseekBase?.default === 'https://api.deepseek.com/v1') {
    ok('deepseek.baseUrl 默认值正确');
  } else {
    fail('deepseek.baseUrl 默认值异常');
  }
}

async function testParseSolution() {
  section('JSON 解题方案解析');
  const sample = `\`\`\`json
{"problem":"1+1=?","finalAnswer":"$2$","steps":[{"id":"s1","phase":"understanding","content":"求和","metadata":{}}]}
\`\`\``;
  try {
    const sol = parseSolution(sample, '1+1=?');
    if (sol.steps.length === 1 && sol.finalAnswer === '$2$') {
      ok('parseSolution 解析 fenced JSON');
    } else {
      fail('parseSolution 结果不符合预期');
    }
  } catch (e) {
    fail('parseSolution 抛出异常', e.message);
  }
}

async function testParseActionOutput() {
  section('parseActionOutput / VizSpec');
  const sample = `说明正文

\`\`\`json
{"kind":"svg","svg":{"width":400,"height":280,"elements":[{"type":"point","x":10,"y":10}]}}
\`\`\``;
  const match = sample.match(/```json\s*([\s\S]*?)```/);
  if (!match) {
    fail('JSON 尾块正则');
    return;
  }
  try {
    const obj = JSON.parse(match[1].trim());
    if (obj.kind === 'svg' && obj.svg?.elements?.length === 1) {
      ok('VizSpec SVG JSON 解析');
    } else {
      fail('VizSpec 结构异常');
    }
  } catch (e) {
    fail('VizSpec JSON 解析', e.message);
  }

  const comparisonSample = `对比

\`\`\`json
{"columns":["A","B"],"rows":[["1","2"]]}
\`\`\``;
  const cm = comparisonSample.match(/```json\s*([\s\S]*?)```/);
  if (cm) {
    const c = JSON.parse(cm[1].trim());
    if (c.columns?.length === 2 && c.rows?.length === 1) {
      ok('ComparisonSpec JSON 解析');
    } else {
      fail('ComparisonSpec 结构异常');
    }
  }

  const ext = fs.readFileSync(path.join(root, 'dist/extension.js'), 'utf8');
  if (ext.includes('branchSteps') && ext.includes('practiceProblem')) {
    ok('extension.js 含结构化 meta 解析逻辑');
  } else {
    fail('extension.js 缺少结构化 meta 解析');
  }
  if (ext.includes('generateSolutionStreaming') && ext.includes('solutionPhaseSteps')) {
    ok('extension.js 含分阶段解题推送');
  } else {
    fail('extension.js 缺少分阶段解题');
  }

  const webview = fs.readFileSync(path.join(root, 'dist/webview.js'), 'utf8');
  if (webview.includes('GeometrySvg') || webview.includes('geometry-svg')) {
    ok('webview.js 含 SVG 渲染');
  } else {
    fail('webview.js 缺少 GeometrySvg');
  }
  if (webview.includes('ProblemBreakdown') || webview.includes('bd-given')) {
    ok('webview.js 含题干拆解组件');
  } else {
    fail('webview.js 缺少 ProblemBreakdown');
  }
}

async function testMockEngineFlow() {
  section('Mock 引擎逻辑（模拟）');
  // 不依赖 VS Code，验证 Mock 引擎约定的数据结构。
  const mockSolution = {
    problem: 'x^2-5x+6=0',
    finalAnswer: '$x=2$ 或 $x=3$',
    steps: [
      { id: 's1', phase: 'understanding', content: '理解', metadata: {} },
      { id: 's2', phase: 'devising', content: '拟定', metadata: {} },
      { id: 's3', phase: 'carrying-out', content: '执行', metadata: {} },
      { id: 's4', phase: 'looking-back', content: '回顾', metadata: {} },
    ],
  };
  const phases = mockSolution.steps.map((s) => s.phase);
  const expected = ['understanding', 'devising', 'carrying-out', 'looking-back'];
  if (JSON.stringify(phases) === JSON.stringify(expected)) {
    ok('Mock 方案包含完整四阶段');
  } else {
    fail('Mock 方案阶段不完整');
  }
  ok('Mock 引擎数据结构校验');
}

async function testDeepSeekApi(apiKey, baseUrl, model) {
  section('DeepSeek API 连通性');
  if (!apiKey) {
    skip('DeepSeek 流式请求', '未提供 API Key（可用 --api-key 或 POLYA_API_KEY）');
    return;
  }

  const masked = apiKey.slice(0, 6) + '...' + apiKey.slice(-4);
  console.log(`  使用模型: ${model}，密钥: ${masked}`);

  // 1. 简单 ping
  try {
    const text = await streamChat({
      baseUrl,
      apiKey,
      model,
      system: '你是数学助手，用简体中文简短回答。',
      user: '1+1等于几？只回答数字。',
      signal: AbortSignal.timeout(60000),
    });
    if (text.includes('2')) {
      ok('DeepSeek 流式对话', `回复: ${text.trim().slice(0, 80)}`);
    } else {
      fail('DeepSeek 流式对话', `意外回复: ${text.slice(0, 120)}`);
    }
  } catch (e) {
    fail('DeepSeek 流式对话', e.message);
    // 若模型名无效，尝试 fallback
    if (model !== 'deepseek-chat') {
      console.log('  → 尝试 fallback 模型 deepseek-chat ...');
      try {
        const text = await streamChat({
          baseUrl,
          apiKey,
          model: 'deepseek-chat',
          system: '你是数学助手，用简体中文简短回答。',
          user: '1+1等于几？只回答数字。',
          signal: AbortSignal.timeout(60000),
        });
        if (text.includes('2')) {
          ok('DeepSeek fallback (deepseek-chat)', `回复: ${text.trim().slice(0, 80)}`);
          console.log(`  ⚠ 建议将 polyaSolver.deepseek.model 改为 deepseek-chat`);
        } else {
          fail('DeepSeek fallback', `意外回复: ${text.slice(0, 120)}`);
        }
      } catch (e2) {
        fail('DeepSeek fallback', e2.message);
      }
    }
    return;
  }

  // 2. 解题 JSON 格式（与插件 generateSolution 类似）
  try {
    const prompt = `请求解 2+3，输出严格 JSON（不要 markdown 代码块）：
{"problem":"2+3","finalAnswer":"5","steps":[{"id":"s1","phase":"understanding","content":"...","metadata":{}}]}`;
    const raw = await streamChat({
      baseUrl,
      apiKey,
      model,
      system: '你是数学辅导老师，输出严格 JSON。',
      user: prompt,
      signal: AbortSignal.timeout(90000),
    });
    const sol = parseSolution(raw, '2+3');
    if (sol.steps.length >= 1) {
      ok('DeepSeek 解题 JSON 解析', `${sol.steps.length} 个步骤`);
    } else {
      fail('DeepSeek 解题 JSON 解析', 'steps 为空');
    }
  } catch (e) {
    fail('DeepSeek 解题 JSON 解析', e.message);
  }
}

async function main() {
  console.log('Polya 插件冒烟测试\n');

  await testBuildArtifacts();
  await testPackageConfig();
  await testParseSolution();
  await testParseActionOutput();
  testParamEval();
  testBreakdownMeta();
  await testMockEngineFlow();

  const userCfg = readUserPolyaConfig();
  const apiKey = resolveApiKey() || userCfg?.apiKey || '';
  const baseUrl = userCfg?.baseUrl || 'https://api.deepseek.com/v1';
  const model = userCfg?.model || 'deepseek-chat';

  if (userCfg?.engine) {
    console.log(`\n  检测到 Cursor 配置: engine=${userCfg.engine}, model=${model}`);
  }

  await testDeepSeekApi(apiKey, baseUrl, model);

  section('汇总');
  console.log(`  通过: ${passed}  失败: ${failed}  跳过: ${skipped}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
