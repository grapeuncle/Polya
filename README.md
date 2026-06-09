# Polya 数学辅导 (Polya Math Tutor)

> 一个基于乔治·波利亚（George Pólya）《怎样解题》四阶段方法的 VS Code / Cursor 交互式数学辅导插件。
> 选中任意解题步骤，即可像 AI 代码解释工具一样浮出上下文菜单：解释、追问、验证、替代方法、可视化、生成同类练习……

---

## ✨ 特性一览

- **波利亚四阶段解题**：理解题目 → 拟定方案 → 执行方案 → 回顾反思，全程结构化展示。
- **浮动菜单**：点击任意步骤即高亮并浮出工具栏；菜单项随当前阶段动态变化。
- **通用操作**：解释这一步、这一步的目的、为什么这样做、查看详细推导、还有其他方法吗、检验这一步、**常见错误**、提问/追问、复制/标记疑难。
- **本地优先**：`objective` / `detail` / `theoremUsed` / `commonMistake` 有 metadata 时直接展示，无需调用 AI。
- **RichUI 组件**：并排比较表、参数滑块、SVG 几何图、练习一键跳转、重述确认、解法分支 Tab。
- **多轮对话**：步骤追问与全局提问保留对话历史，请求携带上下文。
- **取消与重试**：流式生成可取消；失败或可按新难度刷新单条解释。
- **真撤销**：操作前自动快照，侧边栏撤销可恢复步骤/结果/分支状态。
- **阶段专属操作**：
  - 理解题目：拆解题干、画图/可视化、用自己的话重述、找出关键信息、类似题目。
  - 拟定方案：思路怎么来的、失败路径、相关模型/题型、拟定子目标、先猜后证。
  - 执行方案：展开代数细节、检查计算、用了什么定理、修改参数试试、另解延续。
  - 回顾反思：验证答案、还有别的解法吗、推广/变式、这道题教会我们什么、生成同类练习。
- **全局辅助**：阶段进度导航条、思维导图模式（Mermaid 离线打包）、操作历史与撤销/快照对比、难度调节（可刷新解释或重新求解）、全局提问浮动按钮、教师模式。
- **Gap 补齐交互**：分阶段解题推送、题干句级高亮拆解、可点击代数微步骤、参数滑块本地求值 + AI 补充、重述确认闭环、验算步骤高亮、定理前提检查、分支延续、学习要点收藏、变式题一键加载。
- **渲染**：Markdown + KaTeX 数学公式（离线打包）+ Mermaid 图形；自动适配 VS Code 浅色/深色主题。
- **AI 引擎抽象**：`ISolverEngine` 接口，内置 **Mock**（零配置体验）、**OpenAI**、**Anthropic**、**DeepSeek**（均支持 SSE 流式响应）。

## 🏗️ 项目结构

```
polya-solver/
├── package.json              扩展清单：命令、配置、视图
├── esbuild.js                同时打包扩展主进程与 Webview（含 KaTeX/Codicons 资源复制）
├── tsconfig.json             扩展主进程 TS 配置
├── src/
│   ├── extension.ts          主入口：注册命令、密钥管理
│   ├── PanelManager.ts       创建 Webview 面板、消息转发、CSP
│   ├── shared/types.ts       两端共享的数据模型与消息协议
│   ├── engines/
│   │   ├── ISolverEngine.ts  引擎接口（generateSolution / explainStep / checkStep / globalAsk）
│   │   ├── MockSolverEngine.ts   内置示例引擎（无需密钥）
│   │   ├── LLMSolverEngine.ts    OpenAI / Anthropic / DeepSeek 流式实现
│   │   ├── factory.ts            按配置创建引擎
│   │   ├── parseActionOutput.ts  LLM 输出结构化 meta 解析
│   │   └── prompts.ts            内置波利亚教学法的系统提示词
│   └── webview/              React 应用
│       ├── actions/actionRouter.ts  本地优先动作路由
│       ├── index.tsx         入口
│       ├── App.tsx           主布局：阶段导航 + 输入区 + 步骤列表/思维导图
│       ├── store.ts          Zustand 状态管理（threads / branches / snapshots）
│       ├── menuConfig.ts     菜单按钮配置
│       ├── components/       StepCard / FloatingMenu(portal) / ResultCard / BranchTree / MenuActions/*
│       └── render/           Markdown + KaTeX + Mermaid + GeometrySvg
└── .vscode/                 F5 一键调试配置
```

## 🚀 安装与运行（开发模式）

> 需要 Node.js 18+ 与 VS Code 1.85+（Cursor 同样适用）。

```bash
# 1. 安装依赖
npm install

# 2. 构建（或使用 npm run watch 持续构建）
npm run package

# 3. 在 VS Code / Cursor 中打开本项目，按 F5 启动「扩展开发宿主」窗口
```

在新打开的开发宿主窗口中：

