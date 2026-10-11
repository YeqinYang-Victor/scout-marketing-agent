/**
 * 内置演示数据集。
 * 时间以「距今 N 小时」表示，抓取时动态换算成真实时间戳，保证演示数据永远"新鲜"。
 * 生产环境请把数据源切换为已订阅的资讯站（config/data-sources.json）。
 */
import type { RawEvent } from './types.js';

export interface DemoEvent
  extends Omit<RawEvent, 'publishedAt' | 'heat' | 'sectors' | 'stocks' | 'tags' | 'marketChange'> {
  hoursAgo: number;
  /** 演示数据中以下字段必定提供，收窄类型便于下游直接使用 */
  heat: number;
  sectors: string[];
  stocks: string[];
  tags: string[];
  marketChange: number;
}

export const DEMO_EVENTS: DemoEvent[] = [
  {
    hoursAgo: 2,
    title: '工信部发布固态电池标准体系建设指南，明确2027年装车量产路线图',
    summary:
      '工信部联合多部门印发《固态电池标准体系建设指南》，首次给出硫化物、氧化物、聚合物三条技术路线的国家标准与装车时间表，提出到2027年实现规模化装车、2030年形成万亿级产业规模。',
    content:
      '指南明确：2026年完成关键材料与电芯标准立项，2027年实现 GWh 级量产装车，2030年产业规模突破万亿。同时提出对固态电解质、锂金属负极等"卡脖子"环节给予首台套保险补偿与专项债支持。业内测算，固态电池能量密度有望从当前 250Wh/kg 提升至 400Wh/kg 以上，将重塑动力电池与储能产业链格局。',
    url: 'https://example.com/news/solid-state-battery-standard',
    source: '工信部官网',
    heat: 1_862_000,
    sectors: ['固态电池', '锂电材料', '新能源车', '储能', '有色金属', '高端装备'],
    stocks: ['宁德时代', '赣锋锂业', '当升科技', '上海洗霸', '三祥新材'],
    tags: ['政策', '新能源', '国产替代'],
    marketChange: 6.8,
  },
  {
    hoursAgo: 4,
    title: '国家大基金三期首笔投资落地，加码国产GPU与先进封装',
    summary:
      '国家集成电路产业投资基金三期完成首笔超300亿元投资，重点投向国产GPU架构、Chiplet先进封装与HBM存储，多家A股设备与材料公司进入投资名单。',
    content:
      '大基金三期注册资本3440亿元，首笔投资聚焦算力芯片自主可控。市场预计将带动国内先进制程设备、EDA工具、封装基板等环节订单放量。',
    url: 'https://example.com/news/bigfund-iii',
    source: '证券时报',
    heat: 1_520_000,
    sectors: ['半导体', '人工智能', '算力', '先进封装', '消费电子'],
    stocks: ['中芯国际', '长电科技', '通富微电', '寒武纪', '北方华创'],
    tags: ['国产替代', '算力'],
    marketChange: 5.2,
  },
  {
    hoursAgo: 6,
    title: '人形机器人量产元年开启，头部厂商公布万台级交付计划',
    summary:
      '国内头部人形机器人厂商发布万台级量产交付计划，核心零部件国产化率提升至 85%，单台成本下降至 20 万元以内。',
    content:
      '多家厂商同步公布订单，主要来自汽车、3C 制造与物流场景。谐波减速器、行星滚柱丝杠、六维力传感器等环节有望率先受益。',
    url: 'https://example.com/news/humanoid-robot-mass-production',
    source: '财联社',
    heat: 1_180_000,
    sectors: ['机器人', '高端装备', '汽车零部件', '传感器'],
    stocks: ['绿的谐波', '三花智控', '拓普集团', '鸣志电器'],
    tags: ['智能制造'],
    marketChange: 4.5,
  },
  {
    hoursAgo: 9,
    title: '创新药出海再下一城，国产双抗授权总额刷新纪录',
    summary:
      '国内药企与跨国巨头达成双抗药物海外授权合作，首付款加里程碑总额超过 60 亿美元，创国产创新药单笔授权纪录。',
    content:
      '本次授权覆盖肿瘤与自免两大适应症。业内认为，国产创新药研发能力获国际认可，CXO 与上游生命科学试剂需求有望同步提升。',
    url: 'https://example.com/news/innovative-drug-license-out',
    source: '医药经济报',
    heat: 760_000,
    sectors: ['创新药', '医药', 'CXO', '生命科学'],
    stocks: ['恒瑞医药', '百济神州', '药明康德', '康龙化成'],
    tags: ['出海', '医药'],
    marketChange: 3.1,
  },
  {
    hoursAgo: 12,
    title: '低空经济试点城市扩容至30个，空域管理细则同步落地',
    summary:
      '民航局公布第二批低空经济试点城市名单，总数扩至30个，同步发布低空空域分类划设与飞行审批细则。',
    content: 'eVTOL 适航审定加速，通航机场、空管系统与复合材料环节迎来增量订单。',
    url: 'https://example.com/news/low-altitude-economy',
    source: '中国民航报',
    heat: 690_000,
    sectors: ['低空经济', '军工', '复合材料', '航空装备'],
    stocks: ['中信海直', '万丰奥威', '光威复材'],
    tags: ['政策', '新质生产力'],
    marketChange: 2.8,
  },
  {
    hoursAgo: 14,
    title: '铜价突破历史新高，全球库存降至近十年低位',
    summary: 'LME 铜价盘中突破历史高位，全球显性库存降至近十年低位，矿端供给扰动持续。',
    content: '电网投资与新能源需求共振，冶炼加工费持续走低，铜产业链利润向上游集中。',
    url: 'https://example.com/news/copper-record-high',
    source: '上海有色网',
    heat: 540_000,
    sectors: ['有色金属', '铜', '电网设备', '新能源'],
    stocks: ['紫金矿业', '洛阳钼业', '铜陵有色'],
    tags: ['大宗商品'],
    marketChange: 3.6,
  },
  {
    hoursAgo: 18,
    title: 'AI 手机出货量指引上调，端侧大模型推动换机周期',
    summary: '多家机构上调 AI 手机出货量指引，端侧大模型带动存储、散热与光学升级。',
    content: '折叠屏与 AI 影像成为主要卖点，供应链备货节奏提前。',
    url: 'https://example.com/news/ai-phone',
    source: '第一财经',
    heat: 430_000,
    sectors: ['消费电子', '半导体', '光学光电子'],
    stocks: ['立讯精密', '水晶光电', '蓝思科技'],
    tags: ['消费电子'],
    marketChange: 1.9,
  },
  {
    hoursAgo: 22,
    title: '光伏行业自律公约落地，硅料价格连续三周回升',
    summary: '光伏行业自律公约正式落地，落后产能加速出清，硅料价格连续三周回升。',
    content: '产业链盈利有望修复，但终端装机需求仍待观察。',
    url: 'https://example.com/news/pv-price',
    source: '证券时报',
    heat: 310_000,
    sectors: ['光伏', '新能源'],
    stocks: ['通威股份', '大全能源'],
    tags: ['反内卷'],
    marketChange: 2.2,
  },
  {
    hoursAgo: 26,
    title: '券商并购重组再提速，头部机构整合预期升温',
    summary: '监管部门表态支持券商通过并购重组做优做强，市场对头部机构整合预期升温。',
    content: '行业集中度有望提升，资本实力与投行能力成为核心竞争力。',
    url: 'https://example.com/news/broker-ma',
    source: '上海证券报',
    heat: 280_000,
    sectors: ['券商', '金融'],
    stocks: ['国泰海通', '中国银河'],
    tags: ['金融'],
    marketChange: 1.5,
  },
  {
    hoursAgo: 30,
    title: '卫星互联网组网提速，年内发射计划上调',
    summary: '低轨卫星互联网组网提速，年内发射计划上调，火箭与地面终端环节受益。',
    content: '商业航天被列入新质生产力重点方向，产业链国产化率持续提升。',
    url: 'https://example.com/news/satellite-internet',
    source: '中国航天报',
    heat: 240_000,
    sectors: ['卫星互联网', '军工', '通信'],
    stocks: ['中国卫星', '海格通信'],
    tags: ['新质生产力'],
    marketChange: 1.2,
  },
  {
    hoursAgo: 34,
    title: '数据要素市场化配置改革试点扩大，公共数据授权运营提速',
    summary: '数据要素市场化配置改革试点范围扩大，公共数据授权运营与数据资产入表加速推进。',
    content: '数据确权、定价与交易环节的制度供给持续完善。',
    url: 'https://example.com/news/data-element',
    source: '经济参考报',
    heat: 210_000,
    sectors: ['数据要素', '计算机', '通信'],
    stocks: ['深桑达A', '易华录'],
    tags: ['政策'],
    marketChange: 0.9,
  },
  {
    hoursAgo: 40,
    title: '储能招标规模同比翻倍，构网型储能成新增长点',
    summary: '国内储能招标规模同比翻倍，构网型储能与长时储能成为新增量方向。',
    content: '独立储能商业模式逐步跑通，PCS 与温控环节弹性较大。',
    url: 'https://example.com/news/energy-storage-bid',
    source: '北极星储能网',
    heat: 180_000,
    sectors: ['储能', '新能源', '电力设备'],
    stocks: ['阳光电源', '英维克'],
    tags: ['新能源'],
    marketChange: 1.6,
  },
  {
    hoursAgo: 46,
    title: '军工订单回暖，航空发动机产业链景气度回升',
    summary: '军工订单边际回暖，航空发动机与高温合金环节景气度回升。',
    content: '交付节奏加快，产业链排产环比改善。',
    url: 'https://example.com/news/military-order',
    source: '国防科技工业',
    heat: 150_000,
    sectors: ['军工', '航空装备', '有色金属'],
    stocks: ['航发动力', '抚顺特钢'],
    tags: ['军工'],
    marketChange: 1.1,
  },
  {
    hoursAgo: 52,
    title: '某上市公司发布股东减持公告，涉及金额较大',
    summary: '某上市公司公告股东减持计划，涉及金额较大，市场关注度一般。',
    content: '公司公告称减持系股东自身资金安排，不影响公司经营。',
    url: 'https://example.com/news/shareholder-reduction',
    source: '交易所公告',
    heat: 60_000,
    sectors: ['计算机'],
    stocks: [],
    tags: ['公告'],
    marketChange: -0.4,
  },
];
