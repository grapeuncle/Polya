# Polya 数学辅导 (Polya Math Tutor)

> 一个基于乔治·波利亚（George Pólya）《怎样解题》四阶段方法的 VS Code / Cursor 交互式数学辅导插件。
> 选中任意解题步骤，即可像 AI 代码解释工具一样浮出上下文菜单：解释、追问、验证、替代方法、可视化、生成同类练习……

---

## ✨ 特性一览

- **波利亚四阶段解题**：理解题目 → 拟定方案 → 执行方案 → 回顾反思，全程结构化展示。
- **浮动菜单**：点击任意步骤即高亮并浮出工具栏；菜单项随当前阶段动态变化。
- **通用操作**：解释这一步、这一步的目的、为什么这样做、查看详细推导、还有其他方法吗、检验这一步、提问/追问、复制/标记疑难。
- **阶段专属操作**：
  - 理解题目：拆解题干、画图/可视化、用自己的话重述、找出关键信息、类似题目。
  - 拟定方案：思路怎么来的、失败路径、相关模型/题型、拟定子目标、先猜后证。
  - 执行方案：展开代数细节、检查计算、用了什么定理、修改参数试试、另解延续。
  - 回顾反思：验证答案、还有别的解法吗、推广/变式、这道题教会我们什么、生成同类练习。
- **全局辅助**：阶段进度导航条、思维导图模式（Mermaid）、操作历史与撤销、难度调节滑块（简洁/标准/详解）、全局提问浮动按钮、教师模式（默认隐藏部分启发内容）。
- **渲染**：Markdown + KaTeX 数学公式（离线打包）+ Mermaid 图形；自动适配 VS Code 浅色/深色主题。
- **AI 引擎抽象**：`ISolverEngine` 接口，内置 **Mock**（零配置体验）、**OpenAI**、**Anthropic**（均支持 SSE 流式响应）。

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
│   │   ├── LLMSolverEngine.ts    OpenAI / Anthropic 流式实现
│   │   ├── factory.ts            按配置创建引擎
│   │   └── prompts.ts            内置波利亚教学法的系统提示词
│   └── webview/              React 应用
│       ├── index.tsx         入口
│       ├── App.tsx           主布局：阶段导航 + 输入区 + 步骤列表/思维导图
│       ├── store.ts          Zustand 状态管理
│       ├── menuConfig.ts     菜单按钮配置
│       ├── components/       StepCard / FloatingMenu / ResultCard / PhaseNav / ProblemInput / Sidebar / MindMap / GlobalAsk
│       └── render/           Markdown + KaTeX + Mermaid 渲染
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
| `polyaSolver.engine` | 解题引擎：`mock` / `openai` / `anthropic` | `mock` |
| `polyaSolver.apiKey` | API 密钥（兜底；推荐用命令存入 SecretStorage） | 空 |
| `polyaSolver.openai.baseUrl` | OpenAI 兼容接口 Base URL | `https://api.openai.com/v1` |
| `polyaSolver.openai.model` | OpenAI 模型 | `gpt-4o-mini` |
| `polyaSolver.anthropic.baseUrl` | Anthropic Base URL | `https://api.anthropic.com` |
| `polyaSolver.anthropic.model` | Anthropic 模型 | `claude-3-5-sonnet-latest` |
| `polyaSolver.difficulty` | 解释详细程度：`concise`/`standard`/`detailed` | `standard` |
| `polyaSolver.teacherMode` | 教师模式：默认隐藏部分启发内容 | `false` |

### 🔐 安全地设置 API 密钥

运行命令 **`Polya: 设置 API 密钥`**，密钥会保存在 VS Code 的 **SecretStorage** 中，而不是明文写入设置文件。留空提交即可清除。

> 默认使用 `mock` 引擎，**无需任何密钥**即可体验完整交互。切换到 `openai`/`anthropic` 后才会调用真实模型。

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

- 系统提示词内置波利亚教学理念，每次请求都携带完整上下文（题目、当前阶段、步骤历史、聚焦步骤）。
- 流式响应通过 `postMessage` 逐段推送到 Webview，实时显示。
- 调用失败时显示友好错误并提供「重试」。

## 🛠️ 常用脚本

| 命令 | 作用 |
| --- | --- |
| `npm run compile` | 开发构建 |
| `npm run watch` | 监听并持续构建（配合 F5） |
| `npm run package` | 生产构建（压缩） |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run lint` | ESLint 检查 |

## 📦 打包为 .vsix（可选）

```bash
npm install -g @vscode/vsce
vsce package
```

## 📝 说明

- 所有解释性内容默认使用**简体中文**。
- 数学公式使用 KaTeX，字体已随插件打包，离线可用；思维导图的 Mermaid 运行时按需从 CDN 加载（失败会回退显示源码）。
- 体积优化：核心依赖精简，Webview 产物约 480KB。

## 📄 License

MIT
