import { get, post, put, del } from './http';

export interface User {
  id: number;
  username: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled';
  created_at: string;
}

export async function listUsers(): Promise<{ items: User[] }> {
  return get('/admin/users');
}

export async function createUser(payload: { username: string; password: string; role: 'admin' | 'user' }): Promise<{ user: User }> {
  return post('/admin/users', payload);
}

export async function updateUser(id: number, payload: { password?: string; status?: 'active' | 'disabled'; role?: 'admin' | 'user' }): Promise<{ id: number }> {
  return put(`/admin/users/${id}`, payload);
}

export async function deleteUser(id: number): Promise<{ id: number }> {
  return del(`/admin/users/${id}`);
}
