/**
 * 领域知识库：
 *  - CHAIN_KB  ：主题关键词 → 产业链上/中/下游描述（用于规则引擎生成"产业链传导"）
 *  - STOCK_KB  ：个股名称 → 代码 / 所属环节 / 一句话业务（用于生成"受益方向"）
 *  - SECTOR_CHAIN：行业 → 上中下游兜底描述
 * 这里的内容可随业务持续补充，不影响其他模块。
 */

export interface ChainEntry {
  match: string[];
  up: string;
  mid: string;
  down: string;
}

export const CHAIN_KB: ChainEntry[] = [
  {
    match: ['固态电池', '锂电', '电池', '储能'],
    up: '锂矿与锂盐、正负极材料、固态电解质、锂金属负极',
    mid: '电芯制造、PACK 集成、电池专用设备',
    down: '新能源整车、储能电站、低空飞行器与消费电子',
  },
  {
    match: ['半导体', '芯片', '算力', 'GPU', '封装', '集成电路', 'AI'],
    up: 'EDA 工具、半导体设备、光刻胶与电子特气、硅片',
    mid: '晶圆代工、先进封装、HBM 存储、GPU/CPU 设计',
    down: 'AI 服务器、云计算、智能终端、行业智能化应用',
  },
  {
    match: ['机器人', '人形机器人', '减速器'],
    up: '谐波减速器、行星滚柱丝杠、六维力传感器、伺服电机',
    mid: '本体集成、运动控制、灵巧手与执行器',
    down: '汽车制造、3C 装配、仓储物流、家庭服务',
  },
  {
    match: ['创新药', '医药', '双抗', 'CXO'],
    up: '生命科学试剂、培养基、实验室仪器',
    mid: '创新药研发、CXO 外包、临床前与临床服务',
    down: '医院终端、医保支付、海外授权与商业化',
  },
  {
    match: ['低空经济', 'eVTOL', '通航'],
    up: '碳纤维复合材料、航空级电机、飞控与航电',
    mid: 'eVTOL 整机、无人机系统集成',
    down: '通航运营、城市空中交通、物流配送',
  },
  {
    match: ['铜', '有色金属', '稀土', '矿'],
    up: '矿山开采、选矿与冶炼',
    mid: '铜杆铜箔加工、稀土永磁材料',
    down: '电网投资、新能源车、家电与地产竣工',
  },
  {
    match: ['光伏', '硅料', '组件'],
    up: '硅料、硅片、光伏玻璃与 EVA 胶膜',
    mid: '电池片、组件制造、逆变器',
    down: '集中式与分布式电站、储能配套',
  },
  {
    match: ['卫星', '商业航天', '火箭'],
    up: '火箭发动机、卫星平台与载荷、复合材料',
    mid: '卫星总装、地面测控与终端设备',
    down: '卫星通信运营、导航与遥感应用',
  },
  {
    match: ['数据要素', '数据资产'],
    up: '数据采集与标注、算力基础设施',
    mid: '数据确权登记、数据交易平台',
    down: '政务、金融、医疗等行业数据应用',
  },
  {
    match: ['军工', '航空发动机', '国防'],
    up: '高温合金、钛合金、复合材料',
    mid: '航空发动机与主机厂总装',
    down: '军机交付、维修保障与外贸出口',
  },
  {
    match: ['券商', '金融', '并购重组'],
    up: '金融 IT 与数据服务',
    mid: '证券经纪、投行与资管',
    down: '居民财富管理与机构服务',
  },
  {
    match: ['消费电子', '手机', '折叠屏'],
    up: '面板、光学镜片、结构件与散热材料',
    mid: '模组组装、精密制造、整机代工',
    down: '品牌终端、换机需求与以旧换新',
  },
];

