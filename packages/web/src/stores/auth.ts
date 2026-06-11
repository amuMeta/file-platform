import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import * as authApi from '@/api/auth';
import type { User } from '@/api/auth';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const ready = ref(false);
  const wasAuthenticated = ref(false);

  const isLoggedIn = computed(() => !!user.value);
  const isAdmin = computed(() => user.value?.role === 'admin');

  async function refresh(): Promise<void> {
    try {
      const { user: u } = await authApi.fetchMe();
      user.value = u;
      if (u) wasAuthenticated.value = true;
    } catch {
      user.value = null;
    } finally {
      ready.value = true;
    }
  }

  async function login(username: string, password: string): Promise<void> {
    const { user: u } = await authApi.login(username, password);
    user.value = u;
    wasAuthenticated.value = true;
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout();
    } finally {
      user.value = null;
      wasAuthenticated.value = false;
    }
  }

  return { user, ready, isLoggedIn, isAdmin, wasAuthenticated, refresh, login, logout };
});
