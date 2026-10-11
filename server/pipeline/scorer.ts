/**
 * 筛选引擎：去重 → 硬性过滤 → 五维加权打分 → 排序 → 选出 TopN。
 * 所有打分逻辑都由 config/filter-rules.json 驱动，权重、阈值、关键词均可自定义。
 */
import type {
  FilterRules,
  NormalizedEvent,
  ScoreAdjustment,
  ScoreBreakdown,
  ScoredEvent,
} from './types.js';
import {
  cnDate,
  isTradingDay,
  lastTradingDayOnOrBefore,
  recentTradingDays,
  tradingDaysBetween,
} from './trading-calendar.js';

/* ------------------------------------------------------------------ */
/* 去重                                                                */
/* ------------------------------------------------------------------ */

/** 标题归一化：去掉标点与空白，便于模糊比对 */
function normTitle(t: string): string {
  return t.replace(/[\s\p{P}]/gu, '').toLowerCase();
}

/** 计算两个标题的字符级 Jaccard 相似度 */
function similarity(a: string, b: string): number {
  const sa = new Set(a.split(''));
  const sb = new Set(b.split(''));
  let inter = 0;
  for (const c of sa) if (sb.has(c)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * 去重策略：
 *  1. ID 完全相同的直接合并；
 *  2. 标题相似度 ≥ 0.82 视为同一事件，保留热度更高的一条。
 */
export function dedupe(events: NormalizedEvent[]): NormalizedEvent[] {
  const out: NormalizedEvent[] = [];
  for (const e of events) {
    const dup = out.find(
      (o) => o.id === e.id || similarity(normTitle(o.title), normTitle(e.title)) >= 0.82,
    );
    if (!dup) {
      out.push(e);
    } else if (e.heat > dup.heat) {
      // 用信息更全 / 热度更高的一条替换
      Object.assign(dup, e, { sectors: Array.from(new Set([...dup.sectors, ...e.sectors])) });
    } else {
      dup.sectors = Array.from(new Set([...dup.sectors, ...e.sectors]));
      dup.stocks = Array.from(new Set([...dup.stocks, ...e.stocks]));
      dup.tags = Array.from(new Set([...dup.tags, ...e.tags]));
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 硬性过滤                                                            */
/* ------------------------------------------------------------------ */

export interface FilterOutcome {
  kept: NormalizedEvent[];
  dropped: { title: string; reason: string }[];
  /** 休市回退等特殊情况的说明，供日志与界面展示 */
  note?: string;
}

export function applyHardFilters(
  events: NormalizedEvent[],
  rules: FilterRules,
  now: number = Date.now(),
): FilterOutcome {
  const { minHeat, requireSectors, maxTradingDays } = rules.hardFilters;
  const maxStale = Number(rules.hardFilters.maxStaleTradingDays ?? 1);
  const excludes = rules.excludeKeywords ?? [];
  const blacklist = rules.sectorBlacklist ?? [];
  const whitelist = rules.sectorWhitelist ?? [];
  const dropped: { title: string; reason: string }[] = [];
  const survivors: NormalizedEvent[] = [];

  /* ---------- 第一步：与时效无关的条件 ---------- */
  for (const e of events) {
    const text = `${e.title} ${e.summary} ${(e.tags ?? []).join(' ')}`;
    const hitExclude = excludes.find((k) => k && text.includes(k));
    if (hitExclude) {
      dropped.push({ title: e.title, reason: `命中排除词「${hitExclude}」` });
      continue;
    }
    if (e.heat < minHeat) {
      dropped.push({ title: e.title, reason: `热度 ${e.heat} 低于阈值 ${minHeat}` });
      continue;
    }
    if (requireSectors && e.sectors.length === 0) {
      dropped.push({ title: e.title, reason: '未识别到所属行业' });
      continue;
    }
    const hitBlack = (e.sectors ?? []).find((s) => blacklist.includes(s));
    if (hitBlack) {
      dropped.push({ title: e.title, reason: `命中行业黑名单「${hitBlack}」` });
      continue;
    }
    // 白名单非空时，仅保留命中白名单行业的事件（含模糊包含匹配，兼容「固态电池」↔「电池」）
    if (whitelist.length > 0) {
      const inScope = whitelist.some((w) => e.sectors.some((s) => s.includes(w) || w.includes(s)));
      if (!inScope) {
        dropped.push({ title: e.title, reason: '所属行业不在白名单范围内' });
        continue;
      }
    }
    survivors.push(e);
  }

  /* ---------- 第二步：交易日窗口 ---------- */
  /*
   * 用「最近 N 个交易日」而不是「距今 N 小时」。
   * 按小时硬切会在周末/节假日把最近一个交易日的内容全部丢掉 —— 例如周五 08:00 的条目，
   * 到周日 08:00 就超过 48h，于是周六下午起、整个周日、周一早晨都会产出为空，
   * 而周一早晨正是客户经理准备当日内容的关键时点。
   *
   * 基准日取「数据源中最新一条所在的交易日」，而不是「今天」：
   * 交易日上午（尤其周一 7:30）当日数据尚未产生，若以今天为基准，窗口会退化成只剩 1 天。
   */
  const today = cnDate(new Date(now));
  const lastTrading = lastTradingDayOnOrBefore(today);

  const dated = survivors
    .map((e) => ({ e, date: cnDate(new Date(e.publishedAt)) }))
    .filter((x) => x.date && isTradingDay(x.date));

  // 落在非交易日的条目（正常情况下不该出现）单独记录，便于发现数据源异常
  const nonTrading = survivors.length - dated.length;
  if (nonTrading > 0) {
    for (const e of survivors) {
      const d = cnDate(new Date(e.publishedAt));
      if (!d || !isTradingDay(d)) {
        dropped.push({ title: e.title, reason: `发布于非交易日 ${d || '未知'}` });
      }
    }
  }

  if (dated.length === 0) {
    return {
      kept: [],
      dropped,
      note: `数据源未返回任何落在交易日的内容（共 ${survivors.length} 条）`,
    };
  }

  const base = dated.reduce((a, b) => (a.date >= b.date ? a : b)).date;
  const lag = tradingDaysBetween(base, lastTrading);

  // 数据源滞后过多 → 判定停更，交由上层报错，避免静默输出过期内容
  if (lag > maxStale) {
    return {
      kept: [],
      dropped,
      note:
        `数据源最新一条为 ${base}，落后最近交易日 ${lastTrading} 共 ${lag} 个交易日` +
        `（允许滞后 ${maxStale} 个），判定为数据源未更新`,
    };
  }

  const window = recentTradingDays(maxTradingDays, base);
  const windowSet = new Set(window);
  const kept = dated.filter((x) => windowSet.has(x.date)).map((x) => x.e);

  for (const x of dated) {
    if (!windowSet.has(x.date)) {
      dropped.push({ title: x.e.title, reason: `发布于 ${x.date}，超出最近 ${maxTradingDays} 个交易日` });
    }
  }

  const note =
    lag > 0
      ? `数据源最新为 ${base}，最近交易日为 ${lastTrading}（滞后 ${lag} 个交易日，在允许范围内）`
      : undefined;

  return { kept, dropped, note };
}

/* ------------------------------------------------------------------ */
/* 打分                                                                */
/* ------------------------------------------------------------------ */

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

/** 判断发布时间与「现在」是否落在同一个自然日（按服务器本地时区） */
export function isSameLocalDay(iso: string, now: number): boolean {
  const a = new Date(iso);
  const b = new Date(now);
  if (Number.isNaN(a.getTime())) return false;
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/** 产业链上中下游识别词表 */
const CHAIN_KEYWORDS: Record<'up' | 'mid' | 'down', string[]> = {
  up: ['材料', '矿', '资源', '原料', '设备', '零部件', '元器件', '锂', '铜', '稀土', '硅料', '正极', '负极', '电解质', '基板'],
  mid: ['制造', '加工', '电池', '芯片', '模组', '装备', '封装', '电芯', '组件', '整机', '减速器', '丝杠', '传感器'],
  down: ['应用', '消费', '终端', '需求', '场景', '车', '手机', '储能', '电网', '算力', '出海', '装机', '交付'],
};

function detectChainStages(text: string): { up: boolean; mid: boolean; down: boolean } {
  const has = (arr: string[]) => arr.some((k) => text.includes(k));
  return { up: has(CHAIN_KEYWORDS.up), mid: has(CHAIN_KEYWORDS.mid), down: has(CHAIN_KEYWORDS.down) };
}

/** 单维度打分 */
function scoreDimension(
  key: string,
  e: NormalizedEvent,
  params: Record<string, any>,
  fullText: string,
  now: number,
): { score: number; detail: string } {
  switch (key) {
    case 'marketImpact': {
      const heatCeiling = params.heatCeiling ?? 2_000_000;
      const changeCeiling = params.changeCeiling ?? 8;
      const heatShare = params.heatShare ?? 0.6;
      const changeShare = params.changeShare ?? 0.4;
      const heatScore = clamp((e.heat / heatCeiling) * 100);
      const changeScore = clamp((Math.abs(e.marketChange) / changeCeiling) * 100);
      const score = heatScore * heatShare + changeScore * changeShare;
      return {
        score: Math.round(score * 10) / 10,
        detail: `热度 ${(e.heat / 10000).toFixed(1)}万（${heatScore.toFixed(0)}分）· 板块涨跌 ${e.marketChange}%（${changeScore.toFixed(0)}分）`,
      };
    }
    case 'industryCoverage': {
      const sectorCeiling = params.sectorCeiling ?? 6;
      const sectorShare = params.sectorShare ?? 0.6;
      const chainShare = params.chainShare ?? 0.4;
      const sectorScore = clamp((e.sectors.length / sectorCeiling) * 100);
      const stages = detectChainStages(fullText);
      const stageCount = [stages.up, stages.mid, stages.down].filter(Boolean).length;
      const chainScore = clamp((stageCount / 3) * 100);
      const score = sectorScore * sectorShare + chainScore * chainShare;
      const stageLabel = [stages.up && '上游', stages.mid && '中游', stages.down && '下游']
        .filter(Boolean)
        .join('/') || '未识别';
      return {
        score: Math.round(score * 10) / 10,
        detail: `覆盖 ${e.sectors.length} 个行业（${sectorScore.toFixed(0)}分）· 传导环节 ${stageLabel}（${chainScore.toFixed(0)}分）`,
      };
    }
    case 'timeliness': {
      const halfLife = params.halfLifeHours ?? 12;
      let score = clamp(100 * Math.pow(0.5, e.ageHours / halfLife));
      // 当日发布的条目额外加分，保证「优先当天的热点」而不只是「越新越高」
      const bonus = Number(params.sameDayBonus ?? 0);
      const sameDay = bonus > 0 && isSameLocalDay(e.publishedAt, now);
      if (sameDay) score = clamp(score + bonus);
      return {
        score: Math.round(score * 10) / 10,
        detail:
          `发布距今 ${e.ageHours} 小时，半衰期 ${halfLife}h` +
          `${sameDay ? `，当日发布 +${bonus}` : ''}（${score.toFixed(0)}分）`,
      };
    }
    case 'policyRelevance': {
      const keywords: string[] = params.keywords ?? [];
      const perHit = params.perHitScore ?? 18;
      const hits = keywords.filter((k) => fullText.includes(k));
      const score = clamp(hits.length * perHit);
      return {
        score: Math.round(score * 10) / 10,
        detail: hits.length ? `命中政策词：${hits.join('、')}（${score.toFixed(0)}分）` : '未命中政策关键词（0分）',
      };
    }
    case 'clientRelevance': {
      const hotSectors: string[] = params.hotSectors ?? [];
      const base = params.baseScore ?? 40;
      const per = params.perHotSector ?? 15;
      const hits = hotSectors.filter((s) => e.sectors.some((x) => x.includes(s) || s.includes(x)));
      const score = clamp(base + hits.length * per);
      return {
        score: Math.round(score * 10) / 10,
        detail: hits.length ? `命中热门赛道：${hits.join('、')}（${score.toFixed(0)}分）` : `未命中热门赛道（${base}分）`,
      };
    }
    default:
      return { score: 0, detail: '未实现的维度' };
  }
}

/** 对单个事件打分 */
export function scoreEvent(e: NormalizedEvent, rules: FilterRules, now = Date.now()): ScoredEvent {
  const fullText = `${e.title} ${e.summary} ${e.content ?? ''} ${(e.tags ?? []).join(' ')}`;
  const enabled = rules.dimensions.filter((d) => d.enabled);
  const weightSum = enabled.reduce((s, d) => s + d.weight, 0) || 1;

  const breakdown: ScoreBreakdown[] = enabled.map((d) => {
    const { score, detail } = scoreDimension(d.key, e, d.params ?? {}, fullText, now);
    const w = d.weight / weightSum; // 归一化，避免权重之和不为 1 导致失真
    return {
      key: d.key,
      label: d.label,
      weight: Math.round(w * 1000) / 1000,
      score,
      weighted: Math.round(score * w * 10) / 10,
      detail,
    };
  });

  const base = breakdown.reduce((s, b) => s + b.weighted, 0);

  const adjustments: ScoreAdjustment[] = [];
  for (const b of rules.keywordBoosts ?? []) {
    if (b.keyword && fullText.includes(b.keyword)) adjustments.push({ keyword: b.keyword, delta: b.delta });
  }
  for (const p of rules.keywordPenalties ?? []) {
    if (p.keyword && fullText.includes(p.keyword)) adjustments.push({ keyword: p.keyword, delta: p.delta });
  }
  const deltaSum = adjustments.reduce((s, a) => s + a.delta, 0);
  const raw = base + deltaSum;

  return {
    ...e,
    // 展示分裁剪到 0-100；原始分保留完整量级，用于打破「同分并列」
    totalScore: Math.round(clamp(raw) * 10) / 10,
    rawScore: Math.round(raw * 10) / 10,
    breakdown,
    adjustments,
    rank: 0,
  };
}

/** 批量打分并排序（按原始分排序，展示分相同的事件也能保持稳定次序） */
export function scoreAndRank(events: NormalizedEvent[], rules: FilterRules, now = Date.now()): ScoredEvent[] {
  const scored = events.map((e) => scoreEvent(e, rules, now));
  scored.sort((a, b) => b.rawScore - a.rawScore || b.heat - a.heat);
  scored.forEach((s, i) => (s.rank = i + 1));
  return scored;
}

/** 选出 TopN */
export function selectTop(scored: ScoredEvent[], rules: FilterRules): ScoredEvent[] {
  const n = Math.max(1, rules.topN ?? 1);
  return scored.slice(0, n);
}
