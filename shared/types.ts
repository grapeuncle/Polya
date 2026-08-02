// 扩展主进程与 Webview 之间共享的数据模型与类型定义。
// 这些类型不依赖任何 VS Code 或 DOM API，因此可同时被两端引用。

/** 波利亚四阶段 + 举一反三扩展阶段。 */
export type Phase =
  | 'understanding' // 理解题目
  | 'devising' // 拟定方案
  | 'carrying-out' // 执行方案
  | 'looking-back' // 回顾与反思
  | 'analogy'; // 举一反三

/** 阶段的固定顺序，用于导航与进度计算。 */
export const PHASE_ORDER: Phase[] = [
  'understanding',
  'devising',
  'carrying-out',
  'looking-back',
  'analogy',
];

/** 阶段的中文标题与简介，供 UI 展示。 */
export const PHASE_META: Record<Phase, { title: string; subtitle: string; emoji: string }> = {
  understanding: { title: '理解题目', subtitle: '弄清未知量、已知量与条件', emoji: '🔍' },
  devising: { title: '拟定方案', subtitle: '寻找已知与未知之间的联系', emoji: '🧭' },
  'carrying-out': { title: '执行方案', subtitle: '逐步实施并检查每一步', emoji: '✍️' },
  'looking-back': { title: '回顾反思', subtitle: '检验结果并总结推广', emoji: '🔭' },
  analogy: { title: '举一反三', subtitle: '同类变式训练，提升泛化能力', emoji: '🌱' },
};

/** 定理前提检查项。 */
export interface TheoremCheckItem {
  name: string;
  prerequisites: string[];
  satisfied: boolean;
  note?: string;
}

/** 单个解题步骤的元数据。 */
export interface StepMetadata {
  /** 该步骤的目的。 */
  objective?: string;
  /** 启发性思路（这一步是怎么想到的）。 */
  heuristic?: string;
  /** 应用的定理 / 公式。 */
  theoremApplied?: string;
  /** 常见错误提示（主要用于执行方案阶段）。 */
  commonMistake?: string;
  /** 易错提醒严重级别：critical 高危（默认展开并高亮）、warning 需注意、reminder 一般提醒。仅 commonMistake 存在时配套。 */
  mistakeSeverity?: 'critical' | 'warning' | 'reminder';
  /** 审题陷阱（理解题目阶段专用：学生尚未动手解题，语义是"审题"而非"做错"），覆盖三型：看漏（丢失条件信息）、误读（曲解题意）、想当然（脑补题目未给的前提）。 */
  overlooked?: string;
  /** 审题陷阱严重级别，含义同 mistakeSeverity。仅 overlooked 存在时配套。 */
  overlookedSeverity?: 'critical' | 'warning' | 'reminder';
  /** 替代解法简述。 */
  alternativeApproach?: string;
  /** 定理前提检查（AI 补全）。 */
  theoremCheck?: TheoremCheckItem[];
  /** 举一反三阶段专用：变式题提示（简洁点出相对原题的差异与解题技巧），默认折叠，学生点击后展开。 */
  analogyHint?: string;
}

/** 题干拆解句。 */
export interface BreakdownSentence {
  text: string;
  role: 'given' | 'unknown' | 'constraint' | 'goal' | 'hint';
  note?: string;
}

/** 代数微步骤单元。 */
export interface MicroStep {
  id: string;
  label: string;
  content: string;
  op?: string;
}

/** 验算高亮项。 */
export interface VerifyHighlight {
  target: 'step' | 'line';
  lineIndex?: number;
  message: string;
}

/** 子目标节点。 */
export interface SubGoal {
  id: string;
  label: string;
  stepIds?: string[];
}

/** 学习要点收藏。 */
export interface LearningEntry {
  id: string;
  content: string;
  time: number;
  stepId?: string;
}

/** 解题步骤数据结构（核心模型）。 */
export interface SolutionStep {
  id: string;
  phase: Phase;
  /** 显示的主要文本，支持 Markdown / LaTeX。 */
  content: string;
  /** 可选的纯 LaTeX 表达式。 */
  rawLatex?: string;
  /** 可折叠的详细推导子步骤。 */
  subSteps?: SolutionStep[];
  metadata: StepMetadata;
  /** 所属子问题索引（1-based），用于多子问题时按子问题分组展示步骤。 */
  subProblemIndex?: number;
}

