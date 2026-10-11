/**
 * 数据源配置页：管理各类数据源适配器，并配置品牌视觉（config/brand.json）。
 */
import { useEffect, useState } from 'react';
import { Input, InputNumber, MessagePlugin, Select, Switch, Textarea } from 'tdesign-react';
import { Database, Palette, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { api, type BrandConfig, type DataSourceFile, type DataSourceItem } from '../api/scout';
import {
  Chip,
  Field,
  PageHeader,
  PageShell,
  Placeholder,
  PrimaryButton,
  SectionCard,
  SmallButton,
  StepLabel,
  TextButton,
} from '../components/scout/atoms';

const FIELD_MAP_LABELS: [string, string][] = [
  ['title', '标题'],
  ['summary', '摘要'],
  ['url', '链接'],
  ['publishedAt', '发布时间'],
  ['heat', '热度'],
  ['sectors', '行业'],
  ['stocks', '关联个股'],
  ['marketChange', '涨跌幅'],
];

export function SourcesPage() {
  const [sources, setSources] = useState<DataSourceFile | null>(null);
  const [brand, setBrand] = useState<BrandConfig | null>(null);
  const [activeId, setActiveId] = useState('');
  const [saving, setSaving] = useState(false);
  const [rawMode, setRawMode] = useState(false);
  const [rawText, setRawText] = useState('');

  useEffect(() => {
    api
      .meta()
      .then((m) => {
        setSources(m.sources);
        setBrand(m.brand);
        setActiveId(m.sources.sources[0]?.id ?? '');
      })
      .catch((e) => MessagePlugin.error(`加载失败：${e.message}`));
  }, []);

  const current = sources?.sources.find((s) => s.id === activeId) ?? null;

  const patchSource = (patch: Partial<DataSourceItem>) => {
    if (!sources || !current) return;
    setSources({
      ...sources,
      sources: sources.sources.map((s) => (s.id === current.id ? { ...s, ...patch } : s)),
    });
  };

  const patchConfig = (key: string, value: unknown) => {
    if (!current) return;
    patchSource({ config: { ...current.config, [key]: value } });
  };

  const patchCred = (key: 'username' | 'password', value: string) => {
    if (!current) return;
    patchConfig('credentials', { ...(current.config.credentials ?? {}), [key]: value });
  };

  const patchParser = (key: string, value: unknown) => {
    if (!current) return;
    patchConfig('parser', { ...(current.config.parser ?? {}), [key]: value });
  };

  const patchFieldMap = (key: string, value: string) => {
    if (!current) return;
    const fm = { ...(current.config.parser?.fieldMap ?? {}), [key]: value };
    patchParser('fieldMap', fm);
  };

  const saveSources = async () => {
    if (!sources) return;
    setSaving(true);
    try {
      await api.saveConfig('sources', sources);
      MessagePlugin.success('数据源配置已保存');
    } catch (e: any) {
      MessagePlugin.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const saveBrand = async () => {
    if (!brand) return;
    setSaving(true);
    try {
      await api.saveConfig('brand', brand);
      MessagePlugin.success('品牌视觉已保存');
    } catch (e: any) {
      MessagePlugin.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const addSource = () => {
    if (!sources) return;
    const id = `source-${Date.now().toString(36)}`;
    const item: DataSourceItem = {
      id,
      name: '新建数据源',
      type: 'http-login',
      enabled: false,
      note: '',
      config: {
        authMode: 'cookie',
        loginUrl: '',
        loginMethod: 'POST',
        loginContentType: 'application/json',
        loginBody: { username: '{{username}}', password: '{{password}}' },
        credentials: { username: '', password: '' },
        listUrl: '',
        listMethod: 'GET',
        headers: {},
        parser: { kind: 'json', itemsPath: 'data.list', fieldMap: { title: 'title', summary: 'digest', url: 'link', publishedAt: 'publish_time', heat: 'hot_value' } },
        timeoutMs: 15000,
      },
    };
    setSources({ ...sources, sources: [...sources.sources, item] });
    setActiveId(id);
  };

  const removeSource = () => {
    if (!sources || !current) return;
    const rest = sources.sources.filter((s) => s.id !== current.id);
    setSources({
      ...sources,
      sources: rest,
      activeSourceId: sources.activeSourceId === current.id ? rest[0]?.id ?? '' : sources.activeSourceId,
    });
    setActiveId(rest[0]?.id ?? '');
  };

  if (!sources || !brand) {
    return (
      <PageShell>
        <Placeholder title="正在加载配置…" />
      </PageShell>
    );
  }

  const cfg = current?.config ?? {};
  const parser = cfg.parser ?? {};

  return (
    <PageShell>
      <PageHeader
        title="数据源配置"
        desc="支持「账号密码登录 + 接口拉取」「HTML 抓取」「RSS」三类数据源；当前用 URL + 账号密码接入已订阅站点，后续可平滑替换为官方 API。"
        actions={
          <>
            <SmallButton onClick={addSource}>
              <Plus size={14} /> 新增数据源
            </SmallButton>
            <PrimaryButton size="sm" onClick={saveSources} disabled={saving}>
              <Save size={14} /> {saving ? '保存中…' : '保存'}
            </PrimaryButton>
          </>
        }
      />

      <SectionCard title="已配置数据源" icon={<Database size={15} className="text-brand" />}>
        <div className="grid gap-5 lg:grid-cols-12">
          {/* 左侧列表 */}
          <div className="lg:col-span-4 space-y-2">
            {sources.sources.map((s) => {
              const active = s.id === activeId;
              const isDefault = s.id === sources.activeSourceId;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setActiveId(s.id);
                    setRawText(JSON.stringify(s.config, null, 2));
                  }}
                  className={`w-full text-left px-3.5 py-3 rounded-xl border transition-all ${
                    active
                      ? 'bg-brand-soft border-brand'
                      : 'bg-[#FCFDFF] border-hairline hover:border-[#D9DEEA] hover:bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-[13px] font-semibold truncate ${active ? 'text-brand' : 'text-ink'}`}>
                      {s.name}
                    </span>
                    {isDefault && <Chip tone="brand">默认</Chip>}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Chip tone="line">{s.type}</Chip>
                    <span className={`text-[11px] ${s.enabled ? 'text-down' : 'text-ink-faint'}`}>
                      {s.enabled ? '已启用' : '未启用'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* 右侧编辑器 */}
          <div className="lg:col-span-8 space-y-4">
            {!current ? (
              <Placeholder icon={<Database size={32} />} title="请选择或新增一个数据源" />
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="数据源名称">
                    <Input value={current.name} onChange={(v) => patchSource({ name: String(v) })} />
                  </Field>
                  <Field label="类型">
                    <Select
                      value={current.type}
                      onChange={(v) => patchSource({ type: v as DataSourceItem['type'] })}
                      options={[
                        { label: '账号密码登录型（http-login）', value: 'http-login' },
                        { label: 'RSS 订阅源（rss）', value: 'rss' },
                        { label: '内置演示数据（mock）', value: 'mock' },
                      ]}
                    />
                  </Field>
                </div>

                <div className="flex items-center gap-6 flex-wrap">
                  <label className="flex items-center gap-2 text-[12.5px] text-ink-soft">
                    <Switch value={current.enabled} onChange={(v) => patchSource({ enabled: Boolean(v) })} size="small" />
                    启用该数据源
                  </label>
                  <label className="flex items-center gap-2 text-[12.5px] text-ink-soft">
                    <Switch
                      value={sources.activeSourceId === current.id}
                      onChange={(v) => setSources({ ...sources, activeSourceId: v ? current.id : sources.activeSourceId })}
                      size="small"
                    />
                    设为默认数据源
                  </label>
                  <TextButton tone="danger" onClick={removeSource} className="ml-auto">
                    <Trash2 size={14} /> 删除
                  </TextButton>
                </div>

                <Field label="备注">
                  <Input value={current.note ?? ''} onChange={(v) => patchSource({ note: String(v) })} />
                </Field>

                {current.type === 'mock' && (
                  <Field label="返回条数">
                    <InputNumber value={cfg.count ?? 14} onChange={(v) => patchConfig('count', Number(v))} />
                  </Field>
                )}

                {current.type === 'rss' && (
                  <Field label="RSS 地址">
                    <Input value={cfg.feedUrl ?? ''} onChange={(v) => patchConfig('feedUrl', String(v))} />
                  </Field>
                )}

                {current.type === 'http-login' && (
                  <div className="space-y-4 pt-3 border-t border-hairline">
                    <StepLabel>① 登录（账号密码换取 Cookie / Token）</StepLabel>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="登录接口地址">
                        <Input value={cfg.loginUrl ?? ''} onChange={(v) => patchConfig('loginUrl', String(v))} placeholder="https://..." />
                      </Field>
                      <Field label="登录方式">
                        <Select
                          value={cfg.loginMethod ?? 'POST'}
                          onChange={(v) => patchConfig('loginMethod', v)}
                          options={[
                            { label: 'POST', value: 'POST' },
                            { label: 'GET', value: 'GET' },
                          ]}
                        />
                      </Field>
                      <Field label="订阅账号" hint="建议填 ${ENV_VAR} 占位，真实凭据放 .env">
                        <Input
                          value={cfg.credentials?.username ?? ''}
                          onChange={(v) => patchCred('username', String(v))}
                          placeholder="${ZEN_USER}"
                        />
                      </Field>
                      <Field label="订阅密码">
                        <Input
                          type="password"
                          value={cfg.credentials?.password ?? ''}
                          onChange={(v) => patchCred('password', String(v))}
                          placeholder="${ZEN_PASS}"
                        />
                      </Field>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="鉴权方式" hint="cookie：携带登录 Cookie；bearer：Authorization: Bearer xxx；header：Token 原样放入 Authorization">
                        <Select
                          value={cfg.authMode ?? 'cookie'}
                          onChange={(v) => patchConfig('authMode', v)}
                          options={[
                            { label: 'Cookie', value: 'cookie' },
                            { label: 'Bearer Token', value: 'bearer' },
                            { label: 'Authorization 头（无 Bearer 前缀）', value: 'header' },
                          ]}
                        />
                      </Field>
                      <Field label="Token 取值路径" hint="JSON 路径，如 data.token；仅 bearer / header 模式需要">
                        <Input value={cfg.tokenPath ?? ''} onChange={(v) => patchConfig('tokenPath', String(v))} />
                      </Field>
                    </div>

                    <StepLabel>② 拉取热点列表</StepLabel>
                    <Field label="列表接口地址" hint="支持 {{date}} 占位符，例如 ?date={{date}}">
                      <Input value={cfg.listUrl ?? ''} onChange={(v) => patchConfig('listUrl', String(v))} placeholder="https://...?date={{date}}" />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="请求方式">
                        <Select
                          value={cfg.listMethod ?? 'GET'}
                          onChange={(v) => patchConfig('listMethod', v)}
                          options={[
                            { label: 'GET', value: 'GET' },
                            { label: 'POST', value: 'POST' },
                          ]}
                        />
                      </Field>
                      <Field label="超时（毫秒）">
                        <InputNumber value={cfg.timeoutMs ?? 15000} onChange={(v) => patchConfig('timeoutMs', Number(v))} />
                      </Field>
                    </div>

                    <StepLabel>③ 解析与字段映射</StepLabel>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="解析方式">
                        <Select
                          value={parser.kind ?? 'json'}
                          onChange={(v) => patchParser('kind', v)}
                          options={[
                            { label: 'JSON 接口', value: 'json' },
                            { label: 'HTML 页面（CSS 选择器）', value: 'html' },
                          ]}
                        />
                      </Field>
                      {parser.kind === 'html' ? (
                        <Field label="列表项选择器">
                          <Input value={parser.itemSelector ?? ''} onChange={(v) => patchParser('itemSelector', String(v))} placeholder=".news-list .news-item" />
                        </Field>
                      ) : (
                        <Field label="列表数据路径" hint="JSON 路径，如 data.list；留空表示响应本身就是数组">
                          <Input value={parser.itemsPath ?? ''} onChange={(v) => patchParser('itemsPath', String(v))} />
                        </Field>
                      )}
                    </div>

                    <div>
                      <div className="text-[12px] font-medium mb-2 text-ink-soft">字段映射（把源字段映射到系统字段）</div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {FIELD_MAP_LABELS.map(([key, label]) => (
                          <Field key={key} label={label}>
                            <Input
                              size="small"
                              value={typeof parser.fieldMap?.[key] === 'string' ? parser.fieldMap[key] : parser.fieldMap?.[key]?.selector ?? ''}
                              onChange={(v) => patchFieldMap(key, String(v))}
                              placeholder={key}
                            />
                          </Field>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-3 border-t border-hairline">
                  <div className="flex items-center gap-3">
                    <span className="text-[12px] font-medium text-ink-soft">高级：原始 JSON 配置</span>
                    <TextButton
                      onClick={() => {
                        setRawMode((v) => !v);
                        setRawText(JSON.stringify(current.config, null, 2));
                      }}
                    >
                      <RefreshCw size={13} /> {rawMode ? '收起' : '展开'}
                    </TextButton>
                  </div>
                  {rawMode && (
                    <div className="mt-2.5">
                      <Textarea
                        value={rawText}
                        onChange={(v) => setRawText(String(v))}
                        autosize={{ minRows: 8, maxRows: 20 }}
                        style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}
                      />
                      <SmallButton
                        className="mt-2.5"
                        onClick={() => {
                          try {
                            patchSource({ config: JSON.parse(rawText) });
                            MessagePlugin.success('已应用到表单');
                          } catch {
                            MessagePlugin.error('JSON 格式错误');
                          }
                        }}
                      >
                        应用到表单
                      </SmallButton>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="品牌视觉（用于 Banner 生成）"
        icon={<Palette size={15} className="text-brand" />}
        extra={
          <PrimaryButton size="sm" onClick={saveBrand} disabled={saving}>
            <Save size={14} /> 保存品牌配置
          </PrimaryButton>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="券商名称">
            <Input value={brand.brokerName} onChange={(v) => setBrand({ ...brand, brokerName: String(v) })} />
          </Field>
          <Field label="产品名称">
            <Input value={brand.productName} onChange={(v) => setBrand({ ...brand, productName: String(v) })} />
          </Field>
          <Field label="Slogan">
            <Input value={brand.slogan} onChange={(v) => setBrand({ ...brand, slogan: String(v) })} />
          </Field>
          <Field label="主色（品牌红）">
            <Input value={brand.colors.primary} onChange={(v) => setBrand({ ...brand, colors: { ...brand.colors, primary: String(v) } })} />
          </Field>
          <Field label="辅色（深蓝）">
            <Input value={brand.colors.secondary} onChange={(v) => setBrand({ ...brand, colors: { ...brand.colors, secondary: String(v) } })} />
          </Field>
          <Field label="点缀色">
            <Input value={brand.colors.accent} onChange={(v) => setBrand({ ...brand, colors: { ...brand.colors, accent: String(v) } })} />
          </Field>
          <Field label="Banner 宽度">
            <InputNumber value={brand.bannerSize.width} onChange={(v) => setBrand({ ...brand, bannerSize: { ...brand.bannerSize, width: Number(v) } })} />
          </Field>
          <Field label="Banner 高度">
            <InputNumber value={brand.bannerSize.height} onChange={(v) => setBrand({ ...brand, bannerSize: { ...brand.bannerSize, height: Number(v) } })} />
          </Field>
          <Field label="引导语（Banner 左下）">
            <Input value={brand.footer.qrHint} onChange={(v) => setBrand({ ...brand, footer: { ...brand.footer, qrHint: String(v) } })} />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="合规免责声明">
            <Textarea
              value={brand.footer.disclaimer}
              onChange={(v) => setBrand({ ...brand, footer: { ...brand.footer, disclaimer: String(v) } })}
              autosize={{ minRows: 2, maxRows: 4 }}
            />
          </Field>
        </div>
      </SectionCard>
    </PageShell>
  );
}

export default SourcesPage;
