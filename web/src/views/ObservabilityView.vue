<template>
  <div class="obs">
    <!-- 开发期令牌：可观测性接口需鉴权；生产由登录流程下发，此处仅用于本地联调 -->
    <section class="card">
      <h2 class="card-title">访问令牌（开发/QA）</h2>
      <div class="row">
        <input
          v-model="token"
          class="input wide"
          type="text"
          placeholder="粘贴 Bearer 令牌（本地联调用，存于浏览器 localStorage）"
        />
        <button class="btn" @click="saveToken">保存令牌</button>
        <button class="btn ghost" @click="clearToken">清除</button>
      </div>
      <p class="hint">提示：登录后从 /api/auth/login 响应中取 accessToken 填入；未填则接口返回 401。</p>
    </section>

    <!-- 选项卡 -->
    <div class="tabs">
      <button class="tab" :class="{ active: tab === 'audit' }" @click="switchTab('audit')">审计日志</button>
      <button class="tab" :class="{ active: tab === 'recycle' }" @click="switchTab('recycle')">回收站</button>
    </div>

    <!-- 审计日志 -->
    <section v-if="tab === 'audit'" class="card">
      <h2 class="card-title">审计日志（AuditEvent）</h2>
      <div class="filters">
        <input v-model="audit.objectType" class="input" type="text" placeholder="对象类型（如 Topic）" />
        <input v-model="audit.action" class="input" type="text" placeholder="操作（create/update/delete…）" />
        <input v-model="audit.userId" class="input" type="text" placeholder="用户 ID" />
        <input v-model="audit.from" class="input" type="date" title="起始日期" />
        <input v-model="audit.to" class="input" type="date" title="结束日期" />
        <button class="btn primary" :disabled="loading" @click="loadAudit(1)">查询</button>
      </div>

      <div v-if="auditError" class="message err">{{ auditError }}</div>

      <table v-if="auditResult.items.length" class="tbl">
        <thead>
          <tr>
            <th>时间</th>
            <th>用户</th>
            <th>对象类型</th>
            <th>对象 ID</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in auditResult.items" :key="row.id">
            <td class="mono">{{ fmt(row.at) }}</td>
            <td class="mono">{{ row.userId ?? '—' }}</td>
            <td>{{ row.objectType }}</td>
            <td class="mono">{{ short(row.objectId) }}</td>
            <td><span class="action" :class="actionClass(row.action)">{{ row.action }}</span></td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="!auditError" class="empty">暂无审计记录（待 PG 环境联调，或当前筛选无命中）。</p>

      <div v-if="auditResult.total > 0" class="pager">
        <button class="btn ghost" :disabled="auditResult.page <= 1 || loading" @click="loadAudit(auditResult.page - 1)">上一页</button>
        <span class="hint">第 {{ auditResult.page }} 页 / 共 {{ Math.ceil(auditResult.total / auditResult.pageSize) }} 页（{{ auditResult.total }} 条）</span>
        <button class="btn ghost" :disabled="auditResult.page * auditResult.pageSize >= auditResult.total || loading" @click="loadAudit(auditResult.page + 1)">下一页</button>
      </div>
    </section>

    <!-- 回收站 -->
    <section v-else class="card">
      <h2 class="card-title">回收站（软删记录 + 恢复入口）</h2>
      <div class="filters">
        <select v-model="recycleType" class="input" @change="loadRecycle">
          <option value="">全部类型</option>
          <option v-for="t in recycleTypes" :key="t.key" :value="t.key">{{ t.label }}</option>
        </select>
        <button class="btn primary" :disabled="loading" @click="loadRecycle">刷新</button>
      </div>

      <div v-if="recycleError" class="message err">{{ recycleError }}</div>

      <table v-if="recycleItems.length" class="tbl">
        <thead>
          <tr>
            <th>类型</th>
            <th>名称</th>
            <th>删除时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in recycleItems" :key="row.type + ':' + row.id">
            <td>{{ row.typeLabel }}</td>
            <td>{{ row.name || '—' }}</td>
            <td class="mono">{{ fmt(row.deletedAt) }}</td>
            <td>
              <button class="btn primary sm" :disabled="restoring.has(row.id)" @click="restore(row)">
                {{ restoring.has(row.id) ? '恢复中…' : '恢复' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="!recycleError" class="empty">回收站为空（待 PG 环境联调，或当前无软删记录）。</p>
    </section>

    <p v-if="message" class="message" :class="messageType">{{ message }}</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import {
  fetchAuditLog,
  fetchRecycleBin,
  restoreRecycleItem,
  type AuditLogResult,
  type RecycleItem,
  type RecycleResult,
} from '../api/http';

const token = ref<string>(localStorage.getItem('wb_token') ?? '');
const tab = ref<'audit' | 'recycle'>('audit');
const loading = ref(false);
const message = ref('');
const messageType = ref<'ok' | 'err'>('ok');

function saveToken() {
  localStorage.setItem('wb_token', token.value.trim());
  flash('令牌已保存到本地（仅本浏览器）', 'ok');
}
function clearToken() {
  localStorage.removeItem('wb_token');
  token.value = '';
  flash('令牌已清除', 'ok');
}
function flash(msg: string, type: 'ok' | 'err') {
  message.value = msg;
  messageType.value = type;
}
function fmt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { hour12: false });
}
function short(s: string): string {
  return s.length > 10 ? `${s.slice(0, 8)}…` : s;
}
function actionClass(a: string): string {
  if (a.startsWith('delete')) return 'del';
  if (a === 'update' || a === 'update_many') return 'upd';
  return 'cre';
}

