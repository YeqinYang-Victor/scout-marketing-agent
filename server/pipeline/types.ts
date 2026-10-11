/**
 * 产业链侦察兵 —— 流水线核心类型定义
 */

/** 从数据源抓取到的原始事件 */
export interface RawEvent {
  title: string;
  summary?: string;
  content?: string;
  url?: string;
  source?: string;
  /** ISO 时间字符串 */
  publishedAt?: string;
  /** 热度：阅读量 / 讨论量 / 站内热度值 */
  heat?: number;
  /** 涉及行业板块 */
  sectors?: string[];
  /** 关联个股（名称或代码） */
  stocks?: string[];
  /** 标签 */
  tags?: string[];
  /** 相关板块涨跌幅（%） */
  marketChange?: number;
  /** 事件代码（部分数据源提供，如订阅站的 eventCode） */
  code?: string;
  /**
   * 结构化板块明细。
   * 部分专业订阅源会给出「板块 + 涨跌幅 + 传导逻辑说明」，
   * remark 是现成的专业解读，可直接用于生成影响分析。
   */
  sectorDetails?: SectorDetail[];
  /** 结构化个股明细（含代码与涨跌幅），stocks 为其名称投影 */
  securityDetails?: SecurityDetail[];
  /** 关联 ETF */
  etfs?: SecurityDetail[];
}

/** 板块明细 */
export interface SectorDetail {
  name: string;
  /** 板块涨跌幅（%） */
  change: number;
  /** 该事件为何利好此板块的传导逻辑说明 */
  remark?: string;
  /** 板块类型编码（各数据源自定义） */
  type?: string;
}

/** 个股 / ETF 明细 */
export interface SecurityDetail {
  name: string;
  code?: string;
  /** 涨跌幅（%） */
  change?: number;
  /** 所属板块（嵌套结构映射时自动填充） */
  sector?: string;
}

/** 标准化之后的事件 */
export interface NormalizedEvent extends RawEvent {
  id: string;
  title: string;
  summary: string;
  source: string;
  publishedAt: string;
  heat: number;
  sectors: string[];
  stocks: string[];
  tags: string[];
  marketChange: number;
  /** 距今小时数 */
  ageHours: number;
}

/** 单个维度的打分明细 */
export interface ScoreBreakdown {
  key: string;
  label: string;
  weight: number;
  /** 该维度原始分 0-100 */
  score: number;
  /** 加权后得分 */
  weighted: number;
  detail: string;
}

/** 关键词加减分明细 */
export interface ScoreAdjustment {
  keyword: string;
  delta: number;
}

/** 打分后的事件 */
export interface ScoredEvent extends NormalizedEvent {
  /** 展示用总分，裁剪到 0-100 */
  totalScore: number;
  /**
   * 未裁剪的原始分（可能 >100）。
   * 用于在多个事件同时触顶 100 时仍然保持可区分的排序，避免「同分并列」丢失区分度。
   */
  rawScore: number;
  breakdown: ScoreBreakdown[];
  adjustments: ScoreAdjustment[];
  rank: number;
}

/** 受益方向 */
export interface Beneficiary {
  name: string;
  code?: string;
  reason: string;
}

/** 文案内容字段（由 AI 或规则引擎填充） */
export interface ReportFields {
  impactAnalysis?: string;
  eventBackground?: string;
  chainUp?: string;
  chainMid?: string;
  chainDown?: string;
  beneficiaryList?: Beneficiary[];
  riskNote?: string;
  [key: string]: unknown;
}

/** 生成好的文案草稿 */
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
  fields: ReportFields;
  /** 是否经过大模型润色 */
  llmEnhanced: boolean;
  charCount: number;
}

/**
 * Banner 产物。
 * 只记录**文件名**（如 `banner-2026-10-09T…-abc.svg`），不记录绝对路径 ——
 * 绝对路径会把本机目录结构写进运行记录，且让记录无法跨机器复用。
 * 需要读文件时用 `path.join(BANNERS_DIR, banner.svgFile)` 拼回来。
 */
export interface BannerResult {
  svgFile: string;
  pngFile?: string;
  svgUrl: string;
  pngUrl?: string;
  width: number;
  height: number;
  headline: string;
}

/** 流水线步骤 */
export interface PipelineStep {
  key: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
  detail?: string;
  ts: string;
}

/** 一次完整运行记录 */
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

/** 数据源配置 */
export interface DataSource {
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
  sources: DataSource[];
}

/** 筛选规则 */
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
    /**
     * 保留最近 N 个**交易日**的内容（按 A 股交易日历计算）。
     * 用交易日而非「距今小时数」：周末与法定节假日休市，按小时硬切会把最近一个交易日的内容全部丢掉，
     * 导致周一早晨（客户经理准备当日内容的关键时点）产出为空。
     */
    maxTradingDays: number;
    /**
     * 数据源最多允许滞后多少个交易日，超过则判定为停更并报错。
     * 默认 1 —— 允许「今天的数据还没发布」（如交易日上午），但连续漏掉 2 个交易日就要告警。
     */
    maxStaleTradingDays?: number;
  };
  topN: number;
}

/** 文案模板 */
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

/** 品牌视觉配置 */
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
