<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import * as api from '@/api/category';
import type { Category } from '@/api/category';
import { searchFiles, type FileItem } from '@/api/file';

const router = useRouter();
const items = ref<Category[]>([]);
const loading = ref(false);
const searchQuery = ref('');
const searchResults = ref<FileItem[]>([]);
const searching = ref(false);

async function fetchList() {
  loading.value = true;
  try {
    const { items: list } = await api.listClientCategories();
    items.value = list;
  } finally {
    loading.value = false;
  }
}

async function onSearch() {
  const q = searchQuery.value.trim();
  if (!q) {
    searchResults.value = [];
    return;
  }
  searching.value = true;
  try {
    const { items } = await searchFiles(q);
    searchResults.value = items;
  } catch (e) {
    ElMessage.error('搜索失败');
  } finally {
    searching.value = false;
  }
}

function onCategoryClick(c: Category) {
  router.push({ name: 'category', params: { id: c.id } });
}

function onFileClick(f: FileItem) {
  router.push({ name: 'file-detail', params: { id: f.id } });
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

onMounted(fetchList);
</script>

<template>
  <div class="page">
    <!-- Hero -->
    <header class="hero">
      <div class="hero-meta mono">VOL.01 · DISTRIBUTION INDEX</div>
      <h1 class="hero-title">按分类浏览，<em>按需取用</em>。</h1>
      <p class="hero-lede">选择您设备对应的分类,查看最新版本与历史发布。所有下载均会被记录以供售后追溯。</p>

      <div class="search-wrap">
        <span class="search-prefix mono">SEARCH ›</span>
        <input
          v-model="searchQuery"
          class="search-input"
          placeholder="输入文件名或备注关键词,例如 v2.1 / 驱动 / 固件"
          @keyup.enter="onSearch"
        />
        <button class="search-btn" :disabled="searching" @click="onSearch">
          {{ searching ? '搜索中…' : '搜索' }}
        </button>
      </div>
    </header>

    <!-- 搜索结果(覆盖) -->
    <section v-if="searchResults.length > 0 || searching" class="search-results">
      <div class="section-head">
        <span class="section-num mono">01</span>
        <h2 class="section-title">搜索结果</h2>
        <span class="section-count mono">{{ searchResults.length }} 项</span>
      </div>
      <div v-if="searchResults.length === 0 && !searching" class="empty-search">没有匹配的文件。</div>
      <div v-else class="file-table">
        <div v-for="f in searchResults" :key="f.id" class="file-row" @click="onFileClick(f)">
          <div class="file-name">{{ f.filename }}</div>
          <div class="file-meta mono">
            <span>{{ f.category_name }}</span>
            <span>·</span>
            <span>v{{ f.version ?? '—' }}</span>
            <span>·</span>
            <span>{{ formatSize(f.size) }}</span>
          </div>
        </div>
      </div>
      <button class="reset-btn" @click="(searchQuery = '', searchResults = [])">← 返回分类列表</button>
    </section>

    <!-- 分类列表 -->
    <section v-else>
      <div class="section-head">
        <span class="section-num mono">02</span>
        <h2 class="section-title">分类目录</h2>
        <span class="section-count mono">{{ items.length }} 类</span>
      </div>

      <div v-loading="loading" class="cat-grid">
        <article
          v-for="(c, i) in items"
          :key="c.id"
          class="cat-card"
          :style="{ '--idx': i }"
          @click="onCategoryClick(c)"
        >
          <div class="cat-card-head">
            <span class="cat-num mono">{{ String(i + 1).padStart(2, '0') }}</span>
            <span class="cat-arrow">→</span>
          </div>
          <h3 class="cat-name">{{ c.name }}</h3>
          <p class="cat-desc">点击查看该分类下的最新文件及历史版本。</p>
          <div class="cat-foot mono">
            <span>查看详情</span>
          </div>
        </article>

        <div v-if="!loading && items.length === 0" class="empty">
          暂无可用分类。请联系管理员。
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.page {
  max-width: var(--w-page);
  margin: 0 auto;
  padding: var(--s-9) var(--s-6) var(--s-7);
}

/* ---------- Hero ---------- */
.hero { margin-bottom: var(--s-9); }
.hero-meta {
  font-size: 11px;
  letter-spacing: 0.16em;
  color: var(--ink-faint);
  margin-bottom: var(--s-4);
}
.hero-title {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: clamp(40px, 5vw, 64px);
  line-height: 1.05;
  letter-spacing: -0.03em;
  color: var(--ink);
  margin: 0 0 var(--s-4);
}
.hero-title em {
  font-style: italic;
  color: var(--accent);
  font-weight: 500;
}
.hero-lede {
  font-size: 16px;
  line-height: 1.6;
  color: var(--ink-mute);
  max-width: 640px;
  margin: 0 0 var(--s-7);
}

.search-wrap {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--ink);
  background: #FFFFFF;
  max-width: 720px;
}
.search-prefix {
  background: var(--ink);
  color: var(--paper);
  padding: 0 var(--s-4);
  display: flex;
  align-items: center;
  font-size: 10px;
  letter-spacing: 0.16em;
}
.search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  padding: 0 var(--s-4);
  font-family: var(--font-body);
  font-size: 15px;
  color: var(--ink);
}
.search-input::placeholder { color: var(--ink-faint); }
.search-btn {
  background: var(--ink);
  color: var(--paper);
  border: none;
  padding: 0 var(--s-5);
  font-size: 12px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  cursor: pointer;
  transition: background var(--dur) var(--ease);
}
.search-btn:hover:not(:disabled) { background: var(--ink-soft); }
.search-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ---------- 章节头 ---------- */
.section-head {
  display: flex;
  align-items: baseline;
  gap: var(--s-3);
  margin-bottom: var(--s-5);
  padding-bottom: var(--s-3);
  border-bottom: 1px solid var(--ink);
}
.section-num {
  font-size: 11px;
  color: var(--ink-faint);
  letter-spacing: 0.12em;
}
.section-title {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 22px;
  color: var(--ink);
  margin: 0;
  letter-spacing: -0.01em;
}
.section-count {
  font-size: 11px;
  color: var(--ink-mute);
  margin-left: auto;
  letter-spacing: 0.08em;
}