// ---- 审计日志 ----
const audit = reactive({ objectType: '', action: '', userId: '', from: '', to: '' });
const auditResult = reactive<AuditLogResult>({ items: [], total: 0, page: 1, pageSize: 20 });
const auditError = ref('');

async function loadAudit(page = 1) {
  loading.value = true;
  auditError.value = '';
  message.value = '';
  try {
    const res = await fetchAuditLog({
      objectType: audit.objectType || undefined,
      action: audit.action || undefined,
      userId: audit.userId || undefined,
      from: audit.from ? `${audit.from}T00:00:00Z` : undefined,
      to: audit.to ? `${audit.to}T23:59:59Z` : undefined,
      page,
      pageSize: 20,
    });
    auditResult.items = res.items;
    auditResult.total = res.total;
    auditResult.page = res.page;
    auditResult.pageSize = res.pageSize;
  } catch (e) {
    auditError.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

// ---- 回收站 ----
const recycleType = ref('');
const recycleItems = ref<RecycleItem[]>([]);
const recycleTypes = ref<{ key: string; label: string }[]>([]);
const recycleError = ref('');
const restoring = reactive(new Set<string>());

async function loadRecycle() {
  loading.value = true;
  recycleError.value = '';
  message.value = '';
  try {
    const res: RecycleResult = await fetchRecycleBin(recycleType.value || undefined);
    recycleItems.value = res.items;
    recycleTypes.value = res.types;
  } catch (e) {
    recycleError.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

async function restore(row: RecycleItem) {
  restoring.add(row.id);
  message.value = '';
  try {
    await restoreRecycleItem(row.type, row.id);
    recycleItems.value = recycleItems.value.filter((r) => r.id !== row.id);
    flash(`已恢复：${row.typeLabel}（${row.name || row.id}）`, 'ok');
  } catch (e) {
    flash(`恢复失败：${(e as Error).message}`, 'err');
  } finally {
    restoring.delete(row.id);
  }
}

function switchTab(next: 'audit' | 'recycle') {
  tab.value = next;
  if (next === 'audit' && auditResult.items.length === 0 && !auditError.value) loadAudit(1);
  if (next === 'recycle' && recycleItems.value.length === 0 && !recycleError.value) loadRecycle();
}

onMounted(() => {
  loadAudit(1);
});
</script>

<style scoped>
.obs {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.card {
  background: var(--panel, #1e2030);
  border: 1px solid var(--border, #2a2c3a);
  border-radius: 10px;
  padding: 16px 18px;
}
.card-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 12px;
  color: var(--text, #e6e8ef);
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.filters {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.input {
  background: var(--input, #15161f);
  border: 1px solid var(--border, #2a2c3a);
  color: var(--text, #e6e8ef);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 13px;
  outline: none;
}
.input:focus {
  border-color: var(--brand, #4f8cff);
}
.input.wide {
  flex: 1;
  min-width: 260px;
}
.hint {
  font-size: 12px;
  color: var(--side-text, #9aa3b2);
  margin: 6px 0 0;
}
.btn {
  background: var(--panel, #1e2030);
  border: 1px solid var(--border, #2a2c3a);
  color: var(--text, #e6e8ef);
  border-radius: 6px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 13px;
}
.btn:hover {
  border-color: var(--brand, #4f8cff);
}
.btn.primary {
  background: var(--brand, #4f8cff);
  color: var(--brand-ink, #fff);
  border-color: transparent;
}
.btn.ghost {
  background: transparent;
}
.btn.sm {
  padding: 5px 10px;
  font-size: 12px;
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.tabs {
  display: flex;
  gap: 8px;
}
.tab {
  background: var(--panel, #1e2030);
  border: 1px solid var(--border, #2a2c3a);
  color: var(--side-text, #9aa3b2);
  border-radius: 8px 8px 0 0;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
}
.tab.active {
  background: var(--brand, #4f8cff);
  color: var(--brand-ink, #fff);
  border-color: transparent;
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.tbl th,
.tbl td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border, #2a2c3a);
  color: var(--text, #e6e8ef);
}
.tbl th {
  color: var(--side-text, #9aa3b2);
  font-weight: 600;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: var(--side-text, #9aa3b2);
}
.action {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
}
.action.cre {
  background: rgba(79, 140, 255, 0.16);
  color: #7fb0ff;
}
.action.upd {
  background: rgba(255, 170, 70, 0.16);
  color: #ffba6b;
}
.action.del {
  background: rgba(255, 90, 90, 0.16);
  color: #ff9b9b;
}
.empty {
  font-size: 13px;
  color: var(--side-text, #9aa3b2);
  padding: 12px 0;
}
.pager {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}
.message {
  font-size: 13px;
  padding: 10px 12px;
  border-radius: 8px;
}
.message.ok {
  background: rgba(79, 140, 255, 0.12);
  color: #9fc1ff;
}
.message.err {
  background: rgba(255, 90, 90, 0.12);
  color: #ff9b9b;
}
</style>
