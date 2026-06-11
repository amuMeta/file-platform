import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getDb } from '../../db.js';
import { ok } from '../../response.js';
import { BadRequest, NotFound, Conflict } from '../../utils/errors.js';
import { getRealIp } from '../../observability.js';
import { recordAudit } from '../audit/service.js';

interface CategoryRow {
  id: number;
  name: string;
  sort_order: number;
  status: 'enabled' | 'disabled';
  created_at: string;
  file_count?: number;
}

const CreateSchema = z.object({
  name: z.string().min(1).max(64),
  sort_order: z.number().int().optional(),
});

const UpdateSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  status: z.enum(['enabled', 'disabled']).optional(),
});

const SortSchema = z.object({
  items: z.array(
    z.object({
      id: z.number().int().positive(),
      sort_order: z.number().int(),
    })
  ).min(1),
});

function nextSortOrder(): number {
  const db = getDb();
  const row = db.prepare<[], { s: number | null }>('SELECT MAX(sort_order) as s FROM category').get();
  return (row?.s ?? 0) + 10;
}

function actorOf(req: FastifyRequest): { id: number; name: string } {
  return {
    id: req.session.get('userId')!,
    name: req.session.get('username') ?? 'unknown',
  };
}

export async function categoryRoutes(app: FastifyInstance): Promise<void> {
  // 客户端:仅 enabled,按 sort_order 升序
  app.get('/categories', async () => {
    const db = getDb();
    const rows = db
      .prepare<[string], CategoryRow>(
        'SELECT id, name, sort_order, status, created_at FROM category WHERE status = ? ORDER BY sort_order ASC, id ASC'
      )
      .all('enabled');
    return ok({ items: rows });
  });

  // 管理端:全部
  app.get('/admin/categories', { preHandler: [app.requireAuth, app.requireAdmin] }, async () => {
    const db = getDb();
    const rows = db
      .prepare<[], CategoryRow>(
        `SELECT c.id, c.name, c.sort_order, c.status, c.created_at,
                (SELECT COUNT(*) FROM file f WHERE f.category_id = c.id) as file_count
         FROM category c ORDER BY c.sort_order ASC, c.id ASC`
      )
      .all();
    return ok({ items: rows });
  });

  // 新建
  app.post('/admin/categories', { preHandler: [app.requireAuth, app.requireAdmin] }, async (req) => {
    const body = CreateSchema.parse(req.body);
    const db = getDb();
    const dup = db.prepare<[string], { id: number }>('SELECT id FROM category WHERE name = ?').get(body.name);
    if (dup) throw Conflict('分类名称已存在');
    const sort = body.sort_order ?? nextSortOrder();
    const info = db
      .prepare('INSERT INTO category (name, sort_order) VALUES (?, ?)')
      .run(body.name, sort);
    const row = db
      .prepare<[number | bigint], CategoryRow>(
        'SELECT id, name, sort_order, status, created_at FROM category WHERE id = ?'
      )
      .get(info.lastInsertRowid);
    const newId = Number(info.lastInsertRowid);
    recordAudit({
      actor: actorOf(req),
      action: 'category.create',
      resource: 'category',
      resourceId: newId,
      ip: getRealIp(req),
      metadata: { name: body.name, sort_order: sort },
    });
    return ok({ category: row });
  });

  // 更新
  app.put('/admin/categories/:id', { preHandler: [app.requireAuth, app.requireAdmin] }, async (req) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const body = UpdateSchema.parse(req.body);
    if (Object.keys(body).length === 0) throw BadRequest('至少提供一个字段');
    const db = getDb();
    const row = db.prepare<[number], CategoryRow>('SELECT id, name, sort_order, status, created_at FROM category WHERE id = ?').get(params.id);
    if (!row) throw NotFound('分类不存在');
    if (body.name && body.name !== row.name) {
      const dup = db.prepare<[string, number], { id: number }>('SELECT id FROM category WHERE name = ? AND id <> ?').get(body.name, params.id);
      if (dup) throw Conflict('分类名称已存在');
    }
    const nextName = body.name ?? row.name;
    const nextStatus = body.status ?? row.status;
    db.prepare('UPDATE category SET name = ?, status = ? WHERE id = ?').run(nextName, nextStatus, params.id);
    const updated = db
      .prepare<[number], CategoryRow>('SELECT id, name, sort_order, status, created_at FROM category WHERE id = ?')
      .get(params.id);
    recordAudit({
      actor: actorOf(req),
      action: 'category.update',
      resource: 'category',
      resourceId: params.id,
      ip: getRealIp(req),
      metadata: {
        before: { name: row.name, status: row.status },
        after: { name: nextName, status: nextStatus },
      },
    });
    return ok({ category: updated });
  });

  // 删除
  app.delete('/admin/categories/:id', { preHandler: [app.requireAuth, app.requireAdmin] }, async (req) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const db = getDb();
    const row = db.prepare<[number], { id: number; name: string }>('SELECT id, name FROM category WHERE id = ?').get(params.id);
    if (!row) throw NotFound('分类不存在');
    const fileCount = db
      .prepare<[number], { c: number }>('SELECT COUNT(*) as c FROM file WHERE category_id = ?')
      .get(params.id);
    if (fileCount && fileCount.c > 0) {
      // 删除被拒绝也记审计(失败操作)
      recordAudit({
        actor: actorOf(req),
        action: 'category.delete',
        resource: 'category',
        resourceId: params.id,
        ip: getRealIp(req),
        status: 'failed',
        metadata: { name: row.name, reason: `has_${fileCount.c}_files` },
      });
      throw Conflict(`该分类下仍有 ${fileCount.c} 个文件,无法删除`);
    }
    db.prepare('DELETE FROM category WHERE id = ?').run(params.id);
    recordAudit({
      actor: actorOf(req),
      action: 'category.delete',
      resource: 'category',
      resourceId: params.id,
      ip: getRealIp(req),
      metadata: { name: row.name },
    });
    return ok({ id: params.id });
  });

  // 批量排序
  app.put('/admin/categories/sort', { preHandler: [app.requireAuth, app.requireAdmin] }, async (req) => {
    const body = SortSchema.parse(req.body);
    const db = getDb();
    const stmt = db.prepare('UPDATE category SET sort_order = ? WHERE id = ?');
    const tx = db.transaction((items: { id: number; sort_order: number }[]) => {
      for (const it of items) stmt.run(it.sort_order, it.id);
    });
    tx(body.items);
    // metadata 只保留前 50 项,防止 JSON 巨大
    recordAudit({
      actor: actorOf(req),
      action: 'category.sort',
      resource: 'category',
      ip: getRealIp(req),
      metadata: { count: body.items.length, items: body.items.slice(0, 50) },
    });
    return ok({ updated: body.items.length });
  });
}
