<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { fetchMetrics, type Metrics } from '@/api/metrics';
import { listLogs, type LogItem } from '@/api/log';

const metrics = ref<Metrics | null>(null);
const recentLogs = ref<LogItem[]>([]);
const loading = ref(false);
let refreshTimer: number | null = null;

async function refresh() {
  loading.value = true;
  try {
    const [m, l] = await Promise.all([
      fetchMetrics(),
      listLogs({ page: 1, pageSize: 6 }),
    ]);
    metrics.value = m;
    recentLogs.value = l.items;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  refresh();
  refreshTimer = window.setInterval(refresh, 30_000);
});

onBeforeUnmount(() => {
  if (refreshTimer !== null) clearInterval(refreshTimer);
});

function formatUptime(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}天 ${h}时`;
  if (h > 0) return `${h}时 ${m}分`;
  return `${m}分`;
}
</script>

<template>
  <div class="dash">
    <!-- 报头(编辑式) -->
    <header class="dash-head">
      <div class="dash-eyebrow mono">REPORT · 实时概览</div>
      <h1 class="dash-title">今日<em>运营</em>状况</h1>
      <div class="dash-meta mono">
        <span>每 30s 自动刷新</span>
        <span>·</span>
        <span>{{ metrics?.timestamp ?? '加载中…' }}</span>
      </div>
    </header>

    <div v-loading="loading">
      <!-- 大数字条 -->
      <section v-if="metrics" class="big-numbers">
        <div class="bn-item">
          <div class="bn-label mono">CATEGORIES</div>
          <div class="bn-value">{{ metrics.categories.total }}<span class="bn-suffix">/{{ metrics.categories.enabled }}</span></div>
          <div class="bn-sub">分类总数 / 启用</div>
        </div>
        <div class="bn-item">
          <div class="bn-label mono">FILES</div>
          <div class="bn-value">{{ metrics.files.total }}<span class="bn-suffix">/{{ metrics.files.latest }}</span></div>
          <div class="bn-sub">文件总数 / 最新</div>
        </div>
        <div class="bn-item">
          <div class="bn-label mono">USERS</div>
          <div class="bn-value">{{ metrics.users.total }}<span class="bn-suffix">/{{ metrics.users.admins }}</span></div>
          <div class="bn-sub">用户总数 / 管理员</div>
        </div>
        <div class="bn-item bn-item-accent">
          <div class="bn-label mono">DOWNLOADS / STORAGE</div>
          <div class="bn-value">{{ metrics.downloads.total }}<span class="bn-suffix">次 · {{ metrics.files.storageGB }} GB</span></div>
          <div class="bn-sub">总下载量 / 占用</div>
        </div>
      </section>

      <!-- 实时 + Uptime + 存储 -->
      <section v-if="metrics" class="kpi-row">
        <div class="kpi-card">
          <div class="kpi-eyebrow mono">LIVE RATE</div>
          <div class="kpi-value">{{ metrics.downloads.last1h }}<span class="kpi-suffix">/ 小时</span></div>
          <div class="kpi-sub mono">{{ metrics.downloads.last24h }} / 24 小时</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-eyebrow mono">UPTIME</div>
          <div class="kpi-value">{{ formatUptime(metrics.uptime) }}</div>
          <div class="kpi-sub mono">env: {{ metrics.env }}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-eyebrow mono">STORAGE</div>
          <div class="kpi-value">{{ metrics.files.storageMB }}<span class="kpi-suffix">MB</span></div>
          <div class="kpi-sub mono">
            <span :class="metrics.files.latest > 0 ? 'ok' : ''">{{ metrics.files.latest }} latest</span>
            <span>·</span>
            <span>{{ metrics.files.history }} history</span>
            <span>·</span>
            <span>{{ metrics.files.hidden }} hidden</span>
          </div>
        </div>
      </section>

      <div class="row-2">
        <!-- 热门文件 -->
        <section class="panel">
          <div class="section-head">
            <span class="section-num mono">01</span>
            <h2 class="section-title">热门文件 (24h)</h2>
            <span class="section-count mono">{{ metrics?.downloads.topFiles.length ?? 0 }} 项</span>
          </div>
          <ol v-if="metrics && metrics.downloads.topFiles.length > 0" class="rank-list">
            <li v-for="(f, i) in metrics.downloads.topFiles" :key="f.fileId" class="rank-item">
              <span class="rank-num mono">{{ String(i + 1).padStart(2, '0') }}</span>
              <div class="rank-main">
                <div class="rank-name">{{ f.filename }}</div>
                <div class="rank-meta mono">{{ f.category }} · {{ f.sizeMB }} MB</div>
              </div>
              <span class="rank-count mono">{{ f.downloads }} 次</span>
            </li>
          </ol>
          <div v-else class="empty-inline">近 24h 无下载记录</div>
        </section>

        <!-- 活跃用户 -->
        <section class="panel">
          <div class="section-head">
            <span class="section-num mono">02</span>
            <h2 class="section-title">活跃用户 (24h)</h2>
            <span class="section-count mono">{{ metrics?.downloads.topUsers.length ?? 0 }} 位</span>
          </div>
          <ol v-if="metrics && metrics.downloads.topUsers.length > 0" class="rank-list">
            <li v-for="(u, i) in metrics.downloads.topUsers" :key="u.userId" class="rank-item">
              <span class="rank-num mono">{{ String(i + 1).padStart(2, '0') }}</span>
              <div class="rank-main">
                <div class="rank-name">{{ u.username }}</div>
                <div class="rank-meta mono">用户 #{{ u.userId }}</div>
              </div>
              <span class="rank-count mono">{{ u.downloads }} 次</span>
            </li>
          </ol>
          <div v-else class="empty-inline">近 24h 无活跃用户</div>
        </section>
      </div>

      <!-- 最近下载 -->
      <section class="panel">
        <div class="section-head">
          <span class="section-num mono">03</span>
          <h2 class="section-title">最近下载</h2>
          <span class="section-count mono">最新 {{ recentLogs.length }} 条</span>
        </div>
        <div v-if="recentLogs.length === 0" class="empty-inline">暂无下载记录</div>
        <div v-else class="recent-table">
          <div v-for="(l, i) in recentLogs" :key="l.id" class="recent-row">
            <span class="recent-num mono">{{ String(i + 1).padStart(2, '0') }}</span>
            <span class="recent-user">{{ l.username }}</span>
            <span class="recent-file">{{ l.filename }}</span>
            <span class="recent-ip mono">{{ l.ip ?? '—' }}</span>
            <span class="recent-time mono">{{ l.created_at }}</span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.dash {
  max-width: var(--w-page);
  margin: 0 auto;
  padding: var(--s-7) var(--s-6);
}

/* 报头 */
.dash-head { margin-bottom: var(--s-7); }
.dash-eyebrow {
  font-size: 11px;
  color: var(--ink-faint);
  letter-spacing: 0.16em;
  margin-bottom: var(--s-3);
}
.dash-title {
  font-family: var(--font-display);
  font-weight: 400;
  font-size: clamp(36px, 4.5vw, 56px);
  line-height: 1.05;
  letter-spacing: -0.03em;
  color: var(--ink);
  margin: 0 0 var(--s-3);
}
.dash-title em {
  font-style: italic;
  color: var(--accent);
  font-weight: 500;
}
.dash-meta {
  display: flex;
  gap: var(--s-2);
  font-size: 11px;
  color: var(--ink-mute);
  letter-spacing: 0.08em;
}

/* 大数字条 */
.big-numbers {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border: 1px solid var(--ink);
  background: #FFFFFF;
  margin-bottom: var(--s-5);
}
.bn-item {
  padding: var(--s-5);
  border-right: 1px solid var(--rule);
}
.bn-item:last-child { border-right: none; }
.bn-item-accent { background: var(--ink); color: var(--paper); border-right-color: var(--ink); }
.bn-item-accent .bn-label,
.bn-item-accent .bn-sub { color: rgba(250, 248, 245, 0.55); }
.bn-item-accent .bn-value { color: var(--paper); }
.bn-item-accent .bn-suffix { color: rgba(250, 248, 245, 0.5); }

.bn-label {
  font-size: 10px;
  color: var(--ink-faint);
  letter-spacing: 0.16em;
  margin-bottom: var(--s-3);
}
.bn-value {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 42px;
  line-height: 1;
  color: var(--ink);
  margin-bottom: 6px;
  letter-spacing: -0.02em;
}
.bn-suffix {
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--ink-mute);
  font-weight: 400;
  margin-left: 6px;
  letter-spacing: 0;
}
.bn-sub {
  font-size: 10px;
  color: var(--ink-mute);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* KPI 行 */
.kpi-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0;
  border: 1px solid var(--rule);
  background: #FFFFFF;
  margin-bottom: var(--s-5);
}
.kpi-card {
  padding: var(--s-4) var(--s-5);
  border-right: 1px solid var(--rule);
}
.kpi-card:last-child { border-right: none; }
.kpi-eyebrow {
  font-size: 10px;
  color: var(--ink-faint);
  letter-spacing: 0.16em;
  margin-bottom: var(--s-2);
}
.kpi-value {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 24px;
  line-height: 1.1;
  color: var(--ink);
  margin-bottom: 4px;
  letter-spacing: -0.01em;
}
.kpi-suffix {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-mute);
  font-weight: 400;
  margin-left: 4px;
  letter-spacing: 0;
}
.kpi-sub {
  font-size: 10px;
  color: var(--ink-mute);
  letter-spacing: 0.06em;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.kpi-sub .ok { color: var(--positive); }

/* 双列 */
.row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  border: 1px solid var(--rule);
  background: #FFFFFF;
  margin-bottom: var(--s-5);
}
.panel { padding: var(--s-5); border-right: 1px solid var(--rule); }
.panel:last-child { border-right: none; }
@media (max-width: 900px) {
  .row-2 { grid-template-columns: 1fr; }
  .panel { border-right: none; border-bottom: 1px solid var(--rule); }
  .panel:last-child { border-bottom: none; }
  .big-numbers, .kpi-row { grid-template-columns: 1fr 1fr; }
}

.section-head {
  display: flex;
  align-items: baseline;
  gap: var(--s-3);
  margin-bottom: var(--s-4);
  padding-bottom: var(--s-3);
  border-bottom: 1px solid var(--ink);
}
.section-num { font-size: 11px; color: var(--ink-faint); letter-spacing: 0.12em; }
.section-title {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 18px;
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

/* 排名列表 */
.rank-list { list-style: none; padding: 0; margin: 0; }
.rank-item {
  display: grid;
  grid-template-columns: 30px 1fr auto;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-3) 0;
  border-bottom: 1px solid var(--rule-soft);
}
.rank-item:last-child { border-bottom: none; }
.rank-num { font-size: 11px; color: var(--ink-faint); letter-spacing: 0.08em; }
.rank-name {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 14px;
  color: var(--ink);
  margin-bottom: 2px;
}
.rank-meta { font-size: 10px; color: var(--ink-mute); letter-spacing: 0.06em; }
.rank-count {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--accent);
  font-weight: 500;
}

.empty-inline {
  text-align: center;
  padding: var(--s-5);
  color: var(--ink-mute);
  font-family: var(--font-display);
  font-style: italic;
  font-size: 14px;
}

/* 最近下载表 */
.recent-table { display: flex; flex-direction: column; }
.recent-row {
  display: grid;
  grid-template-columns: 30px 100px 1fr 130px 170px;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-3) 0;
  border-bottom: 1px solid var(--rule-soft);
  font-size: 12px;
}
.recent-row:last-child { border-bottom: none; }
.recent-num { font-size: 11px; color: var(--ink-faint); letter-spacing: 0.08em; }
.recent-user { color: var(--ink); font-weight: 500; }
.recent-file { color: var(--ink-mute); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.recent-ip { color: var(--ink-mute); font-size: 11px; letter-spacing: 0.04em; }
.recent-time { color: var(--ink-faint); font-size: 11px; letter-spacing: 0.04em; }
</style>
