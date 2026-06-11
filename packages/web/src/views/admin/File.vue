<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as api from '@/api/file';
import type { FileItem } from '@/api/file';
import { listAdminCategories, type Category } from '@/api/category';

const items = ref<FileItem[]>([]);
const categories = ref<Category[]>([]);
const loading = ref(false);
const uploading = ref(false);
const uploadPercent = ref(0);
const uploadLoadedMB = ref(0);
const uploadTotalMB = ref(0);
const uploadSpeedMbps = ref(0);
const uploadEta = ref('--');
const dialogVisible = ref(false);
const uploadForm = ref<{ category_id: number | null; version: string; remark: string; files: File[] }>({
  category_id: null,
  version: '',
  remark: '',
  files: [],
});
const editDialogVisible = ref(false);
const editing = ref<FileItem | null>(null);
const editForm = ref({ version: '', remark: '', status: 'latest' as 'latest' | 'history' | 'hidden' });
const searchQuery = ref('');

let abortCtrl: AbortController | null = null;
let uploadStartTime = 0;

async function fetchData() {
  loading.value = true;
  try {
    const [files, cats] = await Promise.all([
      api.listAdminFiles(searchQuery.value || undefined),
      listAdminCategories(),
    ]);
    items.value = files.items;
    categories.value = cats.items;
  } finally {
    loading.value = false;
  }
}

function resetUploadProgress() {
  uploadPercent.value = 0;
  uploadLoadedMB.value = 0;
  uploadTotalMB.value = 0;
  uploadSpeedMbps.value = 0;
  uploadEta.value = '--';
  uploadStartTime = 0;
}

function openUploadDialog() {
  uploadForm.value = { category_id: categories.value[0]?.id ?? null, version: '', remark: '', files: [] };
  resetUploadProgress();
  dialogVisible.value = true;
}

function onUploadDialogOpen() {
  document.addEventListener('drop', blockFileDrop, true);
  document.addEventListener('dragover', blockFileDrop, true);
}

function onUploadDialogClosed() {
  document.removeEventListener('drop', blockFileDrop, true);
  document.removeEventListener('dragover', blockFileDrop, true);
}

function blockFileDrop(e: DragEvent) {
  if (e.dataTransfer?.types?.includes('Files')) {
    e.preventDefault();
  }
}

function beforeUpload(file: File): boolean {
  const ext = api.getFileExt(file.name);
  if (!ext) {
    ElMessage.error(`文件缺少扩展名,仅支持: ${api.ALLOWED_EXTS.join(', ')}`);
    return false;
  }
  if (!(api.ALLOWED_EXTS as readonly string[]).includes(ext)) {
    ElMessage.error(`不支持的扩展名 .${ext},仅支持: ${api.ALLOWED_EXTS.join(', ')}`);
    return false;
  }
  const maxBytes = api.MAX_UPLOAD_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    ElMessage.error(`文件过大 (${api.formatSize(file.size)}),最大 ${api.MAX_UPLOAD_MB}MB`);
    return false;
  }
  return true;
}

/**
 * el-upload 的 on-change 钩子:把内部 fileList 里的 raw File 同步到 uploadForm.value.files。
 * 多文件场景下,add/remove 都要正确合并/移除,不能用 onChange 单独 add 覆盖整个数组。
 */
function onChange(uploadFile: { status?: string; raw?: File | null; uid?: number }): void {
  if (uploadFile.status === 'ready' && uploadFile.raw) {
    // 同一 uid 不重复 push(el-upload 在 before-upload=false 时仍会触发 on-change)
    if (!uploadForm.value.files.some((f) => (f as File & { uid?: number }).uid === uploadFile.uid)) {
      uploadForm.value.files = [...uploadForm.value.files, uploadFile.raw];
    }
  } else if (uploadFile.status === 'remove') {
    uploadForm.value.files = uploadForm.value.files.filter(
      (f) => (f as File & { uid?: number }).uid !== uploadFile.uid
    );
  }
}

