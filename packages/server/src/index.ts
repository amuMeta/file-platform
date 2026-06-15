import { buildApp } from './app.js';
import { config } from './config.js';
import { closeDb } from './db.js';

async function main(): Promise<void> {
  const app = await buildApp();
  try {
    const address = await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(`server listening at ${address}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = async (sig: string): Promise<void> => {
    app.log.info(`[${sig}] received, draining...`);
    try {
      await app.close();
      closeDb();
    } catch (e) {
      app.log.error(e);
      process.exit(1);
    }
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main();
