/**
 * 数据源适配器层。
 * 支持三种类型：
 *   - mock       : 内置演示数据
 *   - http-login : 已订阅的资讯站，先用账号密码登录换取 Cookie/Token，再拉取热点列表（JSON 或 HTML）
 *   - rss        : 标准 RSS/Atom 源
 * 新增数据源只需在 config/data-sources.json 增加一条配置，无需改代码。
 */
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import type { DataSource, RawEvent, SecurityDetail, SectorDetail } from './types.js';
import { DEMO_EVENTS } from './demo-events.js';
import { CACHE_DIR } from './store.js';
import { resolveSecret } from './env.js';
import { snapToTradingDay } from './trading-calendar.js';

export interface FetchContext {
  /** 目标日期 YYYY-MM-DD */
  date: string;
  log: (msg: string) => void;
}

export interface FetchResult {
  events: RawEvent[];
  /** 实际请求的地址，便于排查 */
  requestUrl?: string;
  /** 附加说明（如降级原因） */
  note?: string;
}

/* ------------------------------------------------------------------ */
/* 工具函数                                                             */
/* ------------------------------------------------------------------ */

/** 把 {{key}} 占位符替换为上下文中的值 */
function interpolate<T>(input: T, ctx: Record<string, string>): T {
  if (typeof input === 'string') {
    return input.replace(/\{\{(\w+)\}\}/g, (_m, k) => ctx[k] ?? '') as unknown as T;
  }
  if (Array.isArray(input)) {
    return input.map((v) => interpolate(v, ctx)) as unknown as T;
  }
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = interpolate(v, ctx);
    }
    return out as unknown as T;
  }
  return input;
}

/** 解析 "128.6万" / "1,234" / "12.3w" 之类的中文热度文本 */
export function parseHeat(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return 0;
  const s = value.replace(/,/g, '').trim();
  const m = s.match(/([\d.]+)\s*(万|w|W|亿)?/);
  if (!m) return 0;
  const num = parseFloat(m[1]);
  if (Number.isNaN(num)) return 0;
  const unit = m[2];
  if (unit === '万' || unit === 'w' || unit === 'W') return Math.round(num * 10_000);
  if (unit === '亿') return Math.round(num * 100_000_000);
  return Math.round(num);
}

/** 从对象里按 "a.b.c" 路径取值 */
function pick(obj: unknown, pathStr: string): unknown {
  if (!pathStr) return undefined;
  return pathStr.split('.').reduce<any>((acc, key) => {
    if (acc == null) return undefined;
    return acc[key];
  }, obj);
}

