import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import * as authApi from '@/api/auth';
import type { User } from '@/api/auth';

// 关键修复:不要在 chunk 顶层调用 defineStore。
// (Vite prod 把 defineStore 暴露在主 bundle,而主 bundle 顶层 `await` 中,
//  defineStore 的活绑定处于 TDZ,chunk 顶层调用会 ReferenceError 然后
//  整个 import 永不 resolve → 页面卡死白屏)
// 改成 default export 一个工厂,让调用方在 store 真的需要时才创建。

let _store: ReturnType<typeof createStore> | null = null;
function createStore() {
  return defineStore('auth', () => {
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
  })();
}

export function useAuthStore() {
  if (!_store) _store = createStore();
  return _store;
}