/** 难度（解释详细程度）。 */
export type Difficulty = 'concise' | 'standard' | 'detailed';

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  concise: '简洁',
  standard: '标准',
  detailed: '详解',
};

/** 完整解题方案。 */
export interface Solution {
  problem: string;
  steps: SolutionStep[];
  /** 最终答案（若有）。 */
  finalAnswer?: string;
  /** 分小问的结构化答案（用于大题包含多小问时分别展示）。 */
  subAnswers?: SubAnswer[];
  /** 多子问题时每个子问题的完整解题结果。 */
  subSolutions?: SubProblemSolution[];
}

/** 单小问答案。 */
export interface SubAnswer {
  id: number;
  label: string;
  answer: string;
}

/** 一个子问题的完整四阶段解题结果。 */
export interface SubProblemSolution {
  /** 子问题序号（1-based）。 */
  index: number;
  /** 子问题标签，如 "（1）"。 */
  label: string;
  /** 子问题文本内容。 */
  subProblem: string;
  /** 该子问题的四个阶段步骤，按阶段分组。 */
  phases: Partial<Record<Phase, SolutionStep[]>>;
  /** 该子问题的最终答案。 */
  finalAnswer?: string;
}

/** 检测到的子问题信息（仅用于拆分阶段，不参与求解结果）。 */
export interface DetectedSubProblem {
  index: number;
  label: string;
  text: string;
}

/** 阶段状态机。 */
export interface PhaseState {
  currentPhase: Phase;
  completedPhases: Phase[];
}

/** SVG 可视化元素。 */
export type SvgElement =
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number; stroke?: string }
  | { type: 'circle'; cx: number; cy: number; r: number; fill?: string; stroke?: string }
  | { type: 'point'; x: number; y: number; label?: string }
  | { type: 'axis'; x: number; y: number; length: number; direction: 'x' | 'y'; label?: string }
  | { type: 'label'; x: number; y: number; text: string }
  | { type: 'polygon'; points: string; fill?: string; stroke?: string };

/** 可视化规格。 */
export interface VizSpec {
  kind: 'svg' | 'mermaid' | 'table';
  svg?: { width: number; height: number; elements: SvgElement[] };
  table?: { headers: string[]; rows: string[][] };
  mermaid?: string;
}

/** 并排比较规格。 */
export interface ComparisonSpec {
  columns: string[];
  rows: string[][];
}

/** 参数滑块规格。 */
export interface ParamSpec {
  name: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  expression: string;
}

/** 对话消息。 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  time: number;
}

/** 多轮对话线程。 */
export interface ConversationThread {
  stepId: string;
  messages: ConversationMessage[];
}

/** 解法分支。 */
export interface SolutionBranch {
  id: string;
  parentStepId: string;
  label: string;
  alternativeSteps: SolutionStep[];
}

/**
 * 菜单动作类型。通用动作在任意步骤可用；阶段专属动作仅在对应阶段显示。
 * 命名与需求文档中的按钮一一对应。
 */
export type MenuActionId =
  // 通用
  | 'explain'
  | 'objective'
  | 'why'
  | 'detail'
  | 'alternatives'
  | 'verify'
  | 'ask'
  | 'copy'
  | 'flag'
  | 'commonMistake'
  // 理解题目
  | 'breakdown'
  | 'visualize'
  | 'restate'
  | 'keyInfo'
  | 'similarProblem'
  // 拟定方案
  | 'strategyOrigin'
  | 'failedPaths'
  | 'relatedModel'
  | 'subGoals'
  | 'guessThenProve'
  // 执行方案
  | 'expandAlgebra'
  | 'checkCalculation'
  | 'theoremUsed'
  | 'tweakParams'
  | 'tweakParamsEval'
  | 'branchAlternative'
  // 回顾反思
  | 'verifyAnswer'
  | 'allSolutions'
  | 'generalize'
  | 'takeaway'
  | 'generatePractice';

