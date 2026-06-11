<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { listLogs, type LogItem } from '@/api/log';
import { listUsers, type User } from '@/api/user';

const items = ref<LogItem[]>([]);
const users = ref<User[]>([]);
const total = ref(0);
const loading = ref(false);
const filter = ref<{ fileId: string; userId: string }>({ fileId: '', userId: '' });
const page = ref(1);
const pageSize = ref(20);

async function fetchData() {
  loading.value = true;
  try {
    const params: Parameters<typeof listLogs>[0] = { page: page.value, pageSize: pageSize.value };
    if (filter.value.fileId) params.fileId = Number(filter.value.fileId);
    if (filter.value.userId) params.userId = Number(filter.value.userId);
    const { items: list, total: t } = await listLogs(params);
    items.value = list;
    total.value = t;
  } finally { loading.value = false; }
}

async function fetchUsers() {
  const { items } = await listUsers();
  users.value = items;
}

function onQuery() { page.value = 1; fetchData(); }
function onReset() { filter.value = { fileId: '', userId: '' }; page.value = 1; fetchData(); }
function onPageChange(p: number) { page.value = p; fetchData(); }
function onPageSizeChange(s: number) { pageSize.value = s; page.value = 1; fetchData(); }

onMounted(() => { fetchData(); fetchUsers(); });
</script>

<template>
  <div class="page-wrap">
    <header class="page-head">
      <div class="page-eyebrow mono">DOWNLOADS · 下载记录</div>
      <h1 class="page-title">下载日志</h1>
    </header>

    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" :model="filter">
        <el-form-item label="文件 ID">
          <input v-model="filter.fileId" class="filter-input mono" placeholder="按 fileId 过滤" @keyup.enter="onQuery" />
        </el-form-item>
        <el-form-item label="用户">
          <el-select v-model="filter.userId" placeholder="全部用户" clearable filterable style="width: 200px;">
            <el-option v-for="u in users" :key="u.id" :label="`${u.username} (id=${u.id})`" :value="String(u.id)" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <button class="btn-primary" @click="onQuery">查询</button>
          <button class="btn-secondary" @click="onReset">重置</button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-table v-loading="loading" :data="items" border stripe class="mt-16">
      <el-table-column type="index" label="#" width="60" align="center">
        <template #default="{ $index }">
          <span class="mono" style="color: var(--ink-faint); font-size: 11px;">{{ String($index + 1).padStart(2, '0') }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="id" label="ID" width="80">
        <template #default="{ row }"><span class="mono" style="color: var(--ink-mute);">#{{ row.id }}</span></template>
      </el-table-column>
      <el-table-column prop="username" label="用户" width="160">
        <template #default="{ row }"><span class="cell-name">{{ row.username }}</span></template>
      </el-table-column>
      <el-table-column prop="filename" label="文件" min-width="240" show-overflow-tooltip />
      <el-table-column prop="file_id" label="文件 ID" width="100">
        <template #default="{ row }"><span class="mono" style="color: var(--ink-mute);">#{{ row.file_id }}</span></template>
      </el-table-column>
      <el-table-column prop="ip" label="IP" width="140">
        <template #default="{ row }"><span class="mono" style="color: var(--ink-mute); font-size: 12px;">{{ row.ip ?? '—' }}</span></template>
      </el-table-column>
      <el-table-column prop="created_at" label="下载时间" width="170">
        <template #default="{ row }"><span class="mono" style="color: var(--ink-mute); font-size: 12px;">{{ row.created_at }}</span></template>
      </el-table-column>
    </el-table>

    <div class="pagination">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :page-sizes="[20, 50, 100]"
        :total="total"
        layout="total, sizes, prev, pager, next, jumper"
        @current-change="onPageChange"
        @size-change="onPageSizeChange"
      />
    </div>
  </div>
</template>

<style scoped>
.page-wrap { max-width: var(--w-page); margin: 0 auto; padding: var(--s-7) var(--s-6); }
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

.filter-card { border: 1px solid var(--rule); }
.filter-input {
  background: transparent;
  border: 1px solid var(--rule);
  padding: 6px 10px;
  font-size: 12px;
  color: var(--ink);
  width: 140px;
  outline: none;
}
.filter-input:focus { border-color: var(--ink); }

.btn-primary {
  background: var(--ink); color: var(--paper); border: none;
  padding: 6px 14px; font-size: 12px; font-family: var(--font-mono);
  text-transform: uppercase; letter-spacing: 0.1em; cursor: pointer;
  transition: background var(--dur) var(--ease);
  margin-right: 6px;
}
.btn-primary:hover { background: var(--accent); }
.btn-secondary {
  background: transparent; color: var(--ink-mute); border: 1px solid var(--rule);
  padding: 6px 14px; font-size: 12px; font-family: var(--font-mono);
  text-transform: uppercase; letter-spacing: 0.1em; cursor: pointer;
  transition: all var(--dur) var(--ease);
}
.btn-secondary:hover { border-color: var(--ink); color: var(--ink); }

.cell-name { font-family: var(--font-display); font-weight: 500; font-size: 14px; }
.pagination { display: flex; justify-content: flex-end; margin-top: var(--s-5); }
</style>
