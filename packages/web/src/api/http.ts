import axios, { AxiosError, type AxiosRequestConfig } from 'axios';

export interface ApiEnvelope<T = unknown> {
  code: number;
  data?: T;
  message?: string;
}

const baseURL = import.meta.env.VITE_API_BASE || '/api';

export const http = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 30_000,
});

type ToastKind = 'error' | 'success';
type ToastHandler = (kind: ToastKind, message: string) => void;

let onUnauthorized: (() => void) | null = null;
let onToast: ToastHandler | null = null;

function statusTextOrDefault(status: number | undefined, err: AxiosError): string {
  if (status === 502 || status === 504) return '后端服务不可达,请检查 server 是否在运行';
  if (status === 404) return '接口不存在 (404)';
  if (status === 413) return '请求体过大';
  if (status === 408) return '请求超时';
  if (status === 0 || status === undefined) return '网络异常,请检查连接';
  if (status >= 500) return `服务异常 (${status}),请稍后重试`;
  if (status >= 400) return `请求被拒绝 (${status})`;
  return err.message || '请求失败';
}

export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

// 关键修复:不要在 http.ts 顶层 import 'element-plus' 的 ElMessage。
// (Vite prod 会把 element-plus 的 named export 拆到主 bundle,
//  而主 bundle 正在 `await setupRouterGuards()`,形成循环依赖死锁,白屏)
// 改成注册式:由 main.ts(ClientLayout 等)在 Element Plus 就绪后回调进来
export function setToastHandler(fn: ToastHandler): void {
  onToast = fn;
}

function toast(kind: ToastKind, message: string): void {
  if (onToast) onToast(kind, message);
  // 兜底:任何情况下 console 都有,便于排查
  if (kind === 'error') console.error('[toast]', message);
  else console.log('[toast]', message);
}

http.interceptors.response.use(
  (resp) => {
    const body = resp.data as ApiEnvelope | undefined;
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code === 0) {
        return resp;
      }
      const message = body.message || '请求失败';
      toast('error', message);
      return Promise.reject(new Error(message));
    }
    return resp;
  },
  (err: AxiosError<ApiEnvelope>) => {
    const status = err.response?.status;
    const body: unknown = err.response?.data;

    let message: string;
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const m = (body as { message?: unknown }).message;
      if (typeof m === 'string' && m) {
        message = m;
      } else {
        message = statusTextOrDefault(status, err);
      }
    } else if (typeof body === 'string' && body.trim()) {
      message = body.trim().slice(0, 80);
    } else {
      message = statusTextOrDefault(status, err);
    }

    if (status === 401) {
      if (onUnauthorized) onUnauthorized();
    } else {
      toast('error', message);
    }
    return Promise.reject(err);
  }
);

export async function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const resp = await http.get<ApiEnvelope<T>>(url, config);
  return resp.data.data as T;
}

export async function post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const resp = await http.post<ApiEnvelope<T>>(url, data, config);
  return resp.data.data as T;
}

export async function put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const resp = await http.put<ApiEnvelope<T>>(url, data, config);
  return resp.data.data as T;
}

export async function del<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const resp = await http.delete<ApiEnvelope<T>>(url, config);
  return resp.data.data as T;
}
