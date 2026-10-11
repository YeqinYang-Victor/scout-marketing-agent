/**
 * 单文件 HTML 日报生成器。
 *
 * 抽成独立模块的原因：既供命令行 `npm run report` 使用，
 * 也供 API `GET /api/scout/export/:runId` 使用，避免两份模板各写一遍。
 */
import fs from 'fs';
import path from 'path';
import { BANNERS_DIR } from './store.js';
import type { BrandConfig, FilterRules, PipelineRun } from './types.js';

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** 把 Banner 文件读成 data URI（运行记录里存的是文件名，这里拼回绝对路径） */
function inlineImage(fileName?: string, mime = 'image/svg+xml'): string {
  if (!fileName) return '';
  const filePath = path.join(BANNERS_DIR, fileName);
  if (!fs.existsSync(filePath)) return '';
  const b64 = fs.readFileSync(filePath).toString('base64');
  return `data:${mime};base64,${b64}`;
}

/** 生成自包含（图片内联）的单文件 HTML 日报 */
export function buildReportHtml(run: PipelineRun, brand: BrandConfig, rules: FilterRules): string {
  const top = run.topEvent!;
  const report = run.report!;
  const banner = run.banner!;
  const c = brand.colors;

  const bannerSrc = banner.pngFile
    ? inlineImage(banner.pngFile, 'image/png')
    : inlineImage(banner.svgFile);

  const dimRows = top.breakdown
    .map(
      (b) => `
      <tr>
        <td class="dim">${esc(b.label)}</td>
        <td class="w">${Math.round(b.weight * 100)}%</td>
        <td class="bar-cell">
          <div class="bar"><span style="width:${b.score}%"></span></div>
          <span class="score">${b.score}</span>
        </td>
        <td class="detail">${esc(b.detail)}</td>
      </tr>`,
    )
    .join('');

  const candRows = run.candidates
    .slice(0, 10)
    .map(
      (x) => `
      <tr class="${x.rank === 1 ? 'top' : ''}">
        <td class="rank">${x.rank}</td>
        <td class="title">${esc(x.title)}</td>
        <td class="sectors">${esc(x.sectors.slice(0, 3).join('、'))}</td>
        <td class="num">${(x.heat / 10000).toFixed(1)}万</td>
        <td class="num ${x.marketChange > 0 ? 'up' : x.marketChange < 0 ? 'down' : ''}">${x.marketChange > 0 ? '+' : ''}${x.marketChange}%</td>
        <td class="num total">${x.totalScore}</td>
      </tr>`,
    )
    .join('');

  const weightSummary = rules.dimensions
    .map((d) => `${esc(d.label)} ${Math.round(d.weight * 100)}%`)
    .join(' · ');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(brand.productName)}日报 · ${esc(report.date)}</title>
