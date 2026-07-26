/**
 * DeepSeek 真实引擎 + 缺省示例题目，端到端测试符号校验层的正确性。
 * 前提：生产服务已用 deepseek 引擎启动（PORT=3002）。
 *
 * 校验逻辑：
 *  1. 用缺省示例「求解方程 x^2 - 5x + 6 = 0」走真实 LLM 求解；
 *  2. 对含等式的步骤逐个发起 verify 动作；
 *  3. 抓取「符号引擎客观校验」段，逐条人工/程序复核判定是否与数学事实一致。
 */
const BASE = process.env.POLYA_BASE ?? 'http://localhost:3002';
const PROBLEM = '求解方程 x^2 - 5x + 6 = 0';
const MAX_VERIFY_STEPS = 4;

let failed = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.error(`  ✗ ${name}${extra ? ` —— ${extra}` : ''}`);
  }
}

/** 解析 SSE 文本为事件数组。 */
function parseSse(text) {
  const events = [];
  for (const block of text.split('\n\n')) {
    const line = block.split('\n').find((l) => l.startsWith('data: '));
    if (line) {
      try {
        events.push(JSON.parse(line.slice(6)));
      } catch {
        // 忽略不可解析块
      }
    }
  }
  return events;
}

console.log('=== DeepSeek + 缺省示例：符号校验正确性测试 ===\n');
console.log(`题目: ${PROBLEM}\n`);

// 1. 会话
const sessionRes = await fetch(`${BASE}/api/session`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ difficulty: 'standard' }),
});
const session = await sessionRes.json();
check('会话创建', Boolean(session.sessionId));
check('服务端引擎为 deepseek', session.init?.engine === 'deepseek', `实际=${session.init?.engine}`);
const sid = session.sessionId;
const headers = { 'Content-Type': 'application/json', 'X-Session-Id': sid };

// 2. 求解（真实 LLM，耗时较长）
console.log('\n[求解中，等待 DeepSeek 四阶段输出…]');
const t0 = Date.now();
const solveRes = await fetch(`${BASE}/api/solve`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ problem: PROBLEM }),
});
const solveEvents = parseSse(await solveRes.text());
console.log(`  求解耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s，事件 ${solveEvents.length} 个`);
const solutionMsg = solveEvents.find((e) => e.type === 'solution');
check('求解完成（solution 事件）', Boolean(solutionMsg));
const steps = solutionMsg?.solution?.steps ?? [];
check('产出步骤数 > 0', steps.length > 0, `实际=${steps.length}`);

// 3. 挑选含等式的步骤（优先执行阶段）
const withEq = (s) => (s.content ?? '').includes('=');
const carryOut = steps.filter((s) => s.phase === 'carrying-out' && withEq(s));
const others = steps.filter((s) => s.phase !== 'carrying-out' && withEq(s));
const targets = [...carryOut, ...others].slice(0, MAX_VERIFY_STEPS);
console.log(`\n[共 ${steps.length} 步，含等式 ${carryOut.length + others.length} 步，本次验证 ${targets.length} 步]`);

let firedSteps = 0;
let totalChecks = 0;
let contradictionSteps = 0;

for (const step of targets) {
  const rid = `dsv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const res = await fetch(`${BASE}/api/action`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ requestId: rid, action: 'verify', stepId: step.id }),
  });
  const events = parseSse(await res.text());
  const chunks = events.filter((e) => e.type === 'actionChunk').map((e) => e.chunk).join('');
  const end = events.find((e) => e.type === 'actionEnd');

  console.log(`\n--- 步骤 ${step.id}（${step.phase}）---`);
  console.log(`内容: ${step.content.slice(0, 120).replace(/\n/g, ' ')}`);

  // 提取符号校验段（🧮 标题到分隔线之间）
  const m = chunks.match(/🧮[\s\S]*?(?=\n\n---|$)/);
  if (!m) {
    console.log('  （本步无可校验等式，符号引擎未触发）');
    continue;
  }
  firedSteps++;
  console.log(`  ${m[0].replace(/\n/g, '\n  ')}`);

  const checks = [...m[0].matchAll(/- (✅|🟡|❌) `([^`]+)` —— (.+)/g)].map((x) => ({
    icon: x[1],
    expr: x[2],
    detail: x[3],
  }));
  totalChecks += checks.length;
  const bad = checks.filter((c) => c.icon === '❌');
  if (bad.length > 0) {
    contradictionSteps++;
    console.log(`  ⚠️ 本步发现 ${bad.length} 处矛盾`);
  }
  if (end?.meta?.kind === 'warning') {
    const symbolicBad = checks.filter((c) => c.icon === '❌').length;
    console.log(`  ⚠️ meta 为 warning（来源：${symbolicBad > 0 ? '符号引擎强制' : 'AI 自身 meta'}）`);
  }
}

// 4. 汇总断言
console.log('\n[汇总]');
check('符号引擎在真实 LLM 输出上触发 ≥1 步', firedSteps > 0, `触发=${firedSteps}`);
check('累计校验等式 ≥1 条', totalChecks > 0, `累计=${totalChecks}`);
console.log(`  触发步骤: ${firedSteps}/${targets.length}，校验等式: ${totalChecks} 条，含矛盾步骤: ${contradictionSteps}`);
if (contradictionSteps > 0) {
  console.log('  提示: 若上方 ❌ 条目对应数学上正确的等式 → 校验引擎误判（bug）；');
  console.log('        若等式本身错误 → 引擎正确捕获了 LLM 幻觉（功能符合预期）。');
}

console.log(`\n总结: ${failed === 0 ? '全部通过' : `${failed} 项失败`}`);
process.exit(failed > 0 ? 1 : 0);
