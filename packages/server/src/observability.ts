import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';

/**
 * 统一日志字段约定(便于 ELK / Loki / 任何 JSON 收集器):
 *   requestId   - 每请求唯一,响应头 X-Request-Id 也带
 *   userId      - 已登录用户的 id(否则 null)
 *   userRole    - admin / user(已登录)
 *   ip          - 客户端真实 IP(已处理 X-Forwarded-For)
 *   method / url / status / durationMs - 访问日志
 *   event       - 业务事件名: 'upload.success' / 'upload.failed' / 'download.success' / 'auth.login' ...
 *   bytes       - 上传/下载字节数
 *   speedMbps   - 平均 MB/s
 *   fileId / filename / categoryId - 业务上下文
 */

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
    startTime: number;
  }
}

export function getRealIp(req: FastifyRequest): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    const first = xff.split(',')[0];
    if (first) return first.trim();
  }
  if (Array.isArray(xff) && xff.length > 0) {
    const first = xff[0];
    if (first) return first.split(',')[0]?.trim() ?? req.ip;
  }
  return req.ip;
}

export function registerAccessLog(app: FastifyInstance): void {
  // 生成 requestId + 记录开始时间
  app.addHook('onRequest', async (req, reply) => {
    req.requestId = (req.headers['x-request-id'] as string) || randomUUID();
    req.startTime = Date.now();
    reply.header('X-Request-Id', req.requestId);
  });

  // 每次请求完成:一条结构化访问日志
  app.addHook('onResponse', async (req, reply) => {
    const durationMs = Date.now() - req.startTime;
    const userId = req.session?.get('userId');
    const userRole = req.session?.get('role');
    app.log.info(
      {
        event: 'http.request',
        requestId: req.requestId,
        method: req.method,
        url: req.url,
        status: reply.statusCode,
        durationMs,
        userId: userId ?? null,
        userRole: userRole ?? null,
        ip: getRealIp(req),
        // 响应字节数(pino 已有 reply.elapsedTime 在 onResponse 时可能未填,改用 header)
        bytes: Number(reply.getHeader('content-length') ?? 0) || undefined,
      },
      `${req.method} ${req.url} ${reply.statusCode} ${durationMs}ms`
    );
  });

  // 错误时多打一条 error 级日志
  app.addHook('onError', async (req, _reply, err) => {
    const durationMs = Date.now() - req.startTime;
    const userId = req.session?.get('userId');
    const userRole = req.session?.get('role');
    app.log.error(
      {
        event: 'http.error',
        requestId: req.requestId,
        method: req.method,
        url: req.url,
        durationMs,
        userId: userId ?? null,
        userRole: userRole ?? null,
        ip: getRealIp(req),
        err: { message: err.message, code: (err as { code?: string }).code, status: (err as { statusCode?: number }).statusCode },
      },
      err.message
    );
  });
}
