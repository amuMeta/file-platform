import { FastifyInstance } from 'fastify';
import fastifyMultipart from '@fastify/multipart';
import { config } from '../config.js';

export async function registerMultipart(app: FastifyInstance): Promise<void> {
  await app.register(fastifyMultipart, {
    limits: {
      fileSize: config.maxUploadMB * 1024 * 1024,
      files: 1,
    },
  });
}
