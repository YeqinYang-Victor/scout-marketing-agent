/**
 * Banner 自动生成模块。
 *
 * 采用「模板化矢量渲染」而非 AI 文生图：
 *   1. 金融投顾物料对文字准确性、合规性要求极高，AI 生图容易把中文标题画错；
 *   2. SVG 矢量输出任意尺寸都清晰，且可 100% 复用品牌色与字体；
 *   3. 服务端生成 SVG 后可选转 PNG（依赖 sharp，失败自动降级为仅 SVG）。
 *
 * 所有视觉参数来自 config/brand.json，版式结构可在此文件内调整。
 */
import fs from 'fs';
import path from 'path';
import type { BrandConfig, ScoredEvent, ReportFields, BannerResult } from './types.js';
import { BANNERS_DIR } from './store.js';

/* ---------------- 文本工具 ---------------- */

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * 半角宽度单位：CJK / 全角字符算 2，ASCII 算 1。
 * 用「宽度」而不是「字符个数」来折行，中英混排的标题才不会一行过长、一行过短。
 */
function charWidth(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  if (
    (code >= 0x1100 && code <= 0x115f) || // 韩文字母
    (code >= 0x2e80 && code <= 0xa4cf) || // CJK 部首 / 汉字 / 假名
    (code >= 0xac00 && code <= 0xd7a3) || // 韩文音节
    (code >= 0xf900 && code <= 0xfaff) || // CJK 兼容汉字
    (code >= 0xfe30 && code <= 0xfe6f) || // CJK 兼容标点
    (code >= 0xff00 && code <= 0xff60) || // 全角字符
    (code >= 0xffe0 && code <= 0xffe6) || // 全角符号
    (code >= 0x20000 && code <= 0x3fffd) // CJK 扩展区
  ) {
    return 2;
  }
  return 1;
}

function strWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += charWidth(ch);
  return w;
}

/** 这些字符不能出现在行首（否则标点会被挤到下一行开头） */
const NO_LINE_START = /^[，。、；：,.;:!?！？%》）)】」》’”·…]$/;
/** 在这些字符「之后」断开最自然 */
const BREAK_AFTER = /[，。、；：,.;:!?！？\s]/;
/** 视为「词内字符」：数字 / 英文 / 股票代码，不能在中间切开 */
const ASCII_WORD = /[A-Za-z0-9]/;

/**
 * 在 [start, end) 之间找一个合法的断点。
 * 优先级：标点后 > 不切开英文/数字的位置 > 硬断。
 */
function findBreakPoint(chars: string[], start: number, end: number): number {
  // 至少填满一半，避免为了找标点而把行压得过短
  const min = start + Math.max(1, Math.floor((end - start) * 0.5));
  let fallback: number | null = null;

  for (let i = end; i > min; i--) {
    const prev = chars[i - 1];
    const next = chars[i];
    if (!prev || !next) continue;
    if (NO_LINE_START.test(next)) continue; // 该位置断开会把标点顶到行首
    if (BREAK_AFTER.test(prev)) return i; // 标点后断开，最优解
    // 不能把 "1200" / "GIS" / "2027" 这类连续 ASCII 从中间切开
    if (fallback === null && !(ASCII_WORD.test(prev) && ASCII_WORD.test(next))) fallback = i;
  }
  return fallback ?? end;
}

/**
 * 按显示宽度折行。
 * @param maxWidth 每行最大宽度（半角单位，一个汉字 = 2）
 * @param maxLines 最多行数，超出则末行以「…」收尾
 */
function wrap(text: string, maxWidth: number, maxLines: number): string[] {
  const t = String(text ?? '').trim();
  if (!t) return [];
  const chars = Array.from(t); // Array.from 才能正确处理代理对（emoji 等）
  const lines: string[] = [];
  let start = 0;

  while (start < chars.length && lines.length < maxLines) {
    const isLastAllowed = lines.length === maxLines - 1;
    // 末行要留出省略号的位置
    const budget = isLastAllowed ? Math.max(4, maxWidth - 2) : maxWidth;

    let w = 0;
    let end = start;
    while (end < chars.length && w + charWidth(chars[end]) <= budget) {
      w += charWidth(chars[end]);
      end++;
    }

    // 剩余内容全部放得下 → 收尾
    if (end >= chars.length) {
      lines.push(chars.slice(start).join(''));
      break;
    }

    if (isLastAllowed) {
      lines.push(chars.slice(start, end).join('') + '…');
      break;
    }

    const cut = findBreakPoint(chars, start, end);
    lines.push(chars.slice(start, cut).join(''));
    start = cut;
  }

  return lines;
}

