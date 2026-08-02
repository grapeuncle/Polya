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

/** metadata 通用原则：宁缺毋滥，禁止硬凑。 */
const METADATA_GENERAL_GUIDE = `metadata 通用原则：
- metadata 整体可选，宁缺毋滥：字段没有真实信息增量时直接省略，禁止填充"注意计算""细心审题"之类的套话。
- 字段内容必须随题目、随步骤变化；如果一句话放到任何题目的同类步骤都成立，就不要写。
- 跨步骤去重：上下文中已给出前序步骤的 metadata 摘要。若同一洞察（如"化为标准型""解的个数转化为交点个数"）已被前序某步的同一字段表达过，本步该字段必须省略，或从明显不同的角度补充，禁止换措辞复述。
- commonMistake 仅在该步存在真实高发错误时填写，并配套 mistakeSeverity 分级："critical"（会导致整题出错的高危点，如开方丢 ±、定义域遗漏）；"warning"（值得警惕的易混点）；"reminder"（一般性提醒，仅在确有价值时使用）。
- overlooked 是理解题目阶段的专用字段（此时学生尚未动手解题，语义是"审题陷阱"而非"做错"），覆盖三型：看漏（丢失条件信息）、误读（曲解题意）、想当然（脑补题目未给的前提）；同样需配套 overlookedSeverity 分级，分级含义与 mistakeSeverity 相同。
- critical 是稀缺资源：每道题（多小问时每小问）的 commonMistake 与 overlooked 合计至多 1-2 条 critical，仅留给最可能导致整题失分的关键一步；拿不准时一律用 warning。`;

/** 各阶段的 metadata 生成策略：避免四字段在每个阶段一刀切硬凑。 */
const PHASE_METADATA_GUIDE: Record<Phase, string> = {
  understanding: `本阶段（理解题目）metadata 策略：
- 只生成 heuristic（这道题像哪类题、模式识别的唤醒线索）与 overlooked（审题陷阱），overlooked 需配套 overlookedSeverity。
- overlooked 覆盖审题层面的三类陷阱，每步至多写最有价值的一条：
  ① 看漏：容易丢失的条件信息（隐含约束、定义域、端点开闭、"不同"实数解等限定词）；
  ② 误读：容易曲解的题意（量词"任意/存在"混淆、术语误用、所求目标张冠李戴）；
  ③ 想当然：容易脑补的题目未给前提（默认图形形状、默认正项/独立、凭"见过类似题"套条件）。
- 只写本题真实存在的陷阱，三型都不成立时省略该字段；不要预警后续计算错误（那是"做错"而非"看漏"），此类内容留给执行阶段的 commonMistake。
- 不要生成 objective（本阶段目的恒为"弄清已知未知与条件"，无信息增量）、theoremApplied（本阶段尚未应用定理，不要硬凑"本题涉及……知识"）与 commonMistake（本阶段用 overlooked 替代）。`,
  devising: `本阶段（拟定方案）metadata 策略：
- 核心字段是 heuristic（策略来源：由什么联想到此方案，如"看到二次三项式联想到配方"）。
- theoremApplied 可选：仅在有明确的"预选工具"时填写，语义是"打算用什么"而非"已经用了什么"。
- 不要生成 objective 与 commonMistake（各方案的优劣与风险已在正文简评中覆盖，不要复述）。`,
  'carrying-out': `本阶段（执行方案）metadata 策略：
- objective 应填写且必须是本步的子目标（如"消去分母""配方凑完全平方"），每步各不相同。
- theoremApplied 填写本步实际应用的定理/公式。
- commonMistake 填写本步真实高发错误并按严重程度配 mistakeSeverity。
- heuristic 可选（仅当本步有非显而易见的技巧时填写）。
- 平凡步骤（纯移项、合并同类项等机械运算）允许 metadata 全部留空。`,
  'looking-back': `本阶段（回顾反思）metadata 策略：
- 只保留 heuristic（更优解法的洞察、可推广的数学思想）。
- 不要生成 objective、theoremApplied 与 commonMistake（验证方法与易错点已在正文总结中覆盖，不要复述）。`,
  analogy: `本阶段（举一反三）metadata 策略：
- 只生成 analogyHint（每步必填，共两行）：
  第一行用一句话简洁点出该变式题相对原题的典型差异，以及应对该差异的核心解题技巧（本质提示）；
  第二行更进一步，结合该变式题本身给出更具体的提示或关键步骤（如先做什么、再做什么、哪里容易翻车）。
- analogyHint 是学生点击后才看到的脚手架，给方向、给关键步骤，但不要写成完整解答。
- 不要生成 objective、heuristic、theoremApplied、commonMistake、overlooked 等其他字段。`,
};

