<template>
  <div class="ac">
    <!-- 开发期令牌：与其它模块一致，所有账号接口均需 Bearer 令牌 -->
    <section class="card">
      <div class="row" style="justify-content: space-between">
        <h2 class="card-title" style="margin: 0">账号与策略</h2>
        <span class="hint">对应 PRD §4.6 / §6.2 · 后端 T1.7 / T2.5 已落地</span>
      </div>
      <div class="row token-row">
        <input
          v-model="token"
          class="input wide"
          type="text"
          placeholder="粘贴 Bearer 令牌（存于浏览器 localStorage，仅本地联调使用）"
        />
        <button class="btn" @click="saveToken">保存令牌</button>
        <button class="btn ghost" @click="clearToken">清除</button>
      </div>
      <p class="hint">登录后从 /api/auth/login 响应取 accessToken 填入；未填或过期时接口返回 401。</p>
    </section>

    <!-- 页签 -->
    <div class="tabs">
      <button
        v-for="t in tabs"
        :key="t.key"
        class="tab"
        :class="{ on: activeTab === t.key }"
        @click="activeTab = t.key"
      >
        {{ t.label }}
      </button>
    </div>

    <!-- ============ 自有账号 ============ -->
    <template v-if="activeTab === 'owned'">
      <section class="card">
        <div class="row" style="justify-content: space-between">
          <h2 class="card-title" style="margin: 0">自有账号（OwnedAccount）</h2>
          <div class="row">
            <select v-model="statusFilter" class="input sm">
              <option value="">全部状态</option>
              <option value="active">active · 运营中</option>
              <option value="paused">paused · 暂停</option>
              <option value="archived">archived · 归档</option>
            </select>
            <button class="btn" :disabled="accountsLoading" @click="loadOwnedAccounts">
              {{ accountsLoading ? '加载中…' : '刷新' }}
            </button>
          </div>
        </div>
        <p class="hint">按当前登录用户隔离；删除为软删，可在「可观测性 → 回收站」恢复。</p>
        <p v-if="accountsError" class="message err">{{ accountsError }}</p>
        <table v-if="filteredAccounts.length" class="tbl">
          <thead>
            <tr>
              <th>名称</th><th>平台</th><th>状态</th><th>默认策略</th><th>创建时间</th><th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in filteredAccounts" :key="a.id">
              <td>{{ a.name }}</td>
              <td><span class="pill">{{ a.platform }}</span></td>
              <td><span class="pill" :class="statusClass(a.status)">{{ statusLabel(a.status) }}</span></td>
              <td class="mono sm">{{ a.defaultStrategyVersionId ? a.defaultStrategyVersionId.slice(0, 8) : '—' }}</td>
              <td class="sm">{{ fmtDate(a.createdAt) }}</td>
              <td>
                <div class="row" style="gap: 6px; flex-wrap: nowrap">
                  <button class="btn ghost sm" @click="startEdit(a)">编辑</button>
                  <button class="btn ghost sm" @click="gotoStrategies(a.id)">策略</button>
                  <button class="btn ghost sm danger" :disabled="removingId === a.id" @click="removeOwned(a)">删除</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else-if="!accountsError && !accountsLoading" class="hint">暂无自有账号（或当前筛选无结果）。可在下方新建。</p>
      </section>

      <section class="card">
        <h2 class="card-title">{{ editingId ? '编辑自有账号' : '新建自有账号' }}</h2>
        <div class="form-grid">
          <div class="field">
            <label>名称 *</label>
            <input v-model="accountForm.name" class="input wide" maxlength="120" placeholder="如：主号·职场成长" />
          </div>
          <div class="field">
            <label>平台</label>
            <select v-model="accountForm.platform" class="input wide" disabled>
              <option value="wechat">wechat（首期）</option>
            </select>
          </div>
          <div class="field">
            <label>状态</label>
            <select v-model="accountForm.status" class="input wide">
              <option value="active">active · 运营中</option>
              <option value="paused">paused · 暂停</option>
              <option value="archived">archived · 归档</option>
            </select>
          </div>
        </div>
        <div class="form-grid">
          <div class="field"><label>定位 position（JSON 对象）</label><textarea v-model="accountForm.position" class="input mono area" rows="3" placeholder='{ "人设": "…", "标签": ["…"] }'></textarea></div>
          <div class="field"><label>受众 audience（JSON 对象）</label><textarea v-model="accountForm.audience" class="input mono area" rows="3" placeholder='{ "年龄段": "…", "痛点": ["…"] }'></textarea></div>
          <div class="field" style="grid-column: 1 / -1"><label>栏目规划 columns（JSON 对象）</label><textarea v-model="accountForm.columns" class="input mono area" rows="2" placeholder='{ "常规栏目": ["…"] }'></textarea></div>
        </div>
        <div class="row">
          <button class="btn primary" :disabled="savingAccount" @click="saveOwnedAccount">
            {{ savingAccount ? '保存中…' : editingId ? '保存修改' : '创建账号' }}
          </button>
          <button v-if="editingId" class="btn ghost" @click="resetAccountForm">取消编辑</button>
          <span class="hint">JSON 字段留空按空对象提交；格式不合法会明确报错，不会静默丢弃。</span>
        </div>
      </section>
    </template>

    <!-- ============ 策略版本 ============ -->
    <template v-else-if="activeTab === 'strategy'">
      <section class="card">
        <div class="row" style="justify-content: space-between">
          <h2 class="card-title" style="margin: 0">策略版本（AccountStrategy）</h2>
          <div class="row">
            <select v-model="strategyAccountId" class="input wide" @change="onStrategyAccountChange">
              <option value="">— 选择自有账号 —</option>
              <option v-for="a in ownedAccounts" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
            <button class="btn" :disabled="strategyLoading || !strategyAccountId" @click="loadStrategies">
              {{ strategyLoading ? '加载中…' : '刷新' }}
            </button>
            <button class="btn primary" :disabled="creatingStrategy || !strategyAccountId" @click="createBlankStrategy">
              {{ creatingStrategy ? '创建中…' : '新建版本' }}
            </button>
          </div>
        </div>
        <p class="hint">账号级汇总（对标分析页）会产出草稿版本；此处可手动新建、编辑七字段卡、设为账号默认或解绑。默认策略会被内容项目（T3.2）继承。</p>
        <p v-if="strategyError" class="message err">{{ strategyError }}</p>
        <table v-if="strategies.length" class="tbl">
          <thead>
            <tr><th>版本</th><th>状态</th><th>账号默认</th><th>来源拆解</th><th>更新时间</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="s in strategies" :key="s.id">
              <td class="mono sm">v{{ s.version }}</td>
              <td><span class="pill" :class="s.status === 'active' ? 'ok' : ''">{{ s.status }}</span></td>
              <td><span v-if="s.isDefault" class="pill ok">已绑定 · 默认</span><span v-else class="pill">—</span></td>
              <td class="sm">{{ (s.sourceAnalysisIds || []).length }}</td>
              <td class="sm">{{ fmtDate(s.updatedAt) }}</td>
              <td>
                <div class="row" style="gap: 6px; flex-wrap: nowrap">
                  <button class="btn ghost sm" @click="openStrategy(s)">编辑</button>
                  <button v-if="!s.isDefault" class="btn ghost sm" :disabled="binding" @click="bindAsDefault(s)">设为默认</button>
                  <button v-else class="btn ghost sm" :disabled="binding" @click="unbindStrategy">解绑</button>
                  <button class="btn ghost sm danger" :disabled="deletingStrategyId === s.id" @click="removeStrategy(s)">删除</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else-if="!strategyError && !strategyLoading" class="hint">该账号暂无策略版本，可点「新建版本」手动创建，或在对标分析页跑一次账号级汇总。</p>
      </section>

      <section v-if="activeStrategy" class="card">
        <div class="row" style="justify-content: space-between">
          <h2 class="card-title" style="margin: 0">编辑策略 v{{ activeStrategy.version }} · 七字段卡</h2>
          <button class="btn ghost sm" @click="activeStrategy = null">关闭</button>
        </div>
        <div class="form-grid">
          <div class="field"><label>状态</label>
            <select v-model="stratEdits.status" class="input wide">
              <option value="draft">draft · 草稿</option>
              <option value="active">active · 启用</option>
              <option value="archived">archived · 归档</option>
            </select>
          </div>
          <div class="field"><label>定位 position（JSON 对象）</label><textarea v-model="stratEdits.position" class="input mono area" rows="3"></textarea></div>
          <div class="field"><label>受众 audience（JSON 对象）</label><textarea v-model="stratEdits.audience" class="input mono area" rows="3"></textarea></div>
          <div class="field"><label>栏目支柱 pillars（JSON 数组）</label><textarea v-model="stratEdits.pillars" class="input mono area" rows="2"></textarea></div>
          <div class="field"><label>标题偏好 titlePref（JSON 对象）</label><textarea v-model="stratEdits.titlePref" class="input mono area" rows="2"></textarea></div>
          <div class="field"><label>结构范式 structure（文本或 JSON）</label><textarea v-model="stratEdits.structure" class="input mono area" rows="2"></textarea></div>
          <div class="field"><label>调性 tone（JSON 对象）</label><textarea v-model="stratEdits.tone" class="input mono area" rows="2"></textarea></div>
          <div class="field"><label>边界 boundaries（JSON 数组）</label><textarea v-model="stratEdits.boundaries" class="input mono area" rows="2"></textarea></div>
        </div>
        <div class="row">
          <button class="btn primary" :disabled="savingStrategy" @click="saveStrategy">
            {{ savingStrategy ? '保存中…' : '保存修改' }}
          </button>
          <span class="hint">仅 PATCH 字段卡；来源拆解由账号级汇总写入，不在手工编辑范围。</span>
        </div>
      </section>
    </template>

    <!-- ============ 对标账号概览 ============ -->
    <template v-else>
      <section class="card">
        <div class="row" style="justify-content: space-between">
          <h2 class="card-title" style="margin: 0">对标账号（ReferenceAccount）概览</h2>
          <button class="btn" :disabled="referenceLoading" @click="loadReferenceAccounts">
            {{ referenceLoading ? '加载中…' : '刷新' }}
          </button>
        </div>
        <p class="hint">全局参考账号，不属于某个用户。新建、批量导入、素材收集与单篇拆解请到「对标分析」页操作，此处仅作账号总览，避免两处重复维护。</p>
        <p v-if="referenceError" class="message err">{{ referenceError }}</p>
        <table v-if="referenceAccounts.length" class="tbl">
          <thead><tr><th>名称</th><th>平台</th><th>主页</th><th>领域</th><th>备注</th></tr></thead>
          <tbody>
            <tr v-for="r in referenceAccounts" :key="r.id">
              <td>{{ r.name }}</td>
              <td><span class="pill">{{ r.platform }}</span></td>
              <td class="mono sm">{{ r.homepageUrl || '—' }}</td>
              <td class="sm">{{ r.domain || '—' }}</td>
              <td class="sm">{{ r.note || '—' }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else-if="!referenceError && !referenceLoading" class="hint">暂无对标账号。前往「对标分析」页新建或批量导入。</p>
      </section>
    </template>

    <p v-if="message" class="message" :class="messageType">{{ message }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import {
  listOwnedAccounts,
  getOwnedAccount,
  createOwnedAccount,
  updateOwnedAccount,
  deleteOwnedAccount,
  listStrategies,
  getStrategy,
  updateStrategy,
  createStrategy,
  deleteStrategy,
  bindStrategy,
  fetchReferenceAccounts,
  type OwnedAccountItem,
  type OwnedAccountStatus,
  type StrategyItem,
  type ReferenceAccount,
} from '../api/http';

type TabKey = 'owned' | 'strategy' | 'reference';
const tabs: { key: TabKey; label: string }[] = [
  { key: 'owned', label: '自有账号' },
  { key: 'strategy', label: '策略版本' },
  { key: 'reference', label: '对标账号概览' },
];
const activeTab = ref<TabKey>('owned');

const token = ref<string>(localStorage.getItem('wb_token') ?? '');
const message = ref('');
const messageType = ref<'ok' | 'err'>('ok');

function flash(msg: string, type: 'ok' | 'err' = 'ok') {
  message.value = msg;
  messageType.value = type;
}
function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
function saveToken() {
  localStorage.setItem('wb_token', token.value.trim());
  flash('令牌已保存到本地（仅本浏览器）');
}
function clearToken() {
  localStorage.removeItem('wb_token');
  token.value = '';
  flash('令牌已清除');
}

function fmtDate(v?: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}
function pretty(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
function statusLabel(s: string): string {
  return { active: '运营中', paused: '暂停', archived: '归档' }[s] ?? s;
}
function statusClass(s: string): string {
  return s === 'active' ? 'ok' : s === 'archived' ? 'warn' : '';
}

/**
 * 严格解析 JSON 字段：空串视为空对象/空数组，非法 JSON 直接抛错（不静默吞掉脏输入）。
 * kind=object 要求非数组对象；kind=array 要求数组；kind=any 允许任意合法 JSON 值或纯文本。
 */
function parseJsonField<T = unknown>(
  raw: string,
  label: string,
  kind: 'object' | 'array' | 'any',
): T {
  const text = raw.trim();
  if (!text) return (kind === 'array' ? [] : kind === 'object' ? {} : '') as T;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    if (kind === 'any') return text as T; // structure 允许纯文本
    throw new Error(`「${label}」不是合法 JSON，请检查引号与逗号`);
  }
  if (kind === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`「${label}」应为 JSON 对象`);
    }
    return value as T;
  }
  if (kind === 'array') {
    if (!Array.isArray(value)) throw new Error(`「${label}」应为 JSON 数组`);
    return value as T;
  }
  return value as T;
}

