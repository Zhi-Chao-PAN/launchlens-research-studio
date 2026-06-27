# 跨项目统筹交接文档：Research Studio ↔ launchlens-ai

> **给统筹 agent 的说明**：本文档由 research-studio 项目的维护 agent 编写，目的是让你
> 快速掌握两个项目的真实关系、契约差距、以及实现"1+1>2"合体的具体路径。
> 文档中所有文件路径、类型定义、API 签名均经代码核实，非凭印象。
> 写于 2026-06-27，对应 research-studio 提交 `39b9297`（R229）。

---

## 0. TL;DR（先看这段）

- 两个项目目前**零代码耦合**，只有一个"人肉复制粘贴"的单向文本桥梁，且**该桥梁两端格式不兼容**——research-studio 产一段自由文本，launchlens-ai 吃结构化五字段对象。
- README 里"Export a `launchlensBrief` → import into launchlens-ai"是**未兑现的设计意图**，不是已实现功能。
- 合体的核心工作 = **定义一个结构化共享契约**，让 research-studio 的综合输出能无损映射到 launchlens-ai 的 `LaunchLensInput`。
- 这需要**同时改两个仓库**，所以必须在新对话里做，且建议先把 launchlens-ai 克隆到本机。

---

## 1. 两个项目的定位

### Research Studio（本项目，`launchlens-research-studio`）
- **定位**：多智能体市场情报工作台。输入一个产品/市场问题 → 6 个 AI 智能体并行调研 → 结构化市场情报报告。
- **架构**：5 个研究智能体（market-sizer / competitor-analyst / pain-detective / pricing-scout / channel-scout）并行 + 1 个综合智能体（synthesis）收尾。
- **角色**：launchlens-ai 的"上游情报采集器"——产出可执行的商业简报，供 launchlens-ai 转成 GTM 策略。
- **技术栈**：Next.js 16.2.9 + React 19.2.4 + TypeScript 5 + Tailwind 4 + Vitest 4。
- **规模**：280 源文件 / 57k 行 / 93 测试文件 / 1529 测试 / 29 API 路由 / 9 页面 / 4 语种 i18n（270 键 ×4）。
- **当前状态**：tsc + lint + test + build 全绿，工作树干净。真实 LLM（MiniMax-M3）已端到端验证。

### launchlens-ai（GitHub: `Zhi-Chao-PAN/launchlens-ai`）
- **定位**：AI 驱动的 GTM（go-to-market）工作台。把一个产品 idea 转成可编辑的上市计划。
- **角色**：Research Studio 的"下游消费者"——接收 brief，生成 target users / MVP scope / backlog / landing page / pricing / launch plan / content calendar / tasks。
- **技术栈**：Next.js + React + TypeScript（与 research-studio 同栈，但版本/依赖未逐一核对）。
- **成熟度**：v1.0.0，portfolio-ready，已部署 Vercel，含 Stripe 计费、多租户、Auth。
- **关键入口**：`POST /api/generate`，吃 `LaunchLensInput`，产 `LaunchLensWorkspace`。
- **本机状态**：⚠️ **未克隆到本机**。统筹前必须先 `git clone` 到 `C:\Users\22304\ZCodeProject\launchlens-ai`。

---

## 2. 契约差距（合体的核心障碍）

### 2.1 research-studio 的"出口"

综合智能体的输出类型（`src/lib/schema/research-schema.ts:152-163`）：

```typescript
export interface SynthesisOutput {
  agent: "synthesis";
  execSummary: string;
  opportunityScore: number;        // 0-100
  riskScore: number;               // 0-100
  keyInsights: { insight: string; supportingAgents: AgentId[]; confidence: ConfidenceLevel }[];
  topThreeOpportunities: { title: string; description: string; rationale: string }[];
  topThreeRisks: { title: string; description: string; mitigation: string }[];
  recommendedNextStep: string;
  launchlensBrief: string;         // ⚠️ 只是一个纯文本段落
  citations: SourceCitation[];
}
```

**问题所在**：`launchlensBrief` 是 `string`，由综合智能体按提示词生成"a concise, self-contained paragraph a founder could act on"（`src/lib/providers/agent-prompts.ts:252`）。它把上面所有结构化字段**压缩成一段话**，丢失了结构。