/** 全局系统提示词：注入波利亚教学法理念。 */
export const SYSTEM_PROMPT = `你是一位精通乔治·波利亚（George Pólya）《怎样解题》教学法的数学辅导老师。
你始终遵循波利亚四阶段，并在其后追加举一反三阶段：
1. 理解题目（understanding）：弄清未知量、已知量、条件。
2. 拟定方案（devising）：寻找已知与未知之间的联系，回忆相关问题与方法。
3. 执行方案（carrying-out）：逐步实施计划，并检查每一步是否正确。
4. 回顾反思（looking-back）：检验结果，思考其他解法、推广与启示。
5. 举一反三（analogy）：给出同类变式题，帮助学生把方法迁移到新情境，提升泛化能力。

教学原则：
- 多用启发式提问引导思考，而不是直接灌输答案。
- 解释要循序渐进，强调"为什么这样做"而非仅仅"怎么做"。
- 所有回答必须使用简体中文。
- 数学公式使用 LaTeX，行内用 $...$，独立公式用 $$...$$。
- **关键**：在 JSON 字符串中，LaTeX 命令的反斜杠必须双写（如 \\\\frac、\\\\sqrt、\\\\begin{aligned} 等）。例如 JSON 中写为 \\\\frac{a}{b} 才能解析为正确的 \\frac{a}{b}。
- JSON 中换行用 \\n（单反斜杠），LaTeX 命令用 \\\\（双反斜杠），两者不同请严格区分。
- 保持鼓励、耐心、清晰的语气。
- 文本排版要求：在 JSON content 字段中直接使用 Markdown 格式（\\n 换行，\\n\\n 分段，- 无序列表，**加粗**，标题等）。每个自然句独占一行，不同主题或不同要点之间用空行分隔。JSON 字符串中的 \\n 会被正确解析为换行，请放心使用。

多子问题处理原则：
- 当题目包含多个小问（如（1）（2）（3））时，系统会依次独立处理每个小问。
- 你被要求处理某一个小问的某个阶段时，请严格聚焦于该小问，不要混入其他小问的内容。
- 若某小问依赖于前序小问的结果，系统会将前序结果作为已知条件提供。
- 每个小问都应独立经历完整的四阶段解题过程。`;

/** 生成完整解题方案时使用的提示词，要求模型输出结构化 JSON。 */
export function buildSolutionPrompt(problem: string, difficulty: Difficulty): string {
  return `请按照波利亚四阶段，求解以下数学题，并输出**严格的 JSON**（不要包含 Markdown 代码块标记）。

<problem>
${problem}
</problem>

${DIFFICULTY_GUIDE[difficulty]}

输出 JSON 的结构如下：
{
  "problem": "原题",
  "finalAnswer": "最终答案（用 LaTeX）",
  "subAnswers": "[{"id": 1, "label": "（1）", "answer": "答案（LaTeX）"}]（若题目含多小问）",
  "steps": [
    {
      "id": "唯一字符串",
      "phase": "understanding | devising | carrying-out | looking-back | analogy",
      "content": "该步主要文本，可含 $LaTeX$。多条要点请逐条换行，不同主题间空一行。",
      "rawLatex": "可选，纯公式",
      "subSteps": [可选，执行阶段至少一步应含子推导],
      "metadata": {
        "objective": "该步目的（可选）",
        "heuristic": "启发性思路（可选）",
        "theoremApplied": "用到的定理/公式（可选）",
        "commonMistake": "常见错误（可选）",
        "mistakeSeverity": "critical | warning | reminder（仅 commonMistake 存在时配套）",
        "overlooked": "审题陷阱（看漏/误读/想当然，可选，理解题目阶段专用）",
        "overlookedSeverity": "critical | warning | reminder（仅 overlooked 存在时配套）",
        "alternativeApproach": "替代思路（可选）",
        "analogyHint": "变式题提示（analogy 阶段每步必填）"
      }
    }
  ]
}

要求：
- 五个阶段都要有步骤，顺序为 understanding → devising → carrying-out → looking-back → analogy。
- analogy 阶段 3-5 个步骤（不少于 3 道、不多于 5 道，数量取决于该题型典型变式的多寡）：每个步骤的 content 仅为一道变式题题面（与原题核心知识、核心技能相同，但在某个典型方面存在变式；各题变式方向互不相同），严禁包含解答与答案；metadata.analogyHint 必填，共两行——第一行一句话点出该题相对原题的差异与核心解题技巧，第二行结合该题给出更具体的提示或关键步骤。
- carrying-out 阶段至少一个步骤包含 subSteps 数组（2-4 个子步骤）。
- 每个 step 的 id 必须唯一；metadata 整体可选，允许留空或省略。
- JSON 中 LaTeX 命令必须双写反斜杠（\\\\frac 而非 \\frac），换行用 \\n（单反斜杠）。
- 只输出 JSON，不要任何额外解释文字。

${METADATA_GENERAL_GUIDE}

${Object.values(PHASE_METADATA_GUIDE).join('\n\n')}`;
}

