import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from 'fastify';
import fp from 'fastify-plugin';
import fastifySecureSession from '@fastify/secure-session';
import { config } from '../config.js';

/**
 * 加密 Cookie 会话(@fastify/secure-session)
 * - session 数据加密后存 cookie,server 无状态
 * - 重启 / 多实例都不丢(只要 SESSION_SECRET 一致)
 * - cookie 体积:我们只存 userId/username/role,约 200-300 字节
 *
 * API 区别(对比旧 @fastify/session):
 *   旧: req.session.data = { userId, ... }  |  req.session.data.userId  |  req.session.destroy(cb)
 *   新: req.session.set('userId', x)        |  req.session.get('userId')  |  req.session.delete()
 */

export interface SessionData {
  userId?: number;
  username?: string;
  role?: 'admin' | 'user';
}

// 扩展 @fastify/secure-session 的 SessionData,让 req.session.get/set 有类型提示
declare module '@fastify/secure-session' {
  interface SessionData {
    userId?: number;
    username?: string;
    role?: 'admin' | 'user';
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: preHandlerHookHandler;
    requireAdmin: preHandlerHookHandler;
  }
}

function getSessionUser(req: FastifyRequest): SessionData | null {
  if (!req.session) return null;
  const userId = req.session.get('userId');
  if (userId === undefined) return null;
  return {
    userId,
    username: req.session.get('username'),
    role: req.session.get('role'),
  };
}

async function authPluginImpl(app: FastifyInstance): Promise<void> {
  // SESSION_SECRET 至少 32 字符(secure-session 要求)。当前 .env 已 38 字符。
  const key = config.sessionSecret.padEnd(32, '0').slice(0, 32);
  await app.register(fastifySecureSession, {
    key: Buffer.from(key, 'utf8'),
    cookieName: 'sid',
    cookie: {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 天
      path: '/',
    },
  });

  app.decorate('requireAuth', async (req, reply) => {
    const u = getSessionUser(req);
    if (!u) {
      reply.status(401).send({ code: 401, message: '未登录' });
    }
  });

  app.decorate('requireAdmin', async (req, reply) => {
    const u = getSessionUser(req);
    if (!u) {
      reply.status(401).send({ code: 401, message: '未登录' });
      return;
    }
    if (u.role !== 'admin') {
      reply.status(403).send({ code: 403, message: '无权访问' });
    }
  });
}

export const authPlugin = fp(authPluginImpl, { name: 'auth' });