导出路径（`src/lib/export/markdown-formatter.ts:227-228`）：把 `launchlensBrief` 包在 markdown `<details>` 里，用户手动复制粘贴。

UI 路径（`src/components/report/sections/SynthesisReport.tsx:156-189`）：一个可展开的 `<pre>` 块 + "Copy brief" 按钮，复制纯文本到剪贴板。

### 2.2 launchlens-ai 的"入口"

输入类型（`src/lib/launchlens/types.ts`，经 GitHub API 核实）：

```typescript
export type LaunchLensInput = {
  idea: string;         // ≥12 字符
  audience: string;
  market: string;
  tone: string;
  constraints: string;  // 每字段 ≤1200 字符
};
```

接收端（`src/app/api/generate/route.ts`）：
- `POST /api/generate`，`runtime = "nodejs"`，`maxDuration = 65`。
- `normalize()` 把请求体映射到 `LaunchLensInput`，非字符串字段静默变 `""`。
- 校验：`idea.length < 12` 拒绝；任一字段 `> 1200` 字符拒绝。
- 速率限制：60s 内 12 次/IP。
- 产出 `LaunchLensWorkspace`（含 summary / targetUsers / pains / mvpScope / backlog / landingPage / pricing / launchPlan / contentCalendar / tasks / assumptions）。

### 2.3 差距总结

| 维度 | research-studio 出口 | launchlens-ai 入口 | 差距 |
|---|---|---|---|
| 格式 | 自由文本段落（`string`） | 结构化五字段对象 | **类型不兼容** |
| 内容 | 压缩后的综述 | 需要分字段（idea/audience/market/tone/constraints） | **结构丢失** |
| 传递方式 | 人肉复制粘贴 | HTTP POST JSON | **无程序对接** |
| 命名 | `launchlensBrief`（research-studio 侧） | `SampleBrief`（launchlens-ai 侧，指内置示例） | **同名不同义** |

---

## 3. 字段映射方案（合体的核心设计）

research-studio 的综合输出 + 各智能体输出，天然能映射到 launchlens-ai 的五字段。以下是建议映射：

### `LaunchLensInput.idea` ← 综合智能体
- **来源**：`SynthesisOutput.execSummary` 的首段，或原始用户查询 `ResearchSession.query`。
- **约束**：≥12 字符（research-studio 的 query 本就满足）。
- **建议**：用 `query`（用户原始意图）+ `execSummary` 拼接，截断到 1200 字符。

### `LaunchLensInput.audience` ← Pain Detective + Channel Scout
- **来源**：`PainDetectiveOutput.userPersonas[]`（persona 名称+描述）+ `ChannelScoutOutput.channels[].audience`。
- **建议**：取前 2-3 个 persona 拼成"Target users: ..."句式。

### `LaunchLensInput.market` ← Market Sizer + Competitor Analyst
- **来源**：`MarketSizerOutput.marketSize`（TAM/SAM/SOM + 增长率）+ `CompetitorAnalystOutput.competitors[]`（前 3 个竞品名）。
- **建议**：`"TAM $X, growing Y%. Key competitors: A, B, C."`

### `LaunchLensInput.tone` ← 无直接来源
- **来源**：无对应智能体。
- **建议**：固定默认值 `"Practical, crisp, and founder-friendly"`（与 launchlens-ai 的 `sample-briefs.ts` 默认一致），或让用户在导出时选择。

### `LaunchLensInput.constraints` ← Pricing Scout + Pain Detective
- **来源**：`PricingScoutOutput.recommendations[]`（定价约束）+ `PainDetectiveOutput.unmetNeeds[]`（前 2 条）+ `SynthesisOutput.topThreeRisks[]`（前 2 条 mitigation）。
- **建议**：拼接为约束陈述，截断到 1200 字符。

> **注意**：每个 `LaunchLensInput` 字段上限 1200 字符，映射时必须截断。research-studio 的智能体输出通常远超此长度。

---

## 4. 合体实施路径（建议分三步）

### 第一步：在 research-studio 增加结构化 brief 导出（本仓库可独立完成）

