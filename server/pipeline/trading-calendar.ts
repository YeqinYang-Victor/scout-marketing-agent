/**
 * A 股交易日历。
 *
 * 规则：**交易日 = 周一至周五 且 非法定节假日**。
 *
 * ⚠️ 最容易踩的坑：调休「补班」的周末（把周六/周日调成工作日）**股市不交易**，
 * 所以不能用「工作日」来判断，必须以法定节假日为准。
 * 已用真实数据源验证：2026-09-20（补班周日）、2026-10-10（补班周六）均无行情数据。
 *
 * 数据来自 config/trading-calendar.json（由 tools/build-trading-calendar.ts 生成）。
 * 未覆盖的年份退化为「周一至周五均为交易日」。
 */
import fs from 'fs';
import { CONFIG_DIR } from './store.js';
import path from 'path';

const CALENDAR_FILE = path.join(CONFIG_DIR, 'trading-calendar.json');

/** 统一按中国时区计算日期，避免服务器时区影响结果 */
const CN_TZ = 'Asia/Shanghai';

interface CalendarFile {
  version: number;
  note?: string;
  source?: string;
  generatedAt?: string;
  coveredYears?: number[];
  /** YYYY-MM-DD → 节假日名称 */
  holidays: Record<string, string>;
}

let loaded = false;
let file: CalendarFile = { version: 0, holidays: {} };
let holidaySet = new Set<string>();
let coveredYears = new Set<number>();

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    file = JSON.parse(fs.readFileSync(CALENDAR_FILE, 'utf8')) as CalendarFile;
    holidaySet = new Set(Object.keys(file.holidays ?? {}));
    coveredYears = new Set((file.coveredYears ?? []).map(Number));
  } catch {
    // 日历文件缺失时静默退化：按「周一至周五」判断，不阻塞主流程
    file = { version: 0, holidays: {} };
    holidaySet = new Set();
    coveredYears = new Set();
  }
}

/** 按中国时区格式化为 YYYY-MM-DD */
export function cnDate(d: Date | string | number): string {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(dt);
}

/** 该日期是否落在日历覆盖范围内（未覆盖时按「周一至周五」退化处理） */
export function isCovered(date: string): boolean {
  load();
  return coveredYears.has(Number(String(date).slice(0, 4)));
}

/** 星期几（0=周日）。用固定 +08:00 解析，避免时区歧义 */
function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00+08:00`).getDay();
}

/** 是否 A 股交易日 */
export function isTradingDay(date: string): boolean {
  load();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const w = weekdayOf(date);
  if (w === 0 || w === 6) return false;
  return !holidaySet.has(date);
}

/** 节假日名称（非节假日返回 undefined） */
export function holidayName(date: string): string | undefined {
  load();
  return file.holidays?.[date];
}

/** 日期加减天数（按中国时区） */
function shift(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00+08:00`);
  d.setDate(d.getDate() + days);
  return cnDate(d);
}

/** ≤ date 的最近一个交易日 */
export function lastTradingDayOnOrBefore(date: string): string {
  let cur = date;
  for (let i = 0; i < 400; i++) {
    if (isTradingDay(cur)) return cur;
    cur = shift(cur, -1);
  }
  return date;
}

/** 从 from（含）往前数 n 个交易日，返回**降序**数组 */
export function recentTradingDays(n: number, from?: string): string[] {
  const start = from ?? cnDate(new Date());
  const out: string[] = [];
  let cur = start;
  for (let i = 0; i < 400 && out.length < n; i++) {
    if (isTradingDay(cur)) out.push(cur);
    cur = shift(cur, -1);
  }
  return out;
}

/** (from, to] 之间的交易日数量，用于判断数据源是否滞后 */
export function tradingDaysBetween(from: string, to: string): number {
  if (!from || !to || from >= to) return 0;
  let count = 0;
  let cur = shift(from, 1);
  for (let i = 0; i < 400 && cur <= to; i++) {
    if (isTradingDay(cur)) count++;
    cur = shift(cur, 1);
  }
  return count;
}

/**
 * 把时间戳吸附到最近的交易日（保留时刻不变）。
 *
 * 用途：演示数据 / 模拟站用「距今 N 小时」保证数据永远新鲜，但若当天是周末或节假日，
 * 换算出的时间会落在非交易日，被交易日窗口整批过滤掉。往前回退到最近的交易日即可。
 * （真实订阅源本身就是按交易日发布的，无需这一步。）
 */
export function snapToTradingDay(ts: number): number {
  let t = ts;
  for (let i = 0; i < 30; i++) {
    if (isTradingDay(cnDate(new Date(t)))) return t;
    t -= 86_400_000;
  }
  return t;
}

/** 日历元信息，供界面与日志展示 */
export function calendarMeta(now: number = Date.now()) {
  load();
  const today = cnDate(new Date(now));
  return {
    coveredYears: [...coveredYears].sort(),
    totalHolidays: holidaySet.size,
    source: file.source,
    generatedAt: file.generatedAt,
    today,
    todayIsTradingDay: isTradingDay(today),
    todayHolidayName: holidayName(today),
    lastTradingDay: lastTradingDayOnOrBefore(today),
    recentTradingDays: recentTradingDays(5, today),
  };
}
