// 内置波利亚教学理念的系统提示词与各菜单动作的提示词构建函数。
import {
  ConversationThread,
  Difficulty,
  MenuActionId,
  PHASE_META,
  Phase,
  SolutionStep,
  SolverContext,
} from '../shared/types';

/** 难度对应的措辞指引。 */
const DIFFICULTY_GUIDE: Record<Difficulty, string> = {
  concise: '回答要简洁，直击要点，控制在 2-3 句内，避免赘述。',
  standard: '回答详略得当，给出必要的推理与说明。',
  detailed: '回答要详尽，逐步拆解每个细节，补充背景与易错点，帮助初学者彻底理解。',
};

const JSON_TAIL_GUIDE = `
若需要结构化数据，在 Markdown 正文**之后**单独追加一个 \`\`\`json 代码块（学生看不到此块内的重复内容，仅用于程序解析）。`;

/** 全局系统提示词：注入波利亚教学法理念。 */
export const SYSTEM_PROMPT = `你是一位精通乔治·波利亚（George Pólya）《怎样解题》教学法的数学辅导老师。
你始终遵循波利亚四阶段：
1. 理解题目（understanding）：弄清未知量、已知量、条件。
2. 拟定方案（devising）：寻找已知与未知之间的联系，回忆相关问题与方法。
3. 执行方案（carrying-out）：逐步实施计划，并检查每一步是否正确。
4. 回顾反思（looking-back）：检验结果，思考其他解法、推广与启示。

教学原则：
- 多用启发式提问引导思考，而不是直接灌输答案。
- 解释要循序渐进，强调"为什么这样做"而非仅仅"怎么做"。
- 所有回答必须使用简体中文。
- 数学公式使用 LaTeX，行内用 $...$，独立公式用 $$...$$。
- 保持鼓励、耐心、清晰的语气。`;

/** 生成完整解题方案时使用的提示词，要求模型输出结构化 JSON。 */
export function buildSolutionPrompt(problem: string, difficulty: Difficulty): string {
  return `请按照波利亚四阶段，求解以下数学题，并输出**严格的 JSON**（不要包含 Markdown 代码块标记）。

题目：
"""
${problem}
"""

${DIFFICULTY_GUIDE[difficulty]}

输出 JSON 的结构如下：
{
  "problem": "原题",
  "finalAnswer": "最终答案（用 LaTeX）",
  "steps": [
    {
      "id": "唯一字符串",
      "phase": "understanding | devising | carrying-out | looking-back",
      "content": "该步主要文本，可含 $LaTeX$",
      "rawLatex": "可选，纯公式",
      "subSteps": [可选，执行阶段至少一步应含子推导],
      "metadata": {
        "objective": "该步目的",
        "heuristic": "启发性思路",
        "theoremApplied": "用到的定理/公式（可选）",
        "commonMistake": "常见错误（可选）",
        "alternativeApproach": "替代思路（可选）"
      }
    }
  ]
}

要求：
- 四个阶段都要有至少一个步骤，顺序为 understanding → devising → carrying-out → looking-back。
- carrying-out 阶段至少一个步骤包含 subSteps 数组（2-4 个子步骤）。
- 每个 step 的 id 必须唯一，metadata 不可省略。
- 只输出 JSON，不要任何额外解释文字。`;
}

/** 单阶段解题提示词（用于分阶段流式推送）。 */
export function buildPhaseSolutionPrompt(
  problem: string,
  phase: Phase,
  difficulty: Difficulty,
  priorSteps: SolutionStep[]
): string {
  const priorBrief = priorSteps
    .map((s, i) => `  ${i + 1}. [${PHASE_META[s.phase].title}] ${s.content}`)
    .join('\n');
  return `请针对以下数学题，仅生成波利亚「${PHASE_META[phase].title}」（phase=${phase}）阶段的步骤，输出**严格 JSON**（不要 Markdown 代码块）。

题目：
"""
${problem}
"""

${priorBrief ? `已生成的前序步骤：\n${priorBrief}\n` : ''}

${DIFFICULTY_GUIDE[difficulty]}

输出 JSON 结构：
{
  "steps": [
    {
      "id": "唯一字符串",
      "phase": "${phase}",
      "content": "该步主要文本，可含 $LaTeX$",
      "subSteps": [可选，执行阶段建议含 2-4 个子步骤],
      "metadata": { "objective": "...", "heuristic": "...", "theoremApplied": "...", "commonMistake": "..." }
    }
  ],
  "finalAnswer": "仅 looking-back 阶段可给出最终答案 LaTeX，其他阶段省略此字段"
}

要求：本回复只包含 ${PHASE_META[phase].title} 阶段的 1-2 个步骤，phase 必须为 ${phase}。只输出 JSON。`;
}

function formatThread(thread: ConversationThread | undefined): string {
  if (!thread || thread.messages.length === 0) {
    return '（暂无对话历史）';
  }
  return thread.messages
    .slice(-6)
    .map((m) => `  ${m.role === 'user' ? '学生' : '老师'}：${m.content.slice(0, 200)}`)
    .join('\n');
}

