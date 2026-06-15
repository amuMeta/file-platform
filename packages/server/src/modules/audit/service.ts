import type Database from 'better-sqlite3';
import { getDb } from '../../db.js';

export type AuditAction =
  | 'auth.login.success'
  | 'auth.login.failed'
  | 'auth.logout'
  | 'category.create'
  | 'category.update'
  | 'category.delete'
  | 'category.sort'
  | 'file.upload'
  | 'file.update'
  | 'file.delete'
  | 'user.create'
  | 'user.update'
  | 'user.delete';

export type AuditResource = 'category' | 'file' | 'user' | 'session';

export type AuditStatus = 'success' | 'failed';

export interface AuditRecordOptions {
  actor: { id: number | null; name: string } | null;
  action: AuditAction;
  resource: AuditResource;
  resourceId?: number | null;
  ip?: string | null;
  metadata?: Record<string, unknown> | null;
  status?: AuditStatus;
  db?: Database.Database;
}

interface AuditRow {
  id: number;
  actor_id: number | null;
  actor_name: string;
  action: string;
  resource: string;
  resource_id: number | null;
  ip: string | null;
  metadata: string | null;
  status: string;
  created_at: string;
}

/**
 * 落一条审计日志(同步写,直接 INSERT)
 * - 默认走 getDb(),调用方可传 db 以加入外部事务
 * - metadata 序列化为 JSON;过大时请调用方先精简
 * - 失败不抛:审计失败不应阻塞业务请求
 */
export function recordAudit(opts: AuditRecordOptions): number | null {
  const db = opts.db ?? getDb();
  try {
    const meta = opts.metadata == null ? null : JSON.stringify(opts.metadata);
    const info = db
      .prepare(
        `INSERT INTO audit_log
         (actor_id, actor_name, action, resource, resource_id, ip, metadata, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        opts.actor?.id ?? null,
        opts.actor?.name ?? (opts.action.startsWith('auth.login.failed') ? '(unknown)' : 'system'),
        opts.action,
        opts.resource,
        opts.resourceId ?? null,
        opts.ip ?? null,
        meta,
        opts.status ?? 'success'
      );
    return Number(info.lastInsertRowid);
  } catch (err) {
    // 审计失败只 console.warn,业务逻辑照常
    // eslint-disable-next-line no-console
    console.warn('[audit] failed to record:', (err as Error).message);
    return null;
  }
}

export function getAuditLogRow(id: number): AuditRow | undefined {
  return getDb()
    .prepare<[number], AuditRow>('SELECT * FROM audit_log WHERE id = ?')
    .get(id);
}

export function queryAuditLogs(filters: {
  actorId?: number;
  action?: string;
  resource?: string;
  page: number;
  pageSize: number;
}): { items: AuditRow[]; total: number } {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filters.actorId) {
    where.push('actor_id = ?');
    params.push(filters.actorId);
  }
  if (filters.action) {
    where.push('action = ?');
    params.push(filters.action);
  }
  if (filters.resource) {
    where.push('resource = ?');
    params.push(filters.resource);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const db = getDb();
  const totalRow = db
    .prepare<typeof params, { c: number }>(`SELECT COUNT(*) as c FROM audit_log ${whereSql}`)
    .get(...params);
  const offset = (filters.page - 1) * filters.pageSize;
  const items = db
    .prepare<typeof params, AuditRow>(
      `SELECT * FROM audit_log ${whereSql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, filters.pageSize, offset);
  return { items, total: totalRow?.c ?? 0 };
}

export type { AuditRow };
