// 内置 Mock 引擎：无需任何 API 密钥即可体验完整交互流程。
import { ISolverEngine, SolutionStreamHandlers, StreamHandlers } from './ISolverEngine';
import {
  ActionResultMeta,
  DetectedSubProblem,
  MenuActionId,
  PHASE_ORDER,
  Solution,
  SolutionStep,
  SolverContext,
  SubProblemSolution,
} from '../shared/types';
import { detectSubProblems } from '../shared/subProblemDetector';

async function streamText(
  text: string,
  handlers: StreamHandlers,
  meta?: ActionResultMeta
): Promise<void> {
  const chunkSize = 12;
  for (let i = 0; i < text.length; i += chunkSize) {
    if (handlers.signal?.aborted) {
      return;
    }
    handlers.onChunk(text.slice(i, i + chunkSize));
    await new Promise((r) => setTimeout(r, 12));
  }
  if (meta && handlers.onMeta) {
    handlers.onMeta(meta);
  }
}

function pickTemplate(problem: string): 'quadratic' | 'inequality' | 'proof' {
  const p = problem.toLowerCase();
  if (/证明|求证|show that|prove/.test(p)) {
    return 'proof';
  }
  if (/不等|≥|≤|>|<|最大|最小|min|max/.test(p)) {
    return 'inequality';
  }
  return 'quadratic';
}

function buildSteps(problem: string, template: ReturnType<typeof pickTemplate>): SolutionStep[] {
  const shortProblem = problem.slice(0, 120);
  if (template === 'proof') {
    return [
      {
        id: 's1',
        phase: 'understanding',
        content: `理解题目：${shortProblem}。需明确要证明的命题及其前提条件。`,
        metadata: {
          heuristic: '证明题先明确命题结构与可用条件。',
          overlooked: '误读：命题中的量词（"任意"还是"存在"）与否定词极易看反，证错方向满盘皆输。',
          overlookedSeverity: 'warning',
        },
      },
      {
        id: 's2',
        phase: 'devising',
        content: '拟定方案：考虑从左式化到右式，或构造辅助量/不等式链。',
        metadata: { heuristic: '常见方法：直接推导、反证、归纳。' },
      },
      {
        id: 's3',
        phase: 'carrying-out',
        content: '执行证明：逐步变形，每一步注明依据（公式/定理）。',
        metadata: { objective: '完成恒等变形。', theoremApplied: '基本代数恒等式' },
        subSteps: [
          { id: 's3a', phase: 'carrying-out', content: '写出起始表达式。', metadata: {} },
          { id: 's3b', phase: 'carrying-out', content: '应用恒等变形得到目标式。', metadata: {} },
        ],
      },
      {
        id: 's4',
        phase: 'looking-back',
        content: '回顾：检查是否用到全部条件，能否推广到更一般情形。',
        metadata: { heuristic: '检验每个条件是否被使用，是验证证明完整性的常用切口。' },
      },
    ];
  }
  if (template === 'inequality') {
    return [
      {
        id: 's1',
        phase: 'understanding',
        content: `理解题目：${shortProblem}。明确变量范围与求最值的函数。`,
        metadata: {
          heuristic: '求最值问题先锁定变量范围与目标函数。',
          overlooked: '看漏：变量取值范围（定义域）与区间端点开闭，直接决定最值能否取到。',
          overlookedSeverity: 'warning',
        },
      },
      {
        id: 's2',
        phase: 'devising',
        content: '拟定方案：配方、求导或基本不等式 $a^2+b^2\\ge 2ab$。',
        metadata: { heuristic: '二次函数优先配方找顶点。' },
      },
      {
        id: 's3',
        phase: 'carrying-out',
        content: '执行：对函数配方或求导，找到极值点并验证。',
        metadata: { objective: '求出极值点并验证。', theoremApplied: '顶点公式 / 导数为零' },
        subSteps: [
          { id: 's3a', phase: 'carrying-out', content: '配方或求导。', metadata: {} },
          { id: 's3b', phase: 'carrying-out', content: '代入极值点求最值。', metadata: {} },
        ],
      },
      {
        id: 's4',
        phase: 'looking-back',
        content: '回顾：检查端点与定义域，确认最值正确。',
        metadata: { heuristic: '端点与定义域是最值问题最易漏检的地方。' },
      },
    ];
  }
  return [
    {
      id: 's1',
      phase: 'understanding',
      content: `阅读题目：${shortProblem}。识别未知量与方程类型。`,
      metadata: {
        heuristic: '标准形式 $ax^2+bx+c=0$。',
        overlooked: '想当然：不要默认方程必有两个实根；留意题干是否含"两个不同实根"等限定词。',
        overlookedSeverity: 'warning',
      },
    },
    {
      id: 's2',
      phase: 'devising',
      content: '拟定方案：尝试因式分解或求根公式。',
      metadata: {
        theoremApplied: '因式分解 / 求根公式',
        alternativeApproach: '配方法',
      },
    },
    {
      id: 's3',
      phase: 'carrying-out',
      content: '执行：分解因式或代入求根公式，得到根。',
      metadata: {
        objective: '求出根。',
        theoremApplied: '零积性质',
        commonMistake: '漏解或符号错误。',
        mistakeSeverity: 'critical',
      },
      subSteps: [
        { id: 's3a', phase: 'carrying-out', content: '因式分解或套公式。', metadata: {} },
        { id: 's3b', phase: 'carrying-out', content: '解出每个因式对应的根。', metadata: {} },
      ],
    },
    {
      id: 's4',
      phase: 'looking-back',
      content: '回顾：代回验证，并可用韦达定理交叉检验。',
      metadata: { heuristic: '韦达定理是检验二次方程根的快捷工具。' },
    },
  ];
}