<style>
  :root{
    --primary:${esc(c.primary)}; --primary-dark:${esc(c.primaryDark)};
    --secondary:${esc(c.secondary)}; --accent:${esc(c.accent)};
    --bg:#f5f6fa; --card:#fff; --text:${esc(c.text)}; --muted:${esc(c.textMuted)};
    --up:${esc(c.up)}; --down:${esc(c.down)}; --line:#e6e8f0;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--text);
    font-family:PingFang SC,Hiragino Sans GB,Microsoft YaHei,system-ui,sans-serif;
    line-height:1.6;padding:32px 20px 64px}
  .wrap{max-width:1000px;margin:0 auto}
  .head{background:linear-gradient(120deg,var(--primary),var(--primary-dark));color:#fff;
    border-radius:16px;padding:26px 30px;box-shadow:0 8px 28px rgba(199,0,11,.18)}
  .head h1{font-size:23px;font-weight:700;letter-spacing:.5px}
  .head p{opacity:.9;font-size:13px;margin-top:6px}
  .meta{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}
  .chip{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);
    border-radius:999px;padding:5px 13px;font-size:12px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:14px;
    padding:22px 24px;margin-top:20px}
  .card h2{font-size:15px;font-weight:700;margin-bottom:14px;display:flex;align-items:center;gap:8px}
  .card h2::before{content:"";width:4px;height:16px;border-radius:2px;background:var(--primary)}
  .banner{width:100%;border-radius:12px;border:1px solid var(--line);display:block}
  pre.copy{white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.95;
    background:#fbfbfd;border:1px solid var(--line);border-radius:10px;padding:20px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;font-weight:600;color:var(--muted);font-size:12px;
    padding:8px 10px;border-bottom:1px solid var(--line)}
  td{padding:10px;border-bottom:1px solid #f0f1f6;vertical-align:middle}
  tr:last-child td{border-bottom:none}
  tr.top td{background:rgba(199,0,11,.045)}
  .dim{font-weight:600;width:96px}
  .w{color:var(--muted);width:52px}
  .bar-cell{width:190px}
  .bar{display:inline-block;vertical-align:middle;width:130px;height:7px;border-radius:4px;
    background:#eef0f6;overflow:hidden}
  .bar span{display:block;height:100%;border-radius:4px;background:var(--primary)}
  .score{margin-left:9px;font-weight:700;color:var(--primary);font-size:12px}
  .detail{color:var(--muted);font-size:12px}
  .rank{width:34px;font-weight:700;color:var(--muted)}
  tr.top .rank{color:var(--primary)}
  .title{font-weight:500}
  .sectors{color:var(--muted);font-size:12px;width:150px}
  .num{text-align:right;width:74px;font-variant-numeric:tabular-nums}
  .total{font-weight:700;color:var(--primary)}
  .up{color:var(--up)} .down{color:var(--down)}
  .tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
  .tag{font-size:12px;padding:4px 11px;border-radius:999px;background:rgba(199,0,11,.07);
    color:var(--primary);border:1px solid rgba(199,0,11,.18)}
  .tag.gray{background:#f2f3f8;color:var(--muted);border-color:var(--line)}
  .kv{display:grid;grid-template-columns:110px 1fr;gap:8px 14px;font-size:13px}
  .kv dt{color:var(--muted)}
  .note{margin-top:22px;font-size:12px;color:var(--muted);text-align:center;line-height:1.9}
  @media(max-width:720px){.detail,.sectors{display:none}.bar{width:70px}}
</style>
</head>
<body>
<div class="wrap">

  <div class="head">
    <h1>${esc(brand.brokerName)} · ${esc(brand.productName)}</h1>
    <p>${esc(brand.slogan)} ｜ 营销文案自动化生产 Agent · 日报样例</p>
    <div class="meta">
      <span class="chip">📅 ${esc(report.date)} ${esc(report.weekday)}</span>
      <span class="chip">📡 数据源：${esc(run.sourceName)}</span>
      <span class="chip">📝 模板：${esc(report.templateName)}</span>
      <span class="chip">🗂 抓取 ${run.fetched} 条 · 入选 ${run.afterFilter} 条</span>
      <span class="chip">${run.llmEnhanced ? '✨ 大模型润色' : '⚙️ 规则引擎生成'}</span>
      <span class="chip">🕐 ${esc(new Date(run.startedAt).toLocaleString('zh-CN'))}</span>
    </div>
  </div>

  <div class="card">
    <h2>App 首页 Banner（自动生成 · ${banner.width}×${banner.height}）</h2>
    ${bannerSrc ? `<img class="banner" src="${bannerSrc}" alt="banner">` : '<p>未生成 Banner</p>'}
  </div>

  <div class="card">
    <h2>日报文案（客户经理可直接转发）</h2>
    <pre class="copy">${esc(report.text)}</pre>
    <div class="tags">
      <span class="tag gray">${report.charCount} 字</span>
      <span class="tag gray">${esc(report.channel)}</span>
      ${top.sectors.map((s) => `<span class="tag">${esc(s)}</span>`).join('')}
    </div>
  </div>

  <div class="card">
    <h2>头号事件与打分明细</h2>
    <div class="kv" style="margin-bottom:16px">
      <dt>事件标题</dt><dd><strong>${esc(top.title)}</strong></dd>
      <dt>来源 / 时间</dt><dd>${esc(top.source)} · 发布距今 ${top.ageHours} 小时</dd>
      <dt>综合得分</dt><dd><strong style="color:var(--primary);font-size:18px">${top.totalScore}</strong> 分</dd>
    </div>
    <table>
      <thead><tr><th>评分维度</th><th>权重</th><th>得分</th><th>打分依据</th></tr></thead>
      <tbody>${dimRows}</tbody>
    </table>
    ${
      top.adjustments.length
        ? `<div class="tags">${top.adjustments
            .map(
              (a) =>
                `<span class="tag" style="${a.delta > 0 ? '' : 'background:#fff4e6;color:#e37318;border-color:#ffd8a8'}">${
                  esc(a.keyword)
                } ${a.delta > 0 ? '+' + a.delta : a.delta}</span>`,
            )
            .join('')}</div>`
        : ''
    }
  </div>

  <div class="card">
    <h2>候选事件排行（Top ${Math.min(10, run.candidates.length)}）</h2>
    <table>
      <thead><tr><th>#</th><th>事件</th><th>涉及行业</th><th style="text-align:right">热度</th><th style="text-align:right">板块</th><th style="text-align:right">总分</th></tr></thead>
      <tbody>${candRows}</tbody>
    </table>
  </div>

  <div class="card">
    <h2>本次使用的筛选规则</h2>
    <div class="kv">
      <dt>维度权重</dt><dd>${weightSummary}</dd>
      <dt>硬性条件</dt><dd>最低热度 ${rules.hardFilters.minHeat} · 保留最近 ${rules.hardFilters.maxTradingDays} 个交易日 · 选出 Top${rules.topN}</dd>
      <dt>排除关键词</dt><dd>${esc(rules.excludeKeywords.join('、')) || '无'}</dd>
      <dt>加分关键词</dt><dd>${esc(rules.keywordBoosts.map((k) => k.keyword).join('、')) || '无'}</dd>
    </div>
  </div>

  <p class="note">
    ${esc(brand.footer.disclaimer)}<br>
    本页面由「${esc(brand.productName)}」自动生成 · ${esc(brand.footer.complianceCode)}
  </p>
</div>
</body>
</html>`;
}