/** 引擎请求的统一上下文，携带完整对话信息。 */
export interface SolverContext {
  problem: string;
  difficulty: Difficulty;
  phaseState: PhaseState;
  /** 已生成的步骤历史。 */
  steps: SolutionStep[];
  /** 当前聚焦的步骤（若有）。 */
  focusedStep?: SolutionStep;
  /** 教师模式下是否隐藏部分内容。 */
  teacherMode?: boolean;
  /** 多轮对话历史（按 stepId 或 __global__）。 */
  conversationThreads?: Record<string, ConversationThread>;
  /** 当前继续求解的分支（continueBranch）。 */
  activeBranch?: SolutionBranch;
  /** 学生在步骤内划选的文本片段（若有）。 */
  focusedSelection?: string;
  /** 当前正在处理的子问题序号（1-based，多子问题时使用）。 */
  currentSubProblemIndex?: number;
  /** 已完成子问题的简要结果（供后续子问题作为已知条件引用）。 */
  completedSubResults?: { index: number; label: string; finalAnswer?: string }[];
}

// ============== Webview -> Extension 消息 ==============

export type WebviewToExtMessage =
  | { type: 'ready' }
  | { type: 'solve'; problem: string }
  | { type: 'continueBranch'; branchId: string; requestId: string; branch: SolutionBranch }
  | {
      type: 'action';
      requestId: string;
      action: MenuActionId;
      stepId: string;
      question?: string;
      selectedText?: string;
      threadMessages?: ConversationMessage[];
      /** 客户端当前会话的题目与步骤（用于恢复到缓存会话后纠正服务端上下文）。 */
      problem?: string;
      steps?: SolutionStep[];
    }
  | {
      type: 'globalAsk';
      requestId: string;
      question: string;
      threadMessages?: ConversationMessage[];
      /** 同 action：客户端当前会话上下文。 */
      problem?: string;
      steps?: SolutionStep[];
    }
  | { type: 'setDifficulty'; difficulty: Difficulty }
  | { type: 'copy'; text: string }
  | { type: 'cancelAction'; requestId: string }
  | { type: 'reportState'; completedPhases: Phase[] }
  | { type: 'info'; message: string }
  | { type: 'error'; message: string }
  | { type: 'requestState' }
  | { type: 'solveSubProblem'; requestId: string; index: number; subProblem: string };

// ============== Extension -> Webview 消息 ==============

export type ExtToWebviewMessage =
  | { type: 'init'; difficulty: Difficulty; teacherMode: boolean; engine: string }
  | { type: 'solutionStart'; problem: string }
  | { type: 'solutionPhaseStart'; phase: Phase }
  | { type: 'solutionPhaseSteps'; phase: Phase; steps: SolutionStep[] }
  | { type: 'solutionPhaseChunk'; phase: Phase; chunk: string }
  | { type: 'solutionHeartbeat'; phase: Phase; elapsedMs: number }
  | { type: 'solution'; solution: Solution }
  | { type: 'solveError'; message: string }
  | { type: 'subProblemStart'; index: number; label: string; subProblem: string }
  | { type: 'subProblemPhaseSteps'; index: number; phase: Phase; steps: SolutionStep[] }
  | { type: 'subProblemComplete'; index: number; finalAnswer?: string }
  | { type: 'subProblemSteps'; requestId: string; index: number; steps: SolutionStep[] }
  | { type: 'subProblemError'; requestId: string; index: number; message: string }
  | { type: 'branchStepsAppended'; branchId: string; steps: SolutionStep[] }
  // 流式动作结果：先 start，再多次 chunk，最后 end / error。
  | { type: 'actionStart'; requestId: string; action: MenuActionId; stepId: string }
  | { type: 'actionChunk'; requestId: string; chunk: string }
  | { type: 'actionEnd'; requestId: string; meta?: ActionResultMeta }
  | { type: 'actionError'; requestId: string; message: string }
  | { type: 'actionCancelled'; requestId: string }
  | { type: 'difficultyChanged'; difficulty: Difficulty };

/** 动作结果的附加结构化信息（用于渲染特殊卡片，如可视化、对比等）。 */
export interface ActionResultMeta {
  /** 渲染样式：普通文本卡片 / Mermaid 图 / 对比表 / 高亮等。 */
  kind?: 'text' | 'mermaid' | 'comparison' | 'warning' | 'practice' | 'restate' | 'svg';
  title?: string;
  viz?: VizSpec;
  comparison?: ComparisonSpec;
  params?: ParamSpec[];
  practiceProblem?: string;
  branchSteps?: SolutionStep[];
  branchLabel?: string;
  breakdown?: { sentences: BreakdownSentence[] };
  microSteps?: MicroStep[];
  highlights?: VerifyHighlight[];
  theoremCheck?: TheoremCheckItem[];
  subGoals?: SubGoal[];
  variantProblem?: string;
  variantNote?: string;
}