/** 单阶段解题提示词（用于分阶段流式推送）。 */
export function buildPhaseSolutionPrompt(
  problem: string,
  phase: Phase,
  difficulty: Difficulty,
  priorSteps: SolutionStep[]
): string {
  const priorBrief = priorSteps
    .map((s, i) => {
      const meta = [];
      if (s.metadata.objective) meta.push(`目的：${s.metadata.objective}`);
      if (s.metadata.heuristic) meta.push(`思路：${s.metadata.heuristic}`);
      const metaStr = meta.length > 0 ? `（${meta.join('；')}）` : '';
      return `  ${i + 1}. [${PHASE_META[s.phase].title}]${metaStr}\n  ${s.content}`;
    })
    .join('\n\n');
  // 阶段特化要求
  const phaseSpecificRules: string[] = [];
  if (phase === 'devising') {
    phaseSpecificRules.push(
      '请列出至少 2 种可行解法/策略，用一两句话简评每种方案的优劣。若某个方案确实没有明显劣势，请直接说"无明显劣势"，切勿硬凑缺点。然后明确选中推荐方案并说明选择理由。所选方案将在后续 carrying-out 阶段执行。'
    );
  }
  if (phase === 'looking-back') {
    phaseSpecificRules.push(
      '回顾请用精炼的 3-5 句话总结，重点覆盖：①所用的验证方法；②常见易错点；③可推广的数学思想或变式方向。',
      '禁止长篇自我质疑/纠错过程（如"等等，这里可能错了……让我们重新计算……"）。如果之前步骤有误，直接说明正确的做法即可，不要模拟犯错再修正的过程。',
      '若在回顾中提出替代解法或参数化方法，必须给出完整推导直到最终结论，不得半途而废（如写到一半说"需要调整"却没有给出正确结果）。'
    );
  }
  if (phase === 'analogy') {
    phaseSpecificRules.push(
      '请生成 3-5 道变式题（不少于 3 道，不多于 5 道）：与原题考察的核心知识与核心技能相同，但各自在一个典型方面存在变化（如数值与条件形式、所求目标、参数范围、情境背景、逆向设问等），各题变式方向互不相同，难度可略有梯度。具体数量取决于该题型典型变式的多寡：典型变式丰富就给 4-5 道，较少就给 3 道；宁缺毋滥，禁止硬凑重复或牵强的变式。',
      '每个 step 的 content 只写变式题题面本身（可含 $LaTeX$），严禁包含解答、答案或分析过程。',
      '每个 step 的 metadata.analogyHint 必填，共两行（用 \\n 分隔）：第一行一句话点出该题相对原题的差异与核心解题技巧（本质提示）；第二行结合该题给出更具体的提示或关键步骤（如先做什么、再做什么）。这是学生"先想一下再点开"的脚手架，不要写成完整解答。',
      '本阶段不输出 finalAnswer 与 subAnswers 字段。'
    );
  }
  const extraRules = phaseSpecificRules.length > 0
    ? `\n\n本阶段附加要求：\n${phaseSpecificRules.map((r) => `- ${r}`).join('\n')}`
    : '';

  return `请针对以下数学题，仅生成「${PHASE_META[phase].title}」（phase=${phase}）阶段的步骤，输出**严格 JSON**（不要 Markdown 代码块）。

<problem>
${problem}
</problem>

${priorBrief ? `已生成的前序步骤：\n${priorBrief}\n` : ''}

${DIFFICULTY_GUIDE[difficulty]}${extraRules}

${METADATA_GENERAL_GUIDE}

${PHASE_METADATA_GUIDE[phase]}

输出 JSON 结构：
{
  "steps": [
    {
      "id": "唯一字符串",
      "phase": "${phase}",
      "content": "该步主要文本，可含 $LaTeX$。在 JSON 字符串内直接使用 \\n\\n 分段，支持 Markdown 列表（-）和加粗（**）。多条要点逐条换行，不同主题间空一行。注意：JSON 中 LaTeX 命令的反斜杠必须双写，如 \\\\frac、\\\\sqrt 等。",
      "subSteps": [可选，执行阶段建议含 2-4 个子步骤],
      "metadata": { 可选字段 objective / heuristic / theoremApplied / commonMistake / mistakeSeverity / overlooked / overlookedSeverity / analogyHint，按上方阶段策略选填，可整体省略 }
    }
  ],
  "finalAnswer": "仅 looking-back 阶段可给出最终答案 LaTeX，其他阶段省略此字段",
  "subAnswers": ${phase === 'looking-back'
    ? '[{"id": 1, "label": "（1）", "answer": "LaTeX 答案"}, ...]'
    : '仅 looking-back 阶段可选，格式为 [{"id": 1, "label": "（1）", "answer": "答案"}]'
  }
}

要求：本回复只包含 ${PHASE_META[phase].title} 阶段的 ${phase === 'analogy' ? '3-5' : '1-2'} 个步骤，phase 必须为 ${phase}。只输出 JSON。JSON 中 LaTeX 命令必须双写反斜杠（\\\\frac 而非 \\frac）。${phase === 'looking-back' ? '\n若题目包含多个小问（如（1）（2）（3）（4）），请在 subAnswers 数组中为每个小问提供独立的结构化答案。' : ''}`;
}

