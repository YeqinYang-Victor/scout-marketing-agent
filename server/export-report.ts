/**
 * 导出「产业链侦察兵」日报为**单文件 HTML**（无需服务器即可打开、可邮件/微信发送）。
 *
 * 用法：
 *   npm run report
 *   npm run report -- --template scout-deep --out ./output
 *
 * 产物：output/侦察兵日报-YYYY-MM-DD.html（内联 Banner、文案、打分明细、候选排行）
 *
 * 说明：HTML 模板已抽到 `server/pipeline/export-html.ts`，
 * 与 API `GET /api/scout/export/:runId` 共用同一份实现。
 */
import fs from 'fs';
import path from 'path';
import { runPipeline } from './pipeline/run.js';
import { buildReportHtml } from './pipeline/export-html.js';
import { BANNERS_DIR, ROOT_DIR, readBrand, readRules } from './pipeline/store.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : 'true';
}

async function main() {
  console.log('🚀 生成日报并导出单文件 HTML…\n');

  const run = await runPipeline({
    templateId: arg('template'),
    sourceId: arg('source'),
    useLlm: arg('llm') === 'true',
    onStep: (s) => {
      if (s.status === 'done') console.log(`  ✅ ${s.label}${s.detail ? '：' + s.detail : ''}`);
    },
  });

  if (run.status !== 'success' || !run.topEvent || !run.report || !run.banner) {
    console.error(`\n❌ 生成失败：${run.error}`);
    process.exit(1);
  }

  const html = buildReportHtml(run, readBrand(), readRules());

  const outDir = arg('out') ?? path.join(ROOT_DIR, 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `侦察兵日报-${new Date().toISOString().slice(0, 10)}.html`);
  fs.writeFileSync(outFile, html, 'utf8');

  console.log(`\n✅ 已导出：${outFile}`);
  console.log(`🖼  Banner：${path.join(BANNERS_DIR, run.banner.pngFile ?? run.banner.svgFile)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
