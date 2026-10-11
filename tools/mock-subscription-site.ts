/**
 * 本地「模拟订阅站」—— 用于联调账号密码型数据源，无需真实订阅账号。
 *
 * 启动：npm run mock-site      （默认端口 4100）
 *
 * 它刻意模拟真实订阅站的两个特征，用来验证适配器的健壮性：
 *   1. 必须先登录（POST /api/login 换 Cookie + Token），否则列表接口返回 401；
 *   2. 字段名与系统字段**完全不同**（news_title / hot_index / publish_ts …），
 *      用来验证 config/data-sources.json 里的 fieldMap 字段映射是否真的生效；
 *   3. 热度返回 "186.2万" 这类中文文本、时间返回 13 位毫秒时间戳，
 *      用来验证 parseHeat / toIso 的兼容处理。
 *
 * 同时提供 HTML 版本（/hot），用于验证 CSS 选择器抓取路径。
 */
import express from 'express';
import { DEMO_EVENTS } from '../server/pipeline/demo-events.js';
import { snapToTradingDay } from '../server/pipeline/trading-calendar.js';

const PORT = Number(process.env.MOCK_SITE_PORT ?? 4100);

const USERNAME = process.env.MOCK_SITE_USER ?? 'demo';
const PASSWORD = process.env.MOCK_SITE_PASS ?? 'demo123';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/** 会话表：sid -> username */
const sessions = new Map<string, string>();

/** 把内置演示事件伪装成"订阅站自己的字段格式" */
function toSiteEvent(e: (typeof DEMO_EVENTS)[number], idx: number) {
  // 真实行情站只在交易日发布，这里同样吸附到最近交易日，
  // 否则周末联调时条目会全部落在非交易日、被交易日窗口过滤掉
  const publishTs = snapToTradingDay(Date.now() - e.hoursAgo * 3600_000);
  return {
    news_title: e.title,
    news_digest: e.summary,
    news_body: e.content,
    news_url: e.url,
    publish_ts: publishTs, // 13 位毫秒时间戳
    hot_index: e.heat >= 10000 ? `${(e.heat / 10000).toFixed(1)}万` : String(e.heat), // 中文热度文本
    industry_tags: (e.sectors ?? []).join('|'), // 竖线分隔的字符串
    rel_stocks: (e.stocks ?? []).join('、'), // 顿号分隔的字符串
    sector_pct: e.marketChange,
    rank_no: idx + 1,
  };
}

/* ---------------- 登录 ---------------- */

app.post('/api/login', (req, res) => {
  const { username, password } = req.body ?? {};
  if (username !== USERNAME || password !== PASSWORD) {
    console.log(`[mock-site] 登录失败：${username}`);
    return res.status(401).json({ code: 401, msg: '账号或密码错误' });
  }
  const sid = `sid_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  sessions.set(sid, String(username));
  console.log(`[mock-site] 登录成功：${username} → ${sid}`);
  res.setHeader('Set-Cookie', `SID=${sid}; Path=/; HttpOnly`);
  res.json({
    code: 0,
    msg: 'ok',
    data: { token: `tk_${sid}`, userName: username, expireIn: 7200 },
  });
});

/* ---------------- 鉴权中间件 ---------------- */

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const cookie = String(req.headers.cookie ?? '');
  const sid = /SID=([^;]+)/.exec(cookie)?.[1];
  const bearer = /^Bearer\s+(.+)$/.exec(String(req.headers.authorization ?? ''))?.[1];
  const tokenSid = bearer?.replace(/^tk_/, '');

  if ((sid && sessions.has(sid)) || (tokenSid && sessions.has(tokenSid))) {
    return next();
  }
  console.log('[mock-site] 未授权访问被拒绝');
  return res.status(401).json({ code: 401, msg: '未登录或登录已过期' });
}

/* ---------------- 热点列表（JSON） ---------------- */

app.get('/api/hot', requireAuth, (req, res) => {
  const date = String(req.query.date ?? new Date().toISOString().slice(0, 10));
  const limit = Number(req.query.limit ?? 50);
  const list = DEMO_EVENTS.slice(0, limit).map(toSiteEvent);
  console.log(`[mock-site] 返回 ${list.length} 条热点（date=${date}）`);
  res.json({
    code: 0,
    msg: 'ok',
    data: {
      date,
      total: list.length,
      list,
    },
  });
});

/* ---------------- 热点列表（HTML，验证 CSS 选择器抓取） ---------------- */

app.get('/hot', requireAuth, (req, res) => {
  const items = DEMO_EVENTS.map(
    (e) => `
    <li class="news-item">
      <a class="title" href="${e.url ?? '#'}">${e.title}</a>
      <p class="digest">${e.summary ?? ''}</p>
      <span class="time">${new Date(snapToTradingDay(Date.now() - e.hoursAgo * 3600_000)).toISOString()}</span>
      <span class="hot">${(e.heat / 10000).toFixed(1)}万</span>
    </li>`,
  ).join('');
  res.type('html').send(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>热点列表</title></head>
<body><h1>今日热点</h1><ul class="news-list">${items}</ul></body></html>`);
});

/* ---------------- 首页 ---------------- */

app.get('/', (_req, res) => {
  res.type('html').send(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>模拟订阅站</title></head><body style="font-family:system-ui;padding:40px;line-height:1.9">
<h1>模拟订阅站（联调专用）</h1>
<p>账号：<code>${USERNAME}</code>　密码：<code>${PASSWORD}</code></p>
<ul>
  <li>POST <code>/api/login</code> —— 登录，返回 Cookie + Token</li>
  <li>GET <code>/api/hot?date=YYYY-MM-DD</code> —— 热点列表（JSON，需登录）</li>
  <li>GET <code>/hot</code> —— 热点列表（HTML，需登录，用于选择器抓取）</li>
</ul>
<p>当前在线会话数：${sessions.size}</p>
</body></html>`);
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`
  ◉ 模拟订阅站已启动
  ────────────────────────────────────────────
  地址    : http://127.0.0.1:${PORT}
  账号    : ${USERNAME} / ${PASSWORD}
  接口    : POST /api/login · GET /api/hot · GET /hot
  ────────────────────────────────────────────
  在「数据源配置」中把地址指向本服务即可联调账号密码型数据源。
  `);
});