/** 为多子问题场景中单个子问题的单个阶段构建提示词。 */
export function buildSubProblemPhasePrompt(
  problem: string,
  subProblem: string,
  subIndex: number,
  phase: Phase,
  difficulty: Difficulty,
  priorSubResults: { index: number; label: string; finalAnswer?: string }[],
  priorSteps: SolutionStep[]
): string {
  const priorResultsBlock = priorSubResults.length > 0
    ? `前面子问题的结果（作为本小问的已知条件）：\n` +
      priorSubResults
        .map((s) => `  第 ${s.index} 小问${s.finalAnswer ? ` 答案：${s.finalAnswer}` : '（尚未完成）'}`)
        .join('\n') + '\n'
    : '';

  const priorBrief = priorSteps
    .map((s, i) => {
      const meta = [];
      if (s.metadata.objective) meta.push(`目的：${s.metadata.objective}`);
      if (s.metadata.heuristic) meta.push(`思路：${s.metadata.heuristic}`);
      const metaStr = meta.length > 0 ? `（${meta.join('；')}）` : '';
      return `  ${i + 1}. [${PHASE_META[s.phase].title}]${metaStr}\n  ${s.content}`;
    })
    .join('\n\n');

  const phaseSpecificRules: string[] = [];
  if (phase === 'devising') {
    phaseSpecificRules.push(
      '请列出至少 2 种可行解法/策略，用一两句话简评每种方案的优劣。若某个方案确实明显没有劣势，请直接说"好方案，无明显缺点"，切勿硬凑缺点。然后明确选中推荐方案并说明选择理由。'
    );
  }
  if (phase === 'looking-back') {
    phaseSpecificRules.push(
      '回顾请用精炼的 3-5 句话总结，重点覆盖：①所用的验证方法；②常见易错点；③可推广的数学思想。',
      '禁止长篇自我质疑/纠错过程。如果之前步骤有误，直接说明正确的做法即可。'
    );
  }
  if (phase === 'analogy') {
    phaseSpecificRules.push(
      '请生成 3-5 道变式题（不少于 3 道，不多于 5 道）：与本小问考察的核心知识与核心技能相同，但各自在一个典型方面存在变化（如数值与条件形式、所求目标、参数范围、情境背景、逆向设问等），各题变式方向互不相同。具体数量取决于该题型典型变式的多寡：典型变式丰富就给 4-5 道，较少就给 3 道；宁缺毋滥，禁止硬凑重复或牵强的变式。',
      '每个 step 的 content 只写变式题题面本身（可含 $LaTeX$），严禁包含解答、答案或分析过程。',
      '每个 step 的 metadata.analogyHint 必填，共两行（用 \\n 分隔）：第一行一句话点出该题相对本小问原题的差异与核心解题技巧（本质提示）；第二行结合该题给出更具体的提示或关键步骤（如先做什么、再做什么）。不要写成完整解答。',
      '本阶段不输出 finalAnswer 字段。'
    );
  }
  const extraRules = phaseSpecificRules.length > 0
    ? `\n\n本阶段附加要求：\n${phaseSpecificRules.map((r) => `- ${r}`).join('\n')}`
    : '';

  return `原题包含多个小问。请仅针对第 ${subIndex} 小问，生成「${PHASE_META[phase].title}」阶段的步骤，输出**严格 JSON**（不要 Markdown 代码块）。

<problem>
完整原题：${problem}

当前聚焦：第 ${subIndex} 小问
${subProblem}
</problem>

${priorResultsBlock}
${priorBrief ? `本小问已生成的前序步骤：\n${priorBrief}\n` : ''}

${DIFFICULTY_GUIDE[difficulty]}${extraRules}

${METADATA_GENERAL_GUIDE}

${PHASE_METADATA_GUIDE[phase]}

输出 JSON 结构：
{
  "steps": [
    {
      "id": "唯一字符串（建议以 sub${subIndex}- 开头）",
      "phase": "${phase}",
      "content": "该步主要文本，可含 $LaTeX$。在 JSON 字符串内直接使用 \\n\\n 分段，支持 Markdown 列表（-）和加粗（**）。多条要点逐条换行，不同主题间空一行。注意：JSON 中 LaTeX 命令的反斜杠必须双写，如 \\\\frac、\\\\sqrt 等。",
      "subSteps": [可选，执行阶段建议含 2-4 个子步骤],
      "metadata": { 可选字段 objective / heuristic / theoremApplied / commonMistake / mistakeSeverity / overlooked / overlookedSeverity / analogyHint，按上方阶段策略选填，可整体省略 }
    }
  ],
  "finalAnswer": ${phase === 'looking-back' ? '"本小问最终答案 LaTeX"' : '仅 looking-back 阶段可给出最终答案 LaTeX，其他阶段省略此字段'}
}

要求：本回复只包含第 ${subIndex} 小问的 ${PHASE_META[phase].title} 阶段 ${phase === 'analogy' ? '3-5' : '1-2'} 个步骤，phase 必须为 ${phase}。只输出 JSON。JSON 中 LaTeX 命令必须双写反斜杠（\\\\frac 而非 \\frac）。`;
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
    .map((s, i) => `  ${i + 1}. [${PHASE_META[s.phase].title}]\n  ${s.content}`)
    .join('\n\n');
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

/** 与步骤卡片 inline 摘要重复的菜单动作：对应的已有摘要字段。 */
const INLINE_SUMMARY_BY_ACTION: Partial<
  Record<MenuActionId, { label: string; pick: (m: SolutionStep['metadata']) => string | undefined }>
> = {
  objective: { label: '该步目的', pick: (m) => m.objective },
  strategyOrigin: { label: '思路来源', pick: (m) => m.heuristic },
  theoremUsed: { label: '所用定理', pick: (m) => m.theoremApplied },
  commonMistake: { label: '常见错误/易忽略', pick: (m) => m.commonMistake ?? m.overlooked },
};

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
  const inlineSummary = INLINE_SUMMARY_BY_ACTION[action];
  const seenSummary = inlineSummary?.pick(step.metadata);
  const seenBlock = seenSummary
    ? `\n\n# 学生已看过的摘要（请勿重复）
步骤卡片上已向学生展示${inlineSummary!.label}摘要：「${seenSummary}」。请在此基础上向纵深展开（举例、对比、前提校验、与前后步骤的关联），不要复述这句摘要本身。`
    : '';
  return `${buildContextBlock(ctx, step.id)}

${focus}${selectionBlock}${seenBlock}

# 任务
${actionInstruction(action, step, question, selection)}

${DIFFICULTY_GUIDE[ctx.difficulty]}
请用简体中文回答。回答为纯 Markdown 格式，公式使用 LaTeX（行内 $...$，独立 $$...$$）。用 ## 或 ### 标记章节，- 做列表，\\n\\n 分段。`;
}

