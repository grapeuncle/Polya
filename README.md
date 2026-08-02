# Polya 数学辅导 (Polya Math Tutor)

> 基于乔治·波利亚（George Pólya）《怎样解题》四阶段方法的交互式数学辅导 **Web 应用**。
> 选中任意解题步骤，即可浮出上下文菜单：解释、追问、验证、替代方法、可视化、生成同类练习……

---

## 特性一览

- **波利亚四阶段解题**：理解题目 → 拟定方案 → 执行方案 → 回顾反思，全程结构化展示。
- **核心三件套菜单**：浮动菜单一级仅保留「解释 / 检验 / 追问」三个高频动作，其余 20+ 动作折叠进「更多功能（实验）」，降低认知负荷。
- **本地优先**：`objective` / `detail` / `theoremUsed` / `commonMistake` 有 metadata 时直接展示，无需调用 AI。
- **RichUI 组件**：并排比较表、参数滑块、SVG 几何图、练习一键跳转、重述确认、解法分支 Tab。
- **多轮对话**：步骤追问与全局提问保留对话历史，请求携带上下文。
- **取消与重试**：流式生成可取消；失败或可按新难度刷新单条解释。
- **真撤销**：操作前自动快照，侧边栏撤销可恢复步骤/结果/分支状态。
- **渲染**：Markdown + KaTeX 数学公式 + Mermaid 图形；自动适配系统浅色/深色主题。
- **AI 引擎抽象**：`ISolverEngine` 接口，内置 **Mock**（零配置）、**OpenAI**、**Anthropic**、**DeepSeek**（均支持 SSE 流式响应）。

## 项目结构

```
polya-solver/
├── client/              React SPA（原 webview）
├── server/              Express API + SolverService（SSE 推送）
├── engines/             Mock / LLM 解题引擎
├── shared/              共享类型与工具
├── public/media/        KaTeX / Codicons / Mermaid 静态资源
├── vite.config.ts       前端构建与 dev 代理
└── scripts/             冒烟测试、资源复制
```

## 安装与运行（开发模式）

> 需要 Node.js 18+。

```bash
# 1. 安装依赖（自动复制 media 资源）
npm install

# 2. 配置环境变量
cp .env.example .env
# 若曾使用 Cursor 插件，可一键导入旧设置：
npm run import:cursor

# 3. 同时启动 API（:3001）与前端（:5173）
npm run dev
```

在浏览器打开 **http://localhost:5173**：

1. 在左侧输入题目（或点击示例题目），点击「开始求解」。
2. 点击任意步骤卡片 → 浮出菜单 → 体验各类辅导操作。

也可通过 URL 传入题目：`http://localhost:5173/?problem=求解方程%20x^2-5x+6=0`

## 配置

### 服务端（`.env`）

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `POLYA_ENGINE` | 引擎：`mock` / `openai` / `anthropic` / `deepseek` | `mock` |
| `POLYA_API_KEY` | 大模型 API 密钥 | 空 |
| `POLYA_OPENAI_BASE_URL` | OpenAI 兼容接口 Base URL | `https://api.openai.com/v1` |
| `POLYA_OPENAI_MODEL` | OpenAI 模型 | `gpt-4o-mini` |
| `POLYA_ANTHROPIC_*` | Anthropic 配置 | 见 `.env.example` |
| `POLYA_DEEPSEEK_*` | DeepSeek 配置 | 见 `.env.example` |
| `PORT` | API 端口 | `3001` |

### 客户端（浏览器 localStorage）

- 解释详细程度（简洁 / 标准 / 详解）
- 教师模式

> 默认使用 `mock` 引擎，**无需任何密钥**即可体验完整交互。

## 生产构建

```bash
npm run build
npm start
# 访问 http://localhost:3001（静态前端 + API 同端口）
```

## 冒烟测试

```bash
npm run build
npm start   # 另开终端
node scripts/smoke-test.mjs
# 可选：node scripts/smoke-test.mjs --api-key <key>
```

## 常用脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发模式（Vite + Express watch） |
| `npm run build` | 生产构建 |
| `npm start` | 启动生产服务 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run lint` | ESLint 检查 |
| `node scripts/smoke-test.mjs` | 冒烟测试 |

## License

MIT
