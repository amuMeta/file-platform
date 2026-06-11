import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', component: () => import('@/views/client/Login.vue'), meta: { guest: true } },
  { path: '/admin/login', name: 'admin-login', component: () => import('@/views/admin/Login.vue'), meta: { guest: true } },
  {
    path: '/',
    component: () => import('@/layouts/ClientLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', name: 'home', component: () => import('@/views/client/Home.vue') },
      { path: 'category/:id', name: 'category', component: () => import('@/views/client/Category.vue') },
      { path: 'file/:id', name: 'file-detail', component: () => import('@/views/client/FileDetail.vue') },
    ],
  },
  {
    path: '/admin',
    component: () => import('@/layouts/AdminLayout.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
    children: [
      { path: '', redirect: '/admin/dashboard' },
      { path: 'dashboard', name: 'admin-dashboard', component: () => import('@/views/admin/Dashboard.vue') },
      { path: 'category', name: 'admin-category', component: () => import('@/views/admin/Category.vue') },
      { path: 'file', name: 'admin-file', component: () => import('@/views/admin/File.vue') },
      { path: 'log', name: 'admin-log', component: () => import('@/views/admin/Log.vue') },
      { path: 'user', name: 'admin-user', component: () => import('@/views/admin/User.vue') },
      { path: 'audit', name: 'admin-audit', component: () => import('@/views/admin/Audit.vue') },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;

export async function setupRouterGuards(): Promise<void> {
  const { useAuthStore } = await import('@/stores/auth');
  const auth = useAuthStore();
  if (!auth.ready) await auth.refresh();
  router.beforeEach((to) => {
    if (to.meta.guest && auth.isLoggedIn) {
      return auth.isAdmin ? '/admin/dashboard' : '/';
    }
    if (to.meta.requiresAuth && !auth.isLoggedIn) {
      return to.path.startsWith('/admin') ? '/admin/login' : '/login';
    }
    if (to.meta.requiresAdmin && !auth.isAdmin) {
      return '/';
    }
    return true;
  });
}