// ---------- 自有账号 ----------
const ownedAccounts = ref<OwnedAccountItem[]>([]);
const accountsLoading = ref(false);
const accountsError = ref('');
const statusFilter = ref('');
const filteredAccounts = computed(() =>
  statusFilter.value
    ? ownedAccounts.value.filter((a) => a.status === statusFilter.value)
    : ownedAccounts.value,
);

const editingId = ref('');
const savingAccount = ref(false);
const removingId = ref('');
const accountForm = reactive({
  name: '',
  platform: 'wechat' as const,
  status: 'active' as OwnedAccountStatus,
  position: '',
  audience: '',
  columns: '',
});

function resetAccountForm() {
  editingId.value = '';
  accountForm.name = '';
  accountForm.platform = 'wechat';
  accountForm.status = 'active';
  accountForm.position = '';
  accountForm.audience = '';
  accountForm.columns = '';
}

async function loadOwnedAccounts() {
  accountsLoading.value = true;
  accountsError.value = '';
  try {
    ownedAccounts.value = await listOwnedAccounts();
  } catch (e) {
    accountsError.value = errMsg(e);
  } finally {
    accountsLoading.value = false;
  }
}

async function startEdit(a: OwnedAccountItem) {
  try {
    // 列表已含详情字段，但编辑前取一次最新记录，避免并发覆盖他人改动
    const full = await getOwnedAccount(a.id);
    editingId.value = full.id;
    accountForm.name = full.name;
    accountForm.platform = 'wechat';
    accountForm.status = (full.status as OwnedAccountStatus) ?? 'active';
    accountForm.position = pretty(full.position);
    accountForm.audience = pretty(full.audience);
    accountForm.columns = pretty(full.columns);
    flash(`正在编辑「${full.name}」`);
  } catch (e) {
    flash(errMsg(e), 'err');
  }
}

