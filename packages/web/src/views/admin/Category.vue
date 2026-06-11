<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as api from '@/api/category';
import type { Category } from '@/api/category';

const items = ref<Category[]>([]);
const loading = ref(false);
const dialogVisible = ref(false);
const editing = ref<Category | null>(null);
const form = ref<{ name: string; sort_order: number | undefined }>({ name: '', sort_order: undefined });
const formRef = ref<{ validate: () => Promise<boolean> } | null>(null);

const rules = {
  name: [{ required: true, message: '请输入分类名', trigger: 'blur' }],
};

async function fetchList() {
  loading.value = true;
  try {
    const { items: list } = await api.listAdminCategories();
    items.value = list;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editing.value = null;
  form.value = { name: '', sort_order: undefined };
  dialogVisible.value = true;
}

function openEdit(c: Category) {
  editing.value = c;
  form.value = { name: c.name, sort_order: c.sort_order };
  dialogVisible.value = true;
}

async function onSubmit() {
  const ref = formRef.value;
  if (!ref) return;
  const valid = await ref.validate().catch(() => false);
  if (!valid) return;
  try {
    if (editing.value) {
      await api.updateCategory(editing.value.id, { name: form.value.name });
    } else {
      const payload: { name: string; sort_order?: number } = { name: form.value.name };
      if (form.value.sort_order !== undefined) payload.sort_order = form.value.sort_order;
      await api.createCategory(payload.name, payload.sort_order);
    }
    ElMessage.success('保存成功');
    dialogVisible.value = false;
    await fetchList();
  } catch (e) { /* handled */ }
}

async function onToggleStatus(c: Category) {
  const next = c.status === 'enabled' ? 'disabled' : 'enabled';
  try {
    await api.updateCategory(c.id, { status: next });
    ElMessage.success(next === 'enabled' ? '已启用' : '已停用');
    await fetchList();
  } catch (e) { /* handled */ }
}

async function onDelete(c: Category) {
  try {
    await ElMessageBox.confirm(`确认删除「${c.name}」?该分类下若有文件将拒绝删除。`, '提示', { type: 'warning' });
    await api.deleteCategory(c.id);
    ElMessage.success('已删除');
    await fetchList();
  } catch (e) {
    if ((e as { type?: string }).type !== 'cancel') { /* handled */ }
  }
}

async function onRowDrop(oldIndex: number, newIndex: number) {
  const moved = items.value.splice(oldIndex, 1)[0];
  if (!moved) return;
  items.value.splice(newIndex, 0, moved);
  const updates = items.value.map((it, idx) => ({ id: it.id, sort_order: (idx + 1) * 10 }));
  try {
    await api.sortCategories(updates);
    ElMessage.success('排序已保存');
    await fetchList();
  } catch (e) { /* handled */ }
}

onMounted(fetchList);
</script>

<template>
  <div class="page-wrap">
    <header class="page-head">
      <div class="page-eyebrow mono">CATEGORIES · 分类管理</div>
      <h1 class="page-title">分类目录</h1>
      <div class="page-actions">
        <button class="btn-primary" @click="openCreate">+ 新建分类</button>
      </div>
    </header>

    <el-table v-loading="loading" :data="items" row-key="id" border stripe>
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
      <el-table-column prop="name" label="名称">
        <template #default="{ row }">
          <span class="cell-name">{{ row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="sort_order" label="排序" width="100">
        <template #default="{ row }">
          <span class="mono" style="color: var(--ink-mute);">{{ row.sort_order }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="file_count" label="文件" width="100">
        <template #default="{ row }">
          <span class="mono" style="color: var(--ink-mute);">{{ row.file_count ?? 0 }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <span :class="['tag', row.status === 'enabled' ? 'tag-ok' : 'tag-off']">
            {{ row.status === 'enabled' ? '启用' : '停用' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220">
        <template #default="{ row }">
          <button class="btn-link" @click="openEdit(row as Category)">编辑</button>
          <span class="dot">·</span>
          <button class="btn-link" @click="onToggleStatus(row as Category)">
            {{ (row as Category).status === 'enabled' ? '停用' : '启用' }}
          </button>
          <span class="dot">·</span>
          <button class="btn-link danger" :disabled="((row as Category).file_count ?? 0) > 0" @click="onDelete(row as Category)">删除</button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editing ? '编辑分类' : '新建分类'" width="420px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入分类名" maxlength="64" />
        </el-form-item>
        <el-form-item v-if="!editing" label="排序值">
          <el-input-number v-model="form.sort_order" :min="0" :step="10" />
          <div class="muted-hint mono">留空自动追加在末尾</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="onSubmit">确定</el-button>
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
  text-decoration: none;
}
.btn-link:hover { color: var(--accent); }
.btn-link:disabled { color: var(--ink-faint); cursor: not-allowed; }
.btn-link.danger { color: var(--negative); }
.btn-link.danger:hover { color: var(--negative); text-decoration: underline; }
.dot { margin: 0 6px; color: var(--ink-faint); }

.muted-hint {
  font-size: 10px;
  color: var(--ink-mute);
  letter-spacing: 0.08em;
  margin-top: 4px;
}
</style>
