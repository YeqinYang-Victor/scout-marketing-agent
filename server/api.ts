/**
 * 业务 API 路由（挂载到 /api/scout 与 /api/banners）。
 * 前端所有配置读写、流水线触发、产物获取都走这里。
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import type { CopyTemplate, PipelineRun, ReportFields, ScoredEvent } from './pipeline/types.js';
import {
  BANNERS_DIR,
  getConfig,
  listRuns,
  loadRun,
  setConfig,
  type ConfigName,
} from './pipeline/store.js';
import { runPipeline } from './pipeline/run.js';
import { calendarMeta } from './pipeline/trading-calendar.js';
import { composeDraft, generateFieldsByRules } from './pipeline/writer.js';
import { readBrand, readRules, readTemplates } from './pipeline/store.js';
import { buildReportHtml } from './pipeline/export-html.js';

const VALID_CONFIGS: ConfigName[] = ['brand', 'sources', 'rules', 'templates'];

export function createScoutRouter(): express.Router {
  const router = express.Router();

  /* ---------------- 配置读写 ---------------- */

  router.get('/config/:name', (req, res) => {
    const name = req.params.name as ConfigName;
    if (!VALID_CONFIGS.includes(name)) return res.status(400).json({ error: '未知配置项' });
    try {
      res.json(getConfig(name));
    } catch (e: any) {
      res.status(500).json({ error: e?.message ?? '读取配置失败' });
    }
  });

  router.put('/config/:name', (req, res) => {
    const name = req.params.name as ConfigName;
    if (!VALID_CONFIGS.includes(name)) return res.status(400).json({ error: '未知配置项' });
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: '请求体必须是 JSON 对象' });
    }
    try {
      setConfig(name, req.body);
      res.json({ success: true, config: getConfig(name) });
    } catch (e: any) {
      res.status(500).json({ error: e?.message ?? '保存配置失败' });
    }
  });

  /** 一次性拉取全部配置，供前端初始化 */
  router.get('/meta', (_req, res) => {
    try {
      res.json({
        brand: getConfig('brand'),
        sources: getConfig('sources'),
        rules: getConfig('rules'),
        templates: getConfig('templates'),
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message ?? '读取配置失败' });
    }
  });

  /** A 股交易日历状态：今天是否交易日、最近若干交易日，供界面展示与排查 */
  router.get('/calendar', (_req, res) => {
    try {
      res.json(calendarMeta());
    } catch (e: any) {
      res.status(500).json({ error: e?.message ?? '读取交易日历失败' });
    }
  });

  /* ---------------- 流水线 ---------------- */

  /** 同步执行一次完整流水线 */
  router.post('/run', async (req, res) => {
    const { sourceId, templateId, useLlm, model, topN, date } = req.body ?? {};
    try {
      const run = await runPipeline({ sourceId, templateId, useLlm, model, topN, date });
      res.json(run);
    } catch (e: any) {
      res.status(500).json({ error: e?.message ?? '流水线执行失败' });
    }
  });

  /** SSE 流式执行，实时推送每一步进度 */
  router.get('/run/stream', async (req, res) => {
    const { sourceId, templateId, useLlm, model, topN } = req.query as Record<string, string>;

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const send = (payload: unknown) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

    try {
      const run = await runPipeline({
        sourceId: sourceId || undefined,
        templateId: templateId || undefined,
        useLlm: useLlm === 'true' || useLlm === '1',
        model: model || undefined,
        topN: topN ? Number(topN) : undefined,
        onStep: (step) => send({ type: 'step', step }),
      });
      send({ type: 'result', run });
    } catch (e: any) {
      send({ type: 'error', message: e?.message ?? '流水线执行失败' });
    } finally {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  });

  /* ---------------- 运行记录 ---------------- */

  router.get('/runs', (_req, res) => {
    try {
      const ids = listRuns();
      const runs = ids
        .map((f) => loadRun(f.replace(/\.json$/, '')) as any)
        .filter(Boolean)
        .map((r) => ({
          id: r.id,
          startedAt: r.startedAt,
          finishedAt: r.finishedAt,
          status: r.status,
          sourceName: r.sourceName,
          templateName: r.templateName,
          fetched: r.fetched,
          afterFilter: r.afterFilter,
          topEventTitle: r.topEvent?.title ?? '',
          topEventScore: r.topEvent?.totalScore ?? 0,
          llmEnhanced: r.llmEnhanced,
          bannerUrl: r.banner?.pngUrl ?? r.banner?.svgUrl ?? '',
        }));
      res.json({ runs });
    } catch (e: any) {
      res.status(500).json({ error: e?.message ?? '读取运行记录失败' });
    }
  });

  router.get('/runs/:id', (req, res) => {
    const run = loadRun(req.params.id);
    if (!run) return res.status(404).json({ error: '运行记录不存在' });
    res.json(run);
  });

  /* ---------------- 导出单文件 HTML 日报 ---------------- */

  router.get('/export/:id', (req, res) => {
    const run = loadRun(req.params.id) as PipelineRun | null;
    if (!run) return res.status(404).json({ error: '运行记录不存在' });
    if (!run.topEvent || !run.report || !run.banner) {
      return res.status(400).json({ error: '该次运行没有完整产物（缺事件 / 文案 / Banner），无法导出' });
    }
    try {
      const html = buildReportHtml(run, readBrand(), readRules());
      const filename = `侦察兵日报-${new Date(run.startedAt).toISOString().slice(0, 10)}.html`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      // inline：便于前端在新标签页预览；同时给出文件名便于另存
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
      res.send(html);
    } catch (e: any) {
      res.status(500).json({ error: e?.message ?? '导出失败' });
    }
  });

  /* ---------------- 换模板重新生成文案 ---------------- */

  router.post('/recompose', async (req, res) => {
    const { runId, templateId, useLlm, model } = req.body ?? {};
    const run = loadRun(runId) as any;
    if (!run) return res.status(404).json({ error: '运行记录不存在' });
    if (!run.topEvent) return res.status(400).json({ error: '该次运行没有选出头号事件' });

    const templatesFile = readTemplates();
    const template: CopyTemplate | undefined =
      templatesFile.templates.find((t) => t.id === templateId) ??
      templatesFile.templates.find((t) => t.id === run.templateId);
    if (!template) return res.status(400).json({ error: '未找到指定模板' });

    const brand = readBrand();
    const event = run.topEvent as ScoredEvent;

    let fields: ReportFields = generateFieldsByRules(event, template);
    let llmEnhanced = false;
    if (useLlm) {
      const { generateFieldsWithLLM } = await import('./pipeline/llm.js');
      const r = await generateFieldsWithLLM(event, template, brand, { model });
      if (r.ok && r.fields) {
        fields = { ...fields, ...r.fields };
        llmEnhanced = true;
      }
    }
    const draft = composeDraft({ event, template, brand, fields, llmEnhanced });
    res.json({ report: draft, llmEnhanced });
  });

  /* ---------------- Banner 静态资源 ---------------- */

  router.get('/banners/:file', (req, res) => {
    const file = path.basename(req.params.file);
    const full = path.join(BANNERS_DIR, file);
    if (!fs.existsSync(full)) return res.status(404).send('not found');
    res.type(path.extname(full));
    fs.createReadStream(full).pipe(res);
  });

  return router;
}
