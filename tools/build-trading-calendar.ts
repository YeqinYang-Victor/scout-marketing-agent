/**
 * 生成 A 股交易日历 → config/trading-calendar.json
 *
 * A 股休市规则：**周末休市 + 法定节假日休市**。
 * 注意一个容易搞错的点：调休「补班」的周末（把周六/周日调成工作日）**股市不交易**，
 * 所以日历里只记录法定节假日，交易日 = 周一至周五 且 非法定节假日。
 *
 * 数据来源：国务院办公厅节假日安排（经 timor.tech 公开 API 获取）。
 * 该 API 在每年国务院发布次年安排后才会返回次年数据；未发布的年份会被跳过。
 *
 * 用法：
 *   npx tsx tools/build-trading-calendar.ts            # 默认生成 2024–今年+1
 *   npx tsx tools/build-trading-calendar.ts 2024 2027  # 指定年份区间
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'config', 'trading-calendar.json');

const thisYear = new Date().getFullYear();
const from = Number(process.argv[2] ?? thisYear - 2);
const to = Number(process.argv[3] ?? thisYear + 1);

interface ApiResp {
  code: number;
  holiday?: Record<string, { holiday: boolean; name: string; date: string }>;
}

async function fetchYear(year: number): Promise<Record<string, string>> {
  const url = `https://timor.tech/api/holiday/year/${year}`;
  const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = (await resp.json()) as ApiResp;
  if (json.code !== 0 || !json.holiday) return {};
  const out: Record<string, string> = {};
  for (const item of Object.values(json.holiday)) {
    if (item.holiday) out[item.date] = item.name; // 只取「放假日」，补班日不入库
  }
  return out;
}

async function main() {
  const holidays: Record<string, string> = {};
  const coveredYears: number[] = [];

  for (let y = from; y <= to; y++) {
    try {
      const got = await fetchYear(y);
      const n = Object.keys(got).length;
      if (n === 0) {
        console.log(`  ${y}：无数据（国务院尚未发布次年安排），跳过`);
        continue;
      }
      Object.assign(holidays, got);
      coveredYears.push(y);
      console.log(`  ${y}：${n} 天法定节假日`);
    } catch (e) {
      console.log(`  ${y}：获取失败（${(e as Error).message}），跳过`);
    }
  }

  if (Object.keys(holidays).length === 0) {
    throw new Error('未获取到任何节假日数据，请检查网络或 API 可用性');
  }

  // 按日期排序，便于人工核对
  const sorted: Record<string, string> = {};
  for (const d of Object.keys(holidays).sort()) sorted[d] = holidays[d];

  const out = {
    version: 1,
    note: 'A 股交易日历。交易日 = 周一至周五 且 非法定节假日；调休补班的周末股市不交易。',
    source: '国务院办公厅节假日安排（经 timor.tech 公开 API 获取）',
    generatedAt: new Date().toISOString().slice(0, 10),
    coveredYears,
    holidays: sorted,
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`\n✅ 已写入 ${path.relative(process.cwd(), OUT)}`);
  console.log(`   覆盖年份：${coveredYears.join(', ')}｜节假日 ${Object.keys(sorted).length} 天`);
  console.log(`   ⚠️ 未覆盖的年份会退化为「周一至周五均为交易日」，请留意`);
}

main().catch((e) => {
  console.error('❌ 生成失败：', e.message);
  process.exit(1);
});
