# 下一阶段交接:research-studio 负责(A 上线 + B 出口侧)

> **给 research-studio 负责 agent 的说明**:本文档由跨项目统筹 agent 编写,基于
> 已完成的"结构化 brief 导出"整合(commit `1e3a2aa`,已推送 origin/master)。
> 文档定义你在这个阶段的两个工作流,以及与 launchlens-ai 侧的跨项目契约约束。
> 写于 2026-06-28,对应 research-studio HEAD `1e3a2aa`。
> 代码是唯一事实来源——动手前先读代码核实本文档。

---

## 0. 已完成的整合背景(你必须知道的现状)

上一阶段已实现**结构化 brief 导出**:
- `src/lib/export/brief-mapper.ts`:`toLaunchLensBrief(session)` 纯函数,从 6 个 agent 输出确定性派生 5 字段(`idea/audience/market/tone/constraints`,每字段 ≤1200 字符)
- `src/app/api/research/[sessionId]/brief/route.ts`:GET 端点返回结构化 brief JSON
- `src/components/report/ExportActions.tsx`:"Export LaunchLens brief" 按钮下载 `launchlens-brief-*.json`
- 38 个单元测试(含 Deep fail-closed / poison-token 回归),lint/tsc/2059 测试/build 全绿

launchlens-ai 侧已实现**对应导入**(commit `20fce86`,已推送 origin/main,已生产部署到 `https://launchlens-ai-two.vercel.app`):
- `src/lib/launchlens/brief-from-json.ts`:接受 research-studio 信封 / 裸 LaunchLensInput / 旧式自由文本三种形状
- launch-workspace.tsx 的 "Research Studio" 按钮 + 预览对话框 + setInput

**端到端契约已验证打通**:research-studio 导出的 JSON 能被 launchlens-ai 的 `briefFromJson` 解析并通过其 `isLaunchLensInput` 严格守卫。

当前跨项目流程是**文件级单向桥梁**(下载 JSON → 手动上传),本阶段要把它升级为**一键跳转预填**。

---

## 1. brief 信封契约(跨项目契约,不可单方面改)

research-studio 导出的 brief JSON 形状(`src/lib/export/brief-mapper.ts` 的 `LaunchLensImportBrief`):

```typescript
{
  schemaVersion: "1.0.0",
  source: "launchlens-research-studio",
  exportedAt: "<ISO 8601>",
  sessionId: "<session id>",
  query: "<原始查询>",
  input: {
    idea: string,        // ≤1200 字符,≥12 字符
    audience: string,    // ≤1200 字符
    market: string,      // ≤1200 字符
    tone: string,        // 固定 "Practical, crisp, and founder-friendly"
    constraints: string, // ≤1200 字符
  },
  meta: {
    opportunityScore: number | null,
    riskScore: number | null,
    completedAgents: AgentId[],
    truncated: (keyof LaunchLensInput)[],
  }
}
```

launchlens-ai 的 `briefFromJson` 识别这个信封靠 `source === "launchlens-research-studio"` + `input` 字段存在。**任何对这个形状的改动都必须同步给 launchlens-ai 侧**(通过统筹 agent),否则导入会失败。

---

## 2. 工作流 A:research-studio 上线(本阶段最高优先级,必须先做)

### 为什么最先
没有公网实例,工作流 B 的"跳转预填"就没有可跳的源,launchlens-ai 也无法回链到完整报告。这是整个阶段的地基。

### 核心障碍:serverless 无状态 vs 内存 session

research-studio 当前用**内存 map** 存 session(`src/lib/research/research-engine.ts` 的 `getResearchSession`),并有 disk 持久兜底(`src/lib/research/storage.ts` 的 `getResearchRun`,写本地 fs)。

**问题**:Vercel serverless 函数无状态、无本地 fs。内存 map 在 serverless 下每个请求可能命中不同实例;`getResearchRun` 的本地 fs 在 Vercel 上不可写。

### 第一步:小规模验证(在投入完整改造前先做)

**目标**:确认 serverless 下 session/SSE 是否还工作,决定是否必须接持久层。

