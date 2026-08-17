// 端到端验证：通过 vite 代理(5173) → 后端(3001) → DeepSeek，求解三角函数示例题，
// 校验"目的/定理/启发/易错/审题陷阱"五字段的阶段化策略，并将步骤原文留存到 verify_e2e_steps.json 供内容审读。
// 用法：node scripts/verify-metadata-e2e.mjs
import { writeFileSync } from 'node:fs';

const BASE = 'http://localhost:5173/api';

const PROBLEM =
  '已知函数 f(x) = 2sin x·cos x + 2√3·cos^2 x - √3（x∈R）。' +
  '（1）求函数 f(x) 的最小正周期和单调递增区间；' +
  '（2）当 x∈[0, π/2] 时，若方程 f(x) = t 有两个不同的实数解，求实数 t 的取值范围';

// 各阶段不应出现的 metadata 字段（carrying-out 全部允许）
const POLICY = {
  understanding: { forbid: ['objective', 'theoremApplied', 'commonMistake'] },
  devising: { forbid: ['objective', 'commonMistake'] },
  'carrying-out': { forbid: ['overlooked'] },
  'looking-back': { forbid: ['objective', 'theoremApplied', 'commonMistake', 'overlooked'] },
};
const META_KEYS = ['objective', 'heuristic', 'theoremApplied', 'commonMistake', 'overlooked'];

async function main() {
  const t0 = Date.now();
  const sessRes = await fetch(`${BASE}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ difficulty: 'standard', teacherMode: false }),
  });
  if (!sessRes.ok) throw new Error(`session failed: ${sessRes.status}`);
  const sess = await sessRes.json();
  console.log(`session=${sess.sessionId} engine=${sess.init?.engine}`);

  const res = await fetch(`${BASE}/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Session-Id': sess.sessionId },
    body: JSON.stringify({ problem: PROBLEM }),
  });
  if (!res.ok || !res.body) throw new Error(`solve failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const steps = [];
  let finalSolution = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data) continue;
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        continue;
      }
      if (msg.type === 'subProblemPhaseSteps' || msg.type === 'solutionPhaseSteps') {
        for (const s of msg.steps) {
          steps.push({
            sub: s.subProblemIndex ?? msg.index,
            phase: msg.phase,
            id: s.id,
            content: s.content,
            metadata: s.metadata ?? {},
          });
        }
        console.log(
          `[${((Date.now() - t0) / 1000).toFixed(0)}s] ${msg.type} phase=${msg.phase} steps=${msg.steps.length}`
        );
      } else if (msg.type === 'solution') {
        finalSolution = msg.solution;
      } else if (msg.type === 'solveError') {
        console.log(`solveError: ${msg.message}`);
      }
    }
  }

  // 留存原文供内容审读
  writeFileSync(
    'verify_e2e_steps.json',
    JSON.stringify(
      {
        problem: PROBLEM,
        elapsedSec: Math.round((Date.now() - t0) / 1000),
        steps,
        finalAnswer: finalSolution?.finalAnswer,
        subAnswers: finalSolution?.subAnswers,
      },
      null,
      2
    ),
    'utf8'
  );
  console.log(`\n原文已留存: verify_e2e_steps.json (${steps.length} 步)`);

  console.log('\n===== metadata 校验 =====');
  let violations = 0;
  let missingSev = 0;
  const byPhase = {};
  for (const st of steps) {
    const keys = META_KEYS.filter((k) => st.metadata[k]);
    (byPhase[st.phase] ??= []).push({ ...st, keys });
    const policy = POLICY[st.phase];
    if (policy) {
      const bad = policy.forbid.filter((k) => st.metadata[k]);
      if (bad.length > 0) {
        violations++;
        console.log(`VIOLATION [${st.phase}] ${st.id}: 违规字段 ${bad.join(', ')}`);
      }
    }
    if (st.metadata.commonMistake && !st.metadata.mistakeSeverity) {
      missingSev++;
      console.log(`WARN [${st.phase}] ${st.id}: commonMistake 缺 mistakeSeverity`);
    }
    if (st.metadata.overlooked && !st.metadata.overlookedSeverity) {
      missingSev++;
      console.log(`WARN [${st.phase}] ${st.id}: overlooked 缺 overlookedSeverity`);
    }
  }
  for (const [phase, list] of Object.entries(byPhase)) {
    console.log(`\n[${phase}] ${list.length} 步`);
    for (const st of list) {
      const sevVal = st.metadata.mistakeSeverity ?? st.metadata.overlookedSeverity;
      const sev = sevVal ? ` sev=${sevVal}` : '';
      console.log(`  sub${st.sub ?? '-'} ${st.id}: { ${st.keys.join(', ') || '(空)'} }${sev}`);
    }
  }
  console.log(`\n总步骤=${steps.length} 阶段违规=${violations} 缺severity=${missingSev} 耗时=${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log('E2E_DONE');
  process.exit(0);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
