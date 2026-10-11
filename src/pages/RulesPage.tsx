/**
 * 筛选规则配置页：五维权重、硬性过滤（含交易日窗口）、关键词与行业黑白名单。
 * 顶部实时展示 A 股交易日历状态，便于确认当前会保留哪几个交易日。
 */
import { useEffect, useState } from 'react';
import { Input, InputNumber, MessagePlugin, Slider, Switch } from 'tdesign-react';
import { Plus, RotateCcw, Save, SlidersHorizontal, Target, X } from 'lucide-react';
import { api, type FilterRules, type TradingCalendarMeta } from '../api/scout';
import {
  Chip,
  Field,
  PageHeader,
  PageShell,
  Placeholder,
  PrimaryButton,
  SectionCard,
  SmallButton,
} from '../components/scout/atoms';

/** 加减分关键词编辑器 */
function KeywordList({
  items,
  onChange,
  tone,
}: {
  items: { keyword: string; delta: number }[];
  onChange: (v: { keyword: string; delta: number }[]) => void;
  tone: 'ok' | 'line';
}) {
  const [kw, setKw] = useState('');
  const [delta, setDelta] = useState(5);

  const add = () => {
    const k = kw.trim();
    if (!k) return;
    if (items.some((i) => i.keyword === k)) {
      MessagePlugin.warning('关键词已存在');
      return;
    }
    onChange([...items, { keyword: k, delta }]);
    setKw('');
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {items.map((it) => (
          <Chip key={it.keyword} tone={tone}>
            {it.keyword} {it.delta > 0 ? `+${it.delta}` : it.delta}
            <button
              onClick={() => onChange(items.filter((x) => x.keyword !== it.keyword))}
              className="ml-0.5 border-0 bg-transparent opacity-60 hover:opacity-100 transition-opacity"
              title="移除"
            >
              <X size={11} />
            </button>
          </Chip>
        ))}
        {items.length === 0 && <span className="text-[12px] text-ink-faint">暂无</span>}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Input value={kw} onChange={(v) => setKw(String(v))} placeholder="输入关键词" style={{ width: 180 }} size="small" />
        <InputNumber
          value={delta}
          onChange={(v) => setDelta(Number(v))}
          theme="column"
          min={-100}
          max={100}
          style={{ width: 96 }}
          size="small"
        />
        <SmallButton onClick={add}>
          <Plus size={14} /> 添加
        </SmallButton>
      </div>
    </div>
  );
}

/** 通用标签列表（行业白名单 / 黑名单 / 排除词） */
function TagList({
  items,
  onChange,
  placeholder,
  tone,
  emptyHint = '暂无',
}: {
  items: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  tone: 'brand' | 'line';
  emptyHint?: string;
}) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const k = draft.trim();
    if (!k) return;
    if (items.includes(k)) {
      MessagePlugin.warning('该项已存在');
      return;
    }
    onChange([...items, k]);
    setDraft('');
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        {items.map((k) => (
          <Chip key={k} tone={tone}>
            {k}
            <button
              onClick={() => onChange(items.filter((x) => x !== k))}
              className="ml-0.5 border-0 bg-transparent opacity-60 hover:opacity-100 transition-opacity"
              title="移除"
            >
              <X size={11} />
            </button>
          </Chip>
        ))}
        {items.length === 0 && <span className="text-[12px] text-ink-faint">{emptyHint}</span>}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Input value={draft} onChange={(v) => setDraft(String(v))} placeholder={placeholder} style={{ width: 200 }} size="small" />
        <SmallButton onClick={add}>
          <Plus size={14} /> 添加
        </SmallButton>
      </div>
    </div>
  );
}

