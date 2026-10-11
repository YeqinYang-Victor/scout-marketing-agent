/**
 * 今日工作台 —— 面向券商客户经理的「今日日报」工作台。
 *
 * 设计原则（详见 docs/design/工作台设计说明.md）：
 *   1. 结果优先：流水线内部机制（9 步流程、五维打分）折叠收起，首屏只放「能发给客户的东西」；
 *   2. 唯一主操作：空态是「生成今日日报」，结果态是「复制文案，发给客户」；
 *   3. 文案即产品：用聊天气泡预览客户看到的样子；
 *   4. 合规可见：顶部给出真实的自检结果，而不是一句写死的「通过」。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessagePlugin, Select, Switch } from 'tdesign-react';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Copy,
  Database,
  Download,
  FileText,
  History,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Wand2,
  XCircle,
} from 'lucide-react';
import {
  api,
  runPipelineStream,
  type Meta,
  type PipelineRun,
  type PipelineStep,
  type ReportDraft,
  type RunSummary,
} from '../api/scout';
import { Card, CardHead, Chip, Fold, GhostButton, IconBubble, Metric, PrimaryButton, ScoreRing, SmallButton } from '../components/scout/atoms';
import { HistoryDrawer } from '../components/scout/HistoryDrawer';

/* ------------------------------------------------------------------ */
/* 流水线步骤 → 用户可理解的 4 个阶段                                    */
/* ------------------------------------------------------------------ */

const STEP_DEFS: { key: string; label: string }[] = [
  { key: 'config', label: '读取配置' },
  { key: 'fetch', label: '抓取数据源' },
  { key: 'normalize', label: '标准化与去重' },
  { key: 'filter', label: '按规则过滤' },
  { key: 'score', label: '多维打分排序' },
  { key: 'select', label: '选出头号事件' },
  { key: 'fields', label: '生成内容字段' },
  { key: 'copy', label: '渲染文案' },
  { key: 'banner', label: '生成 Banner' },
];

const STAGES = [
  { key: 'fetch', label: '抓取今日资讯', desc: '从订阅源读取热点事件', steps: ['config', 'fetch', 'normalize'] },
  { key: 'pick', label: '筛选影响最大的热点', desc: '去重并按影响力排序', steps: ['filter', 'score', 'select'] },
  { key: 'write', label: '撰写客户文案', desc: '套用模板生成可转发文案', steps: ['fields', 'copy'] },
  { key: 'image', label: '生成配图', desc: '按品牌规范排版 Banner', steps: ['banner'] },
];

const initialSteps = (): PipelineStep[] =>
  STEP_DEFS.map((s) => ({ ...s, status: 'pending', ts: new Date().toISOString() }));

type StageStatus = 'done' | 'active' | 'error' | 'wait';

function computeStages(steps: PipelineStep[]) {
  const byKey = new Map(steps.map((s) => [s.key, s]));
  return STAGES.map((st) => {
    const mine = st.steps.map((k) => byKey.get(k)).filter(Boolean) as PipelineStep[];
    const hasError = mine.some((s) => s.status === 'error');
    const runningStep = mine.find((s) => s.status === 'running');
    const allDone = mine.length > 0 && mine.every((s) => s.status === 'done' || s.status === 'skipped');
    const status: StageStatus = hasError ? 'error' : allDone ? 'done' : runningStep ? 'active' : 'wait';
    const detail =
      runningStep?.detail ??
      [...mine].reverse().find((s) => s.detail)?.detail ??
      st.desc;
    return { ...st, status, detail };
  });
}

/* ------------------------------------------------------------------ */
/* 合规自检：真实检查文案里是否混入投资建议类表述                        */
/* ------------------------------------------------------------------ */

const COMPLIANCE_BANNED = [
  '波段机会', '逢低布局', '逢低买入', '仓位', '止盈', '止损', '加仓', '减仓',
  '建议买入', '建议卖出', '推荐买入', '必涨', '稳赚', '保本', '目标价', '重仓',
];

function complianceCheck(text: string): { ok: boolean; hits: string[] } {
  const hits = COMPLIANCE_BANNED.filter((k) => text.includes(k));
  return { ok: hits.length === 0, hits };
}

/* ------------------------------------------------------------------ */
/* 文案气泡：让客户经理看到「客户收到的样子」                            */
/* ------------------------------------------------------------------ */

const HEAD_MARK = /^(🔥|📌|📊|🔗|🎯|⚠️|【|━|—)/;

