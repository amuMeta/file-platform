import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../../db.js';
import { ok } from '../../response.js';

interface LogRow {
  id: number;
  user_id: number;
  file_id: number;
  ip: string | null;
  created_at: string;
  username: string;
  filename: string;
}

const QuerySchema = z.object({
  fileId: z.coerce.number().int().positive().optional(),
  userId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
});

export async function logRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/logs', { preHandler: [app.requireAuth, app.requireAdmin] }, async (req) => {
    const q = QuerySchema.parse(req.query);
    const db = getDb();
    const where: string[] = [];
    const params: number[] = [];
    if (q.fileId) { where.push('l.file_id = ?'); params.push(q.fileId); }
    if (q.userId) { where.push('l.user_id = ?'); params.push(q.userId); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = db
      .prepare<number[], { c: number }>(`SELECT COUNT(*) as c FROM download_log l ${whereSql}`)
      .get(...params);
    const offset = (q.page - 1) * q.pageSize;
    const rows = db
      .prepare<number[], LogRow>(
        `SELECT l.id, l.user_id, l.file_id, l.ip, l.created_at, u.username, f.filename
         FROM download_log l
         JOIN user u ON u.id = l.user_id
         JOIN file f ON f.id = l.file_id
         ${whereSql}
         ORDER BY l.created_at DESC, l.id DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, q.pageSize, offset);
    return ok({ items: rows, total: total?.c ?? 0, page: q.page, pageSize: q.pageSize });
  });
}
