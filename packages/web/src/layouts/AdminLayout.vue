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
  const loginPath = '/admin/login';
  auth.user = null;
  if (route.path !== loginPath) {
    router.push(loginPath);
  }
});

const menuItems = [
  { path: '/admin/dashboard', label: '概览', code: 'DASH' },
  { path: '/admin/category', label: '分类管理', code: 'CAT' },
  { path: '/admin/file', label: '文件管理', code: 'FILE' },
  { path: '/admin/log', label: '下载记录', code: 'LOG' },
  { path: '/admin/audit', label: '审计日志', code: 'AUDIT' },
  { path: '/admin/user', label: '用户管理', code: 'USER' },
];

async function onLogout() {
  await auth.logout();
  router.push('/admin/login');
}
</script>

<template>
  <div class="layout">
    <!-- 侧边栏 -->
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">FP</div>
        <div class="brand-block">
          <div class="brand-name">文件分发</div>
          <div class="brand-sub mono">ADMIN CONSOLE</div>
        </div>
      </div>

      <nav class="menu">
        <div class="menu-label mono">导航</div>
        <RouterLink
          v-for="m in menuItems"
          :key="m.path"
          :to="m.path"
          class="menu-item"
          :class="{ 'is-active': route.path === m.path }"
        >
          <span class="menu-code mono">{{ m.code }}</span>
          <span class="menu-label-text">{{ m.label }}</span>
        </RouterLink>
      </nav>

      <div class="sidebar-foot">
        <div class="env-card">
          <div class="env-row">
            <span class="env-key mono">ENV</span>
            <span class="env-val mono">production</span>
          </div>
          <div class="env-row">
            <span class="env-key mono">REGION</span>
            <span class="env-val mono">cn-east-1</span>
          </div>
          <div class="env-row">
            <span class="env-key mono">BUILD</span>
            <span class="env-val mono">1.0.0</span>
          </div>
        </div>
      </div>
    </aside>

    <!-- 主区 -->
    <main class="main-col">
      <header class="topbar">
        <div class="topbar-left">
          <div class="breadcrumb mono">
            <span>ADMIN</span>
            <span class="sep">/</span>
            <span class="current">{{ route.path.split('/').pop()?.toUpperCase() || 'DASHBOARD' }}</span>
          </div>
        </div>
        <div class="topbar-right">
          <span class="user-badge">
            <span class="user-role mono">ADMIN</span>
            <span class="user-name">{{ auth.user?.username }}</span>
          </span>
          <button class="logout-btn" @click="onLogout">退出</button>
        </div>
      </header>

      <div class="content">
        <RouterView v-slot="{ Component }">
          <transition name="fade-up" mode="out-in">
            <component :is="Component" />
          </transition>
        </RouterView>
      </div>
    </main>
  </div>
</template>

<style scoped>
.layout {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 260px 1fr;
  background: var(--paper);
}

/* ---------- 侧边栏 ---------- */
.sidebar {
  background: var(--ink);
  color: var(--paper);
  display: flex;
  flex-direction: column;
  padding: var(--s-5) 0;
  position: sticky;
  top: 0;
  height: 100vh;
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: 0 var(--s-5) var(--s-6);
  border-bottom: 1px solid rgba(250, 248, 245, 0.1);
}
.brand-mark {
  width: 32px;
  height: 32px;
  background: var(--accent);
  color: var(--paper);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 14px;
  display: grid;
  place-items: center;
}
.brand-block { display: flex; flex-direction: column; line-height: 1.2; }
.brand-name {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 15px;
  letter-spacing: 0.01em;
}
.brand-sub {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: rgba(250, 248, 245, 0.5);
  margin-top: 2px;
}

.menu {
  padding: var(--s-5) 0;
  flex: 1;
}
.menu-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: rgba(250, 248, 245, 0.4);
  padding: 0 var(--s-5);
  margin-bottom: var(--s-3);
}
.menu-item {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: 10px var(--s-5);
  color: rgba(250, 248, 245, 0.65);
  text-decoration: none;
  font-size: 13px;
  border-left: 2px solid transparent;
  transition: all var(--dur) var(--ease);
  position: relative;
}
.menu-item:hover {
  color: var(--paper);
  background: rgba(250, 248, 245, 0.04);
  text-decoration: none;
}
.menu-item.is-active {
  color: var(--paper);
  background: rgba(250, 248, 245, 0.04);
  border-left-color: var(--accent);
}
.menu-code {
  font-size: 10px;
  letter-spacing: 0.1em;
  color: rgba(250, 248, 245, 0.4);
  min-width: 38px;
}
.menu-item.is-active .menu-code { color: var(--accent-soft); }
.menu-label-text { font-weight: 500; letter-spacing: 0.01em; }

.sidebar-foot { padding: 0 var(--s-4); }
.env-card {
  background: rgba(250, 248, 245, 0.04);
  border: 1px solid rgba(250, 248, 245, 0.1);
  padding: var(--s-3);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.env-row {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
.env-key { color: rgba(250, 248, 245, 0.4); }
.env-val { color: var(--paper); font-weight: 500; }

/* ---------- 主列 ---------- */
.main-col {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.topbar {
  background: var(--paper);
  border-bottom: 1px solid var(--rule);
  padding: 0 var(--s-6);
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 10;
  backdrop-filter: blur(8px);
}

.breadcrumb {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--ink-mute);
  display: flex;
  align-items: center;
  gap: var(--s-2);
}
.breadcrumb .sep { color: var(--ink-faint); }
.breadcrumb .current { color: var(--ink); font-weight: 500; }

.topbar-right { display: flex; align-items: center; gap: var(--s-3); }
.user-badge {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: 6px 10px;
  border: 1px solid var(--rule);
  background: #FFFFFF;
}
.user-role {
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--accent);
  padding: 2px 6px;
  background: var(--accent-soft);
  font-weight: 600;
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

.content {
  flex: 1;
}

/* 转场 */
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
