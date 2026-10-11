/**
 * 交易日窗口过滤的回归测试：覆盖周一早晨、数据源滞后、非交易日条目等边界。
 * 运行：npm run test:window
 */
import type { NormalizedEvent } from '../server/pipeline/types.js';
import { applyHardFilters } from '../server/pipeline/scorer.js';
import { getConfig } from '../server/pipeline/store.js';

const rules = getConfig('rules') as any;

/** 构造一条指定发布日的标准化事件 */
const ev = (date: string, title: string): NormalizedEvent =>
  ({
    id: `${date}-${title}`,
    title,
    summary: '',
    source: 'test',
    publishedAt: `${date}T00:00:00.000Z`, // 与真实数据源一致：UTC 零点
    heat: 1000,
    sectors: ['测试板块'],
    stocks: [],
    tags: [],
    marketChange: 1,
    ageHours: 0,
  }) as NormalizedEvent;

const dataset = [
  ev('2026-10-09', 'A 周五'),
  ev('2026-10-08', 'B 周四'),
  ev('2026-09-30', 'C 节前'),
  ev('2026-10-07', 'D 国庆期间（非交易日）'),
];

const at = (s: string) => Date.parse(`${s}T14:00:00+08:00`);
const show = (label: string, now: string, events = dataset) => {
  const r = applyHardFilters(events, rules, at(now));
  const kept = r.kept.map((e) => e.title).sort();
  console.log(`\n── ${label}（now=${now}）`);
  console.log(`   保留 ${kept.length} 条：${kept.join('、') || '（无）'}`);
  if (r.note) console.log(`   说明：${r.note}`);
  return kept;
};

console.log('══════ 交易日窗口 = 最近 2 个交易日 ══════');
console.log(`当前配置：maxTradingDays=${rules.hardFilters.maxTradingDays}｜maxStaleTradingDays=${rules.hardFilters.maxStaleTradingDays}`);

let bad = 0;
const check = (label: string, got: string[], want: string[]) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`   ${ok ? '✅' : '❌'} ${label}${ok ? '' : `　期望 ${JSON.stringify(want)}`}`);
};

// 周日：基准=周五 10-09，窗口 {10-09, 10-08}
check('周日（10-11）→ 保留 10-09 + 10-08', show('周日', '2026-10-11'), ['A 周五', 'B 周四']);

// 周一早晨：当日数据尚未产生，基准仍是 10-09，滞后 1 个交易日（允许）
check('周一早晨（10-12）→ 仍保留 10-09 + 10-08', show('周一早晨', '2026-10-12'), ['A 周五', 'B 周四']);

// 周二：10-09 已滞后 2 个交易日 → 判定停更，返回空
check('周二（10-13）→ 滞后 2 个交易日，判停更', show('周二', '2026-10-13'), []);

// 数据源停在节前（只有 09-30）：跨国庆滞后 2 个交易日 → 判停更
check(
  '数据源停在 09-30 → 判停更',
  show('数据源停更', '2026-10-11', [ev('2026-09-30', 'C 节前')]),
  [],
);

// 非交易日的数据应被剔除
console.log('\n── 非交易日条目应被剔除');
const r = applyHardFilters(dataset, rules, at('2026-10-11'));
const droppedHoliday = r.dropped.find((d) => d.title === 'D 国庆期间（非交易日）');
console.log(`   ${droppedHoliday ? '✅' : '❌'} D 已被剔除：${droppedHoliday?.reason ?? '未剔除'}`);
if (!droppedHoliday) bad++;

// 窗口设为 1 个交易日
console.log('\n── 把窗口改成 1 个交易日');
const r1 = applyHardFilters(dataset, { ...rules, hardFilters: { ...rules.hardFilters, maxTradingDays: 1 } }, at('2026-10-11'));
const kept1 = r1.kept.map((e) => e.title).sort();
console.log(`   保留 ${kept1.length} 条：${kept1.join('、')}`);
check('窗口=1 → 只保留 10-09', kept1, ['A 周五']);

console.log(`\n══════ 结果：${bad === 0 ? '全部通过' : `${bad} 项失败`} ══════`);
process.exit(bad === 0 ? 0 : 1);
