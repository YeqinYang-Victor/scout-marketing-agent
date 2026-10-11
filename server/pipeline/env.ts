/**
 * 环境变量加载与密钥解析。
 *
 * 使用 Node 20.12+ 内置的 process.loadEnvFile()，无需引入 dotenv 依赖。
 * 目的：让订阅站的账号密码等敏感信息可以放在 .env（已被 .gitignore 忽略），
 * 而不是硬编码在会提交到仓库的 config/data-sources.json 里。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..', '..');

let loaded = false;

/** 加载项目根目录下的 .env（只执行一次；文件不存在时静默跳过） */
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  const file = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(file)) return;
  try {
    (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile(file);
  } catch {
    /* 老版本 Node 不支持时忽略，不影响已有环境变量 */
  }
}

/**
 * 解析配置中的密钥值：
 *   "${ZEN_PASS}"  → 读取 process.env.ZEN_PASS
 *   其他值          → 原样返回
 * 这样配置文件里可以只写占位符，真实凭据留在 .env 中。
 */
export function resolveSecret(value: unknown): string {
  const s = String(value ?? '');
  const m = /^\$\{(\w+)\}$/.exec(s.trim());
  if (!m) return s;
  return process.env[m[1]] ?? '';
}