async function saveOwnedAccount() {
  if (!accountForm.name.trim()) {
    flash('请填写账号名称', 'err');
    return;
  }
  let dto;
  try {
    dto = {
      name: accountForm.name.trim(),
      platform: accountForm.platform,
      status: accountForm.status,
      position: parseJsonField<Record<string, unknown>>(accountForm.position, '定位 position', 'object'),
      audience: parseJsonField<Record<string, unknown>>(accountForm.audience, '受众 audience', 'object'),
      columns: parseJsonField<Record<string, unknown>>(accountForm.columns, '栏目规划 columns', 'object'),
    };
  } catch (e) {
    flash(errMsg(e), 'err');
    return;
  }
  savingAccount.value = true;
  try {
    if (editingId.value) {
      await updateOwnedAccount(editingId.value, dto);
      flash('自有账号已更新');
    } else {
      await createOwnedAccount(dto);
      flash('自有账号已创建');
    }
    resetAccountForm();
    await loadOwnedAccounts();
  } catch (e) {
    flash(errMsg(e), 'err');
  } finally {
    savingAccount.value = false;
  }
}

async function removeOwned(a: OwnedAccountItem) {
  if (!confirm(`确认删除自有账号「${a.name}」？（软删，可在回收站恢复）`)) return;
  removingId.value = a.id;
  try {
    await deleteOwnedAccount(a.id);
    flash(`已删除「${a.name}」`);
    if (editingId.value === a.id) resetAccountForm();
    if (strategyAccountId.value === a.id) {
      strategyAccountId.value = '';
      strategies.value = [];
      activeStrategy.value = null;
    }
    await loadOwnedAccounts();
  } catch (e) {
    flash(errMsg(e), 'err');
  } finally {
    removingId.value = '';
  }
}