export function buildGlobalAskPrompt(question: string, ctx: SolverContext): string {
  const thread = ctx.conversationThreads?.['__global__'];
  return `${buildContextBlock(ctx, '__global__')}

# 学生的整体提问
${question}

# 全局对话历史
${formatThread(thread)}

请结合整道题的上下文作答。${DIFFICULTY_GUIDE[ctx.difficulty]}
用简体中文，回答为纯 Markdown 格式。公式使用 LaTeX（行内 $...$，独立 $$...$$），用 \\n\\n 分段。`;
}

export function buildContinueBranchPrompt(
  branchLabel: string,
  branchSteps: SolutionStep[],
  ctx: SolverContext
): string {
  const branchBrief = branchSteps
    .map((s, i) => `  ${i + 1}. ${s.content}`)
    .join('\n\n');
  return `${buildContextBlock(ctx)}

# 当前分支
名称：${branchLabel}
已有步骤：
${branchBrief}

# 任务
请沿此分支继续推导 1-2 个后续步骤，输出 JSON：
{"branchSteps":[{"id":"唯一id","phase":"carrying-out","content":"...","metadata":{}}]}

${DIFFICULTY_GUIDE[ctx.difficulty]}
只输出 JSON，不要额外文字。JSON 中 LaTeX 命令必须双写反斜杠。`;
}