/* ---------- 分类网格 ---------- */
.cat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 0;
  border-top: 1px solid var(--rule);
}
.cat-card {
  background: #FFFFFF;
  border-right: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
  padding: var(--s-5) var(--s-5) var(--s-4);
  cursor: pointer;
  transition: all var(--dur) var(--ease);
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  position: relative;
  overflow: hidden;
}
.cat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 2px;
  background: var(--accent);
  transition: width var(--dur-slow) var(--ease);
}
.cat-card:hover {
  background: var(--paper-2);
  transform: translateY(-2px);
}
.cat-card:hover::before { width: 100%; }

.cat-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.cat-num {
  font-size: 11px;
  color: var(--ink-faint);
  letter-spacing: 0.08em;
}
.cat-arrow {
  font-size: 18px;
  color: var(--ink-faint);
  transition: all var(--dur) var(--ease);
}
.cat-card:hover .cat-arrow {
  color: var(--accent);
  transform: translateX(4px);
}
.cat-name {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 24px;
  color: var(--ink);
  margin: 0;
  letter-spacing: -0.01em;
}
.cat-desc {
  font-size: 13px;
  color: var(--ink-mute);
  line-height: 1.5;
  margin: 0;
  flex: 1;
}
.cat-foot {
  font-size: 10px;
  color: var(--ink-faint);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  padding-top: var(--s-3);
  border-top: 1px solid var(--rule-soft);
}

.empty {
  grid-column: 1 / -1;
  text-align: center;
  color: var(--ink-mute);
  font-family: var(--font-display);
  font-style: italic;
  padding: var(--s-9);
}

/* ---------- 搜索结果 ---------- */
.file-table {
  border: 1px solid var(--rule);
  background: #FFFFFF;
}
.file-row {
  padding: var(--s-4) var(--s-5);
  border-bottom: 1px solid var(--rule-soft);
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--s-4);
  transition: background var(--dur) var(--ease);
}
.file-row:last-child { border-bottom: none; }
.file-row:hover { background: var(--paper-2); }
.file-name {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 15px;
  color: var(--ink);
}
.file-meta {
  font-size: 11px;
  color: var(--ink-mute);
  letter-spacing: 0.06em;
  display: flex;
  gap: var(--s-2);
}
.empty-search {
  text-align: center;
  padding: var(--s-7);
  color: var(--ink-mute);
  font-family: var(--font-display);
  font-style: italic;
  border: 1px solid var(--rule);
  background: #FFFFFF;
}
.reset-btn {
  margin-top: var(--s-4);
  background: transparent;
  border: 1px solid var(--rule);
  padding: 8px 16px;
  font-size: 12px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ink-mute);
  cursor: pointer;
  transition: all var(--dur) var(--ease);
}
.reset-btn:hover { border-color: var(--ink); color: var(--ink); }
</style>
