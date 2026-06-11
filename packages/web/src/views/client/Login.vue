<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();
const formRef = ref<{ validate: () => Promise<boolean> } | null>(null);
const loading = ref(false);

const form = ref({ username: '', password: '' });

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
};

async function onSubmit(e?: Event) {
  if ((e as KeyboardEvent | undefined)?.isComposing) return;
  const ref = formRef.value;
  if (!ref) return;
  const valid = await ref.validate().catch(() => false);
  if (!valid) return;
  loading.value = true;
  try {
    await auth.login(form.value.username, form.value.password);
    ElMessage.success('登录成功');
    router.push('/');
  } catch (e) {
    const err = e as { response?: { data?: { message?: string } }; message?: string };
    ElMessage.error(err?.response?.data?.message || err?.message || '登录失败');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <!-- 左侧编辑式 hero -->
    <aside class="login-hero">
      <div class="hero-inner">
        <div class="brand-row">
          <div class="brand-mark">FP</div>
          <span class="brand-text">文件分发平台</span>
        </div>

        <h1 class="hero-eyebrow mono">VOL.01 — 客户门户</h1>
        <h2 class="hero-headline">
          简洁可靠的<br />
          <em>版本管理</em> 与<br />
          安装包分发。
        </h2>

        <p class="hero-lede">
          按分类浏览最新版本,获取历史发布,快速定位与你设备匹配的文件。
          所有下载均有完整审计。
        </p>
      </div>
    </aside>

    <!-- 右侧表单 -->
    <main class="login-form-side">
      <div class="form-wrap">
        <div class="form-head">
          <h2 class="form-title">客户登录</h2>
          <p class="form-sub">使用您分配到的账号继续。</p>
        </div>

        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="onSubmit">
          <el-form-item label="用户名" prop="username">
            <el-input v-model="form.username" placeholder="例如:support_company_a" size="large" @keyup.enter="onSubmit" />
          </el-form-item>
          <el-form-item label="密码" prop="password">
            <el-input v-model="form.password" type="password" show-password placeholder="输入密码" size="large" @keyup.enter="onSubmit" />
          </el-form-item>
          <el-button type="primary" native-type="button" :loading="loading" size="large" class="submit-btn" @click="onSubmit">
            登录 →
          </el-button>
        </el-form>

        <hr class="form-divider" />

        <div class="form-foot">
          <span>管理员?</span>
          <RouterLink to="/admin/login">前往管理端登录 →</RouterLink>
        </div>
      </div>

      <div class="page-foot mono">
        © 2026 FILE PLATFORM · INTERNAL BUILD v1.0
      </div>
    </main>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  background: var(--paper);
}

@media (max-width: 900px) {
  .login-page { grid-template-columns: 1fr; }
  .login-hero { display: none; }
}

/* ---------- 左侧 hero ---------- */
.login-hero {
  background: var(--ink);
  color: var(--paper);
  padding: var(--s-7) var(--s-7);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: relative;
  overflow: hidden;
}
.login-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 80% 20%, rgba(194, 65, 12, 0.15) 0%, transparent 50%),
    radial-gradient(circle at 20% 80%, rgba(251, 191, 36, 0.08) 0%, transparent 50%);
  pointer-events: none;
}
.login-hero::after {
  content: '';
  position: absolute;
  bottom: -20%;
  right: -10%;
  width: 60%;
  height: 60%;
  background: radial-gradient(circle, rgba(194, 65, 12, 0.20) 0%, transparent 60%);
  pointer-events: none;
}

.hero-inner { position: relative; z-index: 1; }

.brand-row {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  margin-bottom: var(--s-8);
}
.brand-mark {
  width: 36px;
  height: 36px;
  background: var(--accent);
  color: var(--paper);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 16px;
  letter-spacing: -0.02em;
  display: grid;
  place-items: center;
}
.brand-text {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 16px;
  letter-spacing: 0.02em;
}

.hero-eyebrow {
  font-size: 11px;
  font-weight: 500;
  color: var(--accent-soft);
  letter-spacing: 0.16em;
  margin: 0 0 var(--s-5);
}

.hero-headline {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: clamp(36px, 4.5vw, 56px);
  line-height: 1.05;
  letter-spacing: -0.025em;
  color: var(--paper);
  margin: 0 0 var(--s-6);
}
.hero-headline em {
  font-style: italic;
  color: var(--accent-soft);
  font-weight: 500;
}

.hero-lede {
  font-size: 15px;
  line-height: 1.7;
  color: rgba(250, 248, 245, 0.65);
  max-width: 460px;
  margin: 0 0 var(--s-8);
}

/* ---------- 右侧表单 ---------- */
.login-form-side {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: var(--s-7) var(--s-7);
}

.form-wrap { max-width: 400px; width: 100%; margin: auto; }

.form-head { margin-bottom: var(--s-7); }
.form-title {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 32px;
  color: var(--ink);
  margin: 0 0 var(--s-2);
  letter-spacing: -0.02em;
}
.form-sub {
  font-size: 14px;
  color: var(--ink-mute);
  margin: 0;
}

.submit-btn {
  width: 100%;
  margin-top: var(--s-3);
  font-size: 14px;
  letter-spacing: 0.02em;
  height: 48px;
}

.form-divider {
  border: none;
  height: 1px;
  background: var(--rule);
  margin: var(--s-6) 0;
}

.form-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: var(--ink-mute);
}
.form-foot a {
  color: var(--ink);
  font-weight: 500;
  text-decoration: none;
}
.form-foot a:hover { color: var(--accent); }

.page-foot {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  color: var(--ink-faint);
  margin-top: var(--s-5);
}
</style>
