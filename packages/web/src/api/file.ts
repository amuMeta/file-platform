import { get, post, put, del } from './http';

// 与后端 config.ts 的 ALLOWED_EXT / MAX_UPLOAD_MB 默认值保持一致
// 后端是权威,前端用做上传前的预校验,避免明显错误的请求往返
export const ALLOWED_EXTS = ['rar', 'zip', '7z', 'exe', 'bin', 'img', 'apk'] as const;
export const MAX_UPLOAD_MB = 500;
// 上传超过此大小(MB)时弹"是否继续"确认
export const CONFIRM_UPLOAD_MB = 200;
// XHR 默认超时(毫秒):500MB @ 700KB/s ≈ 12 分钟,取 30min 留余量
export const DEFAULT_UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;

export function getFileExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}

export interface FileItem {
  id: number;
  category_id: number;
  category_name?: string;
  filename: string;
  version: string | null;
  remark: string | null;
  size: number;
  status: 'latest' | 'history' | 'hidden';
  group_key: string | null;
  created_at: string;
}

export interface FileListResp {
  items: FileItem[];
}

export interface FileDetailResp {
  file: FileItem;
  history: FileItem[];
}

export async function listClientCategories(categoryId: number, includeHistory = false): Promise<FileListResp> {
  return get(`/categories/${categoryId}/files${includeHistory ? '?includeHistory=1' : ''}`);
}

export async function getFileDetail(id: number): Promise<FileDetailResp> {
  return get(`/files/${id}`);
}

export async function searchFiles(q: string): Promise<FileListResp> {
  return get(`/search?q=${encodeURIComponent(q)}`);
}

export async function listAdminFiles(q?: string): Promise<FileListResp> {
  return get(`/admin/files${q ? `?q=${encodeURIComponent(q)}` : ''}`);
}

export interface UploadResp {
  files: FileItem[];
  demoted: number;
}

export interface UploadProgress {
  loaded: number;
  total: number;
}

export class UploadCancelledError extends Error {
  constructor() {
    super('上传已取消');
    this.name = 'UploadCancelledError';
  }
}

export interface UploadOptions {
  /** 进度回调(每次 onprogress 触发一次) */
  onProgress?: (p: UploadProgress) => void;
  /** 自定义超时,默认 DEFAULT_UPLOAD_TIMEOUT_MS */
  timeoutMs?: number;
  /** AbortSignal:触发后中断上传,Promise reject with UploadCancelledError */
  signal?: AbortSignal;
}

export async function uploadFiles(
  categoryId: number,
  files: File[],
  version?: string,
  remark?: string,
  opts: UploadOptions = {}
): Promise<UploadResp> {
  const form = new FormData();
  form.append('category_id', String(categoryId));
  if (version) form.append('version', version);
  if (remark) form.append('remark', remark);
  for (const f of files) form.append('file', f);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/admin/files');
    xhr.withCredentials = true;
    xhr.timeout = opts.timeoutMs ?? DEFAULT_UPLOAD_TIMEOUT_MS;

    let aborted = false;
    let abortHandler: (() => void) | null = null;
    if (opts.signal) {
      if (opts.signal.aborted) {
        reject(new UploadCancelledError());
        return;
      }
      abortHandler = () => {
        aborted = true;
        xhr.abort();
      };
      opts.signal.addEventListener('abort', abortHandler);
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && opts.onProgress) {
        opts.onProgress({ loaded: e.loaded, total: e.total });
      }
    };
    xhr.onload = () => {
      cleanup();
      try {
        const body = JSON.parse(xhr.responseText);
        if (body.code === 0) {
          resolve(body.data as UploadResp);
        } else {
          reject(new Error(body.message || `上传失败 (HTTP ${xhr.status})`));
        }
      } catch {
        reject(new Error(`响应解析失败:${xhr.status} ${xhr.responseText.slice(0, 200)}`));
      }
    };
    xhr.onerror = () => {
      cleanup();
      if (aborted) reject(new UploadCancelledError());
      else reject(new Error('网络错误,请检查连接'));
    };
    xhr.ontimeout = () => {
      cleanup();
      const sec = ((opts.timeoutMs ?? DEFAULT_UPLOAD_TIMEOUT_MS) / 1000).toFixed(0);
      reject(new Error(`上传超时(${sec}s),文件过大或网络过慢`));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new UploadCancelledError());
    };

    function cleanup() {
      if (opts.signal && abortHandler) {
        opts.signal.removeEventListener('abort', abortHandler);
      }
    }

    xhr.send(form);
  });
}

/**
 * 兼容老调用:单文件包装为批量上传。
 * 新代码请直接用 uploadFiles(categoryId, [file], ...)。
 */
export async function uploadFile(
  categoryId: number,
  file: File,
  version?: string,
  remark?: string,
  opts: UploadOptions = {}
): Promise<UploadResp> {
  return uploadFiles(categoryId, [file], version, remark, opts);
}

export async function updateFile(
  id: number,
  payload: { version?: string | null; remark?: string | null; status?: 'latest' | 'history' | 'hidden' }
): Promise<{ id: number }> {
  return put(`/admin/files/${id}`, payload);
}

export async function deleteFile(id: number): Promise<{ id: number }> {
  return del(`/admin/files/${id}`);
}

export function downloadUrl(id: number): string {
  return `/api/files/${id}/download`;
}

export function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
