[English](./README.en.md) | **简体中文**

# 产业链侦察兵 · 券商营销文案自动化生产 Agent

![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

> 把「每日金融市场热点」自动变成**客户经理可直接转发的日报文案 + App 首页 Banner**。
> 一条命令完成 `抓取 → 筛选 → 改写 → 配图`，全部环节可在界面上配置，无需改代码。

> **关于语言** —— 产品界面与生成的营销文案是中文的，因为目标用户是国内券商的客户经理。
> 文档提供中英双语：`docs/` 下每份文档都有对应的英文版（`*.en.md`），
> 英文入口见 [English README](README.en.md)。

---

## 目录

- [项目简介](#项目简介)
- [效果预览](#效果预览)
- [核心功能](#核心功能)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [使用说明](#使用说明)
- [项目结构](#项目结构)
- [关键设计](#关键设计)
- [配置说明](#配置说明)
- [API 一览](#api-一览)
- [二次开发](#二次开发)
- [常见问题](#常见问题)
- [合规提示](#合规提示)
- [License](#license)

---

## 项目简介

券商客户经理每天都要给客户发市场资讯，手工做这件事有三个痛点：

1. **选不出重点** —— 每天几百条资讯，人工判断哪一条最值得推给客户，耗时且标准不统一；
2. **写不好话术** —— 把一条政策新闻改写成客户看得懂、又不违规的营销文案，需要专业能力；
3. **配图麻烦** —— App 首页投放图要按品牌规范做，设计排期长。

本项目把这条链路自动化，并提供一个**面向客户经理、而非面向研发**的工作台：
打开页面只需要做一件事 —— 点「生成今日日报」，然后复制文案发给客户。

### 设计取向

| 取舍 | 说明 |
|------|------|
| **配置驱动，而非硬编码** | 数据源、筛选规则、文案模板、品牌视觉全部是 JSON 配置，界面上可直接改，新增数据源不用动代码 |
| **模板化渲染，而非 AI 文生图** | 金融物料对文字准确性要求极高，AI 生图容易把中文标题画错；Banner 用 SVG 模板渲染，文字 100% 准确 |
| **默认不依赖大模型** | 规则引擎 + 产业链知识库即可完整跑通；大模型润色是可选增强，调用失败自动回退 |
| **合规优先** | 模板不含「客户行动建议 / 配置思路」类字段，界面内置合规自检，只做事件解读与产业链梳理 |

---

## 效果预览

**① 今日工作台（结果态）** —— 头号事件 + 可直接转发的客户文案 + 配套 App 首页图。
流水线内部机制（9 步流程、五维打分）收进折叠区，首屏只放「能发给客户的东西」：

![侦察兵工作台](docs/images/01-侦察兵工作台.png)

**② 今日工作台（空态）** —— 全页只有一个主操作，数据源/模板/AI 润色降级为安静的「生成设置」：

![工作台空态](docs/images/06-工作台空态.png)

**③ 历史记录** —— 点击任意一条可重新载入工作台，含文案与 Banner：

![历史记录](docs/images/07-历史记录.png)

**④ 筛选规则** —— 五维权重滑块、硬性阈值、「最近 N 个交易日」窗口、加减分关键词；
顶部实时显示 A 股交易日历状态（今天是否交易日、最近交易日、当前设置会保留哪几天）：

![筛选规则](docs/images/02-筛选规则配置.png)

**⑤ 数据源配置** —— 三类适配器统一管理，含品牌视觉配置：

![数据源配置](docs/images/08-数据源配置.png)

**⑥ 文案模板管理** —— 模板正文、变量检测、内容字段全部可视化编辑：

![文案模板管理](docs/images/05-文案模板管理.png)

**⑦ 导出的单文件日报** —— 自包含 HTML，可直接发邮件 / 微信：

![日报单文件导出](docs/images/03-日报单文件导出.png)

**⑧ 自动生成的 App 首页 Banner**：

![Banner 样例](docs/images/04-Banner样例.png)

> 工作台的完整设计推导（用户画像、6 条设计判断、视觉规范、响应式规则）见
> [工作台设计说明](docs/design/工作台设计说明.md)，可交互原型见 [工作台设计稿](docs/design/工作台设计稿.html)。

---

## 核心功能

### ① 多形态数据源适配器

**新增数据源只需加一条 JSON，不用改代码。** 支持三类适配器：

| 类型 | 适用场景 |
|------|----------|
| `http-login` | 已订阅的资讯站：登录换取 Cookie/Token → 拉取列表（JSON 接口或 HTML 抓取） |
| `rss` | 公开财经 RSS 源 |
| `mock` | 内置演示数据（克隆后即可跑通） |

`http-login` 的完整能力：

| 能力 | 配置项 | 说明 |
|------|--------|------|
| 登录方式 | `loginMethod` / `loginContentType` | `application/json`、`x-www-form-urlencoded`、`multipart/form-data` |
| 登录校验 | `successCodePath` / `successCode` / `messagePath` | 部分站点把业务错误码放在 HTTP 200 响应体里（如 `retCode:"000"`），需显式校验 |
| 鉴权方式 | `authMode` | `cookie`（自动收集 `Set-Cookie`）、`bearer`、`header`（Token 原样放入 `Authorization`） |
| 列表解析 | `parser.kind` | `json` 或 `html`（CSS 选择器） |
| **嵌套结构** | `sectorListPath` / `securityListPath` / `etfListPath` | 适配「事件 → 板块 → 个股/ETF」这类专业订阅源 |
| **派生字段** | `parser.derive` | 源没有的字段（如热度）可由涨跌幅折算；可用现成的板块说明生成摘要/正文 |
| **响应缓存** | `cache.ttlMinutes` | TTL 内复用本地快照，**命中缓存时连登录都跳过**，不会反复请求真实站点 |

### ② 五维加权打分与交易日窗口

**五维加权打分模型**，每维先独立打 0–100 分，再按权重加权汇总，最后叠加关键词加减分：

| 维度 | 默认权重 | 打分依据 |
|------|----------|----------|
| 市场影响力 | 38% | 热度（无原生热度时由板块涨跌幅折算）+ 相关板块涨跌幅 |
| 行业覆盖面 | 12% | 牵动行业数量 + 是否覆盖上/中/下游 |
| 时效性 | 26% | 半衰期衰减；**当日发布的条目额外加成**，确保优先当天热点 |
| 政策关联度 | 14% | 命中部委/规划/会议等政策词的数量 |
| 客户相关性 | 10% | 是否命中零售客户关注的热门赛道（模糊包含匹配） |

筛选窗口按 **A 股交易日**计算（默认「最近 2 个交易日」），而非「距今多少小时」——
细节见 [关键设计 · 为什么用交易日历](#-为什么筛选窗口用交易日历而不是小时)。

### ③ 文案模板引擎

- 内置 3 套模板：**日报标准版**、**快讯短版**、**深度长图文版**
- 支持 `{{变量}}` 插值、`{{#each 数组}}` 循环、`{{#if 变量}}` 条件
- 每个模板声明自己的 `fields`（需要产出哪些内容字段、字数上限、写作要求）
- 界面支持增删模板、增删字段、变量检测、**用最近一次事件实时预览**

### ④ Banner 自动生成

- **模板化矢量渲染**：品牌栏 + 头号事件 + 行业标签 + 产业链三栏 + 合规免责栏
- 尺寸、配色、字体、Slogan、免责声明全部来自 `config/brand.json`
- 输出 SVG（矢量、任意分辨率清晰），可选转 PNG
- 折行按**显示宽度**估算并禁止在 ASCII 串中间断行，避免出现「超12 00亿美元」这类断词

---

## 技术栈

| 层 | 选型 |
|----|------|
| 后端 | Node.js 18+ · Express · TypeScript |
| 前端 | React 18 · Vite · TypeScript · TDesign React · Tailwind CSS |
| 数据 | better-sqlite3（可选，缺失时自动降级为 JSON 文件存储） |
| 出图 | 自研 SVG 模板渲染 + sharp（可选转 PNG） |
| AI（可选） | CodeBuddy Agent SDK |

---

## 快速开始

**环境要求**：Node.js 18+（建议 20/22）、npm。

```bash
# 1. 安装依赖
npm ci            # 按 package-lock.json 精确还原（推荐）
# npm install     # 首次接触或需要升级依赖时用这个

# 2. 启动开发服务（后端 3000 + 前端 5173）
npm run dev
```

打开 <http://localhost:5173>，**默认使用「内置演示数据源」，克隆后即可点「生成今日日报」看到完整效果**，无需任何账号。

> ⏱ **首次安装约需 5–10 分钟**：`better-sqlite3` 与 `sharp` 含原生模块，需要本机编译。
> 缺少编译工具链时不必担心 —— 两者都有降级路径（见下方 [容错设计](#-容错设计)）。

> 想接入自己的订阅站？见 [配置说明 · 接入真实数据源](#接入真实数据源)。

### 单进程部署（生产）

```bash
npm run build     # 类型检查 + 前端生产构建，产物在 dist/
npm run server    # 后端自动托管 dist/，直接访问 http://localhost:3000
```

> 首次启动约需 10–20 秒（加载 cheerio、探测 SQLite 原生模块），属正常现象。

### 运行测试

```bash
npm test                  # 交易日历 + 交易日窗口过滤的回归测试
npm run typecheck         # 前后端类型检查
```

### 持续集成

每次 push / PR 会自动执行 `npm ci → 类型检查 → 回归测试 → 生产构建 → 流水线冒烟测试`，
并在 **Node 20 / 22** 双版本矩阵上验证（对应上方 CI 徽章）。
配置见 [`.github/workflows/ci.yml`](.github/workflows/ci.yml)。

---

## 使用说明

### 工作台（日常出稿）

打开首页就是工作台，日常只需要三步：

1. **点「生成今日日报」** —— 实时走完「抓取资讯 → 筛选热点 → 撰写文案 → 生成配图」四个阶段；
2. **看结果** —— 头号事件卡片在上，下面是客户会收到的完整文案（企微气泡样式），最下面是配套 Banner；
3. **拿走用** —— 「复制文案，发给客户」；侧栏可「导出单文件日报」或「换成快讯版」。

顶栏还有**历史记录**（点任意一条重新载入工作台）与**生成设置**（切换数据源 / 模板 / 大模型润色）。

### 五个页面

| 地址 | 页面 | 用途 |
|------|------|------|
| `/` | 今日工作台 | 日常出稿 |
| `/sources` | 数据源配置 | 管理订阅站、品牌视觉 |
| `/rules` | 筛选规则 | 五维权重、交易日窗口、关键词 |
| `/templates` | 文案模板 | 编辑模板正文与内容字段 |
| `/agent` | Agent 对话 | 会话式交互 |

### 命令行（接入定时任务）

```bash
npm run pipeline                                  # 跑一次完整流水线
npm run pipeline -- --llm                         # 开启大模型润色
npm run pipeline -- --template scout-deep         # 指定模板
npm run pipeline -- --source demo-builtin --topN 3
npm run report                                    # 额外导出自包含 HTML 日报到 output/
```

产物落在 `server/data/`：运行记录 `runs/*.json`、Banner `banners/*.svg|png`、数据源响应缓存 `cache/*.json`。

每日 7:30 自动产出的 crontab 示例：

```cron
30 7 * * 1-5 cd /path/to/project && npm run report >> /var/log/scout.log 2>&1
```

### 本地联调（没有真实订阅账号时）

```bash
npm run mock-site                                 # 启动模拟订阅站（端口 4100）
npm run pipeline -- --source local-mock-site      # 走「账号密码登录 + JSON 接口」链路
npm run pipeline -- --source local-mock-site-html # 走「CSS 选择器抓取」链路
```

模拟站刻意模拟真实订阅站的两个特征：**必须先登录**、**字段名与系统字段完全不同**
（`news_title` / `hot_index` / `publish_ts`），用来验证字段映射与登录链路是否真的生效。

---

## 项目结构

```
├── config/                        ★ 业务配置（改这里，不用改代码）
│   ├── data-sources.json              ① 数据源
│   ├── filter-rules.json              ② 筛选规则
│   ├── templates.json                 ③ 文案模板
│   ├── brand.json                     ④ 品牌视觉
│   └── trading-calendar.json          A 股交易日历（由 npm run build:calendar 生成）
│
├── server/
│   ├── index.ts                   Express + SSE 服务入口
│   ├── api.ts                     业务 REST API：/api/scout/*
│   ├── cli.ts                     命令行入口（可接 cron）
│   ├── export-report.ts           命令行导出单文件 HTML 日报
│   └── pipeline/
│       ├── env.ts                 .env 加载 + ${VAR} 密钥解析
│       ├── fetchers.ts            数据源适配器（登录 / 嵌套映射 / 派生 / 缓存）
│       ├── normalize.ts           标准化与清洗
│       ├── trading-calendar.ts    A 股交易日历（交易日判定 / 最近交易日 / 滞后检测）
│       ├── scorer.ts              去重 + 交易日窗口过滤 + 五维打分 + 排序
│       ├── writer.ts              模板引擎 + 规则引擎字段生成
│       ├── llm.ts                 大模型润色（可选）
│       ├── banner.ts              Banner 生成
│       ├── export-html.ts         单文件 HTML 日报模板（CLI 与 API 共用）
│       ├── knowledge.ts           产业链 & 个股知识库
│       └── run.ts                 流水线编排
│
├── src/
│   ├── App.tsx                    应用外壳（桌面左侧导航 / 移动底部标签栏）
│   ├── api/scout.ts               业务 API 客户端
│   ├── components/scout/
│   │   ├── atoms.tsx              设计系统原子（Chip / Card / Fold / ScoreRing…）
│   │   └── HistoryDrawer.tsx      历史记录抽屉
│   └── pages/
│       ├── ScoutDashboard.tsx     ① 今日工作台（空态 / 生成中 / 结果态）
│       ├── SourcesPage.tsx        ② 数据源配置 + 品牌视觉
│       ├── RulesPage.tsx          ③ 筛选规则
│       ├── TemplatesPage.tsx      ④ 文案模板
│       └── AgentPage.tsx          Agent 对话
│
├── tools/
│   ├── mock-subscription-site.ts  本地模拟订阅站（联调账号密码链路）
│   ├── build-trading-calendar.ts  生成 A 股交易日历
│   └── test-trading-*.ts          回归测试
│
└── docs/                          设计文档与截图
    ├── 01-开源选型评估.md             选型对比与取舍
    ├── 01-open-source-evaluation.en.md        └ 英文版
    ├── 02-架构与二次开发.md          架构说明与扩展指南
    ├── 02-architecture-and-development.en.md  └ 英文版
    ├── design/                     工作台设计说明 + 可交互原型
    └── images/                     README 用到的截图
```

> 文档为中英双语：每份中文文档都有对应的英文版（`.en.md`，文件名为 ASCII 便于分享）。

---

## 关键设计

### 🎯 为什么筛选窗口用交易日历，而不是小时

这是开发中**真实踩过的一个坑**。

数据源的日期字段是 **UTC 零点**（= 北京时间 08:00）。若按「48 小时」硬切，周五 08:00 的条目
到周日 08:00 就过期了 —— 于是**周六下午起、整个周日、周一早晨都会产出为空**，
而周一早晨正是客户经理准备当日内容的关键时点。

改为按 **A 股交易日**切之后，规则变成：

> **交易日 = 周一至周五 且 非法定节假日**

⚠️ 有个容易搞错的细节：调休「**补班**」的周末（把周六/周日调成工作日）**股市不交易**，
所以不能用「工作日」判断，必须以法定节假日为准。
这一点已用真实行情数据交叉验证 —— 补班的 2026-09-20（周日）、2026-10-10（周六）确实没有数据。

另外两个细节：

- **窗口基准日是「数据源中最新一条所在的交易日」，而不是「今天」**。
  交易日上午（尤其周一 7:30）当日数据尚未产生，若以今天为基准，窗口会退化成只剩 1 天。
- **滞后保护**：允许数据源滞后 1 个交易日（覆盖「今天数据还没发布」），
  但连续漏掉 2 个交易日就判定为停更并报错，避免静默输出过期内容。

交易日历数据在 `config/trading-calendar.json`，由 `npm run build:calendar` 从国务院节假日安排生成。

### 🔌 适配器如何做到「加一条 JSON 就接入新数据源」

把「登录 → 鉴权 → 取列表 → 字段映射」抽象成配置项，而不是为每个站点写一个类：

- 登录请求体、URL 支持 `{{date}}` / `{{username}}` / `{{password}}` / `{{timestamp}}` 占位符
- 字段映射用 JSON 路径（`data.list`、`sectorList[].securityList` 这类嵌套结构也能表达）
- 源里没有的字段可以**派生**（如用板块涨跌幅折算热度）
- 响应可缓存，开发调试不会反复打扰真实站点

### 🔒 凭据不进仓库

`credentials` 支持 `${ENV_VAR}` 形式，真实账号密码放在 `.env`（已被 `.gitignore` 忽略），
`config/data-sources.json` 里只留占位符。数据源 URL 同样使用示例域名。

### 🧮 满分触顶时如何保持排序稳定

总分展示时裁剪到 0–100，但内部保留未裁剪的**原始分**并据此排序，
因此多个事件同时触顶 100 时仍能保持稳定次序（界面上显示为 `100+`，悬停可看原始分）。

### ♿ 容错设计

| 事项 | 处理方式 |
|------|----------|
| SQLite 原生模块加载失败 | 自动降级为 JSON 文件存储，功能不受影响 |
| 未配置大模型 API Key | 按需动态加载，文案由规则引擎生成（运行记录标注 `llmEnhanced: false`） |
| PNG 转换失败（缺 sharp） | 降级为仅输出 SVG |
| 数据源停更 | 按交易日判定并报错，不静默输出过期内容 |

---

## 配置说明

### 接入真实数据源

仓库默认使用内置演示源，开箱即用。接入你自己的订阅站分三步：

**① 填凭据** —— 复制 `.env.example` 为 `.env`，填入账号密码：

```bash
cp .env.example .env
# 编辑 .env：
#   ZEN_USER=你的账号
#   ZEN_PASS=你的密码
```

**② 改配置** —— 编辑 `config/data-sources.json` 里的 `subscribed-portal`：

```jsonc
{
  "id": "subscribed-portal",
  "enabled": true,                              // 改成 true
  "config": {
    "loginUrl": "https://api.your-site.com/login",   // 换成真实地址
    "listUrl":  "https://api.your-site.com/hot?page=1&size=50",
    "credentials": {
      "username": "${ZEN_USER}",                // 保持占位符，不要写明文
      "password": "${ZEN_PASS}"
    }
  }
}
```

**③ 设为默认** —— 把顶层 `activeSourceId` 改成 `"subscribed-portal"`，
或直接在界面的「数据源配置」页点「设为默认数据源」。

**调试技巧**：先只填 `loginUrl` + `listUrl`，跑一次 `npm run pipeline`，
看日志里的 `登录成功` 与 `订阅源返回 N 条事件`，再逐步补字段映射。

### 调整打分与筛选

**改权重/阈值**：直接在「筛选规则」页拖滑块，或改 `config/filter-rules.json`。

> 换数据源后建议**重新校准权重**。校准方法：跑一次 `npm run pipeline`，
> 看 `server/data/runs/*.json` 里 `candidates[].breakdown` 各维度的取值分布。
> 若某维度几乎所有事件都取同一个值，说明它在这个源上没有区分度，应当降权或调整
> `params` 里的天花板值（如 `heatCeiling`、`changeCeiling`）。

### 维护交易日历

```bash
npm run build:calendar    # 次年放假安排公布后（通常 11–12 月）执行
```

未覆盖的年份会退化为「周一至周五均为交易日」，界面与 `GET /api/scout/calendar` 会显示当前覆盖年份。

### 开启大模型润色（可选）

```bash
# 在 .env 中配置 CODEBUDDY_API_KEY
```

或在界面工作台打开「大模型润色」开关。调用失败或超时会**自动回退**到规则引擎结果，不影响主流程。

---

## API 一览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/scout/meta` | 一次性拉取全部配置 |
| GET/PUT | `/api/scout/config/:name` | 读写 `brand` / `sources` / `rules` / `templates` |
| POST | `/api/scout/run` | 同步执行一次流水线 |
| GET | `/api/scout/run/stream` | **SSE 流式执行**，实时推送每一步进度 |
| GET | `/api/scout/calendar` | A 股交易日历状态（今天是否交易日、最近交易日） |
| GET | `/api/scout/runs` | 运行记录列表 |
| GET | `/api/scout/runs/:id` | 单次运行详情 |
| GET | `/api/scout/export/:id` | **导出单文件 HTML 日报**（内联 Banner） |
| POST | `/api/scout/recompose` | 用同一事件换模板重新生成文案 |
| GET | `/api/scout/banners/:file` | Banner 静态资源 |

---

## 二次开发

详细的架构说明与扩展指南见 **[docs/02-架构与二次开发.md](docs/02-架构与二次开发.md)**，覆盖：

- 新增一个数据源类型
- 新增一个打分维度
- 新增/修改文案模板
- 调整 Banner 版式
- 接入合规词库

另外可参考 [docs/01-开源选型评估.md](docs/01-开源选型评估.md)（选型对比与取舍）。

---

## 常见问题

<details>
<summary><b>启动后页面打不开 / 一直加载</b></summary>

后端首次启动需 10–20 秒（加载 cheerio、探测 SQLite 原生模块）。若用脚本探活，请把等待时间设到 20 秒以上。
</details>

<details>
<summary><b>提示「筛选后无可用内容」</b></summary>

最常见的原因是**数据源未更新**（如周末、法定节假日休市）。
系统会明确报出「数据源最新一条为 X，落后最近交易日 Y 共 N 个交易日」便于定位。

若处于休市期间，这属正常现象；否则请检查数据源是否正常。
</details>

<details>
<summary><b>`better-sqlite3` 编译失败</b></summary>

需要本机编译工具链。缺少时执行 `xcode-select --install && npm rebuild better-sqlite3`；
或直接忽略 —— 系统会自动降级为 JSON 文件存储，功能不受影响。
</details>

<details>
<summary><b>Banner 没有生成 PNG</b></summary>

PNG 转换依赖 `sharp`，失败时自动降级为仅输出 SVG（矢量图，任意分辨率清晰）。
</details>

<details>
<summary><b>如何换成自己的品牌？</b></summary>

编辑 `config/brand.json`（品牌名、Slogan、配色、尺寸、免责声明），
或在界面「数据源配置」页底部的品牌视觉区域修改。全站主题色由 `src/index.css` 里的
TDesign 变量统一控制。
</details>

---

## 合规提示

生成的文案与 Banner 均包含免责声明。**正式使用前请接入公司合规词库做二次校验**，并确认：

- **不包含投资建议**：模板已移除「客户行动建议 / 配置思路」类内容，
  不出现买卖时机、仓位比例、止盈止损等表述，只做事件解读与产业链梳理；
- 不承诺收益、不使用「必涨 / 稳赚 / 保本」等表述；
- 涉及个股的内容需符合投顾业务规范（「受益方向」仅陈述产业链关系与当日行情，不含推荐语气）；
- Banner 投放需经品牌与合规部门审核。

> 本仓库中的数据源、品牌名、账号密码均为**示例占位值**，请替换为你自己的配置。
> 演示数据仅用于功能验证，不代表任何真实市场观点。

---

## License

[MIT](LICENSE)

---

<sub>本项目为个人作品集项目，用于展示 AI 辅助的内容生产流水线设计。非任何机构的官方产品。</sub>
