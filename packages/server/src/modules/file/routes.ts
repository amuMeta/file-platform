import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { extname, join, resolve } from 'node:path';
import { createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { getDb } from '../../db.js';
import { config } from '../../config.js';
import { ok } from '../../response.js';
import { BadRequest, NotFound, Forbidden, HttpError } from '../../utils/errors.js';
import { getClientIp, freeSpaceMB } from './helpers.js';
import { getRealIp } from '../../observability.js';
import { recordAudit } from '../audit/service.js';

// 上传目录至少预留 50MB 给系统/日志,不够则拒绝
const MIN_DISK_HEADROOM_MB = 50;

interface FileRow {
  id: number;
  category_id: number;
  filename: string;
  stored_path: string;
  version: string | null;
  remark: string | null;
  size: number;
  status: 'latest' | 'history' | 'hidden';
  group_key: string | null;
  created_at: string;
  category_name?: string;
}

const UpdateSchema = z.object({
  version: z.string().max(64).nullable().optional(),
  remark: z.string().max(2000).nullable().optional(),
  status: z.enum(['latest', 'history', 'hidden']).optional(),
});

function isAllowedExt(name: string): boolean {
  const ext = extname(name).slice(1).toLowerCase();
  return config.allowedExt.includes(ext);
}

function extOf(name: string): string {
  return extname(name).slice(1).toLowerCase();
}

function buildGroupKey(filename: string): string {
  return filename.replace(/\.[^.]+$/, '') || 'default';
}

/**
 * 把同分类(粒度可切到 group_key)下原本是 latest 的文件降级为 history。
 * 返回受影响的行数。
 */
function demoteOldLatest(categoryId: number): number {
  const info = getDb()
    .prepare(`UPDATE file SET status = 'history' WHERE category_id = ? AND status = 'latest'`)
    .run(categoryId);
  return info.changes;
}

function deletePhysical(storedPath: string): void {
  const full = resolve(config.uploadDir, storedPath);
  try {
    if (existsSync(full)) unlinkSync(full);
  } catch {
    /* ignore */
  }
}

function rowToPublic(r: FileRow) {
  return {
    id: r.id,
    category_id: r.category_id,
    category_name: r.category_name,
    filename: r.filename,
    version: r.version,
    remark: r.remark,
    size: r.size,
    status: r.status,
    group_key: r.group_key,
    created_at: r.created_at,
  };
}

export async function fileRoutes(app: FastifyInstance): Promise<void> {
  // 客户端:某分类下的文件
  app.get<{ Params: { id: string }; Querystring: { includeHistory?: string } }>(
    '/categories/:id/files',
    { preHandler: [app.requireAuth] },
    async (req) => {
      const params = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
      const include = req.query.includeHistory === '1';
      const db = getDb();
      const statusFilter = include ? "AND f.status IN ('latest', 'history')" : "AND f.status = 'latest'";
      const rows = db
        .prepare<[number], FileRow>(
          `SELECT f.id, f.category_id, f.filename, f.stored_path, f.version, f.remark, f.size,
                  f.status, f.group_key, f.created_at, c.name as category_name
           FROM file f JOIN category c ON c.id = f.category_id
           WHERE f.category_id = ? ${statusFilter}
             AND c.status = 'enabled'
           ORDER BY f.status ASC, f.created_at DESC`
        )
        .all(params.id);
      return ok({ items: rows.map(rowToPublic) });
    }
  );

  // 客户端:文件详情 + 历史版本
  app.get<{ Params: { id: string } }>('/files/:id', { preHandler: [app.requireAuth] }, async (req) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const db = getDb();
    const row = db
      .prepare<[number], FileRow>(
        `SELECT f.id, f.category_id, f.filename, f.stored_path, f.version, f.remark, f.size,
                f.status, f.group_key, f.created_at, c.name as category_name
         FROM file f JOIN category c ON c.id = f.category_id
         WHERE f.id = ? AND f.status != 'hidden' AND c.status = 'enabled'`
      )
      .get(params.id);
    if (!row) throw NotFound('文件不存在');
    const history = db
      .prepare<[number, number, string | null], FileRow>(
        `SELECT f.id, f.category_id, f.filename, f.stored_path, f.version, f.remark, f.size,
                f.status, f.group_key, f.created_at, c.name as category_name
         FROM file f JOIN category c ON c.id = f.category_id
         WHERE f.category_id = ? AND f.id <> ? AND f.status = 'history' AND IFNULL(f.group_key,'') = IFNULL(?, '')
         ORDER BY f.created_at DESC`
      )
      .all(row.category_id, row.id, row.group_key);
    return ok({ file: rowToPublic(row), history: history.map(rowToPublic) });
  });

  // 客户端:搜索
  app.get<{ Querystring: { q?: string } }>('/search', { preHandler: [app.requireAuth] }, async (req) => {
    const q = (req.query.q ?? '').trim();
    if (!q) return ok({ items: [] });
    const db = getDb();
    const like = `%${q}%`;
    const rows = db
      .prepare<[string, string], FileRow>(
        `SELECT f.id, f.category_id, f.filename, f.stored_path, f.version, f.remark, f.size,
                f.status, f.group_key, f.created_at, c.name as category_name
         FROM file f JOIN category c ON c.id = f.category_id
         WHERE f.status = 'latest' AND c.status = 'enabled'
           AND (f.filename LIKE ? OR IFNULL(f.remark, '') LIKE ?)
         ORDER BY f.created_at DESC LIMIT 50`
      )
      .all(like, like);
    return ok({ items: rows.map(rowToPublic) });
  });

  // 客户端:下载
  app.get<{ Params: { id: string } }>(
    '/files/:id/download',
    { preHandler: [app.requireAuth] },
    async (req: FastifyRequest, reply) => {
      const params = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
      const db = getDb();
      const row = db
        .prepare<[number], { id: number; filename: string; stored_path: string; size: number; status: string }>(
          'SELECT id, filename, stored_path, size, status FROM file WHERE id = ?'
        )
        .get(params.id);
      if (!row) {
        req.log.warn({ event: 'download.failed', reason: 'not_found', fileId: params.id, userId: req.session.get('userId') }, 'download not found');
        throw NotFound('文件不存在');
      }
      if (row.status === 'hidden') {
        req.log.warn({ event: 'download.failed', reason: 'hidden', fileId: row.id, userId: req.session.get('userId') }, 'download hidden file attempted');
        throw Forbidden('文件已下架');
      }

      const ip = getClientIp(req);
      const userId = req.session.get('userId')!;
      db.prepare('INSERT INTO download_log (user_id, file_id, ip) VALUES (?, ?, ?)').run(userId, row.id, ip);

      // 业务事件日志(下载本身由 nginx sendfile 实际下发,这里只能记发起)
      req.log.info(
        {
          event: 'download.success',
          fileId: row.id,
          filename: row.filename,
          bytes: row.size,
          userId,
          userRole: req.session.get('role'),
          ip,
        },
        `download ${row.filename} (${row.size} B) by user ${userId}`
      );

      const encoded = encodeURIComponent(row.filename).replace(/['()]/g, escape).replace(/\*/g, '%2A');
      const disposition = `attachment; filename*=UTF-8''${encoded}`;

      if (config.useXAccel) {
        reply
          .header('X-Accel-Redirect', `${config.xaccelPrefix}/${row.stored_path}`)
          .header('Content-Type', 'application/octet-stream')
          .header('Content-Disposition', disposition)
          .header('Content-Length', String(row.size))
          .send();
        return reply;
      }
      // 开发模式:流式 sendFile
      reply
        .header('Content-Type', 'application/octet-stream')
        .header('Content-Disposition', disposition)
        .sendFile(row.stored_path, config.uploadDir);
      return reply;
    }
  );

  // 管理端:列出所有文件(含 hidden)
  app.get<{ Querystring: { q?: string } }>('/admin/files', { preHandler: [app.requireAuth, app.requireAdmin] }, async (req) => {
    const q = req.query.q?.trim();
    const db = getDb();
    const rows = q
      ? db
          .prepare<[string, string], FileRow>(
            `SELECT f.id, f.category_id, f.filename, f.stored_path, f.version, f.remark, f.size,
                    f.status, f.group_key, f.created_at, c.name as category_name
             FROM file f JOIN category c ON c.id = f.category_id
             WHERE f.filename LIKE ? OR IFNULL(f.remark, '') LIKE ?
             ORDER BY f.created_at DESC LIMIT 200`
          )
          .all(`%${q}%`, `%${q}%`)
      : db
          .prepare<[], FileRow>(
            `SELECT f.id, f.category_id, f.filename, f.stored_path, f.version, f.remark, f.size,
                    f.status, f.group_key, f.created_at, c.name as category_name
             FROM file f JOIN category c ON c.id = f.category_id
             ORDER BY f.created_at DESC LIMIT 200`
          )
          .all();
    return ok({ items: rows.map(rowToPublic) });
  });

  // 管理端:上传(multipart:category_id, version?, remark?, file)
  app.post('/admin/files', { preHandler: [app.requireAuth, app.requireAdmin] }, async (req, reply) => {
    const startedAt = Date.now();
    const userId = req.session.get('userId')!;
    const userRole = req.session.get('role');
    const ip = getClientIp(req);

    // 单批最多 50 个文件 — 防止用户一次拖几百个 500MB 把服务打爆
    const MAX_BATCH_FILES = 50;

    // 已落盘的物理文件,出错时全清(全或无回滚)
    const savedFiles: Array<{ storedPath: string; originalName: string; size: number; groupKey: string }> = [];

    function cleanupAll(): void {
      for (const f of savedFiles) deletePhysical(f.storedPath);
      savedFiles.length = 0;
    }

    try {
      if (!req.isMultipart()) {
        req.log.warn({ event: 'upload.failed', reason: 'not_multipart', userId, ip }, 'upload not multipart');
        throw BadRequest('请使用 multipart/form-data 上传');
      }

      let categoryId = 0;
      let version: string | null = null;
      let remark: string | null = null;

      if (!existsSync(config.uploadDir)) mkdirSync(config.uploadDir, { recursive: true });

      // 磁盘空间预检:若剩余空间不足,直接拒(避免写到一半 ENOSPC)
      const headroom = freeSpaceMB(config.uploadDir);
      if (headroom < MIN_DISK_HEADROOM_MB) {
        req.log.warn({ event: 'upload.failed', reason: 'disk_full', headroomMB: headroom, userId, ip }, 'upload rejected: disk full');
        throw new HttpError(
          507,
          'INSUFFICIENT_STORAGE',
          `服务器磁盘空间不足(仅剩 ${headroom.toFixed(0)}MB),请清理后重试`
        );
      }

      const parts = req.parts({ limits: { fileSize: config.maxUploadMB * 1024 * 1024 } });
      for await (const part of parts) {
        if (part.type === 'file') {
          if (savedFiles.length >= MAX_BATCH_FILES) {
            part.file.resume();
            cleanupAll();
            req.log.warn({ event: 'upload.failed', reason: 'too_many_files', limit: MAX_BATCH_FILES, userId, ip }, 'upload rejected: too many files');
            throw BadRequest(`单次最多上传 ${MAX_BATCH_FILES} 个文件`);
          }
          if (!isAllowedExt(part.filename)) {
            part.file.resume();
            cleanupAll();
            req.log.warn({ event: 'upload.failed', reason: 'bad_ext', filename: part.filename, userId, ip }, 'upload rejected: bad extension');
            throw BadRequest(`扩展名不允许:仅支持 ${config.allowedExt.join(', ')}`);
          }
          const ext = extOf(part.filename);
          const id = uuidv4();
          const storedName = ext ? `${id}.${ext}` : id;
          const fullPath = join(config.uploadDir, storedName);
          try {
            await pipeline(part.file, createWriteStream(fullPath));
          } catch (err) {
            deletePhysical(storedName);
            cleanupAll();
            req.log.warn({ event: 'upload.failed', reason: 'write_error', filename: part.filename, errMsg: (err as Error).message, userId, ip }, 'upload write failed');
            throw BadRequest(`写入失败:${(err as Error).message}`);
          }
          const size = statSync(fullPath).size;
          const groupKey = buildGroupKey(part.filename);
          savedFiles.push({ storedPath: storedName, originalName: part.filename, size, groupKey });
        } else if (part.type === 'field') {
          if (part.fieldname === 'category_id') {
            categoryId = Number.parseInt(String(part.value), 10);
          } else if (part.fieldname === 'version') {
            version = String(part.value) || null;
          } else if (part.fieldname === 'remark') {
            remark = String(part.value) || null;
          }
        }
      }

      if (!categoryId) {
        cleanupAll();
        req.log.warn({ event: 'upload.failed', reason: 'missing_category', userId, ip }, 'upload rejected: missing category');
        throw BadRequest('缺少字段: category_id');
      }
      if (savedFiles.length === 0) {
        req.log.warn({ event: 'upload.failed', reason: 'missing_file', userId, ip }, 'upload rejected: missing file');
        throw BadRequest('缺少文件');
      }

      const db = getDb();
      const cat = db
        .prepare<[number], { id: number }>('SELECT id FROM category WHERE id = ?')
        .get(categoryId);
      if (!cat) {
        cleanupAll();
        req.log.warn({ event: 'upload.failed', reason: 'category_not_found', categoryId, userId, ip }, 'upload rejected: category not found');
        throw NotFound('分类不存在');
      }

      // 单事务:1 次 demote + N 次 insert,要么全成要么全回滚
      const insertedIds: number[] = [];
      let demoted = 0;
      const tx = db.transaction(() => {
        demoted = demoteOldLatest(categoryId);
        const insertStmt = db.prepare(
          `INSERT INTO file (category_id, filename, stored_path, version, remark, size, status, group_key)
           VALUES (?, ?, ?, ?, ?, ?, 'latest', ?)`
        );
        for (const f of savedFiles) {
          const info = insertStmt.run(
            categoryId,
            f.originalName,
            f.storedPath,
            version,
            remark,
            f.size,
            f.groupKey
          );
          insertedIds.push(Number(info.lastInsertRowid));
        }
      });
      tx();

      // 重新读取,带 category_name 供前端展示
      const placeholders = insertedIds.map(() => '?').join(',');
      const rows = db
        .prepare<number[], FileRow>(
          `SELECT f.id, f.category_id, f.filename, f.stored_path, f.version, f.remark, f.size,
                  f.status, f.group_key, f.created_at, c.name as category_name
           FROM file f JOIN category c ON c.id = f.category_id
           WHERE f.id IN (${placeholders})`
        )
        .all(...insertedIds);

      const totalBytes = savedFiles.reduce((s, f) => s + f.size, 0);
      const durationMs = Date.now() - startedAt;
      const speedMbps = durationMs > 0 ? totalBytes / 1024 / 1024 / (durationMs / 1000) : 0;
      const filenames = savedFiles.map((f) => f.originalName);

      req.log.info(
        {
          event: 'upload.success',
          fileCount: savedFiles.length,
          filenames,
          totalBytes,
          categoryId,
          demoted,
          durationMs,
          speedMbps: Number(speedMbps.toFixed(2)),
          userId,
          userRole,
          ip,
        },
        `uploaded ${savedFiles.length} file(s) (${(totalBytes / 1024 / 1024).toFixed(1)} MB) in ${durationMs}ms`
      );

      recordAudit({
        actor: { id: userId, name: req.session.get('username') ?? 'unknown' },
        action: 'file.upload',
        resource: 'file',
        resourceId: insertedIds[0] ?? 0,
        ip,
        metadata: {
          fileCount: savedFiles.length,
          filenames,
          totalBytes,
          categoryId,
          version,
          demoted,
          durationMs,
          speedMbps: Number(speedMbps.toFixed(2)),
        },
      });

      return reply.send(ok({ files: rows.map(rowToPublic), demoted }));
    } catch (err) {
      // 兜底:任何未在上面显式清理的异常,统一清盘
      if (savedFiles.length > 0) cleanupAll();
      if (!(err instanceof HttpError) && (err as { statusCode?: number }).statusCode === undefined) {
        req.log.error({ event: 'upload.failed', reason: 'unexpected', errMsg: (err as Error).message, userId, ip }, 'upload unexpected error');
      }
      throw err;
    }
  });

  // 管理端:更新
  app.put<{ Params: { id: string } }>('/admin/files/:id', { preHandler: [app.requireAuth, app.requireAdmin] }, async (req) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const body = UpdateSchema.parse(req.body);
    if (Object.keys(body).length === 0) throw BadRequest('至少提供一个字段');
    const db = getDb();
    const row = db
      .prepare<[number], { id: number; filename: string; version: string | null; remark: string | null; status: string }>(
        'SELECT id, filename, version, remark, status FROM file WHERE id = ?'
      )
      .get(params.id);
    if (!row) throw NotFound('文件不存在');
    const fields: string[] = [];
    const values: (string | number | null)[] = [];
    if (body.version !== undefined) { fields.push('version = ?'); values.push(body.version); }
    if (body.remark !== undefined) { fields.push('remark = ?'); values.push(body.remark); }
    if (body.status !== undefined) { fields.push('status = ?'); values.push(body.status); }
    values.push(params.id);
    db.prepare(`UPDATE file SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    recordAudit({
      actor: { id: req.session.get('userId')!, name: req.session.get('username') ?? 'unknown' },
      action: 'file.update',
      resource: 'file',
      resourceId: params.id,
      ip: getRealIp(req),
      metadata: {
        filename: row.filename,
        before: { version: row.version, remark: row.remark, status: row.status },
        after: {
          version: body.version !== undefined ? body.version : row.version,
          remark: body.remark !== undefined ? body.remark : row.remark,
          status: body.status !== undefined ? body.status : row.status,
        },
      },
    });
    return ok({ id: params.id });
  });

  // 管理端:删除
  app.delete<{ Params: { id: string } }>('/admin/files/:id', { preHandler: [app.requireAuth, app.requireAdmin] }, async (req) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const db = getDb();
    const row = db
      .prepare<[number], { id: number; stored_path: string; filename: string; size: number; category_id: number }>(
        'SELECT id, stored_path, filename, size, category_id FROM file WHERE id = ?'
      )
      .get(params.id);
    if (!row) throw NotFound('文件不存在');
    db.prepare('DELETE FROM download_log WHERE file_id = ?').run(params.id);
    db.prepare('DELETE FROM file WHERE id = ?').run(params.id);
    deletePhysical(row.stored_path);
    recordAudit({
      actor: { id: req.session.get('userId')!, name: req.session.get('username') ?? 'unknown' },
      action: 'file.delete',
      resource: 'file',
      resourceId: params.id,
      ip: getRealIp(req),
      // 文件被删后只剩 metadata,所以把核心信息记进去
      metadata: { filename: row.filename, bytes: row.size, categoryId: row.category_id },
    });
    return ok({ id: params.id });
  });
}
