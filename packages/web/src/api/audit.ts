import { get } from './http';

export interface AuditLog {
  id: number;
  actor_id: number | null;
  actor_name: string;
  action: string;
  resource: string;
  resource_id: number | null;
  ip: string | null;
  metadata: Record<string, unknown> | null;
  status: string;
  created_at: string;
}

export interface AuditListResp {
  items: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listAuditLogs(params: {
  actorId?: number;
  action?: string;
  resource?: 'category' | 'file' | 'user' | 'session';
  page?: number;
  pageSize?: number;
} = {}): Promise<AuditListResp> {
  const search = new URLSearchParams();
  if (params.actorId) search.append('actorId', String(params.actorId));
  if (params.action) search.append('action', params.action);
  if (params.resource) search.append('resource', params.resource);
  search.append('page', String(params.page ?? 1));
  search.append('pageSize', String(params.pageSize ?? 20));
  return get(`/admin/audit-logs?${search.toString()}`);
}

export const AUDIT_ACTIONS = [
  'auth.login.success',
  'auth.login.failed',
  'auth.logout',
  'category.create',
  'category.update',
  'category.delete',
  'category.sort',
  'file.upload',
  'file.update',
  'file.delete',
  'user.create',
  'user.update',
] as const;

export const AUDIT_RESOURCES = ['category', 'file', 'user', 'session'] as const;