/** 各菜单动作对应的指令模板。返回 user prompt 主体。 */
function actionInstruction(
  action: MenuActionId,
  step: SolutionStep,
  question?: string,
  selectedText?: string
): string {
  const phaseName = PHASE_META[step.phase].title;
  const selection = selectedText?.trim();
  switch (action) {
    case 'explain':
      if (selection) {
        return `请只针对学生划选的片段，用通俗语言解释其含义、符号/公式在解题中的作用，以及它与前后文的关系。（注：划选文本可能来自渲染后的公式显示，未必是原始 LaTeX。）`;
      }
      return `请用口语化、通俗的自然语言，详细解释这一步（${phaseName}阶段）在做什么。`;
    case 'objective':
      return '请说明这一步的目的：它想达成什么、在整个解题中扮演什么角色。';
    case 'why':
      return '请回溯推理链，解释为什么会从前面的已知/步骤推导出这一步，逻辑依据是什么。';
    case 'detail':
      return `请把这一步的推导展开为更细的逐步过程（代数变形、公式代入等），每个小步单独成行。${JSON_TAIL_GUIDE}
\`\`\`json
{"microSteps":[{"id":"m1","label":"移项","content":"...","op":"移项"}]}
\`\`\``;
    case 'alternatives':
      return `针对这一步的局部操作，请给出至少一种替代处理方法，并对比两种方法的优劣。
正文用 Markdown 表格对比。${JSON_TAIL_GUIDE}
\`\`\`json
{"columns":["方法","思路","优点","缺点"],"rows":[["方法A","...","...","..."],["方法B","...","...","..."]]}
\`\`\``;
    case 'verify':
      return `请对这一步的结果做快速验算（如代入特殊值、量纲检查、反向推导），展示验算过程；若发现潜在错误请明确高亮指出。${JSON_TAIL_GUIDE}
\`\`\`json
{"highlights":[{"target":"step","message":"错误说明"}]}
\`\`\``;
    case 'ask':
      if (selection) {
        return `学生针对划选片段提出了问题："${question ?? ''}"。请结合该片段与步骤全文上下文及对话历史作答。`;
      }
      return `学生针对这一步提出了问题："${question ?? ''}"。请结合该步骤上下文与对话历史作答。`;
    case 'commonMistake':
      return '请说明这一步常见的错误做法、错误原因，以及正确做法的对比。';
    case 'breakdown':
      return `请逐句拆解原始题干，解释每一句话提供了什么信息或约束。${JSON_TAIL_GUIDE}
\`\`\`json
{"breakdown":{"sentences":[{"text":"原句","role":"given","note":"解读"}]}}
\`\`\`
role 取值：given | unknown | constraint | goal | hint`;
    case 'visualize':
      return `请可视化题目结构。几何/函数题优先用 SVG；关系图可用 Mermaid。
正文简要说明图形含义。${JSON_TAIL_GUIDE}
SVG 示例：
\`\`\`json
{"kind":"svg","svg":{"width":400,"height":300,"elements":[{"type":"axis","x":50,"y":250,"length":300,"direction":"x","label":"x"},{"type":"point","x":150,"y":150,"label":"顶点"},{"type":"label","x":200,"y":30,"text":"y=x²-5x+6"}]}}
\`\`\`
或 Mermaid：
\`\`\`json
{"kind":"mermaid","mermaid":"graph TD\\n  A[原题] --> B[步骤1]"}
\`\`\``;
    case 'restate':
      return '请以学生自己的口吻，用最朴素的语言重述这道题，并确认理解是否一致。';
    case 'keyInfo':
      return '请提取题目中的【已知量】【未知量】【约束条件】，用清晰的列表分类列出。';
    case 'similarProblem':
      return '请给出一道结构类似的题目（只给题面，不要给解法），供学生类比。';
    case 'strategyOrigin':
      return '请说明这一步的策略是怎么想到的（启发来源），例如"看到二次三项式联想到配方"。';
    case 'failedPaths':
      return '请解释在此处常见的失败尝试或弯路，以及它们为什么走不通。';
    case 'relatedModel':
      return '请指出本题可归类为哪种数学模型/题型，并给出该题型的通用解题框架。';
    case 'subGoals':
      return `请把整体解题路径拆解为若干子目标。${JSON_TAIL_GUIDE}
\`\`\`json
{"subGoals":[{"id":"g1","label":"识别类型","stepIds":["s1"]}],"kind":"mermaid","mermaid":"flowchart LR\\n  A[识别类型] --> B[选方法]"}
\`\`\``;
    case 'guessThenProve':
      return '请先给出一个猜测性的结论或答案范围（先猜），再简述如何验证（后证），让学生体会猜想过程。';
    case 'expandAlgebra':
      return `请把这一步分解为最小代数操作单元（移项、合并同类项、约分等），每个单元单独一行并编号。${JSON_TAIL_GUIDE}
\`\`\`json
{"microSteps":[{"id":"a1","label":"移项","content":"详细说明","op":"移项"}]}
\`\`\``;
    case 'checkCalculation':
      return `请做符号/数值运算验证，逐项检查计算，标注任何潜在计算错误。${JSON_TAIL_GUIDE}
\`\`\`json
{"highlights":[{"target":"line","lineIndex":0,"message":"符号错误"}]}
\`\`\``;
    case 'theoremUsed':
      return `请说明这一步用到的定理/公式的完整名称、表述，以及使用前提条件是否满足。${JSON_TAIL_GUIDE}
\`\`\`json
{"theoremCheck":[{"name":"定理名","prerequisites":["前提1"],"satisfied":true,"note":"说明"}]}
\`\`\``;
    case 'tweakParamsEval':
      return `学生调整了参数（${question ?? '见上下文'}），请用 1-2 句话说明此参数变化对结果/判别式/根的影响。`;
    case 'tweakParams':
      return `请说明改变题目中某个常数/参数时结果如何变化。${JSON_TAIL_GUIDE}
\`\`\`json
{"params":[{"name":"c","label":"常数项 c","min":-10,"max":20,"step":1,"default":6,"expression":"x²-5x+{c}=0 的判别式 Δ=25-4c"}]}
\`\`\``;
    case 'branchAlternative':
      return `请在此处分叉，给出并执行另一种解法，对比关键差异。${JSON_TAIL_GUIDE}
\`\`\`json
{"branchLabel":"求根公式法","branchSteps":[{"id":"b1","phase":"carrying-out","content":"...","metadata":{}}]}
\`\`\``;
    case 'verifyAnswer':
      return '请把最终答案代回原题（或换一种方法）进行验证，展示完整验证过程。';
    case 'allSolutions':
      return `请汇总不同解法并排比较。${JSON_TAIL_GUIDE}
\`\`\`json
{"columns":["解法","关键步骤","优点","缺点"],"rows":[["因式分解","...","...","..."],["求根公式","...","...","..."]]}
\`\`\``;
    case 'generalize':
      return `请生成一道"如果改变某个条件……"的推广/变式题，并简述相对原题的变化。${JSON_TAIL_GUIDE}
\`\`\`json
{"variantProblem":"变式题面","variantNote":"相对原题的变化说明"}
\`\`\``;
    case 'takeaway':
      return '请总结这道题教会我们的关键数学思想、方法套路或常见思维误区。';
    case 'generatePractice':
      return `请生成一道全新的同类练习题（题面 + 简要答案要点）。${JSON_TAIL_GUIDE}
\`\`\`json
{"practiceProblem":"求解 x²-7x+12=0"}
\`\`\``;
    default:
      return '请就这一步给出有帮助的辅导说明。';
  }
}