/** 举一反三阶段的 Mock 变式题（3 道，含提示）。 */
function buildAnalogySteps(problem: string): SolutionStep[] {
  const short = problem.slice(0, 50);
  return [
    {
      id: 'analogy-1',
      phase: 'analogy',
      content: `变式一：${short}（将原题中的数值替换后重新求解，Mock 占位题面）`,
      metadata: {
        analogyHint:
          '与原题结构完全相同，仅数值变化；套用同一方法即可。\n具体提示：按原题步骤逐步代入新数值，注意符号与运算顺序，最后代回验证。',
      },
    },
    {
      id: 'analogy-2',
      phase: 'analogy',
      content: `变式二：${short}（将原题的条件与所求互换，逆向设问，Mock 占位题面）`,
      metadata: {
        analogyHint:
          '逆向设问：已知结论反推条件，技巧是先按原方向列出关系式。\n关键步骤：① 写出原题的正向关系式；② 把结论当作已知、条件当作未知；③ 解关于未知条件的方程并检验合理性。',
      },
    },
    {
      id: 'analogy-3',
      phase: 'analogy',
      content: `变式三：${short}（将原题情境推广到更一般的参数情形，Mock 占位题面）`,
      metadata: {
        analogyHint:
          '参数化推广：用参数替代具体常数，按原方法推导。\n关键步骤：① 用参数重写条件；② 按原方法推出含参结果；③ 讨论参数取值对结果（如根的个数、最值）的影响。',
      },
    },
  ];
}

export class MockSolverEngine implements ISolverEngine {
  readonly id = 'mock';

  async generateSolution(problem: string, ctx: SolverContext): Promise<Solution> {
    return this.generateSolutionStreaming(problem, ctx, {
      onPhaseStart: () => {},
      onPhaseSteps: () => {},
      onComplete: () => {},
    });
  }