/** 按行给文案着色。brokerName 由品牌配置传入，避免把品牌名写死在代码里 */
function lineClass(line: string, brokerName: string): string {
  const t = line.trim();
  if (t.startsWith('🔥')) return 'text-brand font-bold';
  if (t.startsWith('【')) return 'text-brand font-bold';
  if (HEAD_MARK.test(t)) return 'text-ink font-bold';
  // 页脚（品牌署名 / 免责声明）弱化显示
  if ((brokerName && t.startsWith(brokerName)) || t.startsWith('本内容由')) {
    return 'text-ink-mute text-[12.5px]';
  }
  if (/^[—━]/.test(t)) return 'text-ink-faint tracking-[2px]';
  return '';
}

function CopyBubble({ text, brokerName = '' }: { text: string; brokerName?: string }) {
  const lines = useMemo(() => text.split('\n'), [text]);
  return (
    <div className="bg-[#F7F9FC] px-5 py-[18px]">
      <div className="flex items-center gap-1.5 text-[11px] text-ink-faint mb-2.5">
        <Target size={12} />
        以下为客户收到的完整内容
      </div>
      <div
        className="relative bg-white border border-hairline rounded-[4px_14px_14px_14px] px-[18px] py-4
          shadow-[0_1px_2px_rgba(20,34,74,.05)]"
      >
        <div className="text-[13.5px] leading-[1.95] text-ink">
          {lines.map((line, i) => (
            <div key={i} className={`whitespace-pre-wrap ${lineClass(line, brokerName)}`}>
              {line || '\u00A0'}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 生成设置：数据源 / 模板 / AI 润色                                     */
/* ------------------------------------------------------------------ */

function SettingsPanel({
  meta,
  sourceId,
  templateId,
  useLlm,
  onSource,
  onTemplate,
  onLlm,
}: {
  meta: Meta | null;
  sourceId: string;
  templateId: string;
  useLlm: boolean;
  onSource: (v: string) => void;
  onTemplate: (v: string) => void;
  onLlm: (v: boolean) => void;
}) {
  const sourceOptions = (meta?.sources.sources ?? []).map((s) => ({
    label: `${s.name}${s.enabled ? '' : '（未启用）'}`,
    value: s.id,
  }));
  const templateOptions = (meta?.templates.templates ?? []).map((t) => ({ label: t.name, value: t.id }));

  return (
    <div className="w-[320px] p-4 space-y-3.5">
      <label className="block">
        <div className="text-[11.5px] text-ink-mute mb-1.5">数据源</div>
        <Select value={sourceId} onChange={(v) => onSource(String(v))} options={sourceOptions} size="small" style={{ width: '100%' }} />
      </label>
      <label className="block">
        <div className="text-[11.5px] text-ink-mute mb-1.5">文案模板</div>
        <Select value={templateId} onChange={(v) => onTemplate(String(v))} options={templateOptions} size="small" style={{ width: '100%' }} />
      </label>
      <label className="flex items-center gap-2 text-[12.5px] text-ink-soft">
        <Switch value={useLlm} onChange={(v) => onLlm(Boolean(v))} size="small" />
        大模型润色
        <span className="ml-auto text-[11px] text-ink-faint">需配置 API Key</span>
      </label>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 主组件                                                              */
/* ------------------------------------------------------------------ */

export function ScoutDashboard() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [view, setView] = useState<'idle' | 'running' | 'done'>('idle');
  const [steps, setSteps] = useState<PipelineStep[]>(initialSteps);
  const [run, setRun] = useState<PipelineRun | null>(null);
  const [report, setReport] = useState<ReportDraft | null>(null);
  const [running, setRunning] = useState(false);
  const [sourceId, setSourceId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [useLlm, setUseLlm] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [recent, setRecent] = useState<RunSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const streamRef = useRef<{ cancel: () => void } | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);

  /** 演示模式：访问 /?autorun=1 时自动跑一次，便于截图与演示 */
  const autorun = useMemo(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('autorun'),
    [],
  );
  /** 演示模式：访问 /?history=1 时自动打开历史记录抽屉 */
  const autoHistory = useMemo(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('history'),
    [],
  );
  const [autoRan, setAutoRan] = useState(false);

  const refreshRecent = useCallback(() => {
    api
      .runs()
      .then((r) => setRecent(r.runs.slice(0, 3)))
      .catch(() => {
        /* 历史记录失败不影响主流程 */
      });
  }, []);

  useEffect(() => {
    api
      .meta()
      .then((m) => {
        setMeta(m);
        setSourceId(m.sources.activeSourceId || m.sources.sources[0]?.id || '');
        setTemplateId(m.templates.activeTemplateId || m.templates.templates[0]?.id || '');
      })
      .catch((e) => setLoadError(e.message));
    refreshRecent();
    return () => streamRef.current?.cancel();
  }, [refreshRecent]);

  /* 生成中计时 */
  useEffect(() => {
    if (!running) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((v) => v + 0.1), 100);
    return () => clearInterval(t);
  }, [running]);

  /* 点击外部关闭生成设置 */
  useEffect(() => {
    if (!settingsOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setSettingsOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [settingsOpen]);

  const handleRun = useCallback(() => {
    if (running) return;
    setRunning(true);
    setView('running');
    setRun(null);
    setReport(null);
    setSteps(initialSteps());
    streamRef.current?.cancel();
    streamRef.current = runPipelineStream(
      { sourceId, templateId, useLlm },
      {
        onStep: (step) => setSteps((prev) => prev.map((s) => (s.key === step.key ? { ...s, ...step } : s))),
        onResult: (r) => {
          setRun(r);
          setReport(r.report ?? null);
          setRunning(false);
          if (r.status === 'success') {
            setView('done');
            refreshRecent();
            MessagePlugin.success('日报生成完成');
          } else {
            setView('idle');
            MessagePlugin.error(r.error || '生成失败');
          }
        },
        onError: (msg) => {
          setRunning(false);
          setView('idle');
          MessagePlugin.error(msg);
        },
      },
    );
  }, [running, sourceId, templateId, useLlm, refreshRecent]);

  useEffect(() => {
    if (autorun && meta && !autoRan && !running) {
      setAutoRan(true);
      handleRun();
    }
  }, [autorun, meta, autoRan, running, handleRun]);

  useEffect(() => {
    if (autoHistory) setHistoryOpen(true);
  }, [autoHistory]);

  const handleRecompose = useCallback(
    async (tid: string) => {
      if (!run) return;
      setTemplateId(tid);
      try {
        const res = await api.recompose({ runId: run.id, templateId: tid, useLlm });
        setReport(res.report);
        MessagePlugin.success('已按新模板重新生成');
      } catch (e: any) {
        MessagePlugin.error(e.message);
      }
    },
    [run, useLlm],
  );

  const handleCopy = useCallback(async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report.text);
      MessagePlugin.success('文案已复制，可直接粘贴到客户群');
    } catch {
      MessagePlugin.error('复制失败，请手动选择文本复制');
    }
  }, [report]);

  /** 从历史记录载入某次运行 */
  const handlePickHistory = useCallback((detail: PipelineRun) => {
    setRun(detail);
    setReport(detail.report ?? null);
    setSteps(detail.steps ?? initialSteps());
    if (detail.sourceId) setSourceId(detail.sourceId);
    if (detail.templateId) setTemplateId(detail.templateId);
    setView('done');
  }, []);

  const top = run?.topEvent;
  const banner = run?.banner;
  const stages = useMemo(() => computeStages(steps), [steps]);
  const doneCount = steps.filter((s) => s.status === 'done' || s.status === 'skipped').length;
  const progress = Math.round((doneCount / Math.max(1, steps.length)) * 100);
  const compliance = useMemo(() => (report ? complianceCheck(report.text) : { ok: true, hits: [] }), [report]);
  const sourceName = meta?.sources.sources.find((s) => s.id === sourceId)?.name ?? '—';
  const templateName = meta?.templates.templates.find((t) => t.id === templateId)?.name ?? '—';
  const todayLabel = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  const templateOptions = (meta?.templates.templates ?? []).map((t) => ({ label: t.name, value: t.id }));

  return (
    <div className="h-full flex flex-col bg-[#F4F6FA]">
      {/* ============ 顶栏 ============ */}
      <header className="flex items-center gap-3 flex-wrap px-4 py-3.5 lg:px-[26px] lg:py-4 bg-white border-b border-hairline">
        <h1 className="text-[16px] lg:text-[17px] font-bold tracking-[.2px] text-ink whitespace-nowrap basis-full lg:basis-auto">
          今日工作台
        </h1>
        <span className="text-[11.5px] font-semibold text-brand bg-brand-soft rounded-full px-2.5 py-[3px] whitespace-nowrap">
          {todayLabel}
        </span>
        <div className="flex-1 min-w-0" />
        <GhostButton onClick={() => setHistoryOpen(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 8v4l3 2" />
            <circle cx="12" cy="12" r="9" />
          </svg>
          <span className="hidden lg:inline">历史记录</span>
        </GhostButton>

        <div className="relative" ref={settingsRef}>
          <GhostButton onClick={() => setSettingsOpen((v) => !v)} active={settingsOpen}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 8.9 19a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>
            <span className="hidden lg:inline">生成设置</span>
          </GhostButton>
          {settingsOpen && (
            <div className="absolute right-0 top-[calc(100%+8px)] z-30 bg-white border border-hairline rounded-xl shadow-[0_2px_6px_-2px_rgba(20,34,74,.06),0_12px_28px_-14px_rgba(20,34,74,.14)]">
              <SettingsPanel
                meta={meta}
                sourceId={sourceId}
                templateId={templateId}
                useLlm={useLlm}
                onSource={setSourceId}
                onTemplate={setTemplateId}
                onLlm={setUseLlm}
              />
            </div>
          )}
        </div>

        <div className="grid place-items-center w-[31px] h-[31px] shrink-0 rounded-full bg-gradient-to-br from-[#2B3A63] to-ink text-white text-[12px] font-semibold">
          王
        </div>
      </header>

      {/* ============ 内容区 ============ */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-[150px] lg:px-[26px] lg:pt-6 lg:pb-10">
        <div className="max-w-[1240px] mx-auto">
          {loadError && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>无法读取配置：{loadError}。请确认后端服务（端口 3000）已启动。</span>
            </div>
          )}

          {/* ---------- 空态 ---------- */}
          {view === 'idle' && (
            <>
              <div className="relative bg-white border border-hairline rounded-[20px] px-6 py-9 lg:px-10 lg:py-11 text-center overflow-hidden shadow-[0_2px_6px_-2px_rgba(20,34,74,.06),0_12px_28px_-14px_rgba(20,34,74,.14)]">
                <div className="absolute -top-px -left-px -right-px h-[3px] bg-gradient-to-r from-brand via-[#E8A33D] to-brand opacity-85" />
                <div className="text-[20px] lg:text-[23px] font-bold tracking-[.3px] text-ink">
                  {new Date().getHours() < 12 ? '早上好' : new Date().getHours() < 18 ? '下午好' : '晚上好'}，王经理 👋
                </div>
                <p className="text-[13px] text-ink-mute mt-2.5 leading-[1.8]">
                  今天是 {new Date().getMonth() + 1} 月 {new Date().getDate()} 日。点一下，我帮你把今天最值得发给客户的
                  <br className="hidden lg:block" />
                  产业链热点，写成可直接转发的日报，并配好 App 首页图。
                </p>
                <div className="mt-6 flex justify-center">
                  <PrimaryButton size="lg" onClick={handleRun}>
                    <Play size={17} />
                    生成今日日报
                  </PrimaryButton>
                </div>

                {/* 生成设置：视觉上安静，不与主操作抢注意力 */}
                <div className="mt-6 pt-5 border-t border-dashed border-hairline flex flex-wrap justify-center gap-2.5">
                  <button
                    onClick={() => setSettingsOpen((v) => !v)}
                    className="inline-flex items-center gap-2 text-[12px] text-ink-soft bg-[#FBFCFE] border border-hairline rounded-full pl-3 pr-2 py-1.5 hover:border-ink-faint transition-colors"
                  >
                    <Database size={12} className="text-ink-faint" />
                    <span className="text-ink-faint">数据源</span>
                    <span className="font-semibold text-ink max-w-[190px] truncate">{sourceName}</span>
                    <ChevronRight size={13} className="text-ink-faint" />
                  </button>
                  <button
                    onClick={() => setSettingsOpen((v) => !v)}
                    className="inline-flex items-center gap-2 text-[12px] text-ink-soft bg-[#FBFCFE] border border-hairline rounded-full pl-3 pr-2 py-1.5 hover:border-ink-faint transition-colors"
                  >
                    <FileText size={12} className="text-ink-faint" />
                    <span className="text-ink-faint">模板</span>
                    <span className="font-semibold text-ink">{templateName}</span>
                    <ChevronRight size={13} className="text-ink-faint" />
                  </button>
                  <button
                    onClick={() => setSettingsOpen((v) => !v)}
                    className="inline-flex items-center gap-2 text-[12px] text-ink-soft bg-[#FBFCFE] border border-hairline rounded-full pl-3 pr-2 py-1.5 hover:border-ink-faint transition-colors"
                  >
                    <Wand2 size={12} className="text-ink-faint" />
                    <span className="text-ink-faint">AI 润色</span>
                    <span className="font-semibold text-ink">{useLlm ? '开启' : '关闭'}</span>
                    <ChevronRight size={13} className="text-ink-faint" />
                  </button>
                </div>
                <div className="mt-3.5 text-[11.5px] text-ink-faint">生成后可直接复制发给客户</div>
              </div>

              {recent.length > 0 && (
                <div className="mt-[22px]">
                  <div className="flex items-center gap-2.5 mb-3 px-0.5">
                    <h2 className="text-[13.5px] font-bold text-ink">最近生成</h2>
                    <div className="flex-1" />
                    <SmallButton onClick={() => setHistoryOpen(true)}>全部记录</SmallButton>
                  </div>
                  <div className="grid gap-2.5 lg:grid-cols-3">
                    {recent.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => api.runDetail(r.id).then(handlePickHistory).catch((e) => MessagePlugin.error(e.message))}
                        className="text-left bg-white border border-hairline rounded-xl px-[15px] py-[13px] hover:border-[#D9DEEA] hover:shadow-[0_2px_6px_-2px_rgba(20,34,74,.06),0_12px_28px_-14px_rgba(20,34,74,.14)] hover:-translate-y-px transition-all"
                      >
                        <div className="text-[11px] text-ink-faint">
                          {new Date(r.startedAt).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })} ·{' '}
                          {new Date(r.startedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="mt-1.5 text-[12.5px] font-semibold leading-[1.55] text-ink line-clamp-2">
                          {r.topEventTitle || '（无头号事件）'}
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-[11px] text-ink-mute">
                          <Chip>{r.templateName}</Chip>
                          {r.status === 'success' && <span className="font-semibold text-brand">{r.topEventScore} 分</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ---------- 生成中 ---------- */}
          {view === 'running' && (
            <div className="bg-white border border-hairline rounded-[20px] px-6 py-8 lg:px-10 lg:py-9 shadow-[0_2px_6px_-2px_rgba(20,34,74,.06),0_12px_28px_-14px_rgba(20,34,74,.14)]">
              <div className="flex items-center gap-3">
                <Loader2 size={22} className="animate-spin text-brand shrink-0" />
                <b className="text-[15px] text-ink">正在生成今日日报…</b>
                <span className="ml-auto text-[12px] text-ink-mute tabular-nums">已用时 {elapsed.toFixed(1)} 秒</span>
              </div>
              <div className="mt-5 h-[5px] rounded-full bg-hairline-soft overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#D4000E] to-[#E8A33D] transition-[width] duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-6 grid gap-3 grid-cols-2 lg:grid-cols-4">
                {stages.map((st) => (
                  <div
                    key={st.key}
                    className={`border rounded-xl px-3.5 py-3.5 ${
                      st.status === 'done'
                        ? 'bg-[#F7FCF9] border-[rgba(15,157,88,.22)]'
                        : st.status === 'active'
                          ? 'bg-brand-soft border-brand-soft2'
                          : st.status === 'error'
                            ? 'bg-red-50 border-red-200'
                            : 'bg-[#FCFDFF] border-hairline'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
                      {st.status === 'done' ? (
                        <Check size={15} className="text-down shrink-0" />
                      ) : st.status === 'active' ? (
                        <Loader2 size={15} className="animate-spin text-brand shrink-0" />
                      ) : st.status === 'error' ? (
                        <XCircle size={15} className="text-red-500 shrink-0" />
                      ) : (
                        <span className="w-[15px] h-[15px] shrink-0 grid place-items-center">
                          <span className="w-2 h-2 rounded-full bg-[#DDE2EC]" />
                        </span>
                      )}
                      {st.label}
                    </div>
                    <div className="mt-1.5 text-[11px] text-ink-mute leading-[1.6] line-clamp-2">{st.detail}</div>
                  </div>
                ))}
              </div>
              <div className="mt-6 space-y-2.5">
                {[46, 92, 88, 74].map((w, i) => (
                  <div
                    key={i}
                    className="h-[13px] rounded-md animate-pulse"
                    style={{
                      width: `${w}%`,
                      background: 'linear-gradient(90deg,#F1F3F8 25%,#E7EAF2 37%,#F1F3F8 63%)',
                      backgroundSize: '400% 100%',
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ---------- 结果态 ---------- */}
          {view === 'done' && top && report && (
            <>
              {/* 状态栏 */}
              <div className="flex items-center gap-2.5 flex-wrap bg-white border border-hairline rounded-xl px-[15px] py-2.5 mb-[15px] text-[12px] text-ink-mute">
                {compliance.ok ? (
                  <Chip tone="ok">
                    <ShieldCheck size={12} /> 合规自检通过
                  </Chip>
                ) : (
                  <Chip tone="line" className="!text-red-600 !border-red-200">
                    <AlertTriangle size={12} /> 合规自检提示：{compliance.hits.join('、')}
                  </Chip>
                )}
                <span>
                  生成于 {new Date(run!.startedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <Chip tone="line">{report.templateName}</Chip>
                <Chip tone="line">{report.charCount} 字</Chip>
                {report.llmEnhanced && (
                  <Chip tone="ok">
                    <Sparkles size={12} /> AI 润色
                  </Chip>
                )}
                <div className="flex-1" />
                <SmallButton onClick={handleRun} className="hidden lg:inline-flex">
                  <RefreshCw size={13} /> 重新生成
                </SmallButton>
              </div>

              <div className="grid gap-[15px] lg:grid-cols-[minmax(0,1fr)_336px] lg:items-start">
                {/* ---- 主列 ---- */}
                <div>
                  <Card>
                    {/* 头号事件 */}
                    <div className="px-5 pt-[19px] pb-4 border-b border-hairline-soft">
                      <div className="flex items-center gap-2 text-[11px] font-bold tracking-[1.4px] text-brand mb-2.5">
                        今日头号事件
                        <span className="flex-1 h-px bg-gradient-to-r from-brand-soft2 to-transparent" />
                      </div>
                      <div className="flex gap-4 items-start">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-[18px] lg:text-[19.5px] font-bold leading-[1.5] tracking-[.2px] text-ink">
                            {top.title}
                          </h3>
                        </div>
                        <ScoreRing score={top.totalScore} size={48} />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        {top.sectors.map((s) => (
                          <Chip key={s} tone="brand">
                            {s}
                          </Chip>
                        ))}
                        <Chip tone="line">来源：{top.source}</Chip>
                      </div>
                      <div className="flex gap-5 lg:gap-6 mt-4 pt-4 border-t border-dashed border-hairline">
                        <Metric label="最强板块">
                          <span className={top.marketChange >= 0 ? 'text-up' : 'text-down'}>
                            {top.sectors[0] ?? '—'} {top.marketChange > 0 ? '+' : ''}
                            {top.marketChange}%
                          </span>
                        </Metric>
                        <Metric label="综合得分">
                          <span className="text-brand">{top.totalScore}</span>
                        </Metric>
                        <Metric label="涉及个股">{top.stocks.length} 只</Metric>
                      </div>
                    </div>

                    {/* 文案 */}
                    <div className="flex items-center gap-2 flex-wrap px-[18px] py-[14px] border-b border-hairline-soft">
                      <h2 className="flex items-center gap-2 text-[13.5px] font-bold text-ink">
                        <FileText size={15} className="text-brand" />
                        客户文案
                      </h2>
                      <div className="flex-1" />
                      <span className="text-[11.5px] text-ink-mute hidden lg:inline">{report.channel} · 可直接转发</span>
                      <Select
                        value={report.templateId}
                        onChange={(v) => handleRecompose(String(v))}
                        options={templateOptions}
                        size="small"
                        style={{ width: 168 }}
                      />
                    </div>

                    <CopyBubble text={report.text} brokerName={meta?.brand?.brokerName} />

                    <div className="flex items-center gap-2.5 flex-wrap px-[18px] py-[14px] border-t border-hairline-soft">
                      <PrimaryButton onClick={handleCopy}>
                        <Copy size={16} />
                        复制文案，发给客户
                      </PrimaryButton>
                      {banner && (
                        <a href={banner.pngUrl ?? banner.svgUrl} download target="_blank" rel="noreferrer">
                          <SmallButton className="!py-2.5 !px-3.5">
                            <Download size={14} /> 下载 Banner
                          </SmallButton>
                        </a>
                      )}
                      <div className="flex-1" />
                      <span className="text-[11.5px] text-ink-faint hidden lg:inline">复制后可直接粘贴到客户群</span>
                    </div>
                  </Card>

                  {/* 折叠：产业链与受益方向（默认展开） */}
                  <Fold title="产业链传导与受益方向" defaultOpen icon={<Layers size={15} className="text-ink-mute" />}>
                    <ChainList fields={report.fields} sectors={top.sectors} />
                  </Fold>

                  {/* 折叠：为什么选它 */}
                  <Fold title="为什么选它？五维打分依据" icon={<TrendingUp size={15} className="text-ink-mute" />}>
                    <div className="space-y-3">
                      {top.breakdown.map((b) => (
                        <div key={b.key}>
                          <div className="flex items-baseline gap-2 text-[12px]">
                            <span className="font-semibold text-ink w-[72px] shrink-0">{b.label}</span>
                            <span className="text-ink-faint text-[11px]">权重 {b.weight}</span>
                            <span className="ml-auto font-bold text-brand tabular-nums">{b.weighted} 分</span>
                          </div>
                          <div className="mt-1.5 h-[5px] rounded-full bg-hairline-soft overflow-hidden">
                            <div className="h-full rounded-full bg-brand" style={{ width: `${b.score}%` }} />
                          </div>
                          <div className="mt-1.5 text-[11px] text-ink-faint leading-[1.6]">{b.detail}</div>
                        </div>
                      ))}
                      {top.adjustments.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {top.adjustments.map((a) => (
                            <Chip key={a.keyword} tone={a.delta > 0 ? 'ok' : 'line'}>
                              {a.keyword} {a.delta > 0 ? `+${a.delta}` : a.delta}
                            </Chip>
                          ))}
                        </div>
                      )}
                    </div>
                  </Fold>

                  {/* 折叠：生成过程 */}
                  <Fold title="生成过程明细" icon={<Play size={15} className="text-ink-mute" />}>
                    <div className="space-y-2">
                      {steps.map((s, i) => (
                        <div key={s.key} className="flex gap-2.5 text-[11.5px] leading-[1.6]">
                          <span className="text-ink-faint tabular-nums shrink-0">{i + 1}</span>
                          <span className="text-ink-soft">
                            {s.label}
                            {s.detail ? `：${s.detail}` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Fold>
                </div>

                {/* ---- 侧列 ---- */}
                <aside className="space-y-[15px]">
                  {banner && (
                    <Card>
                      <CardHead
                        title="配套 App 首页图"
                        extra={<Chip tone="line">{`${banner.width}×${banner.height}`}</Chip>}
                      />
                      <div className="p-3.5">
                        <img
                          src={banner.pngUrl ?? banner.svgUrl}
                          alt="banner"
                          className="w-full rounded-[10px] border border-hairline block"
                        />
                        <a href={banner.pngUrl ?? banner.svgUrl} download target="_blank" rel="noreferrer">
                          <SmallButton solid className="w-full justify-center mt-3 !py-2.5">
                            <Download size={14} /> 下载图片（{banner.pngUrl ? 'PNG' : 'SVG'}）
                          </SmallButton>
                        </a>
                      </div>
                    </Card>
                  )}

                  <Card>
                    <CardHead title="接下来" />
                    <div className="p-3.5 space-y-2.5">
                      <button
                        onClick={() => window.open(api.exportUrl(run!.id), '_blank')}
                        className="w-full flex items-center gap-2.5 text-[12.5px] px-3 py-2.5 border border-hairline rounded-[10px] bg-[#FCFDFF] hover:border-[#D9DEEA] hover:bg-white transition-colors"
                      >
                        <IconBubble>
                          <Download size={14} />
                        </IconBubble>
                        <span className="text-left">
                          <b className="block font-semibold text-ink">导出单文件日报</b>
                          <span className="block text-[10.5px] text-ink-faint mt-0.5">HTML，可直接邮件发送</span>
                        </span>
                      </button>
                      <button
                        onClick={() => {
                          const flash = (meta?.templates.templates ?? []).find((t) => t.id === 'scout-flash');
                          if (flash) handleRecompose(flash.id);
                        }}
                        className="w-full flex items-center gap-2.5 text-[12.5px] px-3 py-2.5 border border-hairline rounded-[10px] bg-[#FCFDFF] hover:border-[#D9DEEA] hover:bg-white transition-colors"
                      >
                        <IconBubble>
                          <Wand2 size={14} />
                        </IconBubble>
                        <span className="text-left">
                          <b className="block font-semibold text-ink">换成快讯版</b>
                          <span className="block text-[10.5px] text-ink-faint mt-0.5">300 字以内，盘中快速触达</span>
                        </span>
                      </button>
                      <button
                        onClick={() => setHistoryOpen(true)}
                        className="w-full flex items-center gap-2.5 text-[12.5px] px-3 py-2.5 border border-hairline rounded-[10px] bg-[#FCFDFF] hover:border-[#D9DEEA] hover:bg-white transition-colors"
                      >
                        <IconBubble>
                          <History size={14} />
                        </IconBubble>
                        <span className="text-left">
                          <b className="block font-semibold text-ink">查看历史日报</b>
                          <span className="block text-[10.5px] text-ink-faint mt-0.5">复用往期内容</span>
                        </span>
                      </button>
                    </div>
                  </Card>

                  <div
                    className={`flex gap-2.5 items-start text-[11.5px] leading-[1.7] rounded-[10px] px-3.5 py-3 border ${
                      compliance.ok ? 'bg-down/[.06] border-down/[.18] text-[#0B7A45]' : 'bg-red-50 border-red-200 text-red-700'
                    }`}
                  >
                    {compliance.ok ? (
                      <ShieldCheck size={15} className="shrink-0 mt-px" />
                    ) : (
                      <AlertTriangle size={15} className="shrink-0 mt-px" />
                    )}
                    <span>
                      {compliance.ok ? (
                        <>
                          <b>合规自检通过。</b>本文案不含买卖时机、仓位比例等投资建议，已自动附带风险提示与免责声明。
                        </>
                      ) : (
                        <>
                          <b>请人工复核。</b>文案中检测到「{compliance.hits.join('、')}」等表述，可能被认定为投资建议。
                        </>
                      )}
                    </span>
                  </div>
                </aside>
              </div>

              {/* 移动端吸底主操作 */}
              <div className="lg:hidden fixed left-0 right-0 bottom-[58px] z-30 px-3.5 pt-3 pb-3 bg-gradient-to-t from-[#F4F6FA] via-[#F4F6FA]/92 to-transparent">
                <PrimaryButton onClick={handleCopy} className="w-full">
                  <Copy size={16} />
                  复制文案，发给客户
                </PrimaryButton>
              </div>
            </>
          )}
        </div>
      </div>

      <HistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} onPick={handlePickHistory} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 产业链传导 + 受益方向                                                */
/* ------------------------------------------------------------------ */

function ChainList({ fields, sectors }: { fields: Record<string, any>; sectors: string[] }) {
  const chain = [
    { tag: '上游', cls: 'bg-[rgba(232,163,61,.14)] text-[#B87A18]', value: fields.chainUp },
    { tag: '中游', cls: 'bg-brand-soft text-brand', value: fields.chainMid },
    { tag: '下游', cls: 'bg-[rgba(20,34,74,.07)] text-ink-soft', value: fields.chainDown },
  ].filter((x) => x.value);

  const bene: any[] = Array.isArray(fields.beneficiaryList) ? fields.beneficiaryList : [];

  return (
    <div>
      {chain.length > 0 && (
        <div className="space-y-2.5">
          {chain.map((c) => (
            <div key={c.tag} className="flex gap-3 items-start text-[12.5px] leading-[1.7]">
              <span className={`shrink-0 w-[46px] text-center text-[11px] font-bold rounded-md py-0.5 ${c.cls}`}>
                {c.tag}
              </span>
              <span className="text-ink-soft">{c.value}</span>
            </div>
          ))}
        </div>
      )}

      {bene.length > 0 ? (
        <div className="mt-4 space-y-2.5">
          {bene.map((b, i) => (
            <div
              key={`${b.name}-${i}`}
              className="flex gap-2.5 items-baseline text-[12.5px] leading-[1.7] pb-2.5 border-b border-dashed border-hairline-soft last:border-0 last:pb-0"
            >
              <span className="font-bold text-ink shrink-0">{b.name}</span>
              {b.code && <span className="text-[10.5px] text-ink-mute bg-hairline-soft rounded px-1.5 py-px tabular-nums">{b.code}</span>}
              <span className="text-ink-soft">{b.reason}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-ink-faint">本模板未包含「受益方向」字段。</p>
      )}

      {sectors.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {sectors.map((s) => (
            <Chip key={s} tone="brand">
              {s}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

export default ScoutDashboard;