// ---------- 策略版本 ----------
const strategyAccountId = ref('');
const strategies = ref<StrategyItem[]>([]);
const strategyLoading = ref(false);
const strategyError = ref('');
const creatingStrategy = ref(false);
const binding = ref(false);
const deletingStrategyId = ref('');
const savingStrategy = ref(false);
const activeStrategy = ref<StrategyItem | null>(null);
const stratEdits = reactive({
  status: 'draft',
  position: '',
  audience: '',
  pillars: '',
  titlePref: '',
  structure: '',
  tone: '',
  boundaries: '',
});

function gotoStrategies(accountId: string) {
  strategyAccountId.value = accountId;
  activeTab.value = 'strategy';
  void loadStrategies();
}
function onStrategyAccountChange() {
  activeStrategy.value = null;
  strategies.value = [];
  strategyError.value = '';
  if (strategyAccountId.value) void loadStrategies();
}

async function loadStrategies() {
  if (!strategyAccountId.value) {
    strategies.value = [];
    return;
  }
  strategyLoading.value = true;
  strategyError.value = '';
  try {
    strategies.value = await listStrategies(strategyAccountId.value);
  } catch (e) {
    strategyError.value = errMsg(e);
  } finally {
    strategyLoading.value = false;
  }
}

async function createBlankStrategy() {
  if (!strategyAccountId.value) return;
  creatingStrategy.value = true;
  try {
    const created = await createStrategy({
      ownedAccountId: strategyAccountId.value,
      status: 'draft',
      position: {},
      audience: {},
      pillars: [],
      titlePref: {},
      structure: '',
      tone: {},
      boundaries: [],
      sourceAnalysisIds: [],
    });
    flash(`已创建策略 v${created.version}（草稿）`);
    await loadStrategies();
  } catch (e) {
    flash(errMsg(e), 'err');
  } finally {
    creatingStrategy.value = false;
  }
}

