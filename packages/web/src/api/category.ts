import { get, post, put, del } from './http';

export interface Category {
  id: number;
  name: string;
  sort_order: number;
  status: 'enabled' | 'disabled';
  created_at: string;
  file_count?: number;
}

export async function listClientCategories(): Promise<{ items: Category[] }> {
  return get('/categories');
}

export async function listAdminCategories(): Promise<{ items: Category[] }> {
  return get('/admin/categories');
}

export async function createCategory(name: string, sort_order?: number): Promise<{ category: Category }> {
  return post('/admin/categories', { name, sort_order });
}

export async function updateCategory(
  id: number,
  payload: { name?: string; status?: 'enabled' | 'disabled' }
): Promise<{ category: Category }> {
  return put(`/admin/categories/${id}`, payload);
}

export async function deleteCategory(id: number): Promise<{ id: number }> {
  return del(`/admin/categories/${id}`);
}

export async function sortCategories(items: { id: number; sort_order: number }[]): Promise<{ updated: number }> {
  return put('/admin/categories/sort', { items });
}