/** 按显示宽度截断并补省略号 */
function clip(text: string, maxWidth: number): string {
  const t = String(text ?? '').trim();
  if (strWidth(t) <= maxWidth) return t;
  const chars = Array.from(t);
  let w = 0;
  let end = 0;
  while (end < chars.length && w + charWidth(chars[end]) <= maxWidth - 2) {
    w += charWidth(chars[end]);
    end++;
  }
  return chars.slice(0, end).join('') + '…';
}

function txt(
  content: string,
  x: number,
  y: number,
  opts: { size?: number; weight?: number; fill?: string; anchor?: string; spacing?: number } = {},
): string {
  const { size = 24, weight = 400, fill = '#14224A', anchor = 'start', spacing } = opts;
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${
    spacing ? ` letter-spacing="${spacing}"` : ''
  }>${esc(content)}</text>`;
}

/* ---------------- 主渲染 ---------------- */

export interface BannerInput {
  event: ScoredEvent;
  fields: ReportFields;
  brand: BrandConfig;
  date: string;
  weekday: string;
}

export function buildBannerSvg(input: BannerInput): string {
  const { event, fields, brand, date, weekday } = input;
  const W = brand.bannerSize.width;
  const H = brand.bannerSize.height;
  const c = brand.colors;
  const PAD = 56;

  /* ---- 1. 标题 ---- */
  // 每行宽度预算按「实际可用像素 ÷ 字号」推算，而不是拍一个字数上限
  const TITLE_SIZE = 40;
  const TITLE_LINE_H = 56;
  const titleBudget = Math.floor(((W - PAD * 2) / TITLE_SIZE) * 2);
  const headlineLines = wrap(event.title, titleBudget, 3);

  /* ---- 2. 行业标签 ---- */
  const CHIP_SIZE = 20;
  const CHIP_PAD = 36; // 左右内边距合计
  const CHIP_MAX_W = 340;
  const CHIP_GAP = 12;
  const chipMaxUnits = Math.floor((CHIP_MAX_W - CHIP_PAD) / (CHIP_SIZE / 2));
  const chips = event.sectors.slice(0, 4);
  let chipX = PAD;
  const chipY = 340;
  const chipH = 44;
  let chipSvg = '';
  for (const s of chips) {
    // 长板块名（如「气体绝缘金属封闭开关设备(GIS)」）先按宽度截断，避免文字溢出胶囊
    const label = clip(s, chipMaxUnits);
    const w = Math.min(CHIP_MAX_W, strWidth(label) * (CHIP_SIZE / 2) + CHIP_PAD);
    if (chipX + w > W - PAD) break; // 超出安全边距则不再追加
    chipSvg +=
      `<rect x="${chipX}" y="${chipY}" width="${w}" height="${chipH}" rx="22" fill="${c.primary}" opacity="0.08"/>` +
      `<rect x="${chipX}" y="${chipY}" width="${w}" height="${chipH}" rx="22" fill="none" stroke="${c.primary}" stroke-opacity="0.25"/>` +
      txt(label, chipX + w / 2, chipY + 29, { size: CHIP_SIZE, weight: 500, fill: c.primary, anchor: 'middle' });
    chipX += w + CHIP_GAP;
  }

  /* ---- 3. 产业链三栏 ---- */
  const cardY = 428;
  const cardH = 106;
  const gap = 24;
  const cardW = (W - PAD * 2 - gap * 2) / 3;
  const CHAIN_SIZE = 17;
  const chainTextW = cardW - 20 - 12; // 左内边距 20，右侧留白 12
  const chainBudget = Math.floor((chainTextW / CHAIN_SIZE) * 2);
  const chainItems: { label: string; value: string; color: string }[] = [
    { label: '上游', value: String(fields.chainUp ?? ''), color: c.accent },
    { label: '中游', value: String(fields.chainMid ?? ''), color: c.primary },
    { label: '下游', value: String(fields.chainDown ?? ''), color: c.secondary },
  ];
  let chainSvg = '';
  chainItems.forEach((item, i) => {
    const x = PAD + i * (cardW + gap);
    const lines = wrap(item.value, chainBudget, 3);
    chainSvg +=
      `<rect x="${x}" y="${cardY}" width="${cardW}" height="${cardH}" rx="14" fill="${c.bgSoft}"/>` +
      `<rect x="${x}" y="${cardY}" width="5" height="${cardH}" rx="2.5" fill="${item.color}"/>` +
      txt(item.label, x + 20, cardY + 34, { size: 21, weight: 700, fill: item.color }) +
      // 行距 21、起始 +58：三行刚好落在 106 高的卡片内（58/79/100）
      lines
        .map((l, li) => txt(l, x + 20, cardY + 58 + li * 21, { size: CHAIN_SIZE, fill: c.textMuted }))
        .join('');
  });

  /* ---- 4. 热度徽标 ---- */
  const heatText = event.heat ? `热度 ${(event.heat / 10000).toFixed(1)}万` : '';
  const changeText =
    event.marketChange > 0
      ? `板块 +${event.marketChange}%`
      : event.marketChange < 0
        ? `板块 ${event.marketChange}%`
        : '';
  const badgeText = [heatText, changeText].filter(Boolean).join('  ·  ');

  /* ---- 5. 组装 ---- */
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${esc(
    brand.fontFamily,
  )}">
  <defs>
    <linearGradient id="hdr" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${c.primary}"/>
      <stop offset="60%" stop-color="${c.primary}"/>
      <stop offset="100%" stop-color="${c.primaryDark}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="${c.primary}" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="${c.primary}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${c.bg}"/>
  <circle cx="${W - 60}" cy="150" r="230" fill="url(#glow)"/>

  <!-- 顶部品牌栏 -->
  <rect x="0" y="0" width="${W}" height="96" fill="url(#hdr)"/>
  ${txt(`${brand.brokerName} · ${brand.productName}`, PAD, 60, { size: 30, weight: 700, fill: '#FFFFFF' })}
  ${txt(`${date} ${weekday}`, W - PAD, 60, { size: 22, weight: 500, fill: '#FFFFFF', anchor: 'end' })}

  <!-- 事件标签 -->
  ${txt('TODAY\'S EVENT ｜ 今日头号事件', PAD, 148, { size: 20, weight: 700, fill: c.primary, spacing: 2 })}
  ${txt(badgeText, W - PAD, 148, { size: 19, weight: 500, fill: c.textMuted, anchor: 'end' })}

  <!-- 标题 -->
  ${headlineLines
    .map((l, i) => txt(l, PAD, 202 + i * TITLE_LINE_H, { size: TITLE_SIZE, weight: 700, fill: c.secondary }))
    .join('')}

  <!-- 行业标签 -->
  ${chipSvg}

  <!-- 产业链传导 -->
  ${txt('产业链传导路径', PAD, 410, { size: 19, weight: 700, fill: c.textMuted, spacing: 1 })}
  ${chainSvg}

  <!-- 底部合规栏 -->
  <rect x="0" y="${H - 60}" width="${W}" height="60" fill="${c.bgSoft}"/>
  ${txt(brand.footer.qrHint, PAD, H - 24, { size: 18, weight: 600, fill: c.primary })}
  ${txt(brand.footer.disclaimer, W - PAD, H - 24, { size: 14, fill: c.textMuted, anchor: 'end' })}
</svg>`;
}

/* ---------------- 落盘 ---------------- */

export async function generateBanner(input: BannerInput): Promise<BannerResult> {
  if (!fs.existsSync(BANNERS_DIR)) fs.mkdirSync(BANNERS_DIR, { recursive: true });

  const svg = buildBannerSvg(input);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = `banner-${stamp}-${input.event.id}`;
  fs.writeFileSync(path.join(BANNERS_DIR, `${base}.svg`), svg, 'utf8');

  const result: BannerResult = {
    // 只存文件名，不存绝对路径（见 BannerResult 注释）
    svgFile: `${base}.svg`,
    svgUrl: `/api/scout/banners/${base}.svg`,
    width: input.brand.bannerSize.width,
    height: input.brand.bannerSize.height,
    headline: input.event.title,
  };

  // 可选：转 PNG（依赖 sharp；失败不影响主流程）
  try {
    const sharpMod = (await import('sharp')).default;
    await sharpMod(Buffer.from(svg), { density: 144 })
      .png()
      .toFile(path.join(BANNERS_DIR, `${base}.png`));
    result.pngFile = `${base}.png`;
    result.pngUrl = `/api/scout/banners/${base}.png`;
  } catch {
    /* 无 sharp 时仅输出 SVG */
  }

  return result;
}
