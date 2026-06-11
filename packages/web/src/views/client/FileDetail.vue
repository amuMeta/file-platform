<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { getFileDetail, downloadUrl, formatSize, type FileItem } from '@/api/file';

const route = useRoute();
const router = useRouter();
const file = ref<FileItem | null>(null);
const history = ref<FileItem[]>([]);
const loading = ref(false);

async function fetchData() {
  const id = Number(route.params.id);
  if (!id) return;
  loading.value = true;
  try {
    const { file: f, history: h } = await getFileDetail(id);
    file.value = f;
    history.value = h;
  } catch (e) {
    ElMessage.error('文件不存在');
    router.back();
  } finally {
    loading.value = false;
  }
}

function onDownload(f: FileItem) {
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
    <button class="back-link" @click="router.back()">← 返回</button>

    <article v-if="file" class="detail">
      <div class="detail-head">
        <div class="eyebrow mono">FILE · 文件详情</div>
        <h1 class="title">{{ file.filename }}</h1>
        <div class="meta mono">
          <span>{{ file.category_name }}</span>
          <span>·</span>
          <span>v{{ file.version ?? '—' }}</span>
          <span>·</span>
          <span>{{ formatSize(file.size) }}</span>
          <span>·</span>
          <span>{{ file.created_at }}</span>
        </div>
      </div>

      <hr class="rule" />

      <div v-if="file.remark" class="remark">
        <div class="remark-eyebrow mono">REMARK · 备注</div>
        <blockquote class="remark-body">{{ file.remark }}</blockquote>
      </div>

      <div class="action-row">
        <button class="dl-primary" @click="onDownload(file)">下载文件 ↓</button>
        <span class="dl-note mono">{{ formatSize(file.size) }} · 单一文件</span>
      </div>

      <section v-if="history.length > 0" class="history">
        <div class="section-head">
          <span class="section-num mono">H</span>
          <h2 class="section-title">历史版本</h2>
          <span class="section-count mono">{{ history.length }} 个</span>
        </div>
        <div class="history-list">
          <div v-for="(h, i) in history" :key="h.id" class="history-item">
            <div class="hist-idx mono">{{ String(i + 1).padStart(2, '0') }}</div>
            <div class="hist-main">
              <div class="hist-name">{{ h.filename }}</div>
              <div class="hist-meta mono">
                <span>v{{ h.version ?? '—' }}</span>
                <span>·</span>
                <span>{{ formatSize(h.size) }}</span>
                <span>·</span>
                <span>{{ h.created_at }}</span>
              </div>
            </div>
            <button class="dl-secondary" @click="onDownload(h)">下载</button>
          </div>
        </div>
      </section>
    </article>
  </div>
</template>

<style scoped>
.page { max-width: 820px; }

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
  margin-bottom: var(--s-5);
  transition: color var(--dur) var(--ease);
}
.back-link:hover { color: var(--ink); }

.detail-head { margin-bottom: var(--s-5); }
.eyebrow {
  font-size: 11px;
  letter-spacing: 0.16em;
  color: var(--ink-faint);
  margin-bottom: var(--s-3);
}
.title {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: clamp(32px, 4vw, 48px);
  line-height: 1.1;
  letter-spacing: -0.025em;
  color: var(--ink);
  margin: 0 0 var(--s-3);
}
.meta {
  font-size: 12px;
  color: var(--ink-mute);
  letter-spacing: 0.06em;
  display: flex;
  gap: var(--s-2);
  flex-wrap: wrap;
}

.rule {
  border: none;
  height: 1px;
  background: var(--ink);
  margin: var(--s-5) 0;
}

.remark-eyebrow {
  font-size: 11px;
  color: var(--ink-faint);
  letter-spacing: 0.16em;
  margin-bottom: var(--s-3);
}
.remark-body {
  font-family: var(--font-display);
  font-style: italic;
  font-size: 20px;
  line-height: 1.5;
  color: var(--ink-soft);
  margin: 0 0 var(--s-5);
  padding: 0;
  border: none;
  background: none;
}

.action-row {
  display: flex;
  align-items: center;
  gap: var(--s-4);
  margin-bottom: var(--s-7);
}
.dl-primary {
  background: var(--ink);
  color: var(--paper);
  border: none;
  padding: 14px 28px;
  font-size: 13px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  cursor: pointer;
  transition: all var(--dur) var(--ease);
  font-weight: 500;
}
.dl-primary:hover { background: var(--accent); transform: translateY(-1px); }
.dl-note {
  font-size: 11px;
  color: var(--ink-mute);
  letter-spacing: 0.08em;
}

.section-head {
  display: flex;
  align-items: baseline;
  gap: var(--s-3);
  margin-bottom: var(--s-4);
  padding-bottom: var(--s-3);
  border-bottom: 1px solid var(--ink);
}
.section-num {
  font-size: 11px;
  color: var(--ink-faint);
  letter-spacing: 0.12em;
  font-weight: 500;
}
.section-title {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 20px;
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

.history-list { display: flex; flex-direction: column; }
.history-item {
  display: grid;
  grid-template-columns: 50px 1fr auto;
  align-items: center;
  gap: var(--s-4);
  padding: var(--s-4) 0;
  border-bottom: 1px solid var(--rule-soft);
}
.history-item:last-child { border-bottom: none; }
.hist-idx {
  font-size: 11px;
  color: var(--ink-faint);
  letter-spacing: 0.08em;
}
.hist-name {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 15px;
  color: var(--ink);
  margin-bottom: 4px;
}
.hist-meta {
  font-size: 11px;
  color: var(--ink-mute);
  letter-spacing: 0.06em;
  display: flex;
  gap: var(--s-2);
}
.dl-secondary {
  background: transparent;
  color: var(--ink);
  border: 1px solid var(--rule);
  padding: 8px 16px;
  font-size: 11px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: all var(--dur) var(--ease);
}
.dl-secondary:hover {
  background: var(--ink);
  color: var(--paper);
  border-color: var(--ink);
}
</style>
