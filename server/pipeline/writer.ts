/**
 * 文案生成：模板渲染 + 内容字段生成。
 *
 * 两条路径：
 *   A. 规则引擎（默认，无需 API Key）—— 基于领域知识库自动生成产业链解读
 *   B. 大模型润色（可选）—— 通过 CodeBuddy Agent SDK 生成更自然的内容，失败自动回退到 A
 */
import type { Beneficiary, BrandConfig, CopyTemplate, ReportDraft, ReportFields, ScoredEvent } from './types.js';
import { matchChain, lookupStock } from './knowledge.js';

/* ------------------------------------------------------------------ */
/* 极简模板引擎：支持 {{var}} / {{#each}} / {{#if}}                      */
/* ------------------------------------------------------------------ */

type Node =
  | { type: 'text'; value: string }
  | { type: 'var'; path: string }
  | { type: 'each'; path: string; children: Node[] }
  | { type: 'if'; path: string; children: Node[] };

export function parseTemplate(tpl: string): Node[] {
  const root: Node[] = [];
  const stack: { children: Node[] }[] = [{ children: root }];
  const re = /\{\{\s*([#/]?)\s*([^}]*?)\s*\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(tpl))) {
    const [full, sigil, rawExpr] = m;
    const text = tpl.slice(last, m.index);
    if (text) stack[stack.length - 1].children.push({ type: 'text', value: text });
    last = m.index + full.length;

    if (sigil === '#') {
      const isEach = rawExpr.startsWith('each ');
      const path = isEach ? rawExpr.slice(5).trim() : rawExpr.replace(/^if\s+/, '').trim();
      const node = { type: (isEach ? 'each' : 'if') as 'each' | 'if', path, children: [] as Node[] };
      stack[stack.length - 1].children.push(node);
      stack.push({ children: node.children });
    } else if (sigil === '/') {
      if (stack.length > 1) stack.pop();
    } else {
      stack[stack.length - 1].children.push({ type: 'var', path: rawExpr.trim() });
    }
  }
  const tail = tpl.slice(last);
  if (tail) stack[stack.length - 1].children.push({ type: 'text', value: tail });
  return root;
}

function resolve(path: string, ctx: Record<string, unknown>): unknown {
  if (path === 'this') return ctx.this;
  const keys = path.split('.');
  let cur: any = ctx;
  if (keys[0] === 'this') {
    cur = ctx.this;
    keys.shift();
  }
  for (const k of keys) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}

function renderNodes(nodes: Node[], ctx: Record<string, unknown>): string {
  let out = '';
  for (const n of nodes) {
    if (n.type === 'text') out += n.value;
    else if (n.type === 'var') {
      const v = resolve(n.path, ctx);
      out += v == null ? '' : String(v);
    } else if (n.type === 'each') {
      const arr = resolve(n.path, ctx);
      if (Array.isArray(arr)) {
        for (const item of arr) {
          out += renderNodes(n.children, { ...ctx, this: item });
        }
      }
    } else if (n.type === 'if') {
      if (resolve(n.path, ctx)) out += renderNodes(n.children, ctx);
    }
  }
  return out;
}

/** 渲染模板：把 ctx 填进 body */
export function renderTemplate(body: string, ctx: Record<string, unknown>): string {
  const tree = parseTemplate(body);
  return renderNodes(tree, ctx)
    .replace(/[ \t]+$/gm, '')
    // 兜底：变量为空时若留下孤零零的话题标记（如一行只有「#」），整行剔除
    .replace(/^[#＃]\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ------------------------------------------------------------------ */
/* 日期工具                                                            */
/* ------------------------------------------------------------------ */

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

export function formatDate(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function weekdayOf(d: Date): string {
  return WEEKDAYS[d.getDay()];
}

/* ------------------------------------------------------------------ */
/* 规则引擎：生成内容字段                                                */
/* ------------------------------------------------------------------ */

function truncate(s: string, max: number): string {
  if (!s) return '';
  const t = s.trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max - 1);
  // 优先在句末标点处截断，保证语义完整
  const sentence = head.match(/^[\s\S]*[。！？；]/);
  if (sentence && sentence[0].trim().length >= max * 0.5) return sentence[0].trim();
  // 退而求其次：在分句标点处截断并补句号
  const clause = head.match(/^[\s\S]*[，、]/);
  if (clause && clause[0].trim().length >= max * 0.65) {
    return clause[0].replace(/[，、]\s*$/, '') + '。';
  }
  return head + '…';
}

/** 从事件里推断事件主题关键词 */
function topicOf(event: ScoredEvent): string {
  const pool = [event.title, event.summary, event.sectors.join(' ')].join(' ');
  const chain = matchChain(pool);
  if (chain) return chain.match.find((k) => pool.includes(k)) ?? event.sectors[0] ?? '该主题';
  return event.sectors[0] ?? '该主题';
}

/** 取表现最好的板块（与数据源 derive 口径保持一致） */
function topSectorOf(event: ScoredEvent) {
  const details = event.sectorDetails ?? [];
  if (!details.length) return undefined;
  return details.reduce((best, s) => (s.change > best.change ? s : best));
}

/**
 * 判断是否属于「消费 / 服务」类行业。
 * 这类行业的产业链是「供给 → 渠道 → 终端」，没有「原材料 → 制造」环节，
 * 若沿用制造业兜底措辞会写出明显不通的句子。
 */
const SERVICE_SECTOR_HINTS = [
  '零售', '百货', '商超', '消费', '食品', '饮料', '乳', '酒', '旅游', '酒店', '餐饮',
  '免税', '传媒', '游戏', '影视', '出版', '教育', '医疗', '医院', '物流', '快递',
  '电商', '银行', '保险', '证券', '券商', '地产', '房地产', '物业', '公用事业',
  '电力', '燃气', '水务', '运营商', '通信服务', '航空', '机场', '港口', '公路',
  '铁路', '航运', '环境治理', '检测服务',
];

function isServiceIndustry(sectors: string[]): boolean {
  return sectors.some((s) => SERVICE_SECTOR_HINTS.some((h) => s.includes(h)));
}

/** 规则引擎生成全部内容字段 */
export function generateFieldsByRules(event: ScoredEvent, template: CopyTemplate): ReportFields {
  const chain = matchChain(`${event.title} ${event.summary} ${event.sectors.join(' ')}`);
  const topic = topicOf(event);
  const hasSectors = event.sectors.length > 0;
  const sectorsText = event.sectors.slice(0, 4).join('、');
  // 涨跌描述与板块罗列分开组织，避免「相关板块……，相关板块等方向……」的重复措辞
  const changeText =
    event.marketChange > 0
      ? `相关板块当日上涨 ${event.marketChange}%`
      : event.marketChange < 0
        ? `相关板块当日回调 ${Math.abs(event.marketChange)}%`
        : '相关板块表现平稳';
  const focusClause = hasSectors
    ? event.marketChange > 0
      ? `${sectorsText}等方向获得资金关注`
      : `${sectorsText}等方向出现异动`
    : '相关方向资金关注度仍有提升空间';
  // 盘面反应：涨跌方向决定措辞，避免「板块下跌」却写成「获得资金关注」
  const boardReaction =
    event.marketChange > 0
      ? `从盘面看，${focusClause}，短期情绪驱动成分较高。`
      : `从盘面看，${hasSectors ? `${sectorsText}等方向` : '相关方向'}当日尚未明显启动，逻辑兑现仍需等待订单与业绩验证。`;

  const fields: ReportFields = {};

  // 影响解读：优先使用数据源自带的专业传导说明（如订阅站的 sectorRemark），
  // 没有时退回通用逻辑。注意：摘要（事件速览）已给出涨跌幅与板块清单，
  // 这里不再重复，只补充盘面反应，避免两段文字雷同。
  const topRemark = topSectorOf(event)?.remark;
  const genericTail =
    `事件从政策与供需两端同时发力，产业链上下游有望迎来订单与估值的双重修复；` +
    `但传导节奏取决于后续落地细则与订单验证，短期情绪驱动成分较高。`;
  fields.impactAnalysis = truncate(
    topRemark
      ? `${topRemark}${boardReaction}`
      : `${changeText}，${focusClause}。${genericTail}`,
    template.fields.find((f) => f.key === 'impactAnalysis')?.maxChars ?? 140,
  );

  // 事件背景：有结构化板块明细时，用「除头号板块外」的传导说明拼出背景。
  // 头号板块的说明已用于「影响解读」，此处排除以免两段重复。
  const details = event.sectorDetails ?? [];
  const headSector = topSectorOf(event);
  const otherRemarks = details
    .filter((d) => d !== headSector && d.remark)
    .map((d) => `【${d.name}】${d.remark}`)
    .join(' ');
  const backgroundSource = details.length
    ? `${event.title}。涉及 ${event.sectors.join('、')} 等方向。${otherRemarks || event.content || ''}`
    : `${event.source}发布相关消息：${event.summary || event.title}` + (event.content ? `。${event.content}` : '');
  fields.eventBackground = truncate(
    backgroundSource,
    template.fields.find((f) => f.key === 'eventBackground')?.maxChars ?? 200,
  );

  // 无命中知识库时，用「行业（或主题）+ 环节」拼出兜底描述。
  // 注意：制造类行业是「原材料 → 制造 → 应用」，而消费/服务类行业是「供给 → 渠道 → 终端」，
  // 若统一套用制造业措辞，会写出「百货零售上游原材料与核心设备」这类明显不通的句子。
  // 用单个代表性主题（而非板块罗列）作为环节前缀：一个事件常同时牵动若干不相关板块，
  // 罗列会让「上游/中游/下游」句子读不通（如「百货零售、常温灭菌奶、啤酒上游…」）。
  const stagePrefix = topic;
  const serviceLike = isServiceIndustry(event.sectors);
  const chainUp = chain?.up ?? (serviceLike ? `${stagePrefix}上游供给与采购` : `${stagePrefix}上游原材料与核心设备`);
  const chainMid = chain?.mid ?? (serviceLike ? `${stagePrefix}中游渠道与运营` : `${topic}中游制造与系统集成`);
  const chainDown = chain?.down ?? (serviceLike ? `${stagePrefix}下游终端需求与场景` : `${stagePrefix}下游应用与终端需求`);
  fields.chainUp = truncate(chainUp, template.fields.find((f) => f.key === 'chainUp')?.maxChars ?? 60);
  fields.chainMid = truncate(chainMid, template.fields.find((f) => f.key === 'chainMid')?.maxChars ?? 60);
  fields.chainDown = truncate(chainDown, template.fields.find((f) => f.key === 'chainDown')?.maxChars ?? 60);

  // 受益方向：优先用事件自带的关联个股，配合知识库补全代码与业务说明
  const maxItems = template.fields.find((f) => f.key === 'beneficiaryList')?.maxItems ?? 4;
  const list: Beneficiary[] = [];
  const seen = new Set<string>();
  // 数据源自带的个股明细（含代码、所属板块、当日涨跌幅）优先于本地知识库
  const securityMap = new Map((event.securityDetails ?? []).map((s) => [s.name, s]));
  for (const name of event.stocks) {
    if (list.length >= maxItems) break;
    if (seen.has(name)) continue;
    seen.add(name);
    const kb = lookupStock(name);
    const sec = securityMap.get(name);
    const code = sec?.code ?? kb.code;
    // 理由优先级：知识库业务描述 > 数据源板块归属 > 通用兜底
    let reason: string;
    if (kb.business) {
      reason = `${kb.business}，直接受益于${topic}需求放量`;
    } else if (sec?.sector) {
      // 注意：这里必须用个股自身所属板块，而不是事件主题 —— 一个事件常牵动多个板块，
      // 用主题会写出「属 常温灭菌奶 板块……处于百货零售产业链关键环节」这种自相矛盾的句子。
      const chg = sec.change != null ? `（当日 ${sec.change > 0 ? '+' : ''}${sec.change}%）` : '';
      reason = `属 ${sec.sector} 板块${chg}，是本次事件直接影响方向`;
    } else {
      reason = `处于${topic}产业链关键环节，受益于需求增量`;
    }
    list.push({ name, code, reason });
  }
  // 个股不足时，用产业链环节兜底（同样区分制造 / 消费服务，避免套用制造业措辞）
  const stageFallback: Beneficiary[] = serviceLike
    ? [
        { name: `${topic}上游供给`, reason: '成本与供给格局改善，盈利弹性提升' },
        { name: `${topic}渠道运营`, reason: '客流与周转改善，经营效率上行' },
        { name: `${topic}终端消费`, reason: '需求扩容，打开成长天花板' },
      ]
    : [
        { name: `${topic}上游材料`, reason: '受益于需求放量带来的量价齐升' },
        { name: `${topic}中游制造`, reason: '订单能见度提升，产能利用率上行' },
        { name: `${topic}下游应用`, reason: '应用场景扩容，打开需求天花板' },
      ];
  for (const f of stageFallback) {
    if (list.length >= maxItems) break;
    list.push(f);
  }
  fields.beneficiaryList = list;

  // 注意：不生成「客户行动建议 / 配置思路」类字段。
  // 券商合规要求——面向客户的材料不得包含具体买卖时机、仓位比例等投资建议，
  // 只做事件解读与产业链梳理。
  fields.riskNote = truncate(
    `政策落地进度不及预期、行业竞争加剧导致价格战、相关板块前期涨幅较大存在回调压力，` +
      `本内容不构成投资建议，请结合自身风险承受能力审慎决策。`,
    template.fields.find((f) => f.key === 'riskNote')?.maxChars ?? 90,
  );

  return fields;
}

/* ------------------------------------------------------------------ */
/* 组装草稿                                                            */
/* ------------------------------------------------------------------ */

export interface ComposeInput {
  event: ScoredEvent;
  template: CopyTemplate;
  brand: BrandConfig;
  fields: ReportFields;
  llmEnhanced: boolean;
  now?: Date;
}

export function composeDraft(input: ComposeInput): ReportDraft {
  const { event, template, brand, fields, llmEnhanced } = input;
  const now = input.now ?? new Date();

  const ctx: Record<string, unknown> = {
    // 基础
    date: formatDate(now),
    dateShort: `${now.getMonth() + 1}月${now.getDate()}日`,
    weekday: weekdayOf(now),
    // 事件
    eventTitle: event.title,
    eventSummary: event.summary || event.title,
    eventSource: event.source,
    eventUrl: event.url ?? '',
    heatText: event.heat ? `热度 ${(event.heat / 10000).toFixed(1)}万` : '',
    marketChangeText:
      event.marketChange > 0
        ? `相关板块 +${event.marketChange}%`
        : event.marketChange < 0
          ? `相关板块 ${event.marketChange}%`
          : '',
    sectors: event.sectors,
    stocks: event.stocks,
    tags: event.tags,
    score: event.totalScore,
    // 品牌
    brokerName: brand.brokerName,
    productName: brand.productName,
    slogan: brand.slogan,
    disclaimer: brand.footer.disclaimer,
    // 内容字段
    ...fields,
  };

  const text = renderTemplate(template.body, ctx);

  return {
    id: `draft-${event.id}-${Date.now().toString(36)}`,
    createdAt: now.toISOString(),
    date: formatDate(now),
    weekday: weekdayOf(now),
    templateId: template.id,
    templateName: template.name,
    channel: template.channel,
    eventId: event.id,
    eventTitle: event.title,
    text,
    fields,
    llmEnhanced,
    charCount: text.replace(/\s/g, '').length,
  };
}
