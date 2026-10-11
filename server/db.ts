/**
 * 会话 / 消息持久化层。
 *
 * 双后端设计：
 *   A. SQLite（better-sqlite3）—— 首选，性能好；
 *   B. JSON 文件 —— 当原生模块未编译成功（缺少 Xcode 命令行工具、跨平台部署等）时自动回退。
 *
 * 对外暴露的 API 完全一致，上层无需感知使用哪个后端。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据目录
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'chat.db');
const jsonPath = path.join(dataDir, 'chat-sessions.json');

// ============= 类型定义 =============

export interface DbSession {
  id: string;
  title: string;
  model: string;
  sdk_session_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  model: string | null;
  created_at: string;
  tool_calls: string | null;
}

// ============= 后端 A：SQLite =============

let sqlite: any = null;
try {
  const mod: any = await import('better-sqlite3');
  const Database = mod.default ?? mod;
  const conn = new Database(dbPath);
  conn.pragma('journal_mode = WAL');
  conn.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      model TEXT NOT NULL,
      sdk_session_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      model TEXT,
      created_at TEXT NOT NULL,
      tool_calls TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
  `);
  // 迁移：补充 sdk_session_id 列
  try {
    const cols = conn.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === 'sdk_session_id')) {
      conn.exec('ALTER TABLE sessions ADD COLUMN sdk_session_id TEXT');
      console.log('[DB] 已为 sessions 表补充 sdk_session_id 列');
    }
  } catch {
    /* 忽略 */
  }
  sqlite = conn;
  console.log(`[DB] 持久化后端：SQLite（${dbPath}）`);
} catch (e: any) {
  sqlite = null;
  console.warn(
    `[DB] better-sqlite3 不可用，已自动回退到 JSON 文件存储（${jsonPath}）。原因：${e?.message ?? e}`,
  );
}

// ============= 后端 B：JSON 文件 =============

interface JsonStore {
  sessions: DbSession[];
  messages: DbMessage[];
}

function loadJson(): JsonStore {
  try {
    if (!fs.existsSync(jsonPath)) return { sessions: [], messages: [] };
    const raw = fs.readFileSync(jsonPath, 'utf8');
    const parsed = JSON.parse(raw) as JsonStore;
    return {
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
    };
  } catch {
    return { sessions: [], messages: [] };
  }
}

function saveJson(store: JsonStore): void {
  const tmp = `${jsonPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmp, jsonPath);
}

// ============= 会话操作 =============

export function getAllSessions(): DbSession[] {
  if (sqlite) {
    return sqlite.prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all() as DbSession[];
  }
  return loadJson().sessions.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function getSession(id: string): DbSession | undefined {
  if (sqlite) {
    return sqlite.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as DbSession | undefined;
  }
  return loadJson().sessions.find((s) => s.id === id);
}

export function createSession(session: DbSession): DbSession {
  if (sqlite) {
    sqlite
      .prepare(
        `INSERT INTO sessions (id, title, model, sdk_session_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        session.id,
        session.title,
        session.model,
        session.sdk_session_id ?? null,
        session.created_at,
        session.updated_at,
      );
    return session;
  }
  const store = loadJson();
  store.sessions.push({ ...session, sdk_session_id: session.sdk_session_id ?? null });
  saveJson(store);
  return session;
}

export function updateSession(
  id: string,
  updates: Partial<Pick<DbSession, 'title' | 'model' | 'sdk_session_id'>>,
): boolean {
  if (sqlite) {
    const fields: string[] = [];
    const values: any[] = [];
    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.model !== undefined) {
      fields.push('model = ?');
      values.push(updates.model);
    }
    if (updates.sdk_session_id !== undefined) {
      fields.push('sdk_session_id = ?');
      values.push(updates.sdk_session_id);
    }
    if (fields.length === 0) return false;
    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);
    const result = sqlite.prepare(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return result.changes > 0;
  }

  const store = loadJson();
  const s = store.sessions.find((x) => x.id === id);
  if (!s) return false;
  if (updates.title !== undefined) s.title = updates.title;
  if (updates.model !== undefined) s.model = updates.model;
  if (updates.sdk_session_id !== undefined) s.sdk_session_id = updates.sdk_session_id;
  s.updated_at = new Date().toISOString();
  saveJson(store);
  return true;
}

