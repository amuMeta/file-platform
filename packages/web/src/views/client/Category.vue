<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { listClientCategories as listCategoryFiles, downloadUrl, formatSize, type FileItem } from '@/api/file';
import { listClientCategories, type Category } from '@/api/category';

const route = useRoute();
const router = useRouter();
const files = ref<FileItem[]>([]);
const categories = ref<Category[]>([]);
const loading = ref(false);
const includeHistory = ref(false);

const currentCategory = computed(() => {
  const id = Number(route.params.id);
  return categories.value.find((c) => c.id === id) ?? null;
});

async function fetchData() {
  const id = Number(route.params.id);
  if (!id) return;
  loading.value = true;
  try {
    const [{ items }, cats] = await Promise.all([
      listCategoryFiles(id, includeHistory.value),
      listClientCategories(),
    ]);
    files.value = items;
    categories.value = cats.items;
  } catch (e) {
    ElMessage.error('加载失败');
  } finally {
    loading.value = false;
  }
}

function onFileClick(f: FileItem) {
  router.push({ name: 'file-detail', params: { id: f.id } });
}

function onDownload(f: FileItem, e: Event) {
  e.stopPropagation();
  const a = document.createElement('a');
  a.href = downloadUrl(f.id);
  a.download = f.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

onMounted(fetchData);
</script>

<template>
  <div v-loading="loading" class="page">
    <div class="page-head">
      <button class="back-link" @click="router.push('/')">← 返回分类</button>
      <div class="page-eyebrow mono">CATEGORY · 分类详情</div>
      <h1 class="page-title">
        {{ currentCategory?.name ?? '加载中…' }}
        <span v-if="files.length > 0" class="title-count mono">
          {{ files.length }} 个文件
        </span>
      </h1>
    </div>

    <div class="toolbar">
      <label class="toggle">
        <input type="checkbox" v-model="includeHistory" @change="fetchData" />
        <span class="toggle-mark"></span>
        <span class="toggle-text">显示历史版本</span>
      </label>
    </div>

    <div v-if="!loading && files.length === 0" class="empty">
      <div class="empty-eyebrow mono">EMPTY</div>
      <div class="empty-text">该分类下暂无文件</div>
    </div>

    <div v-else class="file-list">
      <article
        v-for="(f, i) in files"
        :key="f.id"
        class="file-card"
        :class="{ history: f.status === 'history' }"
        @click="onFileClick(f)"
      >
        <div class="file-idx mono">{{ String(i + 1).padStart(2, '0') }}</div>
        <div class="file-main">
          <div class="file-name-row">
            <span class="file-name">{{ f.filename }}</span>
            <span v-if="f.status === 'latest'" class="badge badge-latest">最新</span>
            <span v-else-if="f.status === 'history'" class="badge badge-history">历史</span>
          </div>
          <div v-if="f.remark" class="file-remark">"{{ f.remark }}"</div>
          <div class="file-meta mono">
            <span>v{{ f.version ?? '—' }}</span>
            <span>·</span>
            <span>{{ formatSize(f.size) }}</span>
            <span>·</span>
            <span>{{ f.created_at }}</span>
          </div>
        </div>
        <button class="dl-btn" @click="onDownload(f, $event)">下载 ↓</button>
      </article>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 960px; }

.page-head { margin-bottom: var(--s-6); }
.back-link {
  background: transparent;
  border: none;
  padding: 0;
  font-size: 12px;
  color: var(--ink-mute);
  cursor: pointer;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: var(--s-4);
  transition: color var(--dur) var(--ease);
}
.back-link:hover { color: var(--ink); }

.title-count {
  font-size: 14px;
  color: var(--ink-mute);
  font-weight: 400;
  margin-left: var(--s-3);
  letter-spacing: 0;
  vertical-align: middle;
}

.toolbar {
  margin-bottom: var(--s-5);
  padding-bottom: var(--s-3);
  border-bottom: 1px solid var(--rule);
}
.toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  cursor: pointer;
  font-size: 13px;
  color: var(--ink-mute);
}
.toggle input { display: none; }
.toggle-mark {
  width: 32px;
  height: 18px;
  background: var(--rule);
  border-radius: 1px;
  position: relative;
  transition: background var(--dur) var(--ease);
}
.toggle-mark::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  background: #FFFFFF;
  transition: transform var(--dur) var(--ease);
}
.toggle input:checked + .toggle-mark { background: var(--ink); }
.toggle input:checked + .toggle-mark::after { transform: translateX(14px); }
.toggle-text { user-select: none; }

/* ---------- 列表 ---------- */
.file-list { display: flex; flex-direction: column; }
.file-card {
  display: grid;
  grid-template-columns: 60px 1fr auto;
  align-items: center;
  gap: var(--s-4);
  padding: var(--s-5) 0;
  border-bottom: 1px solid var(--rule);
  cursor: pointer;
  transition: all var(--dur) var(--ease);
}
.file-card:hover { padding-left: var(--s-3); }
.file-card:hover .file-name { color: var(--accent); }
.file-card.history { opacity: 0.7; }
.file-card.history:hover { opacity: 1; }

.file-idx {
  font-size: 11px;
  color: var(--ink-faint);
  letter-spacing: 0.08em;
}

.file-name-row {
  display: flex;
  align-items: baseline;
  gap: var(--s-3);
  margin-bottom: 6px;
}
.file-name {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 19px;
  color: var(--ink);
  letter-spacing: -0.01em;
  transition: color var(--dur) var(--ease);
}
.file-remark {
  font-family: var(--font-display);
  font-style: italic;
  font-size: 13px;
  color: var(--ink-mute);
  margin-bottom: 6px;
  line-height: 1.5;
}
.file-meta {
  font-size: 11px;
  color: var(--ink-mute);
  letter-spacing: 0.06em;
  display: flex;
  gap: var(--s-2);
}

.badge {
  font-family: var(--font-mono);
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 3px 6px;
  font-weight: 500;
}
.badge-latest { background: var(--accent); color: var(--paper); }
.badge-history { background: var(--paper-2); color: var(--ink-mute); border: 1px solid var(--rule); }

.dl-btn {
  background: var(--ink);
  color: var(--paper);
  border: none;
  padding: 10px 20px;
  font-size: 12px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: all var(--dur) var(--ease);
  white-space: nowrap;
}
.dl-btn:hover { background: var(--accent); transform: translateX(2px); }

/* ---------- Empty ---------- */
.empty {
  text-align: center;
  padding: var(--s-9) 0;
  border: 1px solid var(--rule);
  background: #FFFFFF;
}
.empty-eyebrow {
  font-size: 10px;
  color: var(--ink-faint);
  letter-spacing: 0.2em;
  margin-bottom: var(--s-3);
}
.empty-text {
  font-family: var(--font-display);
  font-style: italic;
  font-size: 18px;
  color: var(--ink-mute);
}
</style>
