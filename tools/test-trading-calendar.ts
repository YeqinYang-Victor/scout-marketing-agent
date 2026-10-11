/**
 * 交易日历回归测试：交易日判定、最近交易日、交易日窗口、滞后检测、时区处理。
 * 运行：npm run test:calendar
 */
import {
  calendarMeta,
  cnDate,
  holidayName,
  isCovered,
  isTradingDay,
  lastTradingDayOnOrBefore,
  recentTradingDays,
  tradingDaysBetween,
} from '../server/pipeline/trading-calendar.js';

let pass = 0;
let fail = 0;
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${label}\n     got=${g}${ok ? '' : `\n     want=${w}`}`);
}

console.log('══════ 1. 交易日判定 ══════');
eq('2026-10-09 周五（交易日）', isTradingDay('2026-10-09'), true);
eq('2026-10-08 周四（交易日）', isTradingDay('2026-10-08'), true);
eq('2026-09-30 周三（交易日）', isTradingDay('2026-09-30'), true);
eq('2026-10-01 周四·国庆（休市）', isTradingDay('2026-10-01'), false);
eq('2026-10-07 周三·国庆（休市）', isTradingDay('2026-10-07'), false);
eq('2026-09-25 周五·中秋（休市）', isTradingDay('2026-09-25'), false);
eq('2026-09-20 周日·补班（股市仍休市）', isTradingDay('2026-09-20'), false);
eq('2026-10-10 周六·补班（股市仍休市）', isTradingDay('2026-10-10'), false);
eq('2026-10-11 周日（休市）', isTradingDay('2026-10-11'), false);

console.log('\n══════ 2. 最近交易日 ══════');
eq('周日的最近交易日 = 周五', lastTradingDayOnOrBefore('2026-10-11'), '2026-10-09');
eq('周一的最近交易日 = 周一本身', lastTradingDayOnOrBefore('2026-10-12'), '2026-10-12');
eq('国庆期间的最近交易日 = 09-30', lastTradingDayOnOrBefore('2026-10-03'), '2026-09-30');
eq('春节最后一天的最近交易日 = 02-13', lastTradingDayOnOrBefore('2026-02-23'), '2026-02-13');

console.log('\n══════ 3. 交易日窗口（最近 2 个交易日） ══════');
eq('以 10-09 为基准往前 2 个', recentTradingDays(2, '2026-10-09'), ['2026-10-09', '2026-10-08']);
eq('以周日 10-11 为基准往前 2 个', recentTradingDays(2, '2026-10-11'), ['2026-10-09', '2026-10-08']);
eq('以周一 10-12 为基准往前 2 个', recentTradingDays(2, '2026-10-12'), ['2026-10-12', '2026-10-09']);
eq('跨国庆往前 2 个', recentTradingDays(2, '2026-10-08'), ['2026-10-08', '2026-09-30']);

console.log('\n══════ 4. 滞后交易日数 ══════');
eq('10-09 → 10-09（不滞后）', tradingDaysBetween('2026-10-09', '2026-10-09'), 0);
eq('10-09 → 10-12 周一（滞后 1，允许）', tradingDaysBetween('2026-10-09', '2026-10-12'), 1);
eq('10-09 → 10-13 周二（滞后 2，应报错）', tradingDaysBetween('2026-10-09', '2026-10-13'), 2);
eq('09-30 → 10-09（跨国庆，滞后 2）', tradingDaysBetween('2026-09-30', '2026-10-09'), 2);

console.log('\n══════ 5. 时区与节假日名称 ══════');
eq('UTC 零点按中国时区仍为当日', cnDate('2026-10-09T00:00:00.000Z'), '2026-10-09');
eq('UTC 17:00 = 中国次日', cnDate('2026-10-08T17:00:00.000Z'), '2026-10-09');
eq('2026-10-01 是国庆节', holidayName('2026-10-01'), '国庆节');
eq('2026-10-09 非节假日', holidayName('2026-10-09'), undefined);

console.log('\n══════ 6. 覆盖范围 ══════');
eq('2026 已覆盖', isCovered('2026-10-11'), true);
eq('2024 已覆盖', isCovered('2024-01-01'), true);
eq('2027 未覆盖（退化为周一至周五）', isCovered('2027-01-01'), false);

console.log('\n══════ 7. 当前状态 ══════');
const m = calendarMeta(Date.parse('2026-10-11T14:46:00+08:00'));
console.log(`   今天 ${m.today}｜交易日=${m.todayIsTradingDay}｜最近交易日 ${m.lastTradingDay}`);
console.log(`   覆盖年份 ${m.coveredYears.join('、')}｜节假日 ${m.totalHolidays} 天`);
console.log(`   最近 5 个交易日 ${m.recentTradingDays.join('、')}`);

console.log(`\n══════ 结果：${pass} 通过 / ${fail} 失败 ══════`);
process.exit(fail === 0 ? 0 : 1);