export function deleteSession(id: string): boolean {
  if (sqlite) {
    const result = sqlite.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    sqlite.prepare('DELETE FROM messages WHERE session_id = ?').run(id);
    return result.changes > 0;
  }
  const store = loadJson();
  const before = store.sessions.length;
  store.sessions = store.sessions.filter((s) => s.id !== id);
  store.messages = store.messages.filter((m) => m.session_id !== id);
  saveJson(store);
  return store.sessions.length < before;
}

// ============= 消息操作 =============

export function getMessagesBySession(sessionId: string): DbMessage[] {
  if (sqlite) {
    return sqlite
      .prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC')
      .all(sessionId) as DbMessage[];
  }
  return loadJson()
    .messages.filter((m) => m.session_id === sessionId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function createMessage(message: DbMessage): DbMessage {
  if (sqlite) {
    sqlite
      .prepare(
        `INSERT INTO messages (id, session_id, role, content, model, created_at, tool_calls)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        message.id,
        message.session_id,
        message.role,
        message.content,
        message.model,
        message.created_at,
        message.tool_calls,
      );
    sqlite
      .prepare('UPDATE sessions SET updated_at = ? WHERE id = ?')
      .run(new Date().toISOString(), message.session_id);
    return message;
  }

  const store = loadJson();
  store.messages.push(message);
  const s = store.sessions.find((x) => x.id === message.session_id);
  if (s) s.updated_at = new Date().toISOString();
  saveJson(store);
  return message;
}

export function updateMessage(id: string, updates: Partial<Pick<DbMessage, 'content' | 'tool_calls'>>): boolean {
  if (sqlite) {
    const fields: string[] = [];
    const values: any[] = [];
    if (updates.content !== undefined) {
      fields.push('content = ?');
      values.push(updates.content);
    }
    if (updates.tool_calls !== undefined) {
      fields.push('tool_calls = ?');
      values.push(updates.tool_calls);
    }
    if (fields.length === 0) return false;
    values.push(id);
    const result = sqlite.prepare(`UPDATE messages SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return result.changes > 0;
  }

  const store = loadJson();
  const m = store.messages.find((x) => x.id === id);
  if (!m) return false;
  if (updates.content !== undefined) m.content = updates.content;
  if (updates.tool_calls !== undefined) m.tool_calls = updates.tool_calls;
  saveJson(store);
  return true;
}

export function deleteMessage(id: string): boolean {
  if (sqlite) {
    return sqlite.prepare('DELETE FROM messages WHERE id = ?').run(id).changes > 0;
  }
  const store = loadJson();
  const before = store.messages.length;
  store.messages = store.messages.filter((m) => m.id !== id);
  saveJson(store);
  return store.messages.length < before;
}

export function createMessages(messages: DbMessage[]): void {
  if (sqlite) {
    const stmt = sqlite.prepare(
      `INSERT INTO messages (id, session_id, role, content, model, created_at, tool_calls)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertMany = sqlite.transaction((msgs: DbMessage[]) => {
      for (const m of msgs) {
        stmt.run(m.id, m.session_id, m.role, m.content, m.model, m.created_at, m.tool_calls);
      }
    });
    insertMany(messages);
    return;
  }
  const store = loadJson();
  store.messages.push(...messages);
  saveJson(store);
}

export function clearAllData(): void {
  if (sqlite) {
    sqlite.exec('DELETE FROM messages');
    sqlite.exec('DELETE FROM sessions');
    return;
  }
  saveJson({ sessions: [], messages: [] });
}

/** 当前使用的持久化后端，便于健康检查展示 */
export const backendName: 'sqlite' | 'json' = sqlite ? 'sqlite' : 'json';

export default {
  getAllSessions,
  getSession,
  createSession,
  updateSession,
  deleteSession,
  getMessagesBySession,
  createMessage,
  updateMessage,
  deleteMessage,
  createMessages,
  clearAllData,
};
