import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok } from '../../response.js';
import { queryAuditLogs, getAuditLogRow } from './service.js';

const QuerySchema = z.object({
  actorId: z.coerce.number().int().positive().optional(),
  action: z.string().max(64).optional(),
  resource: z.enum(['category', 'file', 'user', 'session']).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
});

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/audit-logs', { preHandler: [app.requireAuth, app.requireAdmin] }, async (req) => {
    const q = QuerySchema.parse(req.query);
    const { items, total } = queryAuditLogs({
      actorId: q.actorId,
      action: q.action,
      resource: q.resource,
      page: q.page,
      pageSize: q.pageSize,
    });
    return ok({
      items: items.map((r) => ({
        id: r.id,
        actor_id: r.actor_id,
        actor_name: r.actor_name,
        action: r.action,
        resource: r.resource,
        resource_id: r.resource_id,
        ip: r.ip,
        metadata: r.metadata ? JSON.parse(r.metadata) : null,
        status: r.status,
        created_at: r.created_at,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    });
  });

  app.get<{ Params: { id: string } }>(
    '/admin/audit-logs/:id',
    { preHandler: [app.requireAuth, app.requireAdmin] },
    async (req) => {
      const params = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
      const row = getAuditLogRow(params.id);
      if (!row) return ok({ log: null });
      return ok({
        log: {
          ...row,
          metadata: row.metadata ? JSON.parse(row.metadata) : null,
        },
      });
    }
  );
}