async function openStrategy(s: StrategyItem) {
  try {
    const full = await getStrategy(s.id);
    activeStrategy.value = full;
    stratEdits.status = full.status || 'draft';
    stratEdits.position = pretty(full.position);
    stratEdits.audience = pretty(full.audience);
    stratEdits.pillars = pretty(full.pillars);
    stratEdits.titlePref = pretty(full.titlePref);
    stratEdits.structure = pretty(full.structure);
    stratEdits.tone = pretty(full.tone);
    stratEdits.boundaries = pretty(full.boundaries);
  } catch (e) {
    flash(errMsg(e), 'err');
  }
}

async function saveStrategy() {
  if (!activeStrategy.value) return;
  let dto;
  try {
    dto = {
      status: stratEdits.status,
      position: parseJsonField<Record<string, unknown>>(stratEdits.position, '定位 position', 'object'),
      audience: parseJsonField<Record<string, unknown>>(stratEdits.audience, '受众 audience', 'object'),
      pillars: parseJsonField<unknown[]>(stratEdits.pillars, '栏目支柱 pillars', 'array'),
      titlePref: parseJsonField<Record<string, unknown>>(stratEdits.titlePref, '标题偏好 titlePref', 'object'),
      structure: parseJsonField<unknown>(stratEdits.structure, '结构范式 structure', 'any'),
      tone: parseJsonField<Record<string, unknown>>(stratEdits.tone, '调性 tone', 'object'),
      boundaries: parseJsonField<unknown[]>(stratEdits.boundaries, '边界 boundaries', 'array'),
    };
  } catch (e) {
    flash(errMsg(e), 'err');
    return;
  }
  savingStrategy.value = true;
  try {
    const updated = await updateStrategy(activeStrategy.value.id, dto);
    flash(`策略 v${updated.version} 已保存`);
    activeStrategy.value = null;
    await loadStrategies();
  } catch (e) {
    flash(errMsg(e), 'err');
  } finally {
    savingStrategy.value = false;
  }
}

