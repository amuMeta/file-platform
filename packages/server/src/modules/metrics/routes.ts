import type { FastifyInstance } from 'fastify';
import { getDb } from '../../db.js';
import { ok } from '../../response.js';

interface CountRow { c: number }
interface SumRow { s: number | null }

export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/metrics', { preHandler: [app.requireAuth, app.requireAdmin] }, async () => {
    const db = getDb();
    const now = Date.now();
    const oneDayAgo = new Date(now - 24 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);
    const oneHourAgo = new Date(now - 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);

    // 文件统计
    const filesTotal = db.prepare<[], CountRow>("SELECT COUNT(*) as c FROM file").get()?.c ?? 0;
    const filesLatest = db.prepare<[], CountRow>("SELECT COUNT(*) as c FROM file WHERE status='latest'").get()?.c ?? 0;
    const filesHistory = db.prepare<[], CountRow>("SELECT COUNT(*) as c FROM file WHERE status='history'").get()?.c ?? 0;
    const filesHidden = db.prepare<[], CountRow>("SELECT COUNT(*) as c FROM file WHERE status='hidden'").get()?.c ?? 0;
    const storageBytes = db.prepare<[], SumRow>("SELECT SUM(size) as s FROM file WHERE status IN ('latest','history')").get()?.s ?? 0;

    // 分类
    const categoriesTotal = db.prepare<[], CountRow>("SELECT COUNT(*) as c FROM category").get()?.c ?? 0;
    const categoriesEnabled = db.prepare<[], CountRow>("SELECT COUNT(*) as c FROM category WHERE status='enabled'").get()?.c ?? 0;

    // 用户
    const usersTotal = db.prepare<[], CountRow>("SELECT COUNT(*) as c FROM user").get()?.c ?? 0;
    const usersAdmins = db.prepare<[], CountRow>("SELECT COUNT(*) as c FROM user WHERE role='admin'").get()?.c ?? 0;
    const usersActive = db.prepare<[], CountRow>("SELECT COUNT(*) as c FROM user WHERE status='active'").get()?.c ?? 0;

    // 下载统计
    const downloadsTotal = db.prepare<[], CountRow>("SELECT COUNT(*) as c FROM download_log").get()?.c ?? 0;
    const downloads24h = db.prepare<[string], CountRow>("SELECT COUNT(*) as c FROM download_log WHERE created_at >= ?").get(oneDayAgo)?.c ?? 0;
    const downloads1h = db.prepare<[string], CountRow>("SELECT COUNT(*) as c FROM download_log WHERE created_at >= ?").get(oneHourAgo)?.c ?? 0;

    // 过去 24h 按文件聚合(找出热门文件)
    const topFiles = db
      .prepare<[string], { file_id: number; filename: string; category_name: string; downloads: number; bytes: number }>(
        `SELECT l.file_id, f.filename, c.name as category_name, COUNT(*) as downloads, f.size as bytes
         FROM download_log l
         JOIN file f ON f.id = l.file_id
         JOIN category c ON c.id = f.category_id
         WHERE l.created_at >= ?
         GROUP BY l.file_id
         ORDER BY downloads DESC
         LIMIT 10`
      )
      .all(oneDayAgo);

    // 过去 24h 按用户聚合
    const topUsers = db
      .prepare<[string], { user_id: number; username: string; downloads: number }>(
        `SELECT l.user_id, u.username, COUNT(*) as downloads
         FROM download_log l
         JOIN user u ON u.id = l.user_id
         WHERE l.created_at >= ?
         GROUP BY l.user_id
         ORDER BY downloads DESC
         LIMIT 10`
      )
      .all(oneDayAgo);

    return ok({
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      env: process.env.NODE_ENV ?? 'development',
      files: {
        total: filesTotal,
        latest: filesLatest,
        history: filesHistory,
        hidden: filesHidden,
        storageBytes,
        storageMB: Number((storageBytes / 1024 / 1024).toFixed(2)),
        storageGB: Number((storageBytes / 1024 / 1024 / 1024).toFixed(3)),
      },
      categories: { total: categoriesTotal, enabled: categoriesEnabled },
      users: { total: usersTotal, admins: usersAdmins, active: usersActive },
      downloads: {
        total: downloadsTotal,
        last24h: downloads24h,
        last1h: downloads1h,
        topFiles: topFiles.map((r) => ({
          fileId: r.file_id,
          filename: r.filename,
          category: r.category_name,
          downloads: r.downloads,
          sizeMB: Number((r.bytes / 1024 / 1024).toFixed(2)),
        })),
        topUsers: topUsers.map((r) => ({ userId: r.user_id, username: r.username, downloads: r.downloads })),
      },
    });
  });
}
