<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { setUnauthorizedHandler } from '@/api/http';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

setUnauthorizedHandler(() => {
  if (auth.wasAuthenticated) {
    ElMessage.warning('会话已过期,请重新登录');
  }
  const loginPath = '/login';
  auth.user = null;
  if (route.path !== loginPath) {
    router.push(loginPath);
  }
});

async function onLogout() {
  await auth.logout();
  router.push('/login');
}
</script>

<template>
  <div class="layout">
    <header class="topbar">
      <div class="topbar-inner">
        <div class="brand" @click="router.push('/')">
          <div class="brand-mark">FP</div>
          <div class="brand-block">
            <div class="brand-name">文件分发平台</div>
            <div class="brand-sub mono">FILE PLATFORM / v1.0</div>
          </div>
        </div>

        <nav class="topnav">
          <RouterLink to="/" class="topnav-link" exact-active-class="is-active">分类</RouterLink>
          <a class="topnav-link disabled" tabindex="-1" aria-disabled="true">下载记录</a>
          <a class="topnav-link disabled" tabindex="-1" aria-disabled="true">设置</a>
        </nav>

        <div class="topbar-right">
          <span class="user-badge">
            <span class="user-avatar">{{ (auth.user?.username || '?').slice(0, 1).toUpperCase() }}</span>
            <span class="user-name">{{ auth.user?.username }}</span>
          </span>
          <button class="logout-btn" @click="onLogout">退出</button>
        </div>
      </div>
    </header>

    <main class="main">
      <RouterView v-slot="{ Component }">
        <transition name="fade-up" mode="out-in">
          <component :is="Component" />
        </transition>
      </RouterView>
    </main>

    <footer class="page-footer mono">
      <span>© 2026 FILE PLATFORM</span>
      <span>·</span>
      <span>UPLOADS AUDITED · v1.0</span>
    </footer>
  </div>
</template>

<style scoped>
.layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--paper);
}

/* ---------- 顶栏 ---------- */
.topbar {
  background: var(--paper);
  border-bottom: 1px solid var(--rule);
  position: sticky;
  top: 0;
  z-index: 10;
  backdrop-filter: blur(8px);
}
.topbar-inner {
  max-width: var(--w-page);
  margin: 0 auto;
  padding: 0 var(--s-6);
  height: 64px;
  display: flex;
  align-items: center;
  gap: var(--s-7);
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  cursor: pointer;
}
.brand-mark {
  width: 32px;
  height: 32px;
  background: var(--ink);
  color: var(--paper);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 14px;
  display: grid;
  place-items: center;
  letter-spacing: -0.02em;
}
.brand-block { display: flex; flex-direction: column; line-height: 1.2; }
.brand-name {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 15px;
  color: var(--ink);
  letter-spacing: 0.01em;
}
.brand-sub {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--ink-faint);
  margin-top: 2px;
}

.topnav {
  display: flex;
  gap: var(--s-5);
  flex: 1;
  margin-left: var(--s-5);
}
.topnav-link {
  font-size: 13px;
  color: var(--ink-mute);
  text-decoration: none;
  padding: var(--s-2) 0;
  position: relative;
  font-weight: 500;
  transition: color var(--dur) var(--ease);
}
.topnav-link:hover { color: var(--ink); text-decoration: none; }
.topnav-link.is-active { color: var(--ink); }
.topnav-link.is-active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -22px;
  height: 1px;
  background: var(--ink);
}
.topnav-link.disabled {
  color: var(--ink-faint);
  cursor: not-allowed;
  pointer-events: none;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: var(--s-3);
}

.user-badge {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: 6px 10px 6px 6px;
  border: 1px solid var(--rule);
  background: #FFFFFF;
}
.user-avatar {
  width: 24px;
  height: 24px;
  background: var(--ink);
  color: var(--paper);
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 12px;
}
.user-name {
  font-size: 13px;
  color: var(--ink);
  font-weight: 500;
}

.logout-btn {
  background: transparent;
  border: 1px solid var(--rule);
  color: var(--ink-mute);
  padding: 6px 12px;
  font-size: 12px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: all var(--dur) var(--ease);
}
.logout-btn:hover {
  border-color: var(--ink);
  color: var(--ink);
  background: var(--paper-2);
}

/* ---------- 主区 ---------- */
.main {
  flex: 1;
}

/* ---------- 页脚 ---------- */
.page-footer {
  max-width: var(--w-page);
  margin: 0 auto;
  padding: var(--s-6) var(--s-6) var(--s-5);
  display: flex;
  justify-content: center;
  gap: var(--s-3);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--ink-faint);
  border-top: 1px solid var(--rule-soft);
  margin-top: var(--s-9);
}

/* ---------- 转场 ---------- */
.fade-up-enter-active,
.fade-up-leave-active {
  transition: all var(--dur-slow) var(--ease);
}
.fade-up-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.fade-up-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