  async generateSolutionStreaming(
    problem: string,
    _ctx: SolverContext,
    handlers: SolutionStreamHandlers
  ): Promise<Solution> {
    // 检测子问题
    const subProblems = detectSubProblems(problem);

    if (subProblems.length > 0) {
      return this.solveSubProblemsMock(problem, subProblems, handlers);
    }

    // 单题四阶段（原有逻辑）
    return this.solveSingleProblemMock(problem, handlers);
  }

  /** Mock 单题四阶段解题。 */
  private async solveSingleProblemMock(
    problem: string,
    handlers: SolutionStreamHandlers
  ): Promise<Solution> {
    const template = pickTemplate(problem);
    const steps = [...buildSteps(problem, template), ...buildAnalogySteps(problem)];
    const byPhase = PHASE_ORDER.map((p) => ({
      phase: p,
      steps: steps.filter((s) => s.phase === p),
    }));

    for (const { phase, steps: phaseSteps } of byPhase) {
      if (handlers.signal?.aborted) {
        break;
      }
      if (phaseSteps.length === 0) {
        continue;
      }
      handlers.onPhaseStart(phase);
      await new Promise((r) => setTimeout(r, 280));
      handlers.onPhaseSteps(phase, phaseSteps);
    }

    const solution: Solution = {
      problem,
      finalAnswer: template === 'quadratic' ? '请根据具体方程代入验证' : undefined,
      steps,
    };
    handlers.onComplete(solution);
    return solution;
  }

  /** Mock 多子问题四阶段解题。 */
  private async solveSubProblemsMock(
    problem: string,
    subProblems: DetectedSubProblem[],
    handlers: SolutionStreamHandlers
  ): Promise<Solution> {
    const allSteps: SolutionStep[] = [];
    const subSolutions: SubProblemSolution[] = [];
    const subAnswers: { id: number; label: string; answer: string }[] = [];

    for (const sub of subProblems) {
      if (handlers.signal?.aborted) {
        break;
      }

      handlers.onSubProblemStart?.(sub.index, sub.label, sub.text);

      const subSteps: SolutionStep[] = [];
      let subFinalAnswer: string | undefined;

      for (const phase of PHASE_ORDER) {
        if (handlers.signal?.aborted) {
          break;
        }
        handlers.onPhaseStart(phase);

        const stepId = `sub${sub.index}-${phase}`;
        const phaseStep: SolutionStep = {
          id: stepId,
          phase,
          content: `[Mock] 第 ${sub.index} 小问 — ${phase === 'understanding' ? '理解题目' : phase === 'devising' ? '拟定方案' : phase === 'carrying-out' ? '执行方案' : phase === 'looking-back' ? '回顾反思' : '举一反三'}：${sub.text.slice(0, 60)}...`,
          metadata: {
            objective: `处理第 ${sub.index} 小问的 ${phase} 阶段。`,
          },
          subProblemIndex: sub.index,
        };

        if (phase === 'analogy') {
          phaseStep.metadata = {
            analogyHint:
              '[Mock] 该变式相对本小问改变了条件形式；技巧：先化为原题的标准结构再求解。\n关键步骤：① 对照原题找出被改动的条件；② 化为标准结构；③ 套用原方法求解。',
          };
        }

        if (phase === 'carrying-out') {
          phaseStep.subSteps = [
            { id: `${stepId}-a`, phase: 'carrying-out', content: `[Mock] 第 ${sub.index} 小问：代入公式/条件求解。`, metadata: {} },
            { id: `${stepId}-b`, phase: 'carrying-out', content: `[Mock] 得到中间结果。`, metadata: {} },
          ];
        }

        if (phase === 'looking-back') {
          subFinalAnswer = `第 ${sub.index} 小问 Mock 答案`;
        }

        await new Promise((r) => setTimeout(r, 150));
        const phaseSteps = [phaseStep];
        subSteps.push(...phaseSteps);
        allSteps.push(...phaseSteps);
        handlers.onPhaseSteps(phase, phaseSteps);
      }

      const phasesMap: Partial<Record<typeof PHASE_ORDER[number], SolutionStep[]>> = {};
      for (const phase of PHASE_ORDER) {
        const ps = subSteps.filter((s) => s.phase === phase);
        if (ps.length > 0) {
          phasesMap[phase] = ps;
        }
      }

      subSolutions.push({
        index: sub.index,
        label: sub.label,
        subProblem: sub.text,
        phases: phasesMap,
        finalAnswer: subFinalAnswer,
      });

      if (subFinalAnswer) {
        subAnswers.push({ id: sub.index, label: sub.label, answer: subFinalAnswer });
      }

      handlers.onSubProblemComplete?.(sub.index, subFinalAnswer);
    }

    const solution: Solution = {
      problem,
      steps: allSteps,
      subAnswers: subAnswers.length > 0 ? subAnswers : undefined,
      subSolutions: subSolutions.length > 0 ? subSolutions : undefined,
    };
    handlers.onComplete(solution);
    return solution;
  }

