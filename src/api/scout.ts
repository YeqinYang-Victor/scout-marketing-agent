/**
 * 产业链侦察兵 —— 前端 API 客户端
 */

const BASE = '/api/scout';

/* ---------------- 类型 ---------------- */

export interface DataSourceItem {
  id: string;
  name: string;
  type: 'mock' | 'http-login' | 'rss';
  enabled: boolean;
  note?: string;
  config: Record<string, any>;
}

export interface DataSourceFile {
  version: number;
  activeSourceId: string;
  sources: DataSourceItem[];
}

export interface FilterDimension {
  key: string;
  label: string;
  weight: number;
  enabled: boolean;
  description?: string;
  params?: Record<string, any>;
}

export interface FilterRules {
  version: number;
  note?: string;
  dimensions: FilterDimension[];
  keywordBoosts: { keyword: string; delta: number }[];
  keywordPenalties: { keyword: string; delta: number }[];
  excludeKeywords: string[];
  sectorWhitelist: string[];
  sectorBlacklist: string[];
  hardFilters: {
    minHeat: number;
    requireSectors: boolean;
    /** 保留最近 N 个交易日的内容（按 A 股交易日历计算） */
    maxTradingDays: number;
    /** 数据源最多允许滞后多少个交易日，超过则判定停更并报错，默认 1 */
    maxStaleTradingDays?: number;
  };
  topN: number;
}

/** A 股交易日历状态 */
export interface TradingCalendarMeta {
  coveredYears: number[];
  totalHolidays: number;
  source?: string;
  generatedAt?: string;
  today: string;
  todayIsTradingDay: boolean;
  todayHolidayName?: string;
  lastTradingDay: string;
  recentTradingDays: string[];
}

export interface TemplateField {
  key: string;
  label: string;
  type: 'text' | 'list';
  maxChars?: number;
  maxItems?: number;
  prompt?: string;
}

export interface CopyTemplate {
  id: string;
  name: string;
  channel: string;
  description?: string;
  maxLength?: number;
  enabled: boolean;
  fields: TemplateField[];
  body: string;
}

export interface TemplateFile {
  version: number;
  activeTemplateId: string;
  note?: string;
  templates: CopyTemplate[];
}

export interface BrandConfig {
  version: number;
  brokerName: string;
  productName: string;
  slogan: string;
  colors: Record<string, string>;
  bannerSize: { width: number; height: number };
  footer: { qrHint: string; disclaimer: string; complianceCode: string };
  fontFamily: string;
}

export interface ScoreBreakdown {
  key: string;
  label: string;
  weight: number;
  score: number;
  weighted: number;
  detail: string;
}

export interface ScoredEvent {
  id: string;
  title: string;
  summary: string;
  content?: string;
  url?: string;
  source: string;
  publishedAt: string;
  heat: number;
  sectors: string[];
  stocks: string[];
  tags: string[];
  marketChange: number;
  ageHours: number;
  totalScore: number;
  /** 未裁剪的原始分（可能 >100），用于展示「触顶」与打破同分并列 */
  rawScore: number;
  breakdown: ScoreBreakdown[];
  adjustments: { keyword: string; delta: number }[];
  rank: number;
}

export interface Beneficiary {
  name: string;
  code?: string;
  reason: string;
}

export interface ReportDraft {
  id: string;
  createdAt: string;
  date: string;
  weekday: string;
  templateId: string;
  templateName: string;
  channel: string;
  eventId: string;
  eventTitle: string;
  text: string;
  fields: Record<string, any>;
  llmEnhanced: boolean;
  charCount: number;
}

export interface BannerResult {
  svgUrl: string;
  pngUrl?: string;
  width: number;
  height: number;
  headline: string;
}

export interface PipelineStep {
  key: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
  detail?: string;
  ts: string;
}

export interface PipelineRun {
  id: string;
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'success' | 'error';
  sourceId: string;
  sourceName: string;
  templateId: string;
  templateName: string;
  fetched: number;
  afterFilter: number;
  topEvent?: ScoredEvent;
  candidates: ScoredEvent[];
  report?: ReportDraft;
  banner?: BannerResult;
  steps: PipelineStep[];
  llmEnabled: boolean;
  llmEnhanced: boolean;
  error?: string;
}

export interface RunSummary {
  id: string;
  startedAt: string;
  finishedAt?: string;
  status: string;
  sourceName: string;
  templateName: string;
  fetched: number;
  afterFilter: number;
  topEventTitle: string;
  topEventScore: number;
  llmEnhanced: boolean;
  bannerUrl: string;
}

export interface Meta {
  brand: BrandConfig;
  sources: DataSourceFile;
  rules: FilterRules;
  templates: TemplateFile;
}

/* ---------------- 请求封装 ---------------- */

async function json<T>(resp: Response): Promise<T> {
  const text = await resp.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`返回内容不是合法 JSON：${text.slice(0, 120)}`);
  }
  if (!resp.ok) throw new Error(data?.error || `请求失败（HTTP ${resp.status}）`);
  return data as T;
}

export const api = {
  meta: () => fetch(`${BASE}/meta`).then(json<Meta>),

  /** A 股交易日历状态（今天是否交易日、最近若干交易日） */
  calendar: () => fetch(`${BASE}/calendar`).then(json<TradingCalendarMeta>),

  getConfig: <T>(name: string) => fetch(`${BASE}/config/${name}`).then(json<T>),

  saveConfig: (name: string, data: unknown) =>
    fetch(`${BASE}/config/${name}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(json<{ success: boolean }>),

  run: (params: { sourceId?: string; templateId?: string; useLlm?: boolean; model?: string; topN?: number }) =>
    fetch(`${BASE}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }).then(json<PipelineRun>),

  runs: () => fetch(`${BASE}/runs`).then(json<{ runs: RunSummary[] }>),

  runDetail: (id: string) => fetch(`${BASE}/runs/${id}`).then(json<PipelineRun>),

  /** 单文件 HTML 日报的直链（可直接 window.open 预览 / 下载） */
  exportUrl: (id: string) => `${BASE}/export/${id}`,

  recompose: (params: { runId: string; templateId: string; useLlm?: boolean; model?: string }) =>
    fetch(`${BASE}/recompose`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }).then(json<{ report: ReportDraft; llmEnhanced: boolean }>),
};

/**
 * 以 SSE 方式执行流水线，实时回调每一步进度。
 * 返回一个可取消的句柄。
 */
export function runPipelineStream(
  params: { sourceId?: string; templateId?: string; useLlm?: boolean; model?: string; topN?: number },
  handlers: {
    onStep?: (step: PipelineStep) => void;
    onResult?: (run: PipelineRun) => void;
    onError?: (message: string) => void;
  },
): { cancel: () => void } {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  const es = new EventSource(`${BASE}/run/stream?${qs.toString()}`);

  es.onmessage = (ev) => {
    if (ev.data === '[DONE]') {
      es.close();
      return;
    }
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'step') handlers.onStep?.(msg.step);
      else if (msg.type === 'result') handlers.onResult?.(msg.run);
      else if (msg.type === 'error') handlers.onError?.(msg.message);
    } catch {
      /* 忽略解析失败的心跳 */
    }
  };
  es.onerror = () => {
    es.close();
  };

  return { cancel: () => es.close() };
}
