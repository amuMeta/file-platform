import { get, post } from './http';

export interface User {
  id: number;
  username: string;
  role: 'admin' | 'user';
}

export async function login(username: string, password: string): Promise<{ user: User }> {
  return post('/auth/login', { username, password });
}

export async function logout(): Promise<void> {
  await post('/auth/logout');
}

export async function fetchMe(): Promise<{ user: User | null }> {
  return get('/auth/me');
}
