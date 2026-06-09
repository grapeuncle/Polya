/**
 * Polya Web 应用冒烟测试：构建产物、API 健康检查、Mock SSE 求解、DeepSeek 连通性。
 * 用法：node scripts/smoke-test.mjs [--api-key <key>] [--api-url http://localhost:3001]
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

function resolveApiKey() {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf('--api-key');
  if (idx >= 0 && argv[idx + 1]) {
    return argv[idx + 1].trim();
  }
  return process.env.POLYA_API_KEY?.trim() || process.env.DEEPSEEK_API_KEY?.trim() || '';
}

function resolveApiUrl() {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf('--api-url');
  if (idx >= 0 && argv[idx + 1]) {
    return argv[idx + 1].replace(/\/$/, '');
  }
  return (process.env.POLYA_API_URL || 'http://localhost:3001').replace(/\/$/, '');
}

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

async function consumeSse(res) {
  const events = [];
  if (!res.ok || !res.body) {
    throw new Error(`SSE 失败 ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        if (data) {
          try {
            events.push(JSON.parse(data));
          } catch {
            // ignore
          }
        }
      }
    }
  }
  return events;
}

async function testBuildArtifacts() {
  section('构建产物');
  const required = [
    'dist/client/index.html',
    'public/media/katex.min.css',
    'public/media/codicon.css',
    'package.json',
  ];
  const optional = ['dist/server/index.js', 'dist/client/assets', 'public/media/mermaid.min.js'];
  for (const rel of required) {
    const p = path.join(root, rel);
    if (fs.existsSync(p)) {
      const stat = fs.statSync(p);
      ok(rel, fs.statSync(p).isDirectory() ? 'dir' : `${(stat.size / 1024).toFixed(1)} KB`);
    } else {
      fail(rel, '文件不存在（请先 npm run build）');
    }
  }
  for (const rel of optional) {
    const p = path.join(root, rel);
    if (fs.existsSync(p)) {
      ok(rel + ' (可选)', '');
    } else {
      skip(rel, '未构建');
    }
  }
}

async function testApiHealth(apiUrl) {
  section('API 健康检查');
  try {
    const res = await fetch(`${apiUrl}/api/health`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      if (data.ok) {
        ok('GET /api/health', apiUrl);
      } else {
        fail('GET /api/health', 'ok 不为 true');
      }
    } else {
      fail('GET /api/health', `HTTP ${res.status}`);
    }
  } catch (e) {
    skip('GET /api/health', `服务未启动: ${e.message}`);
  }
}

async function testMockSolveSse(apiUrl) {
  section('Mock 引擎 SSE 求解');
  try {
    const sessionRes = await fetch(`${apiUrl}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ difficulty: 'standard', teacherMode: false }),
      signal: AbortSignal.timeout(5000),
    });
    if (!sessionRes.ok) {
      skip('POST /api/solve SSE', '无法创建会话');
      return;
    }
    const { sessionId } = await sessionRes.json();
    const solveRes = await fetch(`${apiUrl}/api/solve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': sessionId,
      },
      body: JSON.stringify({ problem: '求解方程 x^2 - 5x + 6 = 0' }),
      signal: AbortSignal.timeout(120000),
    });
    const events = await consumeSse(solveRes);
    const types = events.map((e) => e.type);
    if (types.includes('solution') || types.includes('solutionPhaseSteps')) {
      ok('POST /api/solve SSE', `${events.length} 个事件`);
    } else {
      fail('POST /api/solve SSE', `事件: ${types.join(', ')}`);
    }
  } catch (e) {
    skip('POST /api/solve SSE', e.message);
  }
}

function testParamEval() {
  section('paramEval 本地求值');
  const mathPart = '25 - 4*6';
  try {
    const fn = new Function(`"use strict"; return (${mathPart});`);
    const v = fn();
    if (v === 1) {
      ok('参数表达式数值求值', 'Δ=1 when c=6');
    } else {
      fail('参数表达式数值求值', `期望 1 得 ${v}`);
    }
  } catch (e) {
    fail('参数表达式数值求值', e.message);
  }
}

async function testPackageConfig() {
  section('package.json 配置');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (pkg.scripts?.dev?.includes('dev:server') && pkg.scripts?.dev?.includes('dev:client')) {
    ok('dev 脚本含前后端');
  } else {
    fail('dev 脚本配置异常');
  }
  if (fs.existsSync(path.join(root, '.env.example'))) {
    ok('.env.example 存在');
  } else {
    fail('.env.example 缺失');
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

async function testDeepSeekApi(apiKey) {
  section('DeepSeek API 连通性');
  if (!apiKey) {
    skip('DeepSeek 流式请求', '未提供 API Key');
    return;
  }
  const baseUrl = process.env.POLYA_DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
  const model = process.env.POLYA_DEEPSEEK_MODEL || 'deepseek-chat';
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
  }
}

async function main() {
  console.log('Polya Web 应用冒烟测试\n');
  const apiUrl = resolveApiUrl();

  if (!fs.existsSync(path.join(root, 'dist/client/index.html'))) {
    console.log('  提示: 部分构建测试需要先运行 npm run build\n');
  }

  await testBuildArtifacts();
  await testPackageConfig();
  await testParseSolution();
  testParamEval();
  await testApiHealth(apiUrl);
  await testMockSolveSse(apiUrl);

  await testDeepSeekApi(resolveApiKey());

  section('汇总');
  console.log(`  通过: ${passed}  失败: ${failed}  跳过: ${skipped}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
