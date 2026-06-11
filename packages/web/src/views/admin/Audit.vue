<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { listAuditLogs, AUDIT_ACTIONS, AUDIT_RESOURCES, type AuditLog } from '@/api/audit';
import { listUsers, type User } from '@/api/user';

const items = ref<AuditLog[]>([]);
const total = ref(0);
const loading = ref(false);
const users = ref<User[]>([]);

const filter = ref<{ actorId: string; action: string; resource: string }>({ actorId: '', action: '', resource: '' });
const page = ref(1);
const pageSize = ref(20);

const detailVisible = ref(false);
const detail = ref<AuditLog | null>(null);
const detailMetaJson = computed(() => {
  if (!detail.value?.metadata) return '—';
  try { return JSON.stringify(detail.value.metadata, null, 2); }
  catch { return String(detail.value.metadata); }
});

function statusType(s: string): 'success' | 'danger' | 'info' {
  if (s === 'success') return 'success';
  if (s === 'failed') return 'danger';
  return 'info';
}

function actionColor(a: string): 'primary' | 'success' | 'warning' | 'danger' | 'info' {
  if (a.startsWith('auth.login.failed') || a.endsWith('.failed') || a.includes('delete')) return 'danger';
  if (a.startsWith('auth.login.success') || a.endsWith('.create') || a.endsWith('.upload')) return 'success';
  if (a.includes('update') || a.includes('sort')) return 'warning';
  if (a.startsWith('auth.')) return 'info';
  return 'primary';
}

async function fetchData() {
  loading.value = true;
  try {
    const params: Parameters<typeof listAuditLogs>[0] = { page: page.value, pageSize: pageSize.value };
    if (filter.value.actorId) params.actorId = Number(filter.value.actorId);
    if (filter.value.action) params.action = filter.value.action;
    if (filter.value.resource) params.resource = filter.value.resource as 'category' | 'file' | 'user' | 'session';
    const { items: list, total: t } = await listAuditLogs(params);
    items.value = list;
    total.value = t;
  } finally { loading.value = false; }
}

async function fetchUsers() {
  const { items } = await listUsers();
  users.value = items;
}

function onQuery() { page.value = 1; fetchData(); }
function onReset() { filter.value = { actorId: '', action: '', resource: '' }; page.value = 1; fetchData(); }
function onPageChange(p: number) { page.value = p; fetchData(); }
function onPageSizeChange(s: number) { pageSize.value = s; page.value = 1; fetchData(); }
function openDetail(row: AuditLog) { detail.value = row; detailVisible.value = true; }

async function copyMetadata() {
  if (!detailMetaJson.value || detailMetaJson.value === '—') return;
  try {
    await navigator.clipboard.writeText(detailMetaJson.value);
    ElMessage.success('已复制 metadata');
  } catch { ElMessage.error('复制失败(浏览器拒绝)'); }
}

onMounted(() => { fetchData(); fetchUsers(); });
</script>