function errMsg(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--';
  if (seconds < 60) return `${Math.ceil(seconds)} 秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分 ${Math.ceil(seconds % 60)} 秒`;
  const h = Math.floor(seconds / 3600);
  const m = Math.ceil((seconds % 3600) / 60);
  return `${h} 时 ${m} 分`;
}

async function onUpload() {
  if (!uploadForm.value.category_id) {
    ElMessage.warning('请选择分类');
    return;
  }
  const files = uploadForm.value.files;
  if (files.length === 0) {
    ElMessage.warning('请先选择文件');
    return;
  }
  abortCtrl = new AbortController();
  uploadStartTime = Date.now();
  uploading.value = true;
  try {
    const res = await api.uploadFiles(
      uploadForm.value.category_id,
      files,
      uploadForm.value.version,
      uploadForm.value.remark,
      {
        signal: abortCtrl.signal,
        onProgress: ({ loaded, total }) => {
          uploadLoadedMB.value = loaded / 1024 / 1024;
          uploadTotalMB.value = total / 1024 / 1024;
          uploadPercent.value = Math.round((loaded / total) * 100);
          const elapsed = (Date.now() - uploadStartTime) / 1000;
          if (elapsed > 0.5) {
            uploadSpeedMbps.value = uploadLoadedMB.value / elapsed;
            const remaining = total - loaded;
            if (uploadSpeedMbps.value > 0) {
              uploadEta.value = formatTime(remaining / 1024 / 1024 / uploadSpeedMbps.value);
            }
          }
        },
      }
    );
    const n = res.files.length;
    const msg = n === 1
      ? `上传成功:${res.files[0].filename}`
      : `上传成功:共 ${n} 个文件${res.demoted > 0 ? `,${res.demoted} 个旧版本已自动转为历史` : ''}`;
    ElMessage.success(msg);
    dialogVisible.value = false;
    await fetchData();
  } catch (e) {
    if (e instanceof api.UploadCancelledError) ElMessage.info('已取消上传');
    else { ElMessage.error(`上传失败:${errMsg(e, '请稍后重试')}`); console.error('[upload]', e); }
  } finally {
    uploading.value = false;
    abortCtrl = null;
    resetUploadProgress();
  }
}

function handleUploadDialogClose(done: () => void) {
  if (!uploading.value) { done(); return; }
  ElMessageBox.confirm('正在上传,确认取消?', '提示', { type: 'warning' })
    .then(() => { abortCtrl?.abort(); done(); })
    .catch(() => {});
}

function openEdit(f: FileItem) {
  editing.value = f;
  editForm.value = { version: f.version ?? '', remark: f.remark ?? '', status: f.status };
  editDialogVisible.value = true;
}

async function onEditSave() {
  if (!editing.value) return;
  try {
    await api.updateFile(editing.value.id, {
      version: editForm.value.version || null,
      remark: editForm.value.remark || null,
      status: editForm.value.status,
    });
    ElMessage.success('已保存');
    editDialogVisible.value = false;
    await fetchData();
  } catch (e) { ElMessage.error(`保存失败:${errMsg(e, '请稍后重试')}`); console.error('[updateFile]', e); }
}

async function onDelete(f: FileItem) {
  try {
    await ElMessageBox.confirm(`确认删除「${f.filename}」?同时会删除物理文件。`, '提示', { type: 'warning' });
    await api.deleteFile(f.id);
    ElMessage.success('已删除');
    await fetchData();
  } catch (e) {
    if ((e as { type?: string }).type === 'cancel') return;
    ElMessage.error(`删除失败:${errMsg(e, '请稍后重试')}`); console.error('[deleteFile]', e);
  }
}

onMounted(fetchData);
</script>

