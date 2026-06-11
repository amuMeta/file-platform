import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { HttpError } from './utils/errors.js';

export interface ApiResponse<T = unknown> {
  code: number;
  data?: T;
  message?: string;
}

export function ok<T>(data: T): ApiResponse<T> {
  return { code: 0, data };
}

export function fail(code: number, message: string): ApiResponse<never> {
  return { code, message };
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err, _req: FastifyRequest, reply: FastifyReply) => {
    if (err instanceof HttpError) {
      reply.status(err.statusCode).send(fail(err.statusCode, err.message));
      return;
    }
    if (err instanceof ZodError) {
      const message = err.issues.map(i => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
      reply.status(400).send(fail(400, message || '参数错误'));
      return;
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) {
      app.log.error({ err }, 'unhandled error');
      reply.status(status).send(fail(status, '服务器错误'));
    } else {
      reply.status(status).send(fail(status, err.message || '请求失败'));
    }
  });
}