export const STOCK_KB: Record<string, { code: string; business: string; stage: 'up' | 'mid' | 'down' }> = {
  宁德时代: { code: '300750', business: '全球动力电池与储能电池龙头', stage: 'mid' },
  赣锋锂业: { code: '002460', business: '锂盐加工与锂资源一体化布局', stage: 'up' },
  当升科技: { code: '300073', business: '高镍三元正极材料供应商', stage: 'up' },
  上海洗霸: { code: '603200', business: '固态电解质材料布局', stage: 'up' },
  三祥新材: { code: '603663', business: '锆基材料，延伸固态电解质', stage: 'up' },
  中芯国际: { code: '688981', business: '国内晶圆代工龙头', stage: 'mid' },
  长电科技: { code: '600584', business: '全球领先封装测试服务商', stage: 'mid' },
  通富微电: { code: '002156', business: '先进封装与 Chiplet 布局', stage: 'mid' },
  寒武纪: { code: '688256', business: '国产 AI 芯片设计', stage: 'mid' },
  北方华创: { code: '002371', business: '半导体设备平台型龙头', stage: 'up' },
  绿的谐波: { code: '688017', business: '谐波减速器国产龙头', stage: 'up' },
  三花智控: { code: '002050', business: '热管理龙头，延伸机器人执行器', stage: 'mid' },
  拓普集团: { code: '601689', business: '汽车零部件平台，切入机器人', stage: 'mid' },
  鸣志电器: { code: '603728', business: '运动控制与步进电机', stage: 'up' },
  恒瑞医药: { code: '600276', business: '创新药研发龙头', stage: 'mid' },
  百济神州: { code: '688235', business: '创新药出海代表企业', stage: 'mid' },
  药明康德: { code: '603259', business: '全球 CXO 龙头', stage: 'mid' },
  康龙化成: { code: '300759', business: '临床前 CRO 与 CDMO', stage: 'mid' },
  中信海直: { code: '000099', business: '通用航空运营龙头', stage: 'down' },
  万丰奥威: { code: '002085', business: '通航飞机制造与镁合金部件', stage: 'mid' },
  光威复材: { code: '300699', business: '碳纤维复合材料龙头', stage: 'up' },
  紫金矿业: { code: '601899', business: '全球铜金矿业龙头', stage: 'up' },
  洛阳钼业: { code: '603993', business: '铜钴资源一体化', stage: 'up' },
  铜陵有色: { code: '000630', business: '铜冶炼与铜箔加工', stage: 'mid' },
  立讯精密: { code: '002475', business: '消费电子精密制造龙头', stage: 'mid' },
  水晶光电: { code: '002273', business: '光学元件与薄膜面板', stage: 'up' },
  蓝思科技: { code: '300433', business: '消费电子结构件与玻璃盖板', stage: 'up' },
  通威股份: { code: '600438', business: '硅料与电池片一体化', stage: 'mid' },
  大全能源: { code: '688303', business: '高纯多晶硅料供应商', stage: 'up' },
  国泰海通: { code: '601211', business: '综合类头部券商', stage: 'mid' },
  中国银河: { code: '601881', business: '零售经纪业务领先的券商', stage: 'mid' },
  中国卫星: { code: '600118', business: '小卫星研制与卫星应用', stage: 'mid' },
  海格通信: { code: '002465', business: '无线通信与北斗导航', stage: 'mid' },
  深桑达A: { code: '000032', business: '数据要素与数字政府建设', stage: 'down' },
  易华录: { code: '300212', business: '数据湖与数据资产运营', stage: 'down' },
  阳光电源: { code: '300274', business: '光伏逆变器与储能系统', stage: 'mid' },
  英维克: { code: '002837', business: '数据中心与储能温控龙头', stage: 'up' },
  航发动力: { code: '600893', business: '航空发动机整机总装', stage: 'mid' },
  抚顺特钢: { code: '600399', business: '高温合金与特种钢', stage: 'up' },
};

/** 依据主题文本匹配产业链描述 */
export function matchChain(text: string): ChainEntry | null {
  let best: { entry: ChainEntry; hits: number } | null = null;
  for (const entry of CHAIN_KB) {
    const hits = entry.match.filter((k) => text.includes(k)).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { entry, hits };
  }
  return best?.entry ?? null;
}

export function lookupStock(name: string): { code?: string; business?: string; stage?: 'up' | 'mid' | 'down' } {
  const key = Object.keys(STOCK_KB).find((k) => name.includes(k) || k.includes(name));
  return key ? STOCK_KB[key] : {};
}
