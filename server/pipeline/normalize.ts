/**
 * 标准化：把各数据源形态各异的原始事件，统一成 NormalizedEvent。
 */
import { createHash } from 'crypto';
import type { NormalizedEvent, RawEvent } from './types.js';

/** 生成稳定 ID（同一事件重复抓取时 ID 一致，便于去重） */
function makeId(e: RawEvent): string {
  const key = `${e.title || ''}|${e.url || ''}`.trim();
  return createHash('md5').update(key || String(Math.random())).digest('hex').slice(0, 12);
}

function clean(text?: string): string {
  if (!text) return '';
  return String(text)
    .replace(/<[^>]+>/g, '') // 去 HTML 标签
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniq(arr?: string[]): string[] {
  if (!arr) return [];
  return Array.from(new Set(arr.map((s) => String(s).trim()).filter(Boolean)));
}

export function normalize(events: RawEvent[], now = Date.now()): NormalizedEvent[] {
  return events
    .filter((e) => e && e.title)
    .map((e) => {
      const publishedAt = e.publishedAt ? new Date(e.publishedAt).toISOString() : new Date(now).toISOString();
      const ageHours = Math.max(0, (now - new Date(publishedAt).getTime()) / 3600_000);
      const summary = clean(e.summary) || clean(e.content).slice(0, 160);
      return {
        ...e,
        id: makeId(e),
        title: clean(e.title),
        summary,
        content: clean(e.content),
        source: e.source || '未知来源',
        publishedAt,
        heat: Number(e.heat ?? 0) || 0,
        sectors: uniq(e.sectors),
        stocks: uniq(e.stocks),
        tags: uniq(e.tags),
        marketChange: Number(e.marketChange ?? 0) || 0,
        // 结构化明细同样做一次清洗，保证 remark 里的 HTML 与多余空白被处理
        sectorDetails: e.sectorDetails?.map((s) => ({
          ...s,
          name: clean(s.name),
          remark: clean(s.remark) || undefined,
        })),
        securityDetails: e.securityDetails?.map((s) => ({ ...s, name: clean(s.name) })),
        etfs: e.etfs?.map((s) => ({ ...s, name: clean(s.name) })),
        ageHours: Math.round(ageHours * 10) / 10,
      } as NormalizedEvent;
    });
}
