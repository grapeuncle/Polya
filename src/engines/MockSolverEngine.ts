// 内置 Mock 引擎：无需任何 API 密钥即可体验完整交互流程。
// 它生成一份示例性的波利亚四阶段解题方案，并对各菜单动作返回有教学意义的占位内容。
import { ISolverEngine, StreamHandlers } from './ISolverEngine';
import {
  ActionResultMeta,
  MenuActionId,
  Solution,
  SolutionStep,
  SolverContext,
} from '../shared/types';

/** 把一段文本按字符切片，模拟流式输出。 */
async function streamText(
  text: string,
  handlers: StreamHandlers,
  meta?: ActionResultMeta
): Promise<void> {
  if (meta && handlers.onMeta) {
    handlers.onMeta(meta);
  }
  const chunkSize = 12;
  for (let i = 0; i < text.length; i += chunkSize) {
    if (handlers.signal?.aborted) {
      return;
    }
    handlers.onChunk(text.slice(i, i + chunkSize));
    // 模拟网络/生成延迟，使流式效果可见。
    await new Promise((r) => setTimeout(r, 18));
  }
}

export class MockSolverEngine implements ISolverEngine {
  readonly id = 'mock';

  async generateSolution(problem: string, _ctx: SolverContext): Promise<Solution> {
    // 为了演示，无论输入什么题目，都生成一个"解一元二次方程"风格的示例方案。
    await new Promise((r) => setTimeout(r, 400));
    const steps: SolutionStep[] = [
      {
        id: 's1',
        phase: 'understanding',
        content:
          '阅读题目：求解方程 $x^2 - 5x + 6 = 0$。未知量是 $x$，已知量是二次项、一次项与常数项的系数。',
        rawLatex: 'x^2 - 5x + 6 = 0',
        metadata: {
          objective: '明确我们要找的是满足方程的所有 $x$ 值。',
          heuristic: '先识别这是一个一元二次方程，标准形式为 $ax^2+bx+c=0$。',
          commonMistake: '容易忽略二次方程可能有两个解。',
        },
      },
      {
        id: 's2',
        phase: 'devising',
        content:
          '寻找联系：这是可因式分解的二次方程。回忆"十字相乘/因式分解"方法——寻找两个数，乘积为 $6$、和为 $5$。',
        metadata: {
          objective: '选择一条通向解的路径。',
          heuristic: '看到能凑出整数因子的二次三项式，优先尝试因式分解而非求根公式。',
          theoremApplied: '因式分解定理',
          alternativeApproach: '也可使用求根公式 $x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}$。',
        },
      },
      {
        id: 's3',
        phase: 'carrying-out',
        content:
          '执行：$x^2-5x+6=(x-2)(x-3)=0$。由零积性质，$x-2=0$ 或 $x-3=0$，得 $x=2$ 或 $x=3$。',
        rawLatex: '(x-2)(x-3)=0',
        metadata: {
          objective: '通过因式分解得到方程的根。',
          heuristic: '$2$ 与 $3$ 满足"积为 6、和为 5"。',
          theoremApplied: '零积性质：若 $ab=0$，则 $a=0$ 或 $b=0$。',
          commonMistake: '把"或"误写成"且"，或漏掉一个根。',
        },
        subSteps: [
          {
            id: 's3a',
            phase: 'carrying-out',
            content: '分解因式：$x^2-5x+6=(x-2)(x-3)$。',
            metadata: {},
          },
          {
            id: 's3b',
            phase: 'carrying-out',
            content: '令每个因式为零：$x-2=0 \\Rightarrow x=2$；$x-3=0 \\Rightarrow x=3$。',
            metadata: {},
          },
        ],
      },
      {
        id: 's4',
        phase: 'looking-back',
        content:
          '回顾：代回验证 $2^2-5\\cdot2+6=0$、$3^2-5\\cdot3+6=0$ 均成立。两个根之和为 $5$、积为 $6$，与系数（韦达定理）一致。',
        metadata: {
          objective: '确认答案正确并加深理解。',
          heuristic: '用韦达定理快速校验：根之和 $=-b/a$，根之积 $=c/a$。',
          alternativeApproach: '可推广：任意 $x^2-(p+q)x+pq=0$ 的根为 $p,q$。',
        },
      },
    ];
    return {
      problem,
      finalAnswer: 'x=2 \\text{ 或 } x=3',
      steps,
    };
  }

