<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { listUsers, createUser, updateUser, deleteUser, type User } from '@/api/user';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const currentUserId = computed(() => auth.user?.id ?? null);

const items = ref<User[]>([]);
const loading = ref(false);
const dialogVisible = ref(false);
const editing = ref<User | null>(null);
const form = ref<{ username: string; password: string; role: 'admin' | 'user' }>({ username: '', password: '', role: 'user' });
const formRef = ref<{ validate: () => Promise<boolean> } | null>(null);
const editDialogVisible = ref(false);
const editForm = ref<{ password: string; status: 'active' | 'disabled'; role: 'admin' | 'user' }>({
  password: '',
  status: 'active',
  role: 'user',
});

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码 (至少 6 位)', trigger: 'blur', min: 6 }],
};

function errMsg(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

async function fetchData() {
  loading.value = true;
  try {
    const { items: list } = await listUsers();
    items.value = list;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editing.value = null;
  form.value = { username: '', password: '', role: 'user' };
  dialogVisible.value = true;
}

async function onCreate() {
  const ref = formRef.value;
  if (!ref) return;
  const valid = await ref.validate().catch(() => false);
  if (!valid) return;
  try {
    await createUser({ ...form.value });
    ElMessage.success('创建成功');
    dialogVisible.value = false;
    await fetchData();
  } catch (e) {
    ElMessage.error(`创建失败:${errMsg(e, '请稍后重试')}`);
  }
}

function openEdit(u: User) {
  editing.value = u;
  editForm.value = { password: '', status: u.status, role: u.role };
  editDialogVisible.value = true;
}

async function onEditSave() {
  if (!editing.value) return;
  const payload: { password?: string; status?: 'active' | 'disabled'; role?: 'admin' | 'user' } = {
    status: editForm.value.status,
    role: editForm.value.role,
  };
  if (editForm.value.password) payload.password = editForm.value.password;
  try {
    await updateUser(editing.value.id, payload);
    ElMessage.success('已保存');
    editDialogVisible.value = false;
    await fetchData();
  } catch (e) {
    ElMessage.error(`保存失败:${errMsg(e, '请稍后重试')}`);
  }
}

async function onToggleStatus(u: User) {
  const next = u.status === 'active' ? 'disabled' : 'active';
  try {
    await updateUser(u.id, { status: next });
    ElMessage.success(next === 'active' ? '已启用' : '已停用');
    await fetchData();
  } catch (e) {
    ElMessage.error(`${next === 'active' ? '启用' : '停用'}失败:${errMsg(e, '请稍后重试')}`);
  }
}

async function onDelete(u: User) {
  if (u.id === currentUserId.value) {
    ElMessage.warning('不能删除自己的账号');
    return;
  }
  if (u.role === 'admin') {
    const otherActiveAdmins = items.value.filter(
      (x) => x.role === 'admin' && x.status === 'active' && x.id !== u.id
    );
    if (otherActiveAdmins.length === 0) {
      ElMessage.warning('不能删除最后一个管理员');
      return;
    }
  }
  try {
    await ElMessageBox.confirm(
      `确认删除用户「${u.username}」?该用户历史下载记录将保留但匿名化。此操作不可恢复。`,
      '删除用户',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    );
  } catch {
    return;
  }
  try {
    await deleteUser(u.id);
    ElMessage.success('已删除');
    await fetchData();
  } catch (e) {
    ElMessage.error(`删除失败:${errMsg(e, '请稍后重试')}`);
  }
}

onMounted(fetchData);
</script>

<template>
  <div class="page-wrap">
    <header class="page-head">
      <div class="page-eyebrow mono">USERS · 用户管理</div>
      <h1 class="page-title">用户账号</h1>
      <div class="page-actions">
        <button class="btn-primary" @click="openCreate">+ 新建用户</button>
      </div>
    </header>

    <el-table v-loading="loading" :data="items" border stripe>
      <el-table-column type="index" label="#" width="60" align="center">
        <template #default="{ $index }">
          <span class="mono" style="color: var(--ink-faint); font-size: 11px;">{{ String($index + 1).padStart(2, '0') }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="id" label="ID" width="80">
        <template #default="{ row }">
          <span class="mono" style="color: var(--ink-mute);">#{{ row.id }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="username" label="用户名">
        <template #default="{ row }">
          <span class="cell-name">{{ row.username }}</span>
        </template>
      </el-table-column>
      <el-table-column label="角色" width="120">
        <template #default="{ row }">
          <span :class="['tag', row.role === 'admin' ? 'tag-admin' : 'tag-user']">
            {{ row.role === 'admin' ? '管理员' : '用户' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <span :class="['tag', row.status === 'active' ? 'tag-ok' : 'tag-off']">
            {{ row.status === 'active' ? '启用' : '停用' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="创建时间" width="180">
        <template #default="{ row }">
          <span class="mono" style="color: var(--ink-mute); font-size: 12px;">{{ row.created_at }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="280">
        <template #default="{ row }">
          <button class="btn-link" @click="openEdit(row as User)">编辑</button>
          <span class="dot">·</span>
          <button class="btn-link" @click="onToggleStatus(row as User)">
            {{ (row as User).status === 'active' ? '停用' : '启用' }}
          </button>
          <span class="dot">·</span>
          <button
            class="btn-link danger"
            :disabled="(row as User).id === currentUserId"
            :title="(row as User).id === currentUserId ? '不能删除自己' : ''"
            @click="onDelete(row as User)"
          >删除</button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" title="新建用户" width="420px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" maxlength="64" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" type="password" show-password maxlength="128" />
        </el-form-item>
        <el-form-item label="角色">
          <el-radio-group v-model="form.role">
            <el-radio-button value="user">用户</el-radio-button>
            <el-radio-button value="admin">管理员</el-radio-button>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="onCreate">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editDialogVisible" title="编辑用户" width="420px">
      <el-form v-if="editing" label-width="80px">
        <el-form-item label="用户名">
          <div class="mono" style="color: var(--ink-mute);">{{ editing.username }}</div>
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="editForm.password" type="password" show-password placeholder="留空则不修改" maxlength="128" />
        </el-form-item>
        <el-form-item label="角色">
          <el-radio-group v-model="editForm.role">
            <el-radio-button value="user">用户</el-radio-button>
            <el-radio-button value="admin">管理员</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="editForm.status">
            <el-radio-button value="active">启用</el-radio-button>
            <el-radio-button value="disabled">停用</el-radio-button>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="onEditSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page-wrap {
  max-width: var(--w-page);
  margin: 0 auto;
  padding: var(--s-7) var(--s-6);
}
.page-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--s-4);
  margin-bottom: var(--s-6);
  padding-bottom: var(--s-4);
  border-bottom: 1px solid var(--ink);
}
.page-head .page-eyebrow { flex-basis: 100%; margin-bottom: 0; }
.page-head .page-title { margin: 0; }
.page-actions { margin-left: auto; }
.btn-primary {
  background: var(--ink);
  color: var(--paper);
  border: none;
  padding: 8px 16px;
  font-size: 12px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: background var(--dur) var(--ease);
}
.btn-primary:hover { background: var(--accent); }
.cell-name { font-family: var(--font-display); font-weight: 500; font-size: 15px; }
.tag {
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 3px 8px;
  font-weight: 500;
}
.tag-admin { background: var(--ink); color: var(--paper); }
.tag-user { background: var(--paper-2); color: var(--ink-mute); border: 1px solid var(--rule); }
.tag-ok { background: var(--positive-soft); color: var(--positive); }
.tag-off { background: var(--paper-2); color: var(--ink-mute); border: 1px solid var(--rule); }
.btn-link {
  background: transparent;
  border: none;
  padding: 0;
  font-size: 13px;
  color: var(--ink);
  cursor: pointer;
  font-weight: 500;
}
.btn-link:hover { color: var(--accent); }
.btn-link.danger { color: var(--negative); }
.btn-link.danger:hover:not(:disabled) { color: var(--negative); text-decoration: underline; }
.btn-link.danger:disabled { color: var(--ink-faint); cursor: not-allowed; opacity: 0.5; }
.dot { margin: 0 6px; color: var(--ink-faint); }
</style>
