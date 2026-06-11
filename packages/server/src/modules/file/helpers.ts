import type { FastifyRequest } from 'fastify';
import { statfsSync } from 'node:fs';

/** 上传目录可用空间(MB)。失败时返回 Infinity(放行,避免误伤)。 */
export function freeSpaceMB(dir: string): number {
  try {
    return statfsSync(dir).bavail / 1024 / 1024;
  } catch {
    return Infinity;
  }
}

export function getClientIp(req: FastifyRequest): string {
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