/** 针对大题中单个小问的解题 prompt。传入问题原始题干和具体小问文本，以及已完成的前序步骤。 */
export function buildSubProblemPrompt(
  problem: string,
  subProblem: string,
  subIndex: number,
  difficulty: Difficulty,
  priorSteps: SolutionStep[]
): string {
  const priorBrief = priorSteps
    .map((s, i) => {
      const meta = [];
      if (s.metadata.objective) meta.push(`目的：${s.metadata.objective}`);
      const metaStr = meta.length > 0 ? `（${meta.join('；')}）` : '';
      return `  ${i + 1}. [${PHASE_META[s.phase].title}]${metaStr}\n  ${s.content}`;
    })
    .join('\n\n');

  return `请仅针对以下数学题的第 ${subIndex} 小问，生成波利亚执行方案（carrying-out）阶段的解题步骤并给出最终答案，输出**严格 JSON**（不要 Markdown 代码块）。

<problem>
原题：${problem}

第 ${subIndex} 小问：${subProblem}
</problem>

${priorBrief ? `已生成的前序步骤（来自整体解题）：\n${priorBrief}\n` : ''}

${DIFFICULTY_GUIDE[difficulty]}

${METADATA_GENERAL_GUIDE}

${PHASE_METADATA_GUIDE['carrying-out']}

输出 JSON 结构：
{
  "steps": [
    {
      "id": "sub-${subIndex}-1",
      "phase": "carrying-out",
      "content": "该步主要文本，可含 $LaTeX$。在 JSON 字符串内直接使用 \\n\\n 分段，支持 Markdown 列表（-）和加粗（**）。多条要点逐条换行，不同主题间空一行。注意：JSON 中 LaTeX 命令的反斜杠必须双写，如 \\\\frac、\\\\sqrt 等。",
      "metadata": { 可选字段 objective / heuristic / theoremApplied / commonMistake / mistakeSeverity / overlooked / overlookedSeverity，按上方阶段策略选填，可整体省略 }
    }
  ],
  "finalAnswer": "本小问的最终答案 LaTeX"
}

要求：本回复只包含该小问的 1-3 个 carrying-out 步骤，phase 必须为 carrying-out。只输出 JSON。JSON 中 LaTeX 命令必须双写反斜杠。`;
}