**做法**:
1. 在 Vercel 建一个 research-studio 的 preview 项目(先别接生产域名)
2. 配置 `MINIMAX_API_KEY`(已验证的 LLM provider),`TAVILY_API_KEY` 可先不配(会回退 mock)
3. 部署,跑一次完整 6-agent 调研
4. 观察:
   - SSE 流(`src/app/api/research/[sessionId]/stream/route.ts`)能否跨 serverless 实例工作?
   - session 是否在调研进行中丢失?(内存 map 跨实例失效)
   - 完成后 GET `/api/research/[sessionId]` 还能拿到结果吗?(取决于内存是否还在 + disk 兜底是否触发)

**验证结论决定路径**:
- 若 SSE + 内存 session 在 Vercel 上完全失效 → 必须接持久层(见下)
- 若部分工作(如单实例内流式 OK,但跨请求丢 session)→ 接持久层解决跨请求问题
- 若 Vercel 用了长驻实例(Vercel Functions 的 fluid compute)→ 可能内存就够,但仍脆弱

### 第二步:持久层改造(若验证表明必须做)

**推荐方案:Upstash Redis**(research-studio 已有 disk 持久逻辑可参考,Redis 是最小改造;Vercel KV 底层也是 Redis 但绑定 Vercel)。

**改造点**:
1. 新增 `src/lib/research/session-store.ts`:抽象 session 的 get/set/del,实现两个 backend——内存(开发/测试)和 Redis(生产)
2. `research-engine.ts` 的 `getResearchSession` / session map 操作改走 `session-store`
3. `storage.ts` 的 `getResearchRun` disk 持久 → Redis 持久(或保留 disk 作本地开发兜底)
4. SSE 流:若跨实例,流式事件需从 Redis 读 session 状态而非内存
5. 环境变量:`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`(Vercel 集成 Upstash 可一键配)

**注意**:research-studio 的 session 包含完整 agent outputs(可能几十 KB),Redis 存储需考虑 TTL(如 7 天过期)+ 大小。已有 `getResearchRun` 的 disk 持久结构可参考序列化方式。

### 第三步:env 配置 + 域名

- `TAVILY_API_KEY`:交接文档列为唯一待办,配上后 RAG 接地生效(代码就绪,见 R215)
- LLM provider key:MiniMax-M3 已端到端验证
- 域名/子域建议:`research.launchlens.ai`(若要统一品牌)或 `launchlens-research.vercel.app`(Vercel 默认)

### 验收标准
- [ ] 公网 URL 能跑完一次 6-agent 调研(真实 LLM)
- [ ] 调研完成后 GET session + brief 端点都能返回
- [ ] SSE 流式在公网实例工作(或明确降级为轮询并文档化)
- [ ] `TAVILY_API_KEY` 配置后 RAG 接地生效
- [ ] lint/tsc/test/build 全绿

### 风险
- serverless 持久层是本阶段唯一有技术不确定性的点,小规模验证是必须的
- Redis 改造会动到 research-engine 的核心(session 生命周期),需保证现有 1546 测试不破

---

## 3. 工作流 B 出口侧:一键跳转预填(工作流 A 完成后做)

### 跨项目契约:hash fragment 格式(已由统筹 agent 定死)

**跳转目标**:`https://launchlens-ai-two.vercel.app/`(launchlens-ai 生产域名)

**数据通道**:URL hash fragment(不发给服务器,无 CORS,无长度焦虑)

**格式**:
```
https://launchlens-ai-two.vercel.app/#brief=<base64url-encoded-JSON>
```

其中 `<base64url-encoded-JSON>` 是**完整的 brief 信封**(第 1 节的 `LaunchLensImportBrief` 对象)的 `JSON.stringify` 结果,经 `base64url` 编码(URL 安全的 base64:`+`→`-`,`/`→`_`,去掉 `=` 填充)。

**为什么用信封而非裸 input**:信封带 `source` + `schemaVersion` + `sessionId`,launchlens-ai 侧能识别来源、做版本迁移、未来支持回链。

**为什么 base64url 而非普通 base64**:URL fragment 里有 `+`/`/`/`=` 会被某些浏览器/中间件错误处理,base64url 是 URL 安全的。

### research-studio 侧实现

