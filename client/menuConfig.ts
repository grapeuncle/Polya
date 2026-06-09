// 浮动菜单的配置：通用动作 + 四阶段专属动作。
import { MenuActionId, Phase } from '../shared/types';

export interface MenuItemConfig {
  id: MenuActionId;
  label: string;
  /** Codicon 名称（@vscode/webview-ui-toolkit / VS Code 图标字体）。 */
  icon: string;
  /** 简短说明（tooltip）。 */
  tip: string;
  /** 是否为纯前端动作（不调用引擎）：复制 / 标记。 */
  frontendOnly?: boolean;
  /** 是否需要弹出输入框（追问）。 */
  needsInput?: boolean;
}

/** 通用菜单：任意步骤都显示。 */
export const COMMON_ACTIONS: MenuItemConfig[] = [
  { id: 'explain', label: '解释这一步', icon: 'comment', tip: '用通俗语言解释此步骤' },
  { id: 'objective', label: '这一步的目的', icon: 'target', tip: '此步骤想达成什么' },
  { id: 'why', label: '为什么这样做', icon: 'question', tip: '回溯推理依据' },
  { id: 'detail', label: '查看详细推导', icon: 'list-tree', tip: '展开逐步推导' },
  { id: 'alternatives', label: '还有其他方法吗', icon: 'git-branch', tip: '给出替代处理并对比' },
  { id: 'verify', label: '检验这一步', icon: 'check', tip: '快速验算此步' },
  { id: 'commonMistake', label: '常见错误', icon: 'warning', tip: '如果做错了会怎样' },
  { id: 'ask', label: '提问 / 追问', icon: 'mention', tip: '就此步骤提问', needsInput: true },
  { id: 'copy', label: '复制', icon: 'copy', tip: '复制内容到剪贴板', frontendOnly: true },
  { id: 'flag', label: '标记疑难', icon: 'bookmark', tip: '标记为疑难步骤', frontendOnly: true },
];

/** 四阶段专属菜单。 */
export const PHASE_ACTIONS: Record<Phase, MenuItemConfig[]> = {
  understanding: [
    { id: 'breakdown', label: '拆解题干', icon: 'symbol-text', tip: '逐句解读题目' },
    { id: 'visualize', label: '画图 / 可视化', icon: 'graph', tip: '生成示意图' },
    { id: 'restate', label: '用自己的话重述', icon: 'feedback', tip: '学生口吻重述' },
    { id: 'keyInfo', label: '找出关键信息', icon: 'key', tip: '提取已知/未知/约束' },
    { id: 'similarProblem', label: '类似题目', icon: 'files', tip: '展示一道类比题' },
  ],
  devising: [
    { id: 'strategyOrigin', label: '思路怎么来的', icon: 'lightbulb', tip: '策略启发来源' },
    { id: 'failedPaths', label: '尝试过的失败路径', icon: 'error', tip: '常见弯路解析' },
    { id: 'relatedModel', label: '相关模型/题型', icon: 'symbol-class', tip: '题型归类与框架' },
    { id: 'subGoals', label: '拟定子目标', icon: 'checklist', tip: '子目标图' },
    { id: 'guessThenProve', label: '先猜后证', icon: 'wand', tip: '体验猜想过程' },
  ],
  'carrying-out': [
    { id: 'expandAlgebra', label: '展开代数细节', icon: 'symbol-operator', tip: '最小操作单元' },
    { id: 'checkCalculation', label: '检查计算', icon: 'verified', tip: '符号运算验证' },
    { id: 'theoremUsed', label: '用了什么定理', icon: 'book', tip: '定理与前提检查' },
    { id: 'tweakParams', label: '修改参数试试', icon: 'settings', tip: '观察参数影响' },
    { id: 'branchAlternative', label: '另解延续', icon: 'type-hierarchy', tip: '执行另一种解法' },
  ],
  'looking-back': [
    { id: 'verifyAnswer', label: '验证答案', icon: 'pass', tip: '代回验证答案' },
    { id: 'allSolutions', label: '还有别的解法吗', icon: 'list-unordered', tip: '解法并排比较' },
    { id: 'generalize', label: '推广 / 变式', icon: 'extensions', tip: '生成变式题' },
    { id: 'takeaway', label: '这道题教会我们', icon: 'mortar-board', tip: '总结关键思想' },
    { id: 'generatePractice', label: '生成同类练习', icon: 'add', tip: '生成新练习题' },
  ],
};
