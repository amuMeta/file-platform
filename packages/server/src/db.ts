import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.js';

const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS user (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'user',
    status        TEXT NOT NULL DEFAULT 'active',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS category (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'enabled',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS file (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES category(id),
    filename    TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    version     TEXT,
    remark      TEXT,
    size        INTEGER NOT NULL,
    status      TEXT NOT NULL DEFAULT 'latest',
    group_key   TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_file_category ON file(category_id, status)`,
  `CREATE TABLE IF NOT EXISTS download_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES user(id) ON DELETE SET NULL,
    file_id    INTEGER NOT NULL REFERENCES file(id),
    ip         TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_log_file ON download_log(file_id)`,
  `CREATE INDEX IF NOT EXISTS idx_log_user ON download_log(user_id)`,
  // 审计日志:所有 admin 关键操作 + 认证事件,合规追溯
  // actor_name 故意冗余:用户被删后审计仍可读
  `CREATE TABLE IF NOT EXISTS audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id    INTEGER,
    actor_name  TEXT NOT NULL,
    action      TEXT NOT NULL,
    resource    TEXT NOT NULL,
    resource_id INTEGER,
    ip          TEXT,
    metadata    TEXT,
    status      TEXT NOT NULL DEFAULT 'success',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_log(resource, resource_id, created_at)`,
];

let _db: Database.Database | null = null;

function migrateDownloadLogUserIdNullable(db: Database.Database): void {
  const cols = db
    .prepare<[], { name: string; notnull: number }>('PRAGMA table_info(download_log)')
    .all();
  if (cols.length === 0) return;
  const userIdCol = cols.find((c) => c.name === 'user_id');
  if (!userIdCol) return;
  if (userIdCol.notnull === 0) return;
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec(`
      BEGIN TRANSACTION;
      CREATE TABLE download_log_new (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER REFERENCES user(id) ON DELETE SET NULL,
        file_id    INTEGER NOT NULL REFERENCES file(id),
        ip         TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO download_log_new (id, user_id, file_id, ip, created_at)
        SELECT id, user_id, file_id, ip, created_at FROM download_log;
      DROP TABLE download_log;
      ALTER TABLE download_log_new RENAME TO download_log;
      CREATE INDEX IF NOT EXISTS idx_log_file ON download_log(file_id);
      CREATE INDEX IF NOT EXISTS idx_log_user ON download_log(user_id);
      COMMIT;
    `);
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

export function getDb(): Database.Database {
  if (_db) return _db;
  const dir = dirname(config.dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(config.uploadDir)) mkdirSync(config.uploadDir, { recursive: true });
  const db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  for (const stmt of DDL) db.exec(stmt);
  migrateDownloadLogUserIdNullable(db);
  _db = db;
  return db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