<template>
  <div class="page-wrap">
    <header class="page-head">
      <div class="page-eyebrow mono">AUDIT · 审计日志</div>
      <h1 class="page-title">操作追溯</h1>
    </header>

    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" :model="filter">
        <el-form-item label="操作者">
          <el-select v-model="filter.actorId" placeholder="全部" clearable filterable style="width: 180px;">
            <el-option v-for="u in users" :key="u.id" :label="`${u.username} (id=${u.id})`" :value="String(u.id)" />
          </el-select>
        </el-form-item>
        <el-form-item label="动作">
          <el-select v-model="filter.action" placeholder="全部" clearable filterable style="width: 220px;">
            <el-option v-for="a in AUDIT_ACTIONS" :key="a" :label="a" :value="a" />
          </el-select>
        </el-form-item>
        <el-form-item label="资源">
          <el-select v-model="filter.resource" placeholder="全部" clearable style="width: 130px;">
            <el-option v-for="r in AUDIT_RESOURCES" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <button class="btn-primary" @click="onQuery">查询</button>
          <button class="btn-secondary" @click="onReset">重置</button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-table v-loading="loading" :data="items" border stripe class="mt-16" @row-click="openDetail" style="cursor: pointer;">
      <el-table-column type="index" label="#" width="60" align="center">
        <template #default="{ $index }">
          <span class="mono" style="color: var(--ink-faint); font-size: 11px;">{{ String($index + 1).padStart(2, '0') }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="id" label="ID" width="80">
        <template #default="{ row }"><span class="mono" style="color: var(--ink-mute);">#{{ row.id }}</span></template>
      </el-table-column>
      <el-table-column prop="created_at" label="时间" width="170">
        <template #default="{ row }"><span class="mono" style="color: var(--ink-mute); font-size: 12px;">{{ row.created_at }}</span></template>
      </el-table-column>
      <el-table-column prop="actor_name" label="操作者" width="160">
        <template #default="{ row }">
          <span class="cell-name">{{ row.actor_name }}</span>
          <span v-if="row.actor_id" class="mono" style="color: var(--ink-faint); font-size: 11px; margin-left: 4px;">#{{ row.actor_id }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="action" label="动作" width="200">
        <template #default="{ row }">
          <span :class="['tag', `tag-${actionColor(row.action)}`]">{{ row.action }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="resource" label="资源" width="160">
        <template #default="{ row }">
          {{ row.resource }}<span v-if="row.resource_id" class="mono" style="color: var(--ink-faint);"> #{{ row.resource_id }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="ip" label="IP" width="130">
        <template #default="{ row }"><span class="mono" style="color: var(--ink-mute); font-size: 12px;">{{ row.ip ?? '—' }}</span></template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <span :class="['tag', row.status === 'success' ? 'tag-ok' : row.status === 'failed' ? 'tag-fail' : 'tag-info']">{{ row.status }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="metadata" label="metadata 摘要" min-width="220" show-overflow-tooltip>
        <template #default="{ row }">
          <code v-if="row.metadata" class="meta-cell">{{ JSON.stringify(row.metadata) }}</code>
          <span v-else class="muted">—</span>
        </template>
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

    <el-dialog v-model="detailVisible" title="审计详情" width="640px">
      <el-descriptions v-if="detail" :column="2" border size="small">
        <el-descriptions-item label="ID">#{{ detail.id }}</el-descriptions-item>
        <el-descriptions-item label="时间">{{ detail.created_at }}</el-descriptions-item>
        <el-descriptions-item label="操作者">{{ detail.actor_name }} <span class="mono" style="color: var(--ink-faint);">#{{ detail.actor_id ?? '—' }}</span></el-descriptions-item>
        <el-descriptions-item label="IP">{{ detail.ip ?? '—' }}</el-descriptions-item>
        <el-descriptions-item label="动作"><span :class="['tag', `tag-${actionColor(detail.action)}`]">{{ detail.action }}</span></el-descriptions-item>
        <el-descriptions-item label="状态"><span :class="['tag', detail.status === 'success' ? 'tag-ok' : 'tag-fail']">{{ detail.status }}</span></el-descriptions-item>
        <el-descriptions-item label="资源">{{ detail.resource }}</el-descriptions-item>
        <el-descriptions-item label="资源 ID">#{{ detail.resource_id ?? '—' }}</el-descriptions-item>
        <el-descriptions-item label="metadata" :span="2">
          <pre class="meta-pre">{{ detailMetaJson }}</pre>
          <button class="btn-link" @click="copyMetadata" style="margin-top: var(--s-2);">复制 JSON</button>
        </el-descriptions-item>
      </el-descriptions>
    </el-dialog>
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

.tag {
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 3px 8px;
  font-weight: 500;
  display: inline-block;
}
.tag-ok { background: var(--positive-soft); color: var(--positive); }
.tag-fail { background: var(--negative-soft); color: var(--negative); }
.tag-info { background: var(--paper-2); color: var(--ink-mute); border: 1px solid var(--rule); }
.tag-primary { background: var(--accent-soft); color: var(--accent); }
.tag-success { background: var(--positive-soft); color: var(--positive); }
.tag-warning { background: var(--warn-soft); color: var(--warn); }
.tag-danger { background: var(--negative-soft); color: var(--negative); }

.meta-cell {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-mute);
  background: var(--paper-2);
  padding: 1px 6px;
}
.meta-pre {
  margin: 0;
  padding: var(--s-3);
  background: var(--paper-2);
  font-size: 12px;
  line-height: 1.5;
  max-height: 300px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  font-family: var(--font-mono);
}
.btn-link {
  background: transparent;
  border: none;
  padding: 0;
  font-size: 12px;
  color: var(--ink);
  cursor: pointer;
  font-weight: 500;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
.btn-link:hover { color: var(--accent); }
.pagination { display: flex; justify-content: flex-end; margin-top: var(--s-5); }
.muted { color: var(--ink-faint); }
</style>
