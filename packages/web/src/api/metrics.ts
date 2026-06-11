import { get } from './http';

export interface TopFile {
  fileId: number;
  filename: string;
  category: string;
  downloads: number;
  sizeMB: number;
}
export interface TopUser {
  userId: number;
  username: string;
  downloads: number;
}
export interface Metrics {
  timestamp: string;
  uptime: number;
  env: string;
  files: { total: number; latest: number; history: number; hidden: number; storageBytes: number; storageMB: number; storageGB: number };
  categories: { total: number; enabled: number };
  users: { total: number; admins: number; active: number };
  downloads: { total: number; last24h: number; last1h: number; topFiles: TopFile[]; topUsers: TopUser[] };
}

export async function fetchMetrics(): Promise<Metrics> {
  return get('/admin/metrics');
}
