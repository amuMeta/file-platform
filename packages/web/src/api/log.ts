import { get } from './http';

export interface LogItem {
  id: number;
  user_id: number;
  file_id: number;
  ip: string | null;
  created_at: string;
  username: string;
  filename: string;
}

export interface LogListResp {
  items: LogItem[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listLogs(
  params: { fileId?: number; userId?: number; page?: number; pageSize?: number } = {}
): Promise<LogListResp> {
  const search = new URLSearchParams();
  if (params.fileId) search.append('fileId', String(params.fileId));
  if (params.userId) search.append('userId', String(params.userId));
  search.append('page', String(params.page ?? 1));
  search.append('pageSize', String(params.pageSize ?? 20));
  return get(`/admin/logs?${search.toString()}`);
}