function buildContextBlock(ctx: SolverContext, stepId?: string): string {
  const stepsBrief = ctx.steps
    .map((s, i) => `  ${i + 1}. [${PHASE_META[s.phase].title}] ${s.content}`)
    .join('\n');
  const threadKey = stepId ?? '__global__';
  const thread = ctx.conversationThreads?.[threadKey];
  return `# 当前题目
${ctx.problem}

# 当前阶段
${PHASE_META[ctx.phaseState.currentPhase].title}

# 已生成的解题步骤
${stepsBrief || '（暂无）'}

# 近期对话历史
${formatThread(thread)}`;
}

export function buildActionPrompt(
  action: MenuActionId,
  step: SolutionStep,
  ctx: SolverContext,
  question?: string,
  selectedText?: string
): string {
  const selection = selectedText?.trim() || ctx.focusedSelection?.trim();
  const focus = `# 当前聚焦的步骤
${step.content}${step.rawLatex ? `\n公式：$$${step.rawLatex}$$` : ''}`;
  const selectionBlock = selection
    ? `\n\n# 学生划选的片段（请优先围绕此片段回答，仍需结合步骤全文理解上下文）
「${selection}」`
    : '';
  return `${buildContextBlock(ctx, step.id)}

${focus}${selectionBlock}

# 任务
${actionInstruction(action, step, question, selection)}

${DIFFICULTY_GUIDE[ctx.difficulty]}
请用简体中文回答，公式使用 LaTeX（行内 $...$，独立 $$...$$）。`;
}

export function buildGlobalAskPrompt(question: string, ctx: SolverContext): string {
  const thread = ctx.conversationThreads?.['__global__'];
  return `${buildContextBlock(ctx, '__global__')}

# 学生的整体提问
${question}

# 全局对话历史
${formatThread(thread)}

请结合整道题的上下文作答。${DIFFICULTY_GUIDE[ctx.difficulty]}
用简体中文，公式使用 LaTeX。`;
}

export function buildContinueBranchPrompt(
  branchLabel: string,
  branchSteps: SolutionStep[],
  ctx: SolverContext
): string {
  const branchBrief = branchSteps
    .map((s, i) => `  ${i + 1}. ${s.content}`)
    .join('\n');
  return `${buildContextBlock(ctx)}

# 当前分支
名称：${branchLabel}
已有步骤：
${branchBrief}

# 任务
请沿此分支继续推导 1-2 个后续步骤，输出 JSON：
{"branchSteps":[{"id":"唯一id","phase":"carrying-out","content":"...","metadata":{}}]}

${DIFFICULTY_GUIDE[ctx.difficulty]}
只输出 JSON，不要额外文字。`;
}