/** 把任意值规范成字符串数组 */
function toStringArray(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(/[,，、;；|/\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [String(value)];
}

/** 兼容多种时间格式，输出 ISO 字符串 */
export function toIso(value: unknown, fallbackHoursAgo = 6): string {
  if (value == null || value === '') {
    return new Date(Date.now() - fallbackHoursAgo * 3600_000).toISOString();
  }
  if (typeof value === 'number') {
    // 10 位为秒，13 位为毫秒
    const ms = value < 1e12 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }
  const s = String(value).trim();
  // 纯数字时间戳
  if (/^\d{10,13}$/.test(s)) return toIso(Number(s), fallbackHoursAgo);
  // 相对时间："3小时前"
  const rel = s.match(/(\d+)\s*(分钟|小时|天)前/);
  if (rel) {
    const n = Number(rel[1]);
    const unitMs = rel[2] === '分钟' ? 60_000 : rel[2] === '小时' ? 3600_000 : 86_400_000;
    return new Date(Date.now() - n * unitMs).toISOString();
  }
  const d = new Date(s.replace(/\//g, '-'));
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return new Date(Date.now() - fallbackHoursAgo * 3600_000).toISOString();
}

/* ------------------------------------------------------------------ */
/* 响应缓存：真实订阅站只访问一次，后续复用本地快照                        */
/* ------------------------------------------------------------------ */

interface CacheEntry {
  savedAt: string;
  url: string;
  body: unknown;
}

function cacheFileFor(url: string): string {
  const key = createHash('md5').update(url).digest('hex').slice(0, 16);
  return path.join(CACHE_DIR, `${key}.json`);
}

function cacheTtlMs(cache: any): number {
  return typeof cache === 'object' && cache.ttlMinutes ? Number(cache.ttlMinutes) * 60_000 : Infinity;
}

/** 读取仍然新鲜的缓存；无缓存 / 已过期 / 损坏时返回 null */
function readFreshCache(url: string, cache: any): CacheEntry | null {
  if (!cache) return null;
  const file = cacheFileFor(url);
  if (!fs.existsSync(file)) return null;
  try {
    const entry = JSON.parse(fs.readFileSync(file, 'utf8')) as CacheEntry;
    const age = Date.now() - new Date(entry.savedAt).getTime();
    return age < cacheTtlMs(cache) ? entry : null;
  } catch {
    return null;
  }
}

function writeCache(url: string, body: unknown): void {
  fs.writeFileSync(
    cacheFileFor(url),
    JSON.stringify({ savedAt: new Date().toISOString(), url, body }, null, 2),
    'utf8',
  );
}

/** 缓存年龄（分钟），用于日志展示 */
function cacheAgeMinutes(entry: CacheEntry): number {
  return Math.round((Date.now() - new Date(entry.savedAt).getTime()) / 60_000);
}

/**
 * 带缓存的 JSON 拉取。
 * cfg.cache 支持：
 *   false | 省略   —— 每次都请求
 *   true           —— 永久复用首次快照
 *   { ttlMinutes } —— 快照在 TTL 内复用，过期后重新请求
 * 用途：真实订阅站往往有访问频次限制，开发调试期用缓存避免反复请求。
 */
async function fetchJsonCached(
  url: string,
  init: RequestInit,
  cache: any,
  ctx: FetchContext,
): Promise<{ json: any; fromCache: boolean }> {
  const cached = readFreshCache(url, cache);
  if (cached) {
    ctx.log(`命中本地缓存（${cached.savedAt}，${cacheAgeMinutes(cached)} 分钟前）`);
    return { json: cached.body, fromCache: true };
  }
  if (cache) ctx.log('无可用缓存，请求订阅源');

  const resp = await fetch(url, init);
  if (!resp.ok) throw new Error(`列表接口失败：HTTP ${resp.status}`);
  const json = await resp.json();
  if (cache) {
    writeCache(url, json);
    ctx.log('已请求订阅源并写入本地缓存');
  }
  return { json, fromCache: false };
}

/* ------------------------------------------------------------------ */
/* 嵌套结构映射：适配「事件 → 板块 → 个股/ETF」这类专业订阅源             */
/* ------------------------------------------------------------------ */

function readSecurityList(
  parent: any,
  listPath: string,
  fm: Record<string, string>,
  sectorName?: string,
): SecurityDetail[] {
  const raw = (pick(parent, listPath) as any[]) ?? [];
  const out: SecurityDetail[] = [];
  if (!Array.isArray(raw)) return out;
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue;
    const name = String(pick(c, fm.name ?? 'name') ?? '').trim();
    if (!name) continue;
    out.push({
      name,
      code: fm.code ? String(pick(c, fm.code) ?? '').trim() || undefined : undefined,
      change: fm.change ? Number(pick(c, fm.change) ?? 0) || 0 : undefined,
      sector: sectorName,
    });
  }
  return out;
}

/** 把嵌套的板块/个股/ETF 映射进扁平事件模型 */
function applyNestedMapping(ev: RawEvent, item: any, parser: any): void {
  const sfm: Record<string, string> = parser.sectorFieldMap ?? {};
  const raw = (pick(item, parser.sectorListPath) as any[]) ?? [];
  if (!Array.isArray(raw) || raw.length === 0) return;

  const sectorDetails: SectorDetail[] = [];
  const securities: SecurityDetail[] = [];
  const etfs: SecurityDetail[] = [];

  for (const s of raw) {
    if (!s || typeof s !== 'object') continue;
    const name = String(pick(s, sfm.name ?? 'name') ?? '').trim();
    if (!name) continue;
    sectorDetails.push({
      name,
      change: sfm.change ? Number(pick(s, sfm.change) ?? 0) || 0 : 0,
      remark: sfm.remark ? String(pick(s, sfm.remark) ?? '').trim() || undefined : undefined,
      type: sfm.type ? String(pick(s, sfm.type) ?? '').trim() || undefined : undefined,
    });
    if (parser.securityListPath) {
      securities.push(
        ...readSecurityList(s, parser.securityListPath, parser.securityFieldMap ?? {}, name),
      );
    }
    if (parser.etfListPath) {
      etfs.push(...readSecurityList(s, parser.etfListPath, parser.etfFieldMap ?? {}, name));
    }
  }

  if (sectorDetails.length === 0) return;
  ev.sectorDetails = sectorDetails;
  // 嵌套映射优先于扁平字段：板块名以 sectorList 为准
  ev.sectors = Array.from(new Set(sectorDetails.map((s) => s.name)));
  if (securities.length) {
    ev.securityDetails = securities;
    ev.stocks = Array.from(new Set(securities.map((s) => s.name)));
  }
  if (etfs.length) ev.etfs = etfs;
}

/** 派生字段：真实源常常没有「热度」，需要用涨跌幅等信号换算 */
function applyDerive(ev: RawEvent, derive: any): void {
  if (!derive) return;
  const details = ev.sectorDetails ?? [];

  if (details.length) {
    if (derive.marketChange === 'maxAbsSectorChange') {
      // 绝对值最大的板块（可能是下跌）
      ev.marketChange = details.reduce((best, s) => (Math.abs(s.change) > Math.abs(best) ? s.change : best), 0);
    } else if (derive.marketChange === 'maxSectorChange') {
      // 表现最好的板块（优先取上涨，全为下跌时取跌幅最小）
      ev.marketChange = details.reduce((best, s) => (s.change > best ? s.change : best), -Infinity);
    } else if (derive.marketChange === 'avgSectorChange') {
      ev.marketChange = Math.round((details.reduce((s, d) => s + d.change, 0) / details.length) * 100) / 100;
    }
  }

  // 无热度字段时，用涨跌幅折算一个可比口径（默认 1% ≈ 10 万热度）
  if (derive.heatPerPercent && !ev.heat) {
    ev.heat = Math.round(Math.abs(ev.marketChange ?? 0) * Number(derive.heatPerPercent));
  }

  // 用现成的板块信息生成摘要 / 正文
  if (!ev.summary && details.length) {
    // 以「表现最好的板块」作为事件的主代表，方向描述与实际涨跌保持一致
    const top = details.reduce((best, s) => (s.change > best.change ? s : best));
    if (derive.summaryFrom === 'sectorRemark') {
      ev.summary = top.remark ?? '';
    } else if (derive.summaryFrom === 'sectorReaction') {
      const dir = top.change > 0 ? '上涨' : top.change < 0 ? '下跌' : '走平';
      ev.summary =
        `消息带动 ${details.slice(0, 3).map((d) => d.name).join('、')} 等 ${details.length} 个板块异动，` +
        `其中 ${top.name} ${dir} ${Math.abs(top.change)}%。`;
    }
  }
  if (derive.contentFrom === 'allSectorRemarks' && !ev.content) {
    ev.content = details
      .filter((s) => s.remark)
      .map((s) => `【${s.name}】${s.remark}`)
      .join(' ');
  }
}

/* ------------------------------------------------------------------ */
/* 各类型适配器                                                          */
/* ------------------------------------------------------------------ */

/** 内置演示数据源 */
function fetchMock(source: DataSource, ctx: FetchContext): FetchResult {
  const count = Number(source.config?.count ?? DEMO_EVENTS.length);
  const events: RawEvent[] = DEMO_EVENTS.slice(0, count).map((e) => {
    const { hoursAgo, ...rest } = e;
    const ts = snapToTradingDay(Date.now() - hoursAgo * 3600_000);
    return { ...rest, publishedAt: new Date(ts).toISOString() };
  });
  ctx.log(`演示数据源返回 ${events.length} 条事件`);
  return { events, note: '内置演示数据（未接入真实订阅源）' };
}

/** 把列表接口返回的 JSON 逐条映射为 RawEvent（含嵌套结构与派生字段） */
function mapJsonEvents(json: any, parser: any, fieldMap: Record<string, any>, sourceName: string): RawEvent[] {
  // itemsPath 为空表示响应本身就是数组（如订阅站直接返回 [...]）
  const items = parser.itemsPath ? pick(json, parser.itemsPath) : json;
  if (!Array.isArray(items)) {
    throw new Error(`列表接口返回结构不是数组（itemsPath="${parser.itemsPath ?? ''}"）`);
  }

  const events: RawEvent[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const ev: RawEvent = {
      title: String(pick(item, fieldMap.title ?? 'title') ?? ''),
      summary: String(pick(item, fieldMap.summary ?? '') ?? ''),
      content: String(pick(item, fieldMap.content ?? '') ?? ''),
      url: String(pick(item, fieldMap.url ?? '') ?? ''),
      code: fieldMap.code ? String(pick(item, fieldMap.code) ?? '') || undefined : undefined,
      publishedAt: toIso(pick(item, fieldMap.publishedAt ?? '')),
      heat: parseHeat(pick(item, fieldMap.heat ?? '')),
      sectors: toStringArray(pick(item, fieldMap.sectors ?? '')),
      stocks: toStringArray(pick(item, fieldMap.stocks ?? '')),
      tags: toStringArray(pick(item, fieldMap.tags ?? '')),
      marketChange: Number(pick(item, fieldMap.marketChange ?? '') ?? 0) || 0,
      source: sourceName,
    };

    // 专业订阅源常见的「事件 → 板块 → 个股/ETF」嵌套结构
    if (parser.sectorListPath) applyNestedMapping(ev, item, parser);
    applyDerive(ev, parser.derive);

    events.push(ev);
  }
  return events;
}

/** 账号密码登录型订阅站 */
async function fetchHttpLogin(source: DataSource, ctx: FetchContext): Promise<FetchResult> {
  const cfg = source.config ?? {};
  const creds = cfg.credentials ?? {};
  const parser = cfg.parser ?? {};
  const fieldMap: Record<string, any> = parser.fieldMap ?? {};
  const vars: Record<string, string> = {
    date: ctx.date,
    // 凭据支持 "${ENV_VAR}" 形式，避免把密码写进会提交的配置文件
    username: resolveSecret(creds.username),
    password: resolveSecret(creds.password),
    timestamp: String(Date.now()),
  };
  const requestUrl = interpolate(String(cfg.listUrl ?? ''), vars);

  // ---------- 0) 缓存预检：命中且新鲜时完全跳过登录 ----------
  // 这样「已访问过一次」的订阅站在 TTL 内不会再产生任何请求
  if (cfg.cache && parser.kind !== 'html') {
    const cached = readFreshCache(requestUrl, cfg.cache);
    if (cached) {
      ctx.log(`命中本地缓存（${cached.savedAt}，${cacheAgeMinutes(cached)} 分钟前），跳过登录与请求`);
      const events = mapJsonEvents(cached.body, parser, fieldMap, source.name);
      ctx.log(`订阅源返回 ${events.length} 条事件（缓存）`);
      return { events: events.filter((e) => e.title), requestUrl, note: '数据来自本地缓存，未访问真实站点' };
    }
  }

  const timeoutMs = Number(cfg.timeoutMs ?? 15000);
  const headers: Record<string, string> = { ...(cfg.headers ?? {}) };

  if (cfg.loginUrl && !vars.username) {
    throw new Error(
      `数据源「${source.name}」的登录账号为空：请在项目根目录 .env 中配置凭据（参考 .env.example），` +
        `或直接在 config/data-sources.json 的 credentials 中填写。`,
    );
  }

  // ---------- 1) 登录 ----------
  let cookieHeader = '';
  let token = '';
  if (cfg.loginUrl) {
    const contentType = String(cfg.loginContentType ?? 'application/json');
    const bodyPayload = interpolate(cfg.loginBody ?? {}, vars);
    let body: RequestInit['body'];
    if (contentType.includes('json')) {
      body = JSON.stringify(bodyPayload);
      headers['Content-Type'] = 'application/json';
    } else if (contentType.includes('multipart') || contentType.includes('form-data')) {
      // multipart 的 Content-Type 必须由 fetch 自动生成（含 boundary），不能手工设置
      const fd = new FormData();
      for (const [k, v] of Object.entries(bodyPayload as Record<string, unknown>)) {
        fd.append(k, String(v ?? ''));
      }
      body = fd;
      delete headers['Content-Type'];
    } else {
      body = new URLSearchParams(bodyPayload as Record<string, string>).toString();
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    const resp = await fetch(cfg.loginUrl, {
      method: cfg.loginMethod ?? 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!resp.ok) {
      throw new Error(`登录失败：HTTP ${resp.status}`);
    }

    // 收集 Cookie
    const setCookies =
      typeof (resp.headers as any).getSetCookie === 'function'
        ? (resp.headers as any).getSetCookie()
        : [resp.headers.get('set-cookie')].filter(Boolean);
    cookieHeader = (setCookies as string[])
      .map((c) => String(c).split(';')[0])
      .filter(Boolean)
      .join('; ');

    // 提取 Token
    const text = await resp.text();
    let parsedLogin: any = null;
    try {
      parsedLogin = JSON.parse(text);
    } catch {
      /* 非 JSON 响应，忽略 */
    }
    if (parsedLogin && cfg.tokenPath) {
      token = String(pick(parsedLogin, cfg.tokenPath) ?? '');
    }

    // 部分站点把业务错误码放在 HTTP 200 的响应体里（如 {retCode:"000"}），需显式校验
    if (parsedLogin && cfg.successCodePath) {
      const code = String(pick(parsedLogin, cfg.successCodePath) ?? '');
      const expected = String(cfg.successCode ?? '');
      if (expected && code !== expected) {
        const msg = cfg.messagePath ? String(pick(parsedLogin, cfg.messagePath) ?? '') : '';
        throw new Error(`登录被拒绝：${msg || `code=${code}`}`);
      }
    }

    ctx.log(`登录成功（Cookie ${cookieHeader ? '已获取' : '无'}${token ? '，Token 已获取' : ''}）`);
  }

  // ---------- 2) 拉取列表 ----------
  const reqHeaders: Record<string, string> = { ...headers };
  if (cookieHeader) reqHeaders['Cookie'] = cookieHeader;
  if (token) {
    // bearer: "Bearer xxx"；header: 原样放入 Authorization（部分站点约定）
    if (cfg.authMode === 'bearer') reqHeaders['Authorization'] = `Bearer ${token}`;
    else if (cfg.authMode === 'header') reqHeaders['Authorization'] = token;
  }

  const events: RawEvent[] = [];

  if (parser.kind === 'html') {
    const listResp = await fetch(requestUrl, {
      method: cfg.listMethod ?? 'GET',
      headers: reqHeaders,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!listResp.ok) throw new Error(`列表接口失败：HTTP ${listResp.status}`);
    const html = await listResp.text();
    const $ = cheerio.load(html);
    const nodes = $(parser.itemSelector ?? 'li');
    nodes.each((_, el) => {
      const node = $(el);
      const read = (spec: any): string => {
        if (!spec) return '';
        const selector = typeof spec === 'string' ? spec : spec.selector;
        const attr = typeof spec === 'string' ? 'text' : spec.attr ?? 'text';
        const target = selector ? node.find(selector).first() : node;
        if (!target || target.length === 0) return '';
        if (attr === 'text') return target.text().trim();
        return target.attr(attr) ?? '';
      };
      events.push({
        title: read(fieldMap.title),
        summary: read(fieldMap.summary),
        url: read(fieldMap.url),
        publishedAt: toIso(read(fieldMap.publishedAt)),
        heat: parseHeat(read(fieldMap.heat)),
        source: source.name,
      });
    });
  } else {
    const { json, fromCache } = await fetchJsonCached(
      requestUrl,
      { method: cfg.listMethod ?? 'GET', headers: reqHeaders, signal: AbortSignal.timeout(timeoutMs) },
      cfg.cache,
      ctx,
    );
    events.push(...mapJsonEvents(json, parser, fieldMap, source.name));
    if (fromCache) ctx.log('（本次数据来自本地缓存，未请求真实站点）');
  }

  ctx.log(`订阅源返回 ${events.length} 条事件`);
  return { events: events.filter((e) => e.title), requestUrl };
}

/** RSS / Atom 源 */
async function fetchRss(source: DataSource, ctx: FetchContext): Promise<FetchResult> {
  const cfg = source.config ?? {};
  const url = interpolate(String(cfg.feedUrl ?? ''), { date: ctx.date });
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 ScoutBot/1.0' },
    signal: AbortSignal.timeout(Number(cfg.timeoutMs ?? 15000)),
  });
  if (!resp.ok) throw new Error(`RSS 请求失败：HTTP ${resp.status}`);
  const xml = await resp.text();
  const $ = cheerio.load(xml, { xmlMode: true });

  const events: RawEvent[] = [];
  const items = $('item').length ? $('item') : $('entry');
  items.each((_, el) => {
    const node = $(el);
    const link = node.find('link').attr('href') || node.find('link').text();
    events.push({
      title: node.find('title').text().trim(),
      summary: node.find('description').text().trim() || node.find('summary').text().trim(),
      url: link,
      publishedAt: toIso(node.find('pubDate').text() || node.find('updated').text()),
      source: source.name,
    });
  });
  ctx.log(`RSS 返回 ${events.length} 条事件`);
  return { events: events.filter((e) => e.title), requestUrl: url };
}

/* ------------------------------------------------------------------ */
/* 统一入口                                                             */
/* ------------------------------------------------------------------ */

export async function fetchFromSource(source: DataSource, ctx: FetchContext): Promise<FetchResult> {
  ctx.log(`开始抓取数据源：${source.name}（${source.type}）`);
  switch (source.type) {
    case 'mock':
      return fetchMock(source, ctx);
    case 'http-login':
      return fetchHttpLogin(source, ctx);
    case 'rss':
      return fetchRss(source, ctx);
    default:
      throw new Error(`未知的数据源类型：${source.type}`);
  }
}
