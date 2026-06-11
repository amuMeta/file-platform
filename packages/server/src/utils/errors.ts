export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;
  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const Unauthorized = (message = '未登录') => new HttpError(401, 'UNAUTHORIZED', message);
export const Forbidden = (message = '无权访问') => new HttpError(403, 'FORBIDDEN', message);
export const NotFound = (message = '资源不存在') => new HttpError(404, 'NOT_FOUND', message);
export const BadRequest = (message = '参数错误') => new HttpError(400, 'BAD_REQUEST', message);
export const Conflict = (message = '冲突') => new HttpError(409, 'CONFLICT', message);
export const PayloadTooLarge = (message = '文件过大') => new HttpError(413, 'PAYLOAD_TOO_LARGE', message);
