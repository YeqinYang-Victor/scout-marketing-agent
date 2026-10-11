/**
 * 文案模板管理页：编辑模板正文、内容字段与变量，并用最近一次事件实时预览。
 */
import { useEffect, useMemo, useState } from 'react';
import { Input, InputNumber, MessagePlugin, Switch, Textarea } from 'tdesign-react';
import { Check, Copy, Eye, FileText, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import { api, type CopyTemplate, type TemplateFile } from '../api/scout';
import {
  Chip,
  Field,
  PageHeader,
  PageShell,
  Placeholder,
  PrimaryButton,
  SectionCard,
  SmallButton,
  TextButton,
} from '../components/scout/atoms';

/** 提取模板里用到的变量名 */
function extractVars(body: string): string[] {
  const out = new Set<string>();
  const re = /\{\{\s*([#/]?)\s*([^}]*?)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const expr = m[2].replace(/^each\s+/, '').replace(/^if\s+/, '').trim();
    if (expr && expr !== 'this' && !expr.startsWith('this.')) out.add(expr);
  }
  return Array.from(out);
}

const BUILTIN_VARS = ['date', 'weekday', 'eventTitle', 'eventSummary', 'eventSource', 'heatText', 'marketChangeText', 'brokerName', 'productName', 'slogan', 'disclaimer'];

export function TemplatesPage() {
  const [file, setFile] = useState<TemplateFile | null>(null);
  const [activeId, setActiveId] = useState('');
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [lastRunId, setLastRunId] = useState('');
  const [useLlm, setUseLlm] = useState(false);

  useEffect(() => {
    api
      .meta()
      .then((m) => {
        setFile(m.templates);
        setActiveId(m.templates.templates[0]?.id ?? '');
      })
      .catch((e) => MessagePlugin.error(`加载失败：${e.message}`));
    api
      .runs()
      .then((r) => setLastRunId(r.runs.find((x) => x.status === 'success')?.id ?? ''))
      .catch(() => undefined);
  }, []);

  const current = file?.templates.find((t) => t.id === activeId) ?? null;
  const vars = useMemo(() => (current ? extractVars(current.body) : []), [current]);

  const patch = (p: Partial<CopyTemplate>) => {
    if (!file || !current) return;
    setFile({ ...file, templates: file.templates.map((t) => (t.id === current.id ? { ...t, ...p } : t)) });
  };

  const patchField = (idx: number, p: Record<string, unknown>) => {
    if (!current) return;
    patch({ fields: current.fields.map((f, i) => (i === idx ? { ...f, ...p } : f)) });
  };

  const save = async () => {
    if (!file) return;
    setSaving(true);
    try {
      await api.saveConfig('templates', file);
      MessagePlugin.success('模板已保存');
    } catch (e: any) {
      MessagePlugin.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const addTemplate = () => {
    if (!file) return;
    const id = `tpl-${Date.now().toString(36)}`;
    const t: CopyTemplate = {
      id,
      name: '新建模板',
      channel: '企业微信 / 微信',
      description: '',
      maxLength: 600,
      enabled: true,
      fields: [
        { key: 'impactAnalysis', label: '影响解读', type: 'text', maxChars: 120, prompt: '用 2-3 句话说明该事件对市场的核心影响。' },
        { key: 'riskNote', label: '风险提示', type: 'text', maxChars: 90, prompt: '该事件对应的主要风险点。' },
      ],
      body: '【{{productName}}·{{date}}】\n\n🔥 {{eventTitle}}\n\n{{impactAnalysis}}\n\n⚠️ 风险提示\n{{riskNote}}\n\n{{brokerName}} · {{productName}}\n{{disclaimer}}',
    };
    setFile({ ...file, templates: [...file.templates, t] });
    setActiveId(id);
    setPreview('');
  };

  const removeTemplate = () => {
    if (!file || !current) return;
    const rest = file.templates.filter((t) => t.id !== current.id);
    setFile({
      ...file,
      templates: rest,
      activeTemplateId: file.activeTemplateId === current.id ? rest[0]?.id ?? '' : file.activeTemplateId,
    });
    setActiveId(rest[0]?.id ?? '');
    setPreview('');
  };

  const doPreview = async () => {
    if (!lastRunId || !current) {
      MessagePlugin.warning('请先在工作台生成一次日报，再来预览模板效果');
      return;
    }
    setPreviewing(true);
    try {
      await save();
      const res = await api.recompose({ runId: lastRunId, templateId: current.id, useLlm });
      setPreview(res.report.text);
    } catch (e: any) {
      MessagePlugin.error(e.message);
    } finally {
      setPreviewing(false);
    }
  };

  if (!file) {
    return (
      <PageShell>
        <Placeholder title="正在加载模板…" />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="文案模板管理"
        desc="模板决定「产业链侦察兵」日报的版式与话术。支持 {{变量}} 插值、{{#each}} 循环与 {{#if}} 条件，可自由增删模板与内容字段。"
        actions={
          <>
            <SmallButton onClick={addTemplate}>
              <Plus size={14} /> 新建模板
            </SmallButton>
            <PrimaryButton size="sm" onClick={save} disabled={saving}>
              <Save size={14} /> {saving ? '保存中…' : '保存模板库'}
            </PrimaryButton>
          </>
        }
      />

      <SectionCard title="模板列表" icon={<FileText size={15} className="text-brand" />}>
        <div className="grid gap-5 lg:grid-cols-12">
          {/* 左侧列表 */}
          <div className="lg:col-span-4 space-y-2">
            {file.templates.map((t) => {
              const active = t.id === activeId;
              const isDefault = t.id === file.activeTemplateId;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveId(t.id);
                    setPreview('');
                  }}
                  className={`w-full text-left px-3.5 py-3 rounded-xl border transition-all ${
                    active ? 'bg-brand-soft border-brand' : 'bg-[#FCFDFF] border-hairline hover:border-[#D9DEEA] hover:bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-[13px] font-semibold truncate ${active ? 'text-brand' : 'text-ink'}`}>
                      {t.name}
                    </span>
                    {isDefault && <Chip tone="brand">默认</Chip>}
                  </div>
                  <div className="text-[11px] mt-1.5 text-ink-faint">
                    {t.channel} · {t.fields.length} 个内容字段
                  </div>
                </button>
              );
            })}
          </div>

          {/* 右侧编辑器 */}
          <div className="lg:col-span-8 space-y-4">
            {!current ? (
              <Placeholder icon={<FileText size={32} />} title="请选择或新建一个模板" />
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="模板名称">
                    <Input value={current.name} onChange={(v) => patch({ name: String(v) })} />
                  </Field>
                  <Field label="投放渠道">
                    <Input value={current.channel} onChange={(v) => patch({ channel: String(v) })} />
                  </Field>
                </div>

                <Field label="模板说明">
                  <Input value={current.description ?? ''} onChange={(v) => patch({ description: String(v) })} />
                </Field>

                <div className="flex items-center gap-5 flex-wrap">
                  <label className="flex items-center gap-2 text-[12.5px] text-ink-soft">
                    <Switch value={current.enabled} onChange={(v) => patch({ enabled: Boolean(v) })} size="small" />
                    启用
                  </label>
                  <label className="flex items-center gap-2 text-[12.5px] text-ink-soft">
                    <Switch
                      value={file.activeTemplateId === current.id}
                      onChange={(v) => setFile({ ...file, activeTemplateId: v ? current.id : file.activeTemplateId })}
                      size="small"
                    />
                    设为默认模板
                  </label>
                  <label className="flex items-center gap-2 text-[12.5px] text-ink-soft">
                    字数上限
                    <InputNumber
                      value={current.maxLength ?? 600}
                      onChange={(v) => patch({ maxLength: Number(v) })}
                      style={{ width: 110 }}
                      size="small"
                    />
                  </label>
                  <TextButton tone="danger" onClick={removeTemplate} className="ml-auto">
                    <Trash2 size={14} /> 删除模板
                  </TextButton>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-[12px] font-medium text-ink-soft">文案正文</span>
                    <span className="text-[11px] text-ink-faint">
                      支持 {'{{变量}}'} / {'{{#each 数组}}...{{/each}}'} / {'{{#if 变量}}...{{/if}}'}
                    </span>
                  </div>
                  <Textarea
                    value={current.body}
                    onChange={(v) => patch({ body: String(v) })}
                    autosize={{ minRows: 12, maxRows: 30 }}
                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5 }}
                  />
                </div>

                <div>
                  <div className="text-[12px] font-medium mb-2 text-ink-soft">模板变量检测</div>
                  <div className="flex flex-wrap gap-2">
                    {vars.map((v) => (
                      <Chip key={v} tone="brand">
                        {v}
                      </Chip>
                    ))}
                    {vars.length === 0 && <span className="text-[12px] text-ink-faint">未检测到变量</span>}
                  </div>
                  <div className="text-[11px] mt-2 leading-[1.7] text-ink-faint">内置变量：{BUILTIN_VARS.join('、')}</div>
                </div>

                <div>
                  <div className="text-[12px] font-medium mb-2 text-ink-soft">
                    内容字段（决定 AI 需要产出哪些内容）
                  </div>
                  <div className="space-y-2">
                    {current.fields.map((f, i) => (
                      <div
                        key={f.key}
                        className="grid gap-2 items-center rounded-xl border border-hairline px-3 py-2 lg:grid-cols-12"
                      >
                        <Input size="small" className="lg:col-span-3" value={f.key} onChange={(v) => patchField(i, { key: String(v) })} />
                        <Input size="small" className="lg:col-span-3" value={f.label} onChange={(v) => patchField(i, { label: String(v) })} />
                        <div className="lg:col-span-2">
                          <Chip tone="line">
                            {f.type === 'list' ? `列表 ≤${f.maxItems ?? 4}` : `文本 ≤${f.maxChars ?? 120}`}
                          </Chip>
                        </div>
                        <Input size="small" className="lg:col-span-3" value={f.prompt ?? ''} onChange={(v) => patchField(i, { prompt: String(v) })} placeholder="给 AI 的写作要求" />
                        <button
                          className="lg:col-span-1 border-0 bg-transparent text-[12px] text-[#D93025] hover:underline"
                          onClick={() => patch({ fields: current.fields.filter((_, idx) => idx !== i) })}
                        >
                          删除
                        </button>
                      </div>
                    ))}
                  </div>
                  <SmallButton
                    className="mt-2"
                    onClick={() =>
                      patch({
                        fields: [...current.fields, { key: `field${current.fields.length + 1}`, label: '新字段', type: 'text', maxChars: 120, prompt: '' }],
                      })
                    }
                  >
                    <Plus size={14} /> 添加字段
                  </SmallButton>
                </div>

                <div className="pt-3 border-t border-hairline">
                  <div className="flex items-center gap-3 flex-wrap">
                    <SmallButton onClick={doPreview}>
                      <Eye size={14} /> {previewing ? '生成中…' : '用最近一次事件生成预览'}
                    </SmallButton>
                    <label className="flex items-center gap-2 text-[12.5px] text-ink-soft">
                      <Switch value={useLlm} onChange={(v) => setUseLlm(Boolean(v))} size="small" />
                      大模型润色
                    </label>
                    {lastRunId ? (
                      <span className="text-[11.5px] text-ink-faint">
                        将复用运行记录 {lastRunId.slice(-8)} 选出的头号事件
                      </span>
                    ) : (
                      <span className="text-[11.5px] text-[#B87A18]">暂无可用运行记录，请先在工作台生成一次日报</span>
                    )}
                  </div>

                  {preview && (
                    <div className="mt-3">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Sparkles size={14} className="text-brand" />
                        <span className="text-[12px] font-semibold text-ink">预览效果</span>
                        <TextButton
                          onClick={() => {
                            navigator.clipboard.writeText(preview);
                            MessagePlugin.success('已复制');
                          }}
                        >
                          <Copy size={13} /> 复制
                        </TextButton>
                        <span className="ml-auto text-[11.5px] text-ink-faint">
                          {preview.replace(/\s/g, '').length} 字
                        </span>
                      </div>
                      <pre className="whitespace-pre-wrap text-[13px] leading-[1.95] rounded-xl p-4 border border-hairline bg-[#F7F9FC] text-ink font-[inherit]">
                        {preview}
                      </pre>
                      <div className="flex items-center gap-1.5 mt-2 text-[11.5px] text-down">
                        <Check size={13} /> 预览基于最近一次运行的头号事件，未写入新的运行记录
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </SectionCard>
    </PageShell>
  );
}

export default TemplatesPage;
