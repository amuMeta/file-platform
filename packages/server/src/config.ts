import { config as loadEnv } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

function findWorkspaceRoot(start: string): string {
  let cur = start;
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(cur, 'pnpm-workspace.yaml'))) return cur;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  // fallback: package.json 包含 "workspace:*" 提示
  let c = start;
  for (let i = 0; i < 6; i++) {
    const pkg = resolve(c, 'package.json');
    if (existsSync(pkg)) {
      try {
        const content = readFileSync(pkg, 'utf8');
        if (content.includes('"workspaces"') || content.includes('"workspace:')) return c;
      } catch {
        /* ignore */
      }
    }
    const parent = dirname(c);
    if (parent === c) break;
    c = parent;
  }
  return process.cwd();
}

const WORKSPACE_ROOT = findWorkspaceRoot(process.cwd());
const PROJECT_ROOT = WORKSPACE_ROOT;

loadEnv({ path: resolve(PROJECT_ROOT, '.env') });
loadEnv({ path: resolve(PROJECT_ROOT, '.env.local'), override: true });

const isProd = process.env.NODE_ENV === 'production';

function envStr(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v !== undefined && v !== '') return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required env var: ${name}`);
}

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`Env ${name} must be integer, got: ${v}`);
  return n;
}

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v === 'true' || v === '1';
}

function envList(name: string, fallback: string): string[] {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback.split(',').map(s => s.trim()).filter(Boolean);
  return v.split(',').map(s => s.trim()).filter(Boolean);
}

export const config = {
  env: isProd ? 'production' : 'development',
  port: envInt('PORT', 3000),
  dbPath: resolve(PROJECT_ROOT, envStr('DB_PATH', './data/app.db')),
  uploadDir: resolve(PROJECT_ROOT, envStr('UPLOAD_DIR', './data/uploads')),
  maxUploadMB: envInt('MAX_UPLOAD_MB', 500),
  allowedExt: envList('ALLOWED_EXT', 'rar,zip,7z,exe,bin,img,apk'),
  sessionSecret: envStr('SESSION_SECRET', 'dev-only-please-change-me-to-32-plus-chars-string'),
  cookieSecure: envBool('COOKIE_SECURE', false),
  useXAccel: envBool('USE_XACCEL', false),
  xaccelPrefix: envStr('XACCEL_PREFIX', '/protected'),
  seedAdminUser: envStr('SEED_ADMIN_USER', 'admin'),
  seedAdminPass: envStr('SEED_ADMIN_PASS', 'change-me'),
} as const;

export type AppConfig = typeof config;