async function bindAsDefault(s: StrategyItem) {
  if (!strategyAccountId.value) return;
  binding.value = true;
  try {
    await bindStrategy(strategyAccountId.value, s.id);
    flash(`已将策略 v${s.version} 绑定为账号默认`);
    await Promise.all([loadStrategies(), loadOwnedAccounts()]);
  } catch (e) {
    flash(errMsg(e), 'err');
  } finally {
    binding.value = false;
  }
}

async function unbindStrategy() {
  if (!strategyAccountId.value) return;
  binding.value = true;
  try {
    await bindStrategy(strategyAccountId.value, null);
    flash('已解除账号默认策略绑定');
    await Promise.all([loadStrategies(), loadOwnedAccounts()]);
  } catch (e) {
    flash(errMsg(e), 'err');
  } finally {
    binding.value = false;
  }
}

async function removeStrategy(s: StrategyItem) {
  if (!confirm(`确认删除策略 v${s.version}？（软删；若为默认会同时清空账号绑定）`)) return;
  deletingStrategyId.value = s.id;
  try {
    await deleteStrategy(s.id);
    flash(`策略 v${s.version} 已删除`);
    if (activeStrategy.value?.id === s.id) activeStrategy.value = null;
    await Promise.all([loadStrategies(), loadOwnedAccounts()]);
  } catch (e) {
    flash(errMsg(e), 'err');
  } finally {
    deletingStrategyId.value = '';
  }
}

// ---------- 对标账号概览（只读）----------
const referenceAccounts = ref<ReferenceAccount[]>([]);
const referenceLoading = ref(false);
const referenceError = ref('');

async function loadReferenceAccounts() {
  referenceLoading.value = true;
  referenceError.value = '';
  try {
    referenceAccounts.value = await fetchReferenceAccounts();
  } catch (e) {
    referenceError.value = errMsg(e);
  } finally {
    referenceLoading.value = false;
  }
}

onMounted(() => {
  void loadOwnedAccounts();
  void loadReferenceAccounts();
});
</script>

<style scoped>
.ac {
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
.token-row {
  margin-top: 8px;
}
.tabs {
  display: flex;
  gap: 6px;
  border-bottom: 1px solid var(--border, #2a2c3a);
}
.tab {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--side-text, #9aa3b2);
  padding: 9px 16px;
  font-size: 13px;
  cursor: pointer;
}
.tab:hover {
  color: var(--text, #e6e8ef);
}
.tab.on {
  color: var(--brand, #4f8cff);
  border-bottom-color: var(--brand, #4f8cff);
  font-weight: 600;
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
.input:disabled {
  opacity: 0.65;
}
.input.wide {
  flex: 1;
  min-width: 220px;
}
.input.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.input.area {
  width: 100%;
  resize: vertical;
}
.input.sm {
  padding: 5px 8px;
  font-size: 12px;
  min-width: 130px;
}
select.input {
  min-width: 140px;
}
.field {
  margin-bottom: 12px;
}
.field label {
  display: block;
  font-size: 12px;
  color: var(--side-text, #9aa3b2);
  margin-bottom: 6px;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
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
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.btn.ghost {
  background: transparent;
}
.btn.sm {
  padding: 4px 8px;
  font-size: 12px;
}
.btn.danger:hover {
  border-color: #ff6b6b;
  color: #ff9b9b;
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
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
.sm {
  font-size: 12px;
  color: var(--side-text, #9aa3b2);
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  background: var(--border, #2a2c3a);
  color: var(--side-text, #9aa3b2);
}
.pill.ok {
  background: rgba(79, 140, 255, 0.16);
  color: #7fb0ff;
}
.pill.warn {
  background: rgba(255, 170, 70, 0.16);
  color: #ffba6b;
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