**目标**：让"出口"从纯文本升级为结构化 JSON，与 `LaunchLensInput` 对齐。

**改动点**：
1. `src/lib/schema/research-schema.ts`：新增 `LaunchLensImportBrief` 接口（结构化五字段 + 元数据），作为 `SynthesisOutput` 的可选附加字段，**不破坏现有 `launchlensBrief: string`**（向后兼容）。
2. 新增 `src/lib/research/brief-mapper.ts`：纯函数 `toLaunchLensInput(session: ResearchSession): LaunchLensInput`，实现第 3 节的映射 + 1200 字符截断。**带单元测试**。
3. `src/app/api/research/[sessionId]/route.ts` 或新增 `/api/research/[sessionId]/brief/route.ts`：`GET` 返回结构化 brief JSON。
4. `src/components/report/sections/SynthesisReport.tsx`：在现有"Copy brief"旁加"Export to launchlens-ai"按钮，下载 JSON 或直接 POST。
5. i18n：新增相关 key 到 4 语种。

**验收**：`brief-mapper.test.ts` 覆盖映射 + 截断 + 空字段回退；tsc/lint/test/build 全绿。

### 第二步：在 launchlens-ai 增加"从 Research Studio 导入"入口（需打开 launchlens-ai 仓库）

**目标**：让"入口"能接收结构化 brief，而非只接受手填表单。

**改动点**（基于 GitHub API 看到的结构，需克隆后核实）：
1. `src/app/page.tsx` 或新增 `/import` 页面：粘贴 JSON / 上传文件 / 输入 research-studio URL。
2. `POST /api/generate` 已能吃 `LaunchLensInput`，无需改后端——只需前端把导入的 JSON 填入表单并提交。
3. 可选：新增 `POST /api/import-from-studio`，接收 research-studio 的 session 快照，内部转成 `LaunchLensInput` 再调 `generateLaunchWorkspace`。

**验收**：从 research-studio 导出的 JSON 能在 launchlens-ai 一键生成 workspace。

### 第三步：深度集成（可选，1+1>2 的增量）

- **共享类型包**：把 `LaunchLensInput` 抽成独立 npm 包或 monorepo workspace 包，两个项目共享，杜绝漂移。
- **直接 API 对接**：research-studio 的"导出到 launchlens-ai"按钮直接 `POST` 到 launchlens-ai 的 `/api/generate`（需处理 CORS / 认证 / 跨域）。
- **回链**：launchlens-ai 的 workspace 里保存 research-studio 的 session 引用，可跳回查看完整情报报告。
- **双向 i18n 对齐**：两项目都支持 en/zh-CN/ja/ko，确保术语一致。

---

## 5. 关键文件索引

### research-studio（本仓库，已核实）
| 文件 | 作用 |
|---|---|
| `src/lib/schema/research-schema.ts:152-163` | `SynthesisOutput` 定义，含 `launchlensBrief: string` |
| `src/lib/providers/agent-prompts.ts:244-254` | 综合智能体提示词，含 brief 生成指令 |
| `src/lib/research/synthesis-parser.ts:39,228` | brief 的解析与展示映射 |
| `src/lib/export/markdown-formatter.ts:227-228` | brief 的 markdown 导出（`<details>` 包裹） |
| `src/components/report/sections/SynthesisReport.tsx:156-189` | brief 的 UI 展示与复制按钮 |
| `src/lib/research/research-engine.ts` | 会话生命周期、智能体编排（5 并行 + 1 综合） |
| `src/lib/research/use-research-studio.ts` | 前端状态 hook（session + transient 拆分） |
| `src/app/api/research/[sessionId]/route.ts` | 会话状态 GET（结构化输出在此返回） |
| `src/app/api/research/runs/[id]/route.ts` | 历史运行详情 GET（含完整 synthesis） |
| `src/lib/i18n/dictionaries.ts` | 4 语种 × 270 键，新增 i18n key 在此 |
| `AGENTS.md` | 6 智能体架构与输出 schema 文档 |
| `docs/ARCHITECTURE.md` | 技术架构详图 |
| `docs/PROVIDERS.md` | LLM / 检索提供方配置文档 |

