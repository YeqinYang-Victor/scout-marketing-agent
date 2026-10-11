/**
 * 流水线编排：抓取 → 标准化 → 去重 → 过滤 → 打分 → 选 Top1 → 生成字段 → 渲染文案 → 生成 Banner。
 * 每一步都会回调 onStep，供前端通过 SSE 实时展示进度。
 */
import { randomUUID } from 'crypto';
import type { PipelineRun, PipelineStep, ReportFields, ScoredEvent } from './types.js';
import { readBrand, readRules, readSources, readTemplates, saveRun } from './store.js';
import { fetchFromSource } from './fetchers.js';
import { normalize } from './normalize.js';
import { applyHardFilters, dedupe, scoreAndRank, selectTop } from './scorer.js';
import { composeDraft, generateFieldsByRules } from './writer.js';
import { generateFieldsWithLLM } from './llm.js';
import { generateBanner } from './banner.js';

export interface RunOptions {
  sourceId?: string;
  templateId?: string;
  /** 是否启用大模型润色 */
  useLlm?: boolean;
  model?: string;
  date?: string;
  topN?: number;
  onStep?: (step: PipelineStep) => void;
}

export async function runPipeline(opts: RunOptions = {}): Promise<PipelineRun> {
  const startedAt = new Date();
  const run: PipelineRun = {
    id: `run-${startedAt.toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 6)}`,
    startedAt: startedAt.toISOString(),
    status: 'running',
    sourceId: '',
    sourceName: '',
    templateId: '',
    templateName: '',
    fetched: 0,
    afterFilter: 0,
    candidates: [],
    steps: [],
    llmEnabled: !!opts.useLlm,
    llmEnhanced: false,
  };

  const steps: PipelineStep[] = [
    { key: 'config', label: '读取配置', status: 'pending', ts: new Date().toISOString() },
    { key: 'fetch', label: '抓取数据源', status: 'pending', ts: new Date().toISOString() },
    { key: 'normalize', label: '标准化与去重', status: 'pending', ts: new Date().toISOString() },
    { key: 'filter', label: '按规则过滤', status: 'pending', ts: new Date().toISOString() },
    { key: 'score', label: '多维打分排序', status: 'pending', ts: new Date().toISOString() },
    { key: 'select', label: '选出头号事件', status: 'pending', ts: new Date().toISOString() },
    { key: 'fields', label: '生成内容字段', status: 'pending', ts: new Date().toISOString() },
    { key: 'copy', label: '渲染文案', status: 'pending', ts: new Date().toISOString() },
    { key: 'banner', label: '生成 Banner', status: 'pending', ts: new Date().toISOString() },
  ];
  run.steps = steps;

  const emit = (key: string, status: PipelineStep['status'], detail?: string) => {
    const s = steps.find((x) => x.key === key);
    if (!s) return;
    s.status = status;
    if (detail) s.detail = detail;
    s.ts = new Date().toISOString();
    opts.onStep?.({ ...s });
  };

  const date = opts.date ?? new Date().toISOString().slice(0, 10);

  try {
    /* ---------- 1. 读取配置 ---------- */
    emit('config', 'running');
    const sourcesFile = readSources();
    const rules = readRules();
    const templatesFile = readTemplates();
    const brand = readBrand();

    const source =
      sourcesFile.sources.find((s) => s.id === (opts.sourceId ?? sourcesFile.activeSourceId)) ??
      sourcesFile.sources.find((s) => s.enabled) ??
      sourcesFile.sources[0];
    if (!source) throw new Error('未找到可用的数据源，请先在「数据源配置」中添加');
    run.sourceId = source.id;
    run.sourceName = source.name;

    const template =
      templatesFile.templates.find((t) => t.id === (opts.templateId ?? templatesFile.activeTemplateId)) ??
      templatesFile.templates.find((t) => t.enabled) ??
      templatesFile.templates[0];
    if (!template) throw new Error('未找到可用的文案模板，请先在「模板管理」中添加');
    run.templateId = template.id;
    run.templateName = template.name;

    if (opts.topN) rules.topN = opts.topN;
    emit('config', 'done', `数据源「${source.name}」· 模板「${template.name}」`);

    /* ---------- 2. 抓取 ---------- */
    emit('fetch', 'running');
    const fetchResult = await fetchFromSource(source, {
      date,
      log: (m) => emit('fetch', 'running', m),
    });
    run.fetched = fetchResult.events.length;
    if (run.fetched === 0) throw new Error('数据源未返回任何事件，请检查数据源配置或网络');
    emit('fetch', 'done', `共抓取 ${run.fetched} 条事件${fetchResult.note ? `（${fetchResult.note}）` : ''}`);

    /* ---------- 3. 标准化与去重 ---------- */
    emit('normalize', 'running');
    const normalized = normalize(fetchResult.events);
    const deduped = dedupe(normalized);
    emit('normalize', 'done', `标准化 ${normalized.length} 条，去重后 ${deduped.length} 条`);

    /* ---------- 4. 过滤 ---------- */
    emit('filter', 'running');
    const { kept, dropped, note: filterNote } = applyHardFilters(deduped, rules);
    run.afterFilter = kept.length;
    if (kept.length === 0) {
      throw new Error(
        filterNote
          ? `筛选后无可用内容：${filterNote}`
          : `所有事件都被过滤规则排除（保留最近 ${rules.hardFilters.maxTradingDays} 个交易日），请放宽阈值`,
      );
    }
    emit(
      'filter',
      'done',
      `保留 ${kept.length} 条（最近 ${rules.hardFilters.maxTradingDays} 个交易日），排除 ${dropped.length} 条` +
        (filterNote ? ` · ${filterNote}` : ''),
    );

    /* ---------- 5. 打分排序 ---------- */
    emit('score', 'running');
    const scored = scoreAndRank(kept, rules);
    run.candidates = scored.slice(0, 20);
    emit('score', 'done', `最高分 ${scored[0]?.totalScore} 分`);

    /* ---------- 6. 选出头号事件 ---------- */
    emit('select', 'running');
    const [top] = selectTop(scored, rules);
    if (!top) throw new Error('未能选出头号事件');
    run.topEvent = top;
    emit('select', 'done', `「${top.title.slice(0, 24)}…」`);

    /* ---------- 7. 生成内容字段 ---------- */
    emit('fields', 'running');
    let fields: ReportFields = generateFieldsByRules(top, template);
    let llmEnhanced = false;
    if (opts.useLlm) {
      emit('fields', 'running', '正在调用大模型润色…');
      const res = await generateFieldsWithLLM(top, template, brand, { model: opts.model });
      if (res.ok && res.fields) {
        fields = { ...fields, ...res.fields };
        llmEnhanced = true;
        emit('fields', 'done', `大模型润色完成（${res.model}）`);
      } else {
        emit('fields', 'done', `大模型不可用，已回退规则引擎：${res.error ?? '未知原因'}`);
      }
    } else {
      emit('fields', 'done', '规则引擎生成完成');
    }
    run.llmEnhanced = llmEnhanced;

    /* ---------- 8. 渲染文案 ---------- */
    emit('copy', 'running');
    const draft = composeDraft({ event: top, template, brand, fields, llmEnhanced });
    run.report = draft;
    emit('copy', 'done', `${draft.charCount} 字`);

    /* ---------- 9. 生成 Banner ---------- */
    emit('banner', 'running');
    const banner = await generateBanner({
      event: top,
      fields,
      brand,
      date: draft.date,
      weekday: draft.weekday,
    });
    run.banner = banner;
    emit('banner', 'done', banner.pngUrl ? 'SVG + PNG 已生成' : 'SVG 已生成（PNG 需安装 sharp）');

    run.status = 'success';
    run.finishedAt = new Date().toISOString();
    saveRun(run, run.id);
    return run;
  } catch (e: any) {
    run.status = 'error';
    run.error = e?.message ?? String(e);
    run.finishedAt = new Date().toISOString();
    const running = steps.find((s) => s.status === 'running');
    if (running) {
      running.status = 'error';
      running.detail = run.error;
      opts.onStep?.({ ...running });
    }
    saveRun(run, run.id);
    return run;
  }
}

/** 便于其他模块复用的类型导出 */
export type { ScoredEvent };
