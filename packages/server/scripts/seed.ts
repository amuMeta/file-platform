import { getDb } from '../src/db.js';
import { hashPassword } from '../src/utils/hash.js';
import { config } from '../src/config.js';

async function main(): Promise<void> {
  const db = getDb();
  const existing = db
    .prepare<[string], { id: number }>('SELECT id FROM user WHERE username = ?')
    .get(config.seedAdminUser);
  if (existing) {
    console.log(`[seed] admin user '${config.seedAdminUser}' already exists (id=${existing.id})`);
    return;
  }
  const hash = await hashPassword(config.seedAdminPass);
  const info = db
    .prepare('INSERT INTO user (username, password_hash, role) VALUES (?, ?, ?)')
    .run(config.seedAdminUser, hash, 'admin');
  console.log(`[seed] created admin user '${config.seedAdminUser}' (id=${info.lastInsertRowid})`);
  console.log('[seed] password from env SEED_ADMIN_PASS. Remember to change it.');
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
