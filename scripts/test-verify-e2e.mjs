/**
 * 端到端验证：符号校验层是否接入 verify 动作。
 * 前提：生产服务已启动（npm start，端口 3001，mock 引擎）。
 */
const BASE = process.env.POLYA_BASE ?? 'http://localhost:3001';

let failed = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

console.log('=== verify 动作符号校验 E2E ===\n');

// 1. 创建会话
const sessionRes = await fetch(`${BASE}/api/session`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ difficulty: 'standard' }),
});
const { sessionId } = await sessionRes.json();
check('会话创建', Boolean(sessionId));

// 2. 求解（消费 SSE 流直至结束）
const solveRes = await fetch(`${BASE}/api/solve`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
  body: JSON.stringify({ problem: '求解方程 x^2 - 5x + 6 = 0' }),
});
const solveText = await solveRes.text();
check('求解 SSE 流完成', solveText.includes('solution'));
check('后台符号校验事件已推送', solveText.includes('symbolicCheck'));

// 3. 提取一个执行阶段步骤 id（mock 步骤内容含等式）
const stepMatch = solveText.match(/"steps":\[[^\]]*"id":"([^"]+)"[^\]]*"phase":"carrying-out"/) ??
  solveText.match(/"id":"([^"]+)","phase":"carrying-out"/);
const stepId = stepMatch?.[1];
check('提取到执行阶段步骤 id', Boolean(stepId));

if (stepId) {
  // 4. 发起 verify 动作
  const actionRes = await fetch(`${BASE}/api/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
    body: JSON.stringify({ requestId: `e2e-${Date.now()}`, action: 'verify', stepId }),
  });
  const actionText = await actionRes.text();
  check('verify 动作流式返回', actionText.includes('actionChunk'));
  check('包含符号引擎客观校验段', actionText.includes('符号引擎客观校验'));
  check('actionEnd 正常结束', actionText.includes('actionEnd'));
}

console.log(`\n汇总: ${failed === 0 ? '全部通过' : `${failed} 项失败`}`);
process.exit(failed > 0 ? 1 : 0);