export function RulesPage() {
  const [rules, setRules] = useState<FilterRules | null>(null);
  const [calendar, setCalendar] = useState<TradingCalendarMeta | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .meta()
      .then((m) => setRules(m.rules))
      .catch((e) => MessagePlugin.error(`加载失败：${e.message}`));
    // 交易日历状态加载失败不阻塞页面
    api.calendar().then(setCalendar).catch(() => setCalendar(null));
  }, []);

  if (!rules) {
    return (
      <PageShell>
        <Placeholder title="正在加载规则…" />
      </PageShell>
    );
  }

  const enabledSum = rules.dimensions.filter((d) => d.enabled).reduce((s, d) => s + d.weight, 0);
  const sumPct = Math.round(enabledSum * 100);
  const sumOk = Math.abs(sumPct - 100) <= 1;

  const patchDim = (key: string, patch: Partial<FilterRules['dimensions'][number]>) => {
    setRules({
      ...rules,
      dimensions: rules.dimensions.map((d) => (d.key === key ? { ...d, ...patch } : d)),
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.saveConfig('rules', rules);
      MessagePlugin.success('筛选规则已保存');
    } catch (e: any) {
      MessagePlugin.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    try {
      const fresh = await api.getConfig<FilterRules>('rules');
      setRules(fresh);
      MessagePlugin.info('已重新载入磁盘上的规则');
    } catch (e: any) {
      MessagePlugin.error(e.message);
    }
  };

  return (
    <PageShell>
      <PageHeader
        title="筛选规则"
        desc="五维加权打分模型：每个维度先独立打 0–100 分，再按权重加权汇总，最后叠加关键词加减分。总分最高者即当日头号事件。"
        actions={
          <>
            <SmallButton onClick={reset}>
              <RotateCcw size={14} /> 重新载入
            </SmallButton>
            <PrimaryButton size="sm" onClick={save} disabled={saving}>
              <Save size={14} /> {saving ? '保存中…' : '保存规则'}
            </PrimaryButton>
          </>
        }
      />

      <SectionCard
        title="维度权重"
        icon={<SlidersHorizontal size={15} className="text-brand" />}
        extra={
          <Chip tone={sumOk ? 'ok' : 'line'} className={sumOk ? '' : '!text-[#B87A18]'}>
            已启用权重合计 {sumPct}%{sumOk ? '' : '（建议调整为 100%）'}
          </Chip>
        }
      >
        <div className="space-y-5">
          {rules.dimensions.map((d) => (
            <div key={d.key} className="pb-4 border-b border-hairline-soft last:border-0 last:pb-0">
              <div className="flex items-center gap-3 flex-wrap">
                <Switch value={d.enabled} onChange={(v) => patchDim(d.key, { enabled: Boolean(v) })} size="small" />
                <span className="text-[13.5px] font-semibold text-ink">{d.label}</span>
                <Chip tone="line">{d.key}</Chip>
                <span className="ml-auto text-[13px] font-bold w-14 text-right text-brand tabular-nums">
                  {Math.round(d.weight * 100)}%
                </span>
              </div>
              <div className="mt-2 sm:pl-12">
                <Slider
                  value={d.weight}
                  onChange={(v) => patchDim(d.key, { weight: Number(v) })}
                  min={0}
                  max={1}
                  step={0.01}
                  disabled={!d.enabled}
                  label={(p: { value: number | number[] }) => `${Math.round(Number(p?.value ?? 0) * 100)}%`}
                />
                {d.description && (
                  <div className="text-[11.5px] mt-1 leading-[1.7] text-ink-faint">{d.description}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="硬性过滤条件" icon={<Target size={15} className="text-brand" />}>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="最低热度">
            <InputNumber
              value={rules.hardFilters.minHeat}
              onChange={(v) => setRules({ ...rules, hardFilters: { ...rules.hardFilters, minHeat: Number(v) } })}
            />
          </Field>
          <Field label="保留最近交易日数" hint="按 A 股交易日历计算，超出该窗口的条目丢弃">
            <InputNumber
              value={rules.hardFilters.maxTradingDays}
              onChange={(v) =>
                setRules({ ...rules, hardFilters: { ...rules.hardFilters, maxTradingDays: Number(v) } })
              }
              min={1}
              max={10}
            />
          </Field>
          <Field label="数据源最多滞后（交易日）" hint="超过则判定停更并报错，避免静默输出过期内容">
            <InputNumber
              value={rules.hardFilters.maxStaleTradingDays ?? 1}
              onChange={(v) =>
                setRules({ ...rules, hardFilters: { ...rules.hardFilters, maxStaleTradingDays: Number(v) } })
              }
              min={0}
              max={10}
            />
          </Field>
          <Field label="选出条数 TopN">
            <InputNumber value={rules.topN} onChange={(v) => setRules({ ...rules, topN: Number(v) })} min={1} max={5} />
          </Field>
          <label className="flex items-center gap-2 text-[12.5px] text-ink-soft sm:mt-6">
            <Switch
              value={rules.hardFilters.requireSectors}
              onChange={(v) => setRules({ ...rules, hardFilters: { ...rules.hardFilters, requireSectors: Boolean(v) } })}
              size="small"
            />
            必须识别到行业
          </label>
        </div>

        {/* 交易日历状态：让「最近 N 个交易日」具体可见，便于排查 */}
        {calendar && (
          <div className="mt-5 rounded-xl bg-brand-soft/50 border border-brand/15 px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
              <span className="font-semibold text-ink">交易日历</span>
              <span className={calendar.todayIsTradingDay ? 'text-down' : 'text-ink-soft'}>
                {calendar.today}（{calendar.todayIsTradingDay ? '交易日' : calendar.todayHolidayName ? `休市·${calendar.todayHolidayName}` : '休市·周末'}）
              </span>
              <span className="text-ink-faint">｜最近交易日 {calendar.lastTradingDay}</span>
              <span className="text-ink-faint">｜覆盖 {calendar.coveredYears.join('、')} 年</span>
            </div>
            <div className="mt-2 text-[12px] text-ink-soft">
              按当前设置，将保留以下交易日的条目：
              <b className="text-brand ml-1">{calendar.recentTradingDays.slice(0, rules.hardFilters.maxTradingDays).join('、')}</b>
            </div>
            <div className="mt-1 text-[11px] text-ink-faint">
              注：实际以「数据源中最新一条所在交易日」为基准回数，因此交易日上午当日数据未发布时会自动往前顺延。
            </div>
          </div>
        )}
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="加分关键词" icon={<Plus size={15} className="text-down" />}>
          <KeywordList items={rules.keywordBoosts} onChange={(v) => setRules({ ...rules, keywordBoosts: v })} tone="ok" />
        </SectionCard>
        <SectionCard title="减分关键词" icon={<X size={15} className="text-[#E37318]" />}>
          <KeywordList items={rules.keywordPenalties} onChange={(v) => setRules({ ...rules, keywordPenalties: v })} tone="line" />
        </SectionCard>
      </div>

      <SectionCard title="行业范围（白名单 / 黑名单）" icon={<Target size={15} className="text-brand" />}>
        <p className="text-[12px] mb-4 leading-[1.75] text-ink-mute">
          白名单<b className="text-ink">非空时</b>仅保留命中白名单行业的事件（例如只做「固态电池、半导体、算力」）；
          黑名单命中即丢弃，优先级高于白名单。两者都支持模糊包含匹配，如白名单填「电池」可命中「固态电池」。
        </p>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <div className="text-[12.5px] font-semibold mb-2 text-ink">
              行业白名单
              <span className="ml-2 text-[11px] font-normal text-ink-faint">
                {rules.sectorWhitelist.length === 0 ? '为空 = 不做行业限制' : `已限定 ${rules.sectorWhitelist.length} 个行业`}
              </span>
            </div>
            <TagList
              items={rules.sectorWhitelist}
              onChange={(v) => setRules({ ...rules, sectorWhitelist: v })}
              placeholder="如：固态电池"
              tone="brand"
              emptyHint="为空 = 不限制行业"
            />
          </div>
          <div>
            <div className="text-[12.5px] font-semibold mb-2 text-ink">行业黑名单</div>
            <TagList
              items={rules.sectorBlacklist}
              onChange={(v) => setRules({ ...rules, sectorBlacklist: v })}
              placeholder="如：房地产"
              tone="line"
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="排除关键词（命中直接丢弃）">
        <TagList
          items={rules.excludeKeywords}
          onChange={(v) => setRules({ ...rules, excludeKeywords: v })}
          placeholder="输入要排除的关键词"
          tone="line"
        />
      </SectionCard>
    </PageShell>
  );
}

export default RulesPage;