1. 按 `Ctrl/Cmd+Shift+P` 打开命令面板，运行 **`Polya: 打开数学辅导面板`**。
2. 在左侧输入题目（或点击示例题目），点击「开始求解」。
3. 点击任意步骤卡片 → 浮出菜单 → 体验各类辅导操作。

也可以在编辑器中**选中一段文字**，右键选择 **`Polya: 用选中文本作为题目求解`**。

## ⚙️ 配置（设置 → 搜索 "Polya"）

| 配置项 | 说明 | 默认 |
| --- | --- | --- |
| `polyaSolver.engine` | 解题引擎：`mock` / `openai` / `anthropic` / `deepseek` | `mock` |
| `polyaSolver.apiKey` | API 密钥（兜底；推荐用命令存入 SecretStorage） | 空 |
| `polyaSolver.openai.baseUrl` | OpenAI 兼容接口 Base URL | `https://api.openai.com/v1` |
| `polyaSolver.openai.model` | OpenAI 模型 | `gpt-4o-mini` |
| `polyaSolver.anthropic.baseUrl` | Anthropic Base URL | `https://api.anthropic.com` |
| `polyaSolver.anthropic.model` | Anthropic 模型 | `claude-3-5-sonnet-latest` |
| `polyaSolver.deepseek.baseUrl` | DeepSeek Base URL | `https://api.deepseek.com/v1` |
| `polyaSolver.deepseek.model` | DeepSeek 模型 | `deepseek-chat` |
| `polyaSolver.difficulty` | 解释详细程度：`concise`/`standard`/`detailed` | `standard` |
| `polyaSolver.teacherMode` | 教师模式：默认隐藏部分启发内容 | `false` |

### 🔐 安全地设置 API 密钥

运行命令 **`Polya: 设置 API 密钥`**，密钥会保存在 VS Code 的 **SecretStorage** 中，而不是明文写入设置文件。留空提交即可清除。

> 默认使用 `mock` 引擎，**无需任何密钥**即可体验完整交互。切换到 `openai`/`anthropic`/`deepseek` 后才会调用真实模型。

## 🧩 AI 接口抽象

```ts
interface ISolverEngine {
  readonly id: string;
  generateSolution(problem: string, ctx: SolverContext): Promise<Solution>;
  explainStep(action, stepId, ctx, handlers, question?): Promise<void>; // 流式
  checkStep(stepId, ctx, handlers): Promise<void>;                       // 验算
  globalAsk(question, ctx, handlers): Promise<void>;
}
```

- 系统提示词内置波利亚教学理念，每次请求都携带完整上下文（题目、当前阶段、步骤历史、聚焦步骤、**对话历史**）。
- 流式响应通过 `postMessage` 逐段推送到 Webview，实时显示；支持**取消**与**重试**。
- LLM 动作可在 Markdown 正文后追加 ` ```json ` 尾块，解析为 VizSpec / ComparisonSpec / ParamSpec 等结构化 UI。

## 🧪 冒烟测试

```bash
npm run package
node scripts/smoke-test.mjs
# 可选：node scripts/smoke-test.mjs --api-key <key>
```

手动测试清单（F5 扩展宿主）：

- [x] Mock 引擎：求解时四阶段步骤依次出现（分阶段推送）
- [x] 「拆解题干」— 题面句级高亮 + banner 拆解视图
- [x] 「展开代数细节」/「详细推导」— 可点击微步骤并写回 subSteps
- [x] 「修改参数试试」— 滑块即时预览 + 松手后 AI 解读
- [x] 「用自己的话重述」— 「理解一致」有持久状态
- [x] 「检查计算」— 错误时步骤卡片 warning 高亮
- [x] 「另解延续」— 分支 Tab + 思维导图虚线节点可点 + 沿分支继续
- [x] 「这道题教会我们」— 可收藏到侧边栏学习要点
- [x] 「推广/变式」— 一键加载变式题
- [x] 难度切换 — 可选「刷新解释」或「重新求解」
- [x] 侧边栏「与最新对比」快照 diff

## 🛠️ 常用脚本

| 命令 | 作用 |
| --- | --- |
| `npm run compile` | 开发构建 |
| `npm run watch` | 监听并持续构建（配合 F5） |
| `npm run package` | 生产构建（压缩） |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run lint` | ESLint 检查 |
| `node scripts/smoke-test.mjs` | 冒烟测试（构建产物 + 解析 + 可选 API） |

## 📦 打包为 .vsix（可选）

```bash
npm install -g @vscode/vsce
vsce package
```

## 📝 说明

- 所有解释性内容默认使用**简体中文**。
- 数学公式使用 KaTeX，字体已随插件打包，离线可用；Mermaid 优先从 `dist/media/mermaid.min.js` 加载，失败回退 CDN。
- UI 使用 Codicons + 自定义 CSS（未使用已弃用的 webview-ui-toolkit）。

## 📄 License

MIT
