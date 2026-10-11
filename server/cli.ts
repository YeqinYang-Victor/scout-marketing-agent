/**
 * 命令行入口：无需启动前端即可跑一次完整流水线，便于接入定时任务 / 服务器 cron。
 *
 * 用法：
 *   npm run pipeline
 *   npm run pipeline -- --source demo-builtin --template scout-daily-standard
 *   npm run pipeline -- --llm --model claude-sonnet-4
 */
import { runPipeline } from './pipeline/run.js';

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  const next = process.argv[idx + 1];
  return next && !next.startsWith('--') ? next : 'true';
}

async function main() {
  const useLlm = getArg('llm') === 'true';
  console.log('🚀 产业链侦察兵 · 自动化流水线\n');

  const run = await runPipeline({
    sourceId: getArg('source'),
    templateId: getArg('template'),
    useLlm,
    model: getArg('model'),
    topN: getArg('topN') ? Number(getArg('topN')) : undefined,
    onStep: (step) => {
      const icon =
        step.status === 'done' ? '✅' : step.status === 'error' ? '❌' : step.status === 'running' ? '⏳' : '•';
      console.log(`${icon} ${step.label}${step.detail ? `：${step.detail}` : ''}`);
    },
  });

  if (run.status !== 'success') {
    console.error(`\n❌ 运行失败：${run.error}`);
    process.exit(1);
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`🏆 头号事件（${run.topEvent?.totalScore} 分）`);
  console.log(run.topEvent?.title);
  console.log('─'.repeat(60));
  console.log(run.report?.text);
  console.log('─'.repeat(60));
  console.log(`🖼  Banner：${run.banner?.pngUrl ?? run.banner?.svgUrl}`);
  console.log(`📄 运行记录：server/data/runs/${run.id}.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
