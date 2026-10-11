/**
 * 配置中心：负责读取 / 保存 config 目录下的四类配置文件。
 * 所有业务配置都放在项目根目录的 config/ 下，用户可手工编辑，也可通过界面修改。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadEnv } from './env.js';
import type {
  BrandConfig,
  DataSourceFile,
  FilterRules,
  TemplateFile,
} from './types.js';

// 配置中心是全局唯一入口，在这里统一加载 .env，保证任何调用路径都能读到环境变量
loadEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** 项目根目录（server/pipeline -> ../../） */
export const ROOT_DIR = path.resolve(__dirname, '..', '..');
export const CONFIG_DIR = path.join(ROOT_DIR, 'config');
export const DATA_DIR = path.join(ROOT_DIR, 'server', 'data');
export const RUNS_DIR = path.join(DATA_DIR, 'runs');
export const BANNERS_DIR = path.join(DATA_DIR, 'banners');
/** 数据源响应缓存目录：避免反复请求真实订阅站 */
export const CACHE_DIR = path.join(DATA_DIR, 'cache');

export const CONFIG_FILES = {
  brand: 'brand.json',
  sources: 'data-sources.json',
  rules: 'filter-rules.json',
  templates: 'templates.json',
} as const;

export type ConfigName = keyof typeof CONFIG_FILES;

function ensureDirs() {
  for (const dir of [CONFIG_DIR, DATA_DIR, RUNS_DIR, BANNERS_DIR, CACHE_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

ensureDirs();

export function configPath(name: ConfigName): string {
  return path.join(CONFIG_DIR, CONFIG_FILES[name]);
}

export function readConfig<T>(name: ConfigName): T {
  const file = configPath(name);
  const raw = fs.readFileSync(file, 'utf8');
  return JSON.parse(raw) as T;
}

export function writeConfig(name: ConfigName, data: unknown): void {
  const file = configPath(name);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

export const readBrand = () => readConfig<BrandConfig>('brand');
export const readSources = () => readConfig<DataSourceFile>('sources');
export const readRules = () => readConfig<FilterRules>('rules');
export const readTemplates = () => readConfig<TemplateFile>('templates');

export const writeBrand = (d: BrandConfig) => writeConfig('brand', d);
export const writeSources = (d: DataSourceFile) => writeConfig('sources', d);
export const writeRules = (d: FilterRules) => writeConfig('rules', d);
export const writeTemplates = (d: TemplateFile) => writeConfig('templates', d);

/** 统一入口：按名称读配置 */
export function getConfig(name: ConfigName): unknown {
  return readConfig(name);
}

/** 统一入口：按名称写配置 */
export function setConfig(name: ConfigName, data: unknown): void {
  writeConfig(name, data);
}

/** 运行记录持久化 */
export function saveRun(run: unknown, id: string): void {
  if (!fs.existsSync(RUNS_DIR)) fs.mkdirSync(RUNS_DIR, { recursive: true });
  fs.writeFileSync(path.join(RUNS_DIR, `${id}.json`), JSON.stringify(run, null, 2), 'utf8');
}

export function listRuns(): string[] {
  if (!fs.existsSync(RUNS_DIR)) return [];
  return fs
    .readdirSync(RUNS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse();
}

export function loadRun(id: string): unknown | null {
  const file = path.join(RUNS_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