  async continueBranch(
    branchId: string,
    ctx: SolverContext,
    handlers: StreamHandlers
  ): Promise<SolutionStep[]> {
    void branchId;
    void ctx;
    const extra: SolutionStep[] = [
      {
        id: `b-ext-${Date.now()}`,
        phase: 'carrying-out',
        content: '沿分支继续：代入数值完成计算。',
        metadata: { objective: '完成另解路径。' },
      },
      {
        id: `b-ext2-${Date.now()}`,
        phase: 'looking-back',
        content: '回顾分支结果并与主路径对比。',
        metadata: {},
      },
    ];
    await streamText('**分支延续**：已追加后续步骤。', handlers, {
      branchSteps: extra,
      branchLabel: '延续',
    });
    return extra;
  }

  async explainStep(
    action: MenuActionId,
    stepId: string,
    ctx: SolverContext,
    handlers: StreamHandlers,
    question?: string,
    selectedText?: string
  ): Promise<void> {
    const step = findStep(ctx.steps, stepId);
    const { text, meta } = mockActionResult(
      action,
      step?.content ?? '该步骤',
      ctx.problem,
      question,
      selectedText
    );
    await streamText(text, handlers, meta);
  }

  async checkStep(stepId: string, ctx: SolverContext, handlers: StreamHandlers): Promise<void> {
    return this.explainStep('verify', stepId, ctx, handlers);
  }