在 `src/components/report/ExportActions.tsx` 的 "Export LaunchLens brief" 按钮旁(或替换其二次动作),增加一个 **"Send to LaunchLens AI"** 按钮:

1. 调用 `toLaunchLensBrief(session)` 得到信封(已有逻辑,见 `handleExportLaunchLens`)
2. `JSON.stringify(brief)` → base64url 编码
3. 构造 URL:`https://launchlens-ai-two.vercel.app/#brief=<encoded>`
4. `window.open(url, "_blank")` 或 `window.location.href = url`(新标签页更好,保留 research-studio 报告)

**base64url 编码**:浏览器端用 `btoa(encodeURIComponent(...))` 处理 UTF-8,或用 `TextEncoder` + 手动 base64url。注意 brief 含中文/特殊字符时必须正确处理 UTF-8。

**launchlens-ai 生产域名可配置**:不要硬编码,建议加 env `NEXT_PUBLIC_LAUNCHLENS_AI_URL`(默认 `https://launchlens-ai-two.vercel.app`),方便未来换域名。

### 兜底
保留现有 "Export LaunchLens brief (.json)" 下载按钮作为离线/手动兜底(用户可下载文件再上传)。跳转按钮是主路径,下载是备选。

### 验收标准
- [ ] 在公网 research-studio 完成调研 → 点 "Send to LaunchLens AI"
- [ ] 浏览器跳转到 launchlens-ai,表单自动填好 5 字段
- [ ] 含中文/特殊字符的 brief 跳转后字段正确无误
- [ ] 保留下载按钮兜底
- [ ] lint/tsc/test/build 全绿

---

## 4. 与 launchlens-ai 侧的协作边界

| 工作 | 谁负责 |
|---|---|
| brief 信封形状定义 | 已定死(第 1 节),任何改动通过统筹 agent 同步 |
| hash fragment 格式 | 已定死(第 3 节),launchlens-ai 侧按此解析 |
| research-studio 上线 + 跳转按钮 | **你** |
| launchlens-ai 的 hash 解析 + setInput | launchlens-ai agent(已按本契约实现) |
| launchlens-ai 的 workspace 溯源回链 | launchlens-ai agent(工作流 C) |
| 端到端集成验证 | 统筹 agent(你两边都跑完后) |

**顺序约束**:工作流 A(上线)必须先完成,因为 B 的跳转需要公网源 URL。B 的出口侧(你的按钮)和 launchlens-ai 的入口侧可并行,但必须都遵守第 3 节的 hash 契约。

---

## 5. 关键文件索引(已核实)

| 文件 | 作用 |
|---|---|
| `src/lib/export/brief-mapper.ts` | `toLaunchLensBrief()` 纯函数 + `serializeBrief()` |
| `src/lib/export/brief-mapper.test.ts` | 38 个测试(含 Deep fail-closed / poison-token 回归),改 mapper 后必须保持全绿 |
| `src/app/api/research/[sessionId]/brief/route.ts` | brief GET 端点 |
| `src/components/report/ExportActions.tsx` | 导出/跳转按钮所在,见 `handleExportLaunchLens` |
| `src/lib/research/research-engine.ts` | session 生命周期 + agent 编排(工作流 A 改造重点) |
| `src/lib/research/storage.ts` | disk 持久(工作流 A Redis 改造参考) |
| `src/app/api/research/[sessionId]/stream/route.ts` | SSE 流(工作流 A serverless 验证重点) |
| `docs/HANDOFF-FOR-INTEGRATION.md` | 上一任 agent 写的整合背景,含完整架构说明 |
| `CONTRIBUTING.md` | 工程约束(schema 是单一事实源、测试必需、Conventional Commits) |

---

## 6. 验证清单(提交前必跑)

```bash
npm run lint && npx tsc --noEmit && npm test && npm run build
```

四道全绿才能提交。提交信息用 Conventional Commits,如:
- `feat(deploy): add Vercel deployment with Upstash Redis session store`
- `feat(export): add one-click send-to-launchlens-ai via hash fragment`

---

_本文档由跨项目统筹 agent 于 2026-06-28 编写。如有疑问,优先核查代码——代码是唯一事实来源。_