### launchlens-ai（GitHub，经 API 核实，需克隆后复查）
| 文件 | 作用 |
|---|---|
| `src/lib/launchlens/types.ts` | `LaunchLensInput` / `LaunchLensWorkspace` / `GenerationResult` 类型 |
| `src/app/api/generate/route.ts` | `POST /api/generate`，吃 `LaunchLensInput`，校验 ≥12 字符 / ≤1200 字符 / 60s 12 次限流 |
| `src/lib/launchlens/sample-briefs.ts` | 内置示例 brief（注意：这里的 "brief" 指示例输入，非 research-studio 的 brief） |
| `src/lib/launchlens/provider.ts` | `generateLaunchWorkspace()` 核心生成逻辑 |
| `src/app/page.tsx` | 首页（手填表单入口，导入功能需加在此或新页面） |
| `README.md` / `ARCHITECTURE.md` / `docs/PORTFOLIO_CASE_STUDY.md` | 项目文档 |

---

## 6. 已知约束与风险

1. **字段长度**：launchlens-ai 每字段 ≤1200 字符。research-studio 的智能体输出常超长，映射必须截断，可能丢失细节。建议截断时保留最关键的前 N 条。
2. **`tone` 无来源**：research-studio 没有语气/风格智能体，需固定默认值或加用户选择。
3. **认证/跨域**：若做直接 API 对接（第三步），research-studio → launchlens-ai 的跨域 POST 需处理 CORS；launchlens-ai 有 Auth + 多租户，需决定用匿名生成还是登录态。
4. **两个项目独立部署**：research-studio 是内存存储（无 DB），launchlens-ai 有持久化。深度集成时数据归属要明确。
5. **版本漂移风险**：两项目各自迭代，共享类型若不抽包容易漂移。建议至少在第三步抽共享类型包。
6. **launchlens-ai 的 `maxDuration = 65`**：generate 路由 65s 超时。若 research-studio 的 brief 很长，generate 可能慢，需关注。

---

## 7. 给统筹 agent 的操作建议

1. **先把 launchlens-ai 克隆到本机**：
   ```bash
   cd C:/Users/22304/ZCodeProject
   git clone https://github.com/Zhi-Chao-PAN/launchlens-ai.git
   ```
2. **先做第一步**（research-studio 结构化导出），它独立可验证，不依赖 launchlens-ai。做完后 research-studio 的"出口"就是结构化的，降低后续耦合风险。
3. **再做第二步**（launchlens-ai 导入入口），需要同时打开两个仓库，对照 `LaunchLensInput` 字段。
4. **每步都要跑两边的测试**：research-studio 用 `npm test`（vitest），launchlens-ai 的测试命令需克隆后看 `package.json`。
5. **保留向后兼容**：research-studio 的 `launchlensBrief: string` 不要删，新增结构化字段并存，避免破坏现有导出和测试。
6. **i18n 同步**：research-studio 是 4 语种，launchlens-ai 的语种支持需核实，新增文案要对齐。

---

## 8. research-studio 当前完成度（供统筹参考）

- **真实 LLM**：MiniMax-M3 已端到端验证，输出归一化保证健壮（R209/R210/R214）。
- **RAG 接地**：Tavily 适配器代码就绪（R215），未配 key 时自动回退 mock。
- **可靠性**：每智能体墙钟超时 + 卡死检测（R216）、会话淘汰 + 终端事件（R217）、取消持久化（R212）、SSE 流式 + 重连退避。
- **安全**：CSRF 双提交 + 令牌轮转、admin 令牌分层、bypass-token TTL + 懒过期、env 可调速率限制。
- **运维**：admin 遥测页、6-agent 端到端探针、cron 触发、服务端聚合 stats。
- **UX**：9 页面、命令面板 + 和弦快捷键、ActionableError、批量/定时研究、对比页、4 语种完整。
- **唯一待办**：`TAVILY_API_KEY`（用户提供）和结构化 brief 导出（即本交接文档第一步）。

---

_本文档由 research-studio 维护 agent 于 R229 编写。如有疑问，优先核查代码而非本文档——代码是唯一事实来源。_
