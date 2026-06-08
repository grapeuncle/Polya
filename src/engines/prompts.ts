// 内置波利亚教学理念的系统提示词与各菜单动作的提示词构建函数。
import {
  Difficulty,
  MenuActionId,
  PHASE_META,
  SolutionStep,
  SolverContext,
} from '../shared/types';

/** 难度对应的措辞指引。 */
const DIFFICULTY_GUIDE: Record<Difficulty, string> = {
  concise: '回答要简洁，直击要点，控制在 2-3 句内，避免赘述。',
  standard: '回答详略得当，给出必要的推理与说明。',
  detailed: '回答要详尽，逐步拆解每个细节，补充背景与易错点，帮助初学者彻底理解。',
};

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
- 每个 step 的 id 必须唯一。
- 只输出 JSON，不要任何额外解释文字。`;
}

/** 各菜单动作对应的指令模板。返回 user prompt 主体。 */
function actionInstruction(action: MenuActionId, step: SolutionStep, question?: string): string {
  const phaseName = PHASE_META[step.phase].title;
  switch (action) {
    // ===== 通用 =====
    case 'explain':
      return `请用口语化、通俗的自然语言，详细解释这一步（${phaseName}阶段）在做什么。`;
    case 'objective':
      return '请说明这一步的目的：它想达成什么、在整个解题中扮演什么角色。';
    case 'why':
      return '请回溯推理链，解释为什么会从前面的已知/步骤推导出这一步，逻辑依据是什么。';
    case 'detail':
      return '请把这一步的推导展开为更细的逐步过程（代数变形、公式代入等），每个小步单独成行。';
    case 'alternatives':
      return '针对这一步的局部操作，请给出至少一种替代处理方法，并对比两种方法的优劣（用 Markdown 表格对比）。';
    case 'verify':
      return '请对这一步的结果做快速验算（如代入特殊值、量纲检查、反向推导），展示验算过程；若发现潜在错误请明确高亮指出。';
    case 'ask':
      return `学生针对这一步提出了问题："${question ?? ''}"。请结合该步骤上下文作答。`;
    // ===== 理解题目 =====
    case 'breakdown':
      return '请逐句拆解原始题干，解释每一句话提供了什么信息或约束。';
    case 'visualize':
      return '请用 Mermaid 图（graph 或 flowchart）或简单示意，把题目的结构/关系可视化。只输出 Mermaid 代码块。';
    case 'restate':
      return '请以学生自己的口吻，用最朴素的语言重述这道题，并确认理解是否一致。';
    case 'keyInfo':
      return '请提取题目中的【已知量】【未知量】【约束条件】，用清晰的列表分类列出。';
    case 'similarProblem':
      return '请给出一道结构类似的题目（只给题面，不要给解法），供学生类比。';
    // ===== 拟定方案 =====
    case 'strategyOrigin':
      return '请说明这一步的策略是怎么想到的（启发来源），例如"看到二次三项式联想到配方"。';
    case 'failedPaths':
      return '请解释在此处常见的失败尝试或弯路，以及它们为什么走不通。';
    case 'relatedModel':
      return '请指出本题可归类为哪种数学模型/题型，并给出该题型的通用解题框架。';
    case 'subGoals':
      return '请把整体解题路径拆解为若干子目标，用 Mermaid flowchart 呈现子目标图，并标注当前所处位置。';
    case 'guessThenProve':
      return '请先给出一个猜测性的结论或答案范围（先猜），再简述如何验证（后证），让学生体会猜想过程。';
    // ===== 执行方案 =====
    case 'expandAlgebra':
      return '请把这一步分解为最小代数操作单元（移项、合并同类项、约分等），每个单元单独一行并编号。';
    case 'checkCalculation':
      return '请做符号/数值运算验证，逐项检查计算，标注任何潜在计算错误。';
    case 'theoremUsed':
      return '请说明这一步用到的定理/公式的完整名称、表述，以及使用前提条件是否满足。';
    case 'tweakParams':
      return '请说明如果改变题目中的某个常数/参数，结果会如何变化，给出 2-3 组示例对照。';
    case 'branchAlternative':
      return '请在此处分叉，给出并执行另一种解法，最后用 Markdown 表格对比两种解法的关键差异。';
    // ===== 回顾反思 =====
    case 'verifyAnswer':
      return '请把最终答案代回原题（或换一种方法）进行验证，展示完整验证过程。';
    case 'allSolutions':
      return '请汇总这道题的不同解法，并排比较各自思路、适用场景与优缺点。';
    case 'generalize':
      return '请生成 1-2 道"如果改变某个条件……"的推广/变式题，并简述思路差异。';
    case 'takeaway':
      return '请总结这道题教会我们的关键数学思想、方法套路或常见思维误区。';
    case 'generatePractice':
      return '请基于本题结构，生成一道全新的同类练习题（给出题面，并附简要答案要点）。';
    default:
      return '请就这一步给出有帮助的辅导说明。';
  }
}

/** 把上下文（题目、阶段、步骤历史）拼成对话背景，确保每次请求携带完整上下文。 */
function buildContextBlock(ctx: SolverContext): string {
  const stepsBrief = ctx.steps
    .map((s, i) => `  ${i + 1}. [${PHASE_META[s.phase].title}] ${s.content}`)
    .join('\n');
  return `# 当前题目
${ctx.problem}

# 当前阶段
${PHASE_META[ctx.phaseState.currentPhase].title}

# 已生成的解题步骤
${stepsBrief || '（暂无）'}`;
}

/** 构建某个菜单动作的完整 user prompt。 */
export function buildActionPrompt(
  action: MenuActionId,
  step: SolutionStep,
  ctx: SolverContext,
  question?: string
): string {
  const focus = `# 当前聚焦的步骤
${step.content}${step.rawLatex ? `\n公式：$$${step.rawLatex}$$` : ''}`;
  return `${buildContextBlock(ctx)}

${focus}

# 任务
${actionInstruction(action, step, question)}

${DIFFICULTY_GUIDE[ctx.difficulty]}
请用简体中文回答，公式使用 LaTeX（行内 $...$，独立 $$...$$）。`;
}

/** 全局提问的提示词。 */
export function buildGlobalAskPrompt(question: string, ctx: SolverContext): string {
  return `${buildContextBlock(ctx)}

# 学生的整体提问
${question}

请结合整道题的上下文作答。${DIFFICULTY_GUIDE[ctx.difficulty]}
用简体中文，公式使用 LaTeX。`;
}
