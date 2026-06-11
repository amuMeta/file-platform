import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getDb } from '../../db.js';
import { ok } from '../../response.js';
import { BadRequest, NotFound, Conflict } from '../../utils/errors.js';
import { hashPassword } from '../../utils/hash.js';
import { getRealIp } from '../../observability.js';
import { recordAudit } from '../audit/service.js';

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled';
  created_at: string;
}

const CreateSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(6).max(128),
  role: z.enum(['admin', 'user']).default('user'),
});

const UpdateSchema = z.object({
  password: z.string().min(6).max(128).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  role: z.enum(['admin', 'user']).optional(),
});

function toPublic(u: UserRow) {
  return { id: u.id, username: u.username, role: u.role, status: u.status, created_at: u.created_at };
}

function actorOf(req: FastifyRequest): { id: number; name: string } {
  return {
    id: req.session.get('userId')!,
    name: req.session.get('username') ?? 'unknown',
  };
}

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/users', { preHandler: [app.requireAuth, app.requireAdmin] }, async () => {
    const db = getDb();
    const rows = db
      .prepare<[], UserRow>(
        'SELECT id, username, password_hash, role, status, created_at FROM user ORDER BY id ASC'
      )
      .all();
    return ok({ items: rows.map(toPublic) });
  });

  app.post('/admin/users', { preHandler: [app.requireAuth, app.requireAdmin] }, async (req) => {
    const body = CreateSchema.parse(req.body);
    const db = getDb();
    const dup = db.prepare<[string], { id: number }>('SELECT id FROM user WHERE username = ?').get(body.username);
    if (dup) throw Conflict('用户名已存在');
    const hash = await hashPassword(body.password);
    const info = db
      .prepare('INSERT INTO user (username, password_hash, role) VALUES (?, ?, ?)')
      .run(body.username, hash, body.role);
    const row = db
      .prepare<[number | bigint], UserRow>(
        'SELECT id, username, password_hash, role, status, created_at FROM user WHERE id = ?'
      )
      .get(info.lastInsertRowid);
    const newId = Number(info.lastInsertRowid);
    // 审计:不记密码(敏感),只记 username + role
    recordAudit({
      actor: actorOf(req),
      action: 'user.create',
      resource: 'user',
      resourceId: newId,
      ip: getRealIp(req),
      metadata: { username: body.username, role: body.role },
    });
    return ok({ user: toPublic(row!) });
  });

  app.put<{ Params: { id: string } }>('/admin/users/:id', { preHandler: [app.requireAuth, app.requireAdmin] }, async (req) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const body = UpdateSchema.parse(req.body);
    if (Object.keys(body).length === 0) throw BadRequest('至少提供一个字段');
    const db = getDb();
    const row = db
      .prepare<[number], { id: number; username: string; role: 'admin' | 'user'; status: 'active' | 'disabled' }>(
        'SELECT id, username, role, status FROM user WHERE id = ?'
      )
      .get(params.id);
    if (!row) throw NotFound('用户不存在');
    const fields: string[] = [];
    const values: (string | number)[] = [];
    if (body.password !== undefined) {
      const hash = await hashPassword(body.password);
      fields.push('password_hash = ?');
      values.push(hash);
    }
    if (body.status !== undefined) { fields.push('status = ?'); values.push(body.status); }
    if (body.role !== undefined) { fields.push('role = ?'); values.push(body.role); }
    values.push(params.id);
    db.prepare(`UPDATE user SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    // 审计:记改了什么;password 只记"改了"不记新值
    recordAudit({
      actor: actorOf(req),
      action: 'user.update',
      resource: 'user',
      resourceId: params.id,
      ip: getRealIp(req),
      metadata: {
        target: row.username,
        changes: {
          password: body.password !== undefined,
          status: body.status !== undefined ? { from: row.status, to: body.status } : undefined,
          role: body.role !== undefined ? { from: row.role, to: body.role } : undefined,
        },
      },
    });
    return ok({ id: params.id });
  });

  app.delete<{ Params: { id: string } }>('/admin/users/:id', { preHandler: [app.requireAuth, app.requireAdmin] }, async (req) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(req.params);
    const db = getDb();
    const target = db
      .prepare<[number], { id: number; username: string; role: 'admin' | 'user' }>(
        'SELECT id, username, role FROM user WHERE id = ?'
      )
      .get(params.id);
    if (!target) throw NotFound('用户不存在');

    const meId = req.session.get('userId')!;
    if (target.id === meId) throw BadRequest('不能删除自己的账号');

    if (target.role === 'admin') {
      const otherAdmins = db
        .prepare<[number], { c: number }>(
          "SELECT COUNT(*) AS c FROM user WHERE role = 'admin' AND status = 'active' AND id != ?"
        )
        .get(params.id);
      if (!otherAdmins || otherAdmins.c === 0) throw BadRequest('不能删除最后一个管理员');
    }

    db.transaction(() => {
      db.prepare('DELETE FROM user WHERE id = ?').run(params.id);
    })();

    recordAudit({
      actor: actorOf(req),
      action: 'user.delete',
      resource: 'user',
      resourceId: params.id,
      ip: getRealIp(req),
      metadata: { username: target.username, role: target.role },
    });

    return ok({ id: params.id });
  });
}