<template>
  <div class="page-wrap">
    <header class="page-head">
      <div class="page-eyebrow mono">FILES · 文件管理</div>
      <h1 class="page-title">文件库</h1>
      <div class="page-actions">
        <input
          v-model="searchQuery"
          class="search-input"
          placeholder="搜索文件名 / 备注"
          @keyup.enter="fetchData"
        />
        <button class="btn-primary" @click="openUploadDialog">+ 上传文件</button>
      </div>
    </header>

    <el-table v-loading="loading" :data="items" border stripe>
      <el-table-column type="index" label="#" width="60" align="center">
        <template #default="{ $index }">
          <span class="mono" style="color: var(--ink-faint); font-size: 11px;">{{ String($index + 1).padStart(2, '0') }}</span>
        </template>
      </el-table-column>
      <el-table-column label="文件" min-width="240">
        <template #default="{ row }">
          <div class="file-name">{{ row.filename }}</div>
          <div class="file-sub mono">{{ row.category_name }} · v{{ row.version ?? '—' }} · {{ api.formatSize(row.size) }}</div>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <span :class="['tag', `tag-${row.status}`]">
            {{ row.status === 'latest' ? '最新' : row.status === 'history' ? '历史' : '已隐藏' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">
          <span style="color: var(--ink-mute); font-style: italic;">{{ row.remark || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="created_at" label="创建时间" width="170">
        <template #default="{ row }">
          <span class="mono" style="color: var(--ink-mute); font-size: 12px;">{{ row.created_at }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <button class="btn-link" @click="openEdit(row as FileItem)">编辑</button>
          <span class="dot">·</span>
          <button class="btn-link danger" @click="onDelete(row as FileItem)">删除</button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 上传对话框 -->
    <el-dialog v-model="dialogVisible" title="上传文件" width="500px" :close-on-click-modal="false" :show-close="!uploading" :before-close="handleUploadDialogClose" @open="onUploadDialogOpen" @closed="onUploadDialogClosed">
      <el-form label-width="80px">
        <el-form-item label="分类" required>
          <el-select v-model="uploadForm.category_id" placeholder="选择分类" style="width: 100%;">
            <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="版本">
          <el-input v-model="uploadForm.version" placeholder="如 1.0.0 (可选)" maxlength="64" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="uploadForm.remark" type="textarea" :rows="2" placeholder="更新说明/适用机型" maxlength="2000" />
        </el-form-item>
        <el-form-item label="文件" required>
          <!-- 必填提示:还没选时显示 -->
          <div v-if="uploadForm.files.length === 0" class="upload-required-hint mono">
            ↑ 必填 · 请拖入或点击下方区域选择文件(可多选) ↑
          </div>
          <!-- 选中后显示 -->
          <div v-else class="upload-selected-hint mono">
            <svg width="12" height="12" viewBox="0 0 12 12" style="vertical-align: -1px; margin-right: 4px;">
              <path d="M2 6.5L4.5 9L10 3" stroke="currentColor" stroke-width="2" fill="none" />
            </svg>
            已选择 <strong>{{ uploadForm.files.length }}</strong> 个文件
            <span v-if="uploadForm.files.length <= 3">
              · <span v-for="(f, i) in uploadForm.files" :key="i">{{ f.name }}<span v-if="i < uploadForm.files.length - 1">, </span></span>
            </span>
            · 合计 {{ api.formatSize(uploadForm.files.reduce((s, f) => s + f.size, 0)) }}
            <span class="muted-inline">· 系统已就绪,可点击下方"开始上传"</span>
          </div>
          <el-upload
            drag multiple :auto-upload="false"
            :before-upload="beforeUpload"
            :on-change="onChange"
            :disabled="uploading"
            :accept="api.ALLOWED_EXTS.map(e => '.' + e).join(',')"
          >
            <div class="upload-zone" :class="{ 'has-file': uploadForm.files.length > 0 }">
              <div class="upload-icon mono">{{ uploadForm.files.length > 0 ? '✓' : '↑' }}</div>
              <div class="upload-text">
                <template v-if="uploadForm.files.length > 0">
                  点击或继续拖入 <em>添加更多文件</em>
                </template>
                <template v-else>
                  拖文件到此处,或<em>点击选择</em>(可一次选多个)
                </template>
              </div>
              <div class="upload-hint mono">仅支持: {{ api.ALLOWED_EXTS.join(', ') }} · 单文件 ≤ {{ api.MAX_UPLOAD_MB }}MB · 单批建议 ≤ 50 个</div>
            </div>
          </el-upload>
        </el-form-item>
        <div v-if="uploading" class="upload-progress">
          <el-progress :percentage="uploadPercent" :stroke-width="3" />
          <div class="progress-detail mono">
            {{ uploadLoadedMB.toFixed(1) }} MB / {{ uploadTotalMB.toFixed(1) }} MB
            · {{ uploadSpeedMbps.toFixed(2) }} MB/s
            · 剩余 {{ uploadEta }}
          </div>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="handleUploadDialogClose(() => dialogVisible = false)">取消</el-button>
        <el-button
          type="primary"
          :loading="uploading"
          :disabled="uploadForm.files.length === 0"
          @click="onUpload"
        >
          {{ uploadForm.files.length === 0
            ? '请先选择文件'
            : uploadForm.files.length === 1
              ? '开始上传'
              : `开始上传 (${uploadForm.files.length} 个)` }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 编辑对话框 -->
    <el-dialog v-model="editDialogVisible" title="编辑文件" width="500px">
      <el-form label-width="80px" v-if="editing">
        <el-form-item label="文件名">
          <div class="mono" style="color: var(--ink-mute);">{{ editing.filename }}</div>
        </el-form-item>
        <el-form-item label="版本">
          <el-input v-model="editForm.version" maxlength="64" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="editForm.remark" type="textarea" :rows="3" maxlength="2000" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="editForm.status">
            <el-radio-button value="latest">最新</el-radio-button>
            <el-radio-button value="history">历史</el-radio-button>
            <el-radio-button value="hidden">隐藏</el-radio-button>
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
.page-actions { margin-left: auto; display: flex; gap: var(--s-3); align-items: center; }

.search-input {
  background: transparent;
  border: 1px solid var(--rule);
  padding: 8px 12px;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--ink);
  width: 220px;
  outline: none;
  transition: border-color var(--dur) var(--ease);
}
.search-input:focus { border-color: var(--ink); }

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

.file-name { font-family: var(--font-display); font-weight: 500; font-size: 15px; color: var(--ink); }
.file-sub { font-size: 11px; color: var(--ink-mute); letter-spacing: 0.04em; margin-top: 4px; }

.tag {
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 3px 8px;
  font-weight: 500;
}
.tag-latest { background: var(--accent); color: var(--paper); }
.tag-history { background: var(--paper-2); color: var(--ink-mute); border: 1px solid var(--rule); }
.tag-hidden { background: var(--negative-soft); color: var(--negative); }

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
.btn-link.danger:hover { color: var(--negative); text-decoration: underline; }
.dot { margin: 0 6px; color: var(--ink-faint); }

/* 上传区 */
.upload-required-hint {
  font-size: 11px;
  color: var(--warn);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-bottom: var(--s-2);
  padding: 6px 10px;
  background: var(--warn-soft);
  border-left: 2px solid var(--warn);
  text-align: center;
}
.upload-selected-hint {
  font-size: 12px;
  color: var(--positive);
  letter-spacing: 0.04em;
  margin-bottom: var(--s-2);
  padding: 8px 12px;
  background: var(--positive-soft);
  border-left: 2px solid var(--positive);
}
.upload-selected-hint strong { color: var(--ink); font-weight: 600; }
.muted-inline { color: var(--ink-mute); margin-left: 4px; }

.upload-zone { text-align: center; padding: var(--s-3); transition: all var(--dur) var(--ease); }
.upload-zone.has-file { background: var(--paper-2); }
.upload-icon {
  font-size: 32px;
  color: var(--ink-faint);
  margin-bottom: var(--s-2);
  transition: color var(--dur) var(--ease);
}
.upload-zone.has-file .upload-icon { color: var(--positive); }
.upload-text {
  font-size: 13px;
  color: var(--ink-mute);
  margin-bottom: 4px;
}
.upload-text em { color: var(--ink); font-style: normal; font-weight: 500; }
.upload-hint {
  font-size: 10px;
  color: var(--ink-faint);
  letter-spacing: 0.06em;
}

.upload-progress { margin-top: var(--s-4); padding: var(--s-3); background: var(--paper-2); }
.progress-detail {
  margin-top: var(--s-2);
  font-size: 11px;
  color: var(--ink-mute);
  letter-spacing: 0.04em;
}
</style>