  async globalAsk(question: string, ctx: SolverContext, handlers: StreamHandlers): Promise<void> {
    const hist = ctx.conversationThreads?.['__global__']?.messages.length ?? 0;
    await streamText(
      `关于「${question}」（Mock 引擎，已有 ${hist} 轮对话）：结合题目「${ctx.problem.slice(0, 40)}…」，核心是理解波利亚四阶段——先弄清已知未知，再选策略，逐步执行并回顾验证。配置真实 API 后回答会更精准。`,
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

function mockActionResult(
  action: MenuActionId,
  content: string,
  problem: string,
  question?: string,
  selectedText?: string
): { text: string; meta?: ActionResultMeta } {
  const selection = selectedText?.trim();
  const selectionNote = selection ? `\n\n**划选片段**：「${selection}」` : '';
  switch (action) {
    case 'explain':
      if (selection) {
        return {
          text: `**划选解释**：针对「${selection}」—— 这是步骤中的一个关键片段，在把已知条件一步步变成答案的过程中起重要作用。${selectionNote}`,
        };
      }
      return { text: `**通俗解释**：${content} —— 用日常语言说，就是在把已知条件一步步变成答案。` };
    case 'objective':
      return { text: '**这一步的目的**：为后续推导铺路。' };
    case 'why':
      return { text: '**为什么这样做**：前序步骤已建立关键联系，沿此方向最自然。' };
    case 'detail':
      return {
        text: '**详细推导**（可点击微步骤）',
        meta: {
          microSteps: [
            { id: 'm1', label: '写出式子', content: '从已知条件列出方程。', op: '列式' },
            { id: 'm2', label: '变形', content: '移项并合并同类项。', op: '移项' },
            { id: 'm3', label: '得结果', content: '解出未知量。', op: '求解' },
          ],
        },
      };
    case 'alternatives':
      return {
        text: '**两种方法对比**',
        meta: {
          kind: 'comparison',
          title: '替代方法对比',
          comparison: {
            columns: ['方法', '思路', '优点', '缺点'],
            rows: [
              ['法 A', '直接推导', '快', '需技巧'],
              ['法 B', '换元/公式', '通用', '计算多'],
            ],
          },
        },
      };
    case 'verify':
      return {
        text: '**验算**：代入特殊值检验，结果一致 ✓',
        meta: { kind: 'text', title: '检验这一步' },
      };
    case 'commonMistake':
      return {
        text: '**常见错误**：跳步、符号弄反、漏掉约束条件。',
        meta: { kind: 'warning', title: '常见错误' },
      };
    case 'ask':
      if (selection) {
        return {
          text: `针对划选「${selection}」的提问「${question ?? ''}」：Mock 引擎结合当前步骤上下文作答。${selectionNote}`,
        };
      }
      return {
        text: `针对「${question ?? ''}」：Mock 引擎结合当前步骤「${content.slice(0, 30)}…」的解答。多轮对话已启用。`,
      };
    case 'breakdown': {
      const parts = problem.split(/[。；;，,]/).filter((p) => p.trim());
      const sentences = (parts.length > 0 ? parts : [problem]).map((text, i) => ({
        text: text.trim(),
        role: (['given', 'unknown', 'constraint', 'goal'] as const)[i % 4],
        note: 'Mock 解读：该句提供解题信息。',
      }));
      return {
        text: '**逐句拆解题干**',
        meta: { breakdown: { sentences } },
      };
    }
    case 'visualize':
      return {
        text: '**抛物线与根的示意**（$y=x^2-5x+6$ 与 $x$ 轴交点）',
        meta: {
          kind: 'mermaid',
          title: '可视化',
          viz: {
            kind: 'svg',
            svg: {
              width: 400,
              height: 280,
              elements: [
                { type: 'axis', x: 40, y: 220, length: 320, direction: 'x', label: 'x' },
                { type: 'axis', x: 40, y: 220, length: 180, direction: 'y', label: 'y' },
                { type: 'label', x: 180, y: 30, text: 'y = x² - 5x + 6' },
                { type: 'point', x: 120, y: 220, label: 'x=2' },
                { type: 'point', x: 200, y: 220, label: 'x=3' },
                {
                  type: 'polygon',
                  points: '60,200 120,80 200,60 340,180 340,220 60,220',
                  fill: 'rgba(59,130,246,0.12)',
                  stroke: '#3b82f6',
                },
              ],
            },
          },
        },
      };
    case 'restate':
      return {
        text: `**用我自己的话**：${problem.slice(0, 80)} —— 就是要找出满足条件的答案。`,
        meta: { kind: 'restate', title: '重述题目' },
      };
    case 'keyInfo':
      return { text: '**关键信息**：已知量、未知量、约束条件见题目。' };
    case 'similarProblem':
      return { text: '**类似题目**：结构相同、数字不同的练习题（不含解法）。' };
    case 'strategyOrigin':
      return { text: '**思路来源**：从题目结构联想到熟悉的模型或公式。' };
    case 'failedPaths':
      return { text: '**常见弯路**：选错方法或忽略定义域，导致无法继续。' };
    case 'relatedModel':
      return { text: '**题型归类**：识别模型后套用标准框架。' };
    case 'subGoals':
      return {
        text: '**子目标分解**',
        meta: {
          kind: 'mermaid',
          title: '子目标图',
          subGoals: [
            { id: 'g1', label: '理解', stepIds: ['s1'] },
            { id: 'g2', label: '拟定', stepIds: ['s2'] },
            { id: 'g3', label: '执行', stepIds: ['s3'] },
            { id: 'g4', label: '回顾', stepIds: ['s4'] },
          ],
          viz: {
            kind: 'mermaid',
            mermaid: 'flowchart LR\n  A[理解] --> B[拟定] --> C[执行] --> D[回顾]',
          },
        },
      };
    case 'guessThenProve':
      return { text: '**先猜后证**：先估计答案形式，再严格推导验证。' };
    case 'expandAlgebra':
      return {
        text: '**最小操作单元**',
        meta: {
          microSteps: [
            { id: 'a1', label: '移项', content: '将常数项移到等式右边。', op: '移项' },
            { id: 'a2', label: '合并', content: '合并同类项。', op: '合并' },
            { id: 'a3', label: '化简', content: '得到最简形式。', op: '化简' },
          ],
        },
      };
    case 'checkCalculation':
      return {
        text: '**计算检查**：第 2 步符号可能有问题。',
        meta: {
          kind: 'warning',
          highlights: [{ target: 'line', lineIndex: 1, message: '符号弄反' }],
        },
      };
    case 'theoremUsed':
      return {
        text: '**定理与前提**',
        meta: {
          theoremCheck: [
            {
              name: '因式分解 / 求根公式',
              prerequisites: ['方程为标准二次式', '系数为实数'],
              satisfied: true,
              note: '本题满足全部前提。',
            },
          ],
        },
      };
    case 'tweakParams':
      return {
        text: '**参数影响**：拖动滑块观察判别式变化。',
        meta: {
          params: [
            {
              name: 'c',
              label: '常数项 c',
              min: -5,
              max: 15,
              step: 1,
              default: 6,
              expression: 'x^2 - 5x + {c} = 0,\\; \\Delta = 25 - 4c',
            },
          ],
        },
      };
    case 'tweakParamsEval':
      return {
        text: `**参数解读**（${question ?? '当前值'}）：判别式随常数项变化，影响根的数量。`,
      };
    case 'branchAlternative':
      return {
        text: '**另解（求根公式）**',
        meta: {
          kind: 'comparison',
          title: '另解延续',
          branchLabel: '求根公式法',
          branchSteps: [
            {
              id: 'b1',
              phase: 'carrying-out',
              content: '使用求根公式 $x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}$。',
              metadata: {},
            },
            {
              id: 'b2',
              phase: 'carrying-out',
              content: '代入系数计算两根。',
              metadata: {},
            },
          ],
        },
      };
    case 'verifyAnswer':
      return { text: '**验证答案**：代回原题，等式成立。' };
    case 'allSolutions':
      return {
        text: '**多种解法比较**',
        meta: {
          kind: 'comparison',
          title: '解法并排比较',
          comparison: {
            columns: ['解法', '关键步骤', '适用场景'],
            rows: [
              ['因式分解', '凑因子', '系数较整'],
              ['求根公式', '套公式', '通用'],
              ['配方法', '配方', '需配方技巧'],
            ],
          },
        },
      };
    case 'generalize':
      return {
        text: '**推广变式**',
        meta: {
          variantProblem: '若将常数项改为 12，方程变为 x² - 5x + 12 = 0，求根情况如何？',
          variantNote: '改变了常数项 c，需重新计算判别式。',
          kind: 'practice',
        },
      };
    case 'takeaway':
      return { text: '**收获**：理解模型、规范步骤、养成验证习惯。' };
    case 'generatePractice':
      return {
        text: '**同类练习**',
        meta: {
          kind: 'practice',
          title: '生成的练习',
          practiceProblem: '求解 x^2 - 7x + 12 = 0',
        },
      };
    default:
      return { text: '（Mock 占位内容）' };
  }
}