  async explainStep(
    action: MenuActionId,
    stepId: string,
    ctx: SolverContext,
    handlers: StreamHandlers,
    question?: string
  ): Promise<void> {
    const step = findStep(ctx.steps, stepId);
    const { text, meta } = mockActionResult(action, step?.content ?? '该步骤', question);
    await streamText(text, handlers, meta);
  }

  async checkStep(stepId: string, ctx: SolverContext, handlers: StreamHandlers): Promise<void> {
    return this.explainStep('verify', stepId, ctx, handlers);
  }

  async globalAsk(question: string, _ctx: SolverContext, handlers: StreamHandlers): Promise<void> {
    await streamText(
      `（示例引擎回答）关于你的问题"${question}"：这是 Mock 引擎的占位回答。配置真实 API 密钥后，将由大模型结合整道题上下文作答。`,
      handlers
    );
  }
}

function findStep(steps: SolutionStep[], id: string): SolutionStep | undefined {
  for (const s of steps) {
    if (s.id === id) {
      return s;
    }
    if (s.subSteps) {
      const f = findStep(s.subSteps, id);
      if (f) {
        return f;
      }
    }
  }
  return undefined;
}

/** 针对不同动作返回示例文本与渲染元信息。 */
function mockActionResult(
  action: MenuActionId,
  content: string,
  question?: string
): { text: string; meta?: ActionResultMeta } {
  switch (action) {
    case 'explain':
      return {
        text: `**通俗解释**：这一步其实就是把"${content}"用更直白的话说清楚——我们在一步步靠近答案。每个符号都有它的来历，别被公式吓到。`,
      };
    case 'objective':
      return { text: '**这一步的目的**：为后续推导铺路，缩小未知量的范围。' };
    case 'why':
      return {
        text: '**为什么这样做**：因为前一步已经给出了关键条件，沿着这个方向走能最自然地连接已知与未知。',
      };
    case 'detail':
      return {
        text: '**详细推导**：\n1. 写出当前表达式。\n2. 应用对应法则变形。\n3. 整理得到结果。\n\n$$x^2-5x+6=(x-2)(x-3)$$',
      };
    case 'alternatives':
      return {
        text: '**两种方法对比**：\n\n| 方法 | 思路 | 优点 | 缺点 |\n| --- | --- | --- | --- |\n| 因式分解 | 凑因子 | 快、直观 | 系数不整时困难 |\n| 求根公式 | 套公式 | 通用 | 计算量稍大 |',
        meta: { kind: 'comparison', title: '替代方法对比' },
      };
    case 'verify':
      return {
        text: '**验算**：代入 $x=2$：$2^2-5\\cdot2+6=4-10+6=0$ ✓；代入 $x=3$：$9-15+6=0$ ✓。结果正确。',
        meta: { kind: 'text', title: '检验这一步' },
      };
    case 'ask':
      return {
        text: `（示例引擎回答）针对你的追问"${question ?? ''}"：配置真实模型后这里会给出贴合上下文的解答。`,
      };
    case 'breakdown':
      return { text: '**逐句拆解**：\n- "求解方程"→ 要找未知数的值。\n- "$x^2-5x+6=0$"→ 这是一个一元二次方程。' };
    case 'visualize':
      return {
        text: '```mermaid\ngraph TD\n  A[原方程 x²-5x+6=0] --> B[因式分解]\n  B --> C[(x-2)(x-3)=0]\n  C --> D[x=2]\n  C --> E[x=3]\n```',
        meta: { kind: 'mermaid', title: '可视化' },
      };
    case 'restate':
      return { text: '**用我自己的话**：就是要找出哪些数代进这个式子能让它等于 0。' };
    case 'keyInfo':
      return {
        text: '**关键信息**：\n- 已知量：系数 $1,-5,6$\n- 未知量：$x$\n- 约束：方程等于 $0$',
      };
    case 'similarProblem':
      return { text: '**类似题目**：求解 $x^2-7x+12=0$。（先别看解法，试试类比！）' };
    case 'strategyOrigin':
      return { text: '**思路来源**：看到可凑整数因子的二次三项式，自然联想到因式分解。' };
    case 'failedPaths':
      return { text: '**常见弯路**：有人会先两边开方，但 $x^2-5x+6$ 不是完全平方，这条路走不通。' };
    case 'relatedModel':
      return { text: '**题型归类**：一元二次方程求根，标准框架是"判别式 → 选择方法 → 求根 → 验证"。' };
    case 'subGoals':
      return {
        text: '```mermaid\nflowchart LR\n  A[识别方程类型] --> B[选择求解方法]\n  B --> C[求出根]\n  C --> D[验证根]\n  style B fill:#88f\n```',
        meta: { kind: 'mermaid', title: '子目标图' },
      };
    case 'guessThenProve':
      return { text: '**先猜后证**：猜测两根可能是小整数（因为常数项 6 较小）；再用因式分解验证 $2,3$。' };
    case 'expandAlgebra':
      return {
        text: '**最小操作单元**：\n1. 展开目标因子形式。\n2. 比较系数。\n3. 解出待定因子。',
      };
    case 'checkCalculation':
      return { text: '**计算检查**：$(x-2)(x-3)=x^2-5x+6$，展开无误。' };
    case 'theoremUsed':
      return {
        text: '**用到的定理**：零积性质——若 $ab=0$，则 $a=0$ 或 $b=0$。前提：在实数（或整环）范围内成立。',
      };
    case 'tweakParams':
      return {
        text: '**改参数试试**：若常数项改为 $8$（即 $x^2-5x+8=0$），判别式 $25-32<0$，则无实根。',
      };
    case 'branchAlternative':
      return {
        text: '**另解（求根公式）**：$x=\\frac{5\\pm\\sqrt{25-24}}{2}=\\frac{5\\pm1}{2}$，得 $x=3$ 或 $x=2$，与因式分解一致。',
        meta: { kind: 'comparison', title: '另解延续' },
      };
    case 'verifyAnswer':
      return { text: '**验证答案**：$x=2,3$ 代回原方程均得 $0$，答案正确。' };
    case 'allSolutions':
      return {
        text: '**多种解法**：\n\n| 解法 | 关键步骤 |\n| --- | --- |\n| 因式分解 | 凑 $(x-2)(x-3)$ |\n| 求根公式 | 套 $\\frac{-b\\pm\\sqrt{\\Delta}}{2a}$ |\n| 配方法 | $(x-\\tfrac52)^2=\\tfrac14$ |',
        meta: { kind: 'comparison', title: '解法并排比较' },
      };
    case 'generalize':
      return { text: '**推广**：若把常数项改为 $k$，讨论判别式 $25-4k$ 的符号即可判断实根个数。' };
    case 'takeaway':
      return {
        text: '**这道题教会我们**：遇到二次方程先看能否因式分解；并养成"求解后代回验证"的习惯。',
        meta: { kind: 'text', title: '收获总结' },
      };
    case 'generatePractice':
      return {
        text: '**同类练习**：求解 $x^2-6x+8=0$。\n答案要点：因式分解为 $(x-2)(x-4)=0$，得 $x=2$ 或 $x=4$。',
        meta: { kind: 'practice', title: '生成的练习' },
      };
    case 'copy':
    case 'flag':
    default:
      return { text: '（该操作由前端处理或暂无示例内容。）' };
  }
}
