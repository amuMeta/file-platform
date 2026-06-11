import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getDb } from '../../db.js';
import { verifyPassword } from '../../utils/hash.js';
import { Unauthorized, NotFound } from '../../utils/errors.js';
import { ok } from '../../response.js';
import { getRealIp } from '../../observability.js';
import { recordAudit } from '../audit/service.js';

const LoginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
});

interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled';
}

function getClientIp(req: FastifyRequest): string {
  return getRealIp(req);
}

function currentActor(req: FastifyRequest): { id: number; name: string } | null {
  if (!req.session) return null;
  const id = req.session.get('userId');
  if (id === undefined) return null;
  return { id, name: req.session.get('username') ?? 'unknown' };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/login', async (req, reply) => {
    const body = LoginSchema.parse(req.body);
    const ip = getClientIp(req);
    const db = getDb();
    const row = db
      .prepare<[string], UserRow>('SELECT id, username, password_hash, role, status FROM user WHERE username = ?')
      .get(body.username);
    if (!row) {
      req.log.warn({ event: 'auth.login.failed', reason: 'no_user', username: body.username, ip }, 'login: no such user');
      recordAudit({
        actor: { id: null, name: body.username },
        action: 'auth.login.failed',
        resource: 'session',
        ip,
        metadata: { reason: 'no_user', attemptedUsername: body.username },
        status: 'failed',
      });
      throw Unauthorized('用户名或密码错误');
    }
    if (row.status !== 'active') {
      req.log.warn({ event: 'auth.login.failed', reason: 'disabled', userId: row.id, username: body.username, ip }, 'login: account disabled');
      recordAudit({
        actor: { id: row.id, name: row.username },
        action: 'auth.login.failed',
        resource: 'session',
        resourceId: row.id,
        ip,
        metadata: { reason: 'disabled' },
        status: 'failed',
      });
      throw Unauthorized('账号已停用');
    }
    const okPwd = await verifyPassword(body.password, row.password_hash);
    if (!okPwd) {
      req.log.warn({ event: 'auth.login.failed', reason: 'bad_password', userId: row.id, username: body.username, ip }, 'login: bad password');
      recordAudit({
        actor: { id: row.id, name: row.username },
        action: 'auth.login.failed',
        resource: 'session',
        resourceId: row.id,
        ip,
        metadata: { reason: 'bad_password' },
        status: 'failed',
      });
      throw Unauthorized('用户名或密码错误');
    }
    req.session.set('userId', row.id);
    req.session.set('username', row.username);
    req.session.set('role', row.role);
    req.log.info({ event: 'auth.login.success', userId: row.id, username: row.username, role: row.role, ip }, `login: ${row.username} (${row.role})`);
    recordAudit({
      actor: { id: row.id, name: row.username },
      action: 'auth.login.success',
      resource: 'session',
      resourceId: row.id,
      ip,
      metadata: { role: row.role },
    });
    void reply;
    return ok({ user: { id: row.id, username: row.username, role: row.role } });
  });

  app.post('/auth/logout', async (req, reply) => {
    const actor = currentActor(req);
    const ip = getClientIp(req);
    if (actor) {
      req.log.info({ event: 'auth.logout', userId: actor.id, username: actor.name, ip }, `logout: ${actor.name}`);
      recordAudit({ actor, action: 'auth.logout', resource: 'session', resourceId: actor.id, ip });
    }
    req.session.delete();
    return ok({});
  });

  app.get('/auth/me', async (req) => {
    const id = req.session.get('userId');
    if (id === undefined) throw Unauthorized('未登录');
    const db = getDb();
    const row = db
      .prepare<[number], { id: number; username: string; role: 'admin' | 'user' }>(
        'SELECT id, username, role FROM user WHERE id = ?'
      )
      .get(id);
    if (!row) throw Unauthorized('未登录');
    return ok({ user: row });
  });

  void NotFound;
}
