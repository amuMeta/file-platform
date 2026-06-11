import Fastify, { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { getDb } from './db.js';
import { authPlugin } from './plugins/auth.js';
import { registerMultipart } from './plugins/multipart.js';
import { registerErrorHandler, ok } from './response.js';
import { registerAccessLog } from './observability.js';
import { authRoutes } from './modules/auth/routes.js';
import { categoryRoutes } from './modules/category/routes.js';
import { fileRoutes } from './modules/file/routes.js';
import { logRoutes } from './modules/log/routes.js';
import { userRoutes } from './modules/user/routes.js';
import { metricsRoutes } from './modules/metrics/routes.js';
import { auditRoutes } from './modules/audit/routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.env === 'production' ? 'info' : 'debug',
    },
    bodyLimit: config.maxUploadMB * 1024 * 1024,
  });

  registerErrorHandler(app);
  registerAccessLog(app);

  app.get('/healthz', async () => ok({ status: 'ok', env: config.env }));

  await registerMultipart(app);
  // sendFile 仅在 dev(X-Accel 关闭)使用
  await app.register(fastifyStatic, {
    root: config.uploadDir,
    serve: false,
    decorateReply: true,
  });

  await app.register(authPlugin);
  await app.register(authRoutes);
  await app.register(categoryRoutes);
  await app.register(fileRoutes);
  await app.register(logRoutes);
  await app.register(userRoutes);
  await app.register(metricsRoutes);
  await app.register(auditRoutes);

  getDb();

  return app;
}
