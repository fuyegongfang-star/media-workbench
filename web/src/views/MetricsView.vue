<template>
  <div class="metrics">
    <div class="block">
      <div class="head">
        <h2>发布后效果数据回收</h2>
        <span class="badge">T3.10</span>
      </div>
      <p class="desc">
        回收已发布文章的效果指标（阅读/分享/收藏/在看/涨粉/取关）。可手动录入，或配置公众号资质后由
        <code>METRICS_AUTO_PULL=1</code> 定时拉取 <code>getuserread/getarticleread/getusersummary</code>。
      </p>
    </div>

    <div class="tabs">
      <button
        v-for="d in dimensions"
        :key="d.key"
        type="button"
        class="tab"
        :class="{ active: dimension === d.key }"
        @click="dimension = d.key; loadDashboard()"
      >
        {{ d.label }}
      </button>
      <div class="spacer" />
      <button class="btn pull" type="button" :disabled="pulling" @click="pull">
        {{ pulling ? '拉取中…' : '触发微信拉取' }}
      </button>
    </div>

    <div v-if="dashError" class="error">看板加载失败：{{ dashError }}</div>

    <div v-if="dashboard" class="cards">
      <div class="card"><span class="k">阅读</span><span class="v">{{ dashboard.totals.readCount }}</span></div>
      <div class="card"><span class="k">分享</span><span class="v">{{ dashboard.totals.shareCount }}</span></div>
      <div class="card"><span class="k">收藏</span><span class="v">{{ dashboard.totals.favoriteCount }}</span></div>
      <div class="card"><span class="k">在看</span><span class="v">{{ dashboard.totals.likeCount }}</span></div>
      <div class="card"><span class="k">涨粉</span><span class="v up">{{ dashboard.totals.followerIncrease }}</span></div>
      <div class="card"><span class="k">取关</span><span class="v down">{{ dashboard.totals.unfollowCount }}</span></div>
    </div>

    <div v-if="dashboard" class="block">
      <h3>按{{ dimensionLabel }}维度对比</h3>
      <table class="grid">
        <thead>
          <tr>
            <th>{{ dimensionLabel }}</th>
            <th class="num">阅读</th>
            <th class="num">分享</th>
            <th class="num">收藏</th>
            <th class="num">在看</th>
            <th class="num">涨粉</th>
            <th class="num">取关</th>
            <th class="num">样本</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in dashboard.rows" :key="r.key">
            <td class="lbl">{{ r.label }}</td>
            <td class="num">{{ r.readCount }}</td>
            <td class="num">{{ r.shareCount }}</td>
            <td class="num">{{ r.favoriteCount }}</td>
            <td class="num">{{ r.likeCount }}</td>
            <td class="num up">{{ r.followerIncrease }}</td>
            <td class="num down">{{ r.unfollowCount }}</td>
            <td class="num">{{ r.count }}</td>
          </tr>
          <tr v-if="!dashboard.rows.length"><td colspan="8" class="empty">暂无数据（待发布并回收指标）</td></tr>
        </tbody>
      </table>
    </div>

    <div class="block">
      <h3>明细（最近指标）</h3>
      <div class="filters">
        <input v-model="filters.ownedAccountId" class="inp" placeholder="账号ID（可选）" />
        <input v-model="filters.dateFrom" class="inp" type="date" />
        <input v-model="filters.dateTo" class="inp" type="date" />
        <button class="btn" type="button" :disabled="loading" @click="loadList">筛选</button>
      </div>
      <div v-if="listError" class="error">明细加载失败：{{ listError }}</div>
      <table class="grid">
        <thead>
          <tr>
            <th>日期</th><th>账号</th><th>选题</th><th>标题</th>
            <th class="num">阅读</th><th class="num">分享</th><th class="num">收藏</th>
            <th class="num">在看</th><th class="num">涨粉</th><th class="num">取关</th><th>来源</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in list.items" :key="m.id">
            <td>{{ m.metricDate }}</td>
            <td>{{ m.accountName ?? '—' }}</td>
            <td>{{ m.topicTitle ?? '—' }}</td>
            <td>{{ m.titleText ?? '—' }}</td>
            <td class="num">{{ m.readCount }}</td>
            <td class="num">{{ m.shareCount }}</td>
            <td class="num">{{ m.favoriteCount }}</td>
            <td class="num">{{ m.likeCount }}</td>
            <td class="num up">{{ m.followerIncrease }}</td>
            <td class="num down">{{ m.unfollowCount }}</td>
            <td><span class="src">{{ m.source }}</span></td>
          </tr>
          <tr v-if="!list.items.length"><td colspan="11" class="empty">暂无指标（可手动录入或拉取）</td></tr>
        </tbody>
      </table>
    </div>

    <div class="block">
      <h3>手动录入单条指标</h3>
      <div class="form">
        <select v-model="form.contentProjectId" class="inp" :disabled="projectsLoading">
          <option value="">选择内容项目…</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.title ?? p.id }}</option>
        </select>
        <input v-model="form.metricDate" class="inp" type="date" />
        <input v-model.number="form.readCount" class="inp num" type="number" min="0" placeholder="阅读" />
        <input v-model.number="form.shareCount" class="inp num" type="number" min="0" placeholder="分享" />
        <input v-model.number="form.favoriteCount" class="inp num" type="number" min="0" placeholder="收藏" />
        <input v-model.number="form.likeCount" class="inp num" type="number" min="0" placeholder="在看" />
        <input v-model.number="form.followerIncrease" class="inp num" type="number" min="0" placeholder="涨粉" />
        <input v-model.number="form.unfollowCount" class="inp num" type="number" min="0" placeholder="取关" />
        <button class="btn" type="button" :disabled="saving || !form.contentProjectId" @click="save">保存</button>
      </div>
      <div v-if="formMsg" class="hint" :class="formErr ? 'error' : ''">{{ formMsg }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import {
  createMetric,
  fetchMetricDashboard,
  fetchMetrics,
  fetchPublishedProjects,
  pullWechatMetrics,
  type MetricDashboard,
  type MetricListResult,
} from '../api/http';

const dimensions = [
  { key: 'account', label: '账号' },
  { key: 'topic', label: '选题' },
  { key: 'title', label: '标题' },
] as const;

const dimension = ref<'account' | 'title' | 'topic'>('account');
const dimensionLabel = computed(() => dimensions.find((d) => d.key === dimension.value)?.label ?? '账号');

const dashboard = ref<MetricDashboard | null>(null);
const dashError = ref('');
const list = reactive<MetricListResult>({ items: [], total: 0, page: 1, pageSize: 20 });
const listError = ref('');
const loading = ref(false);

const filters = reactive({ ownedAccountId: '', dateFrom: '', dateTo: '' });

const projects = ref<{ id: string; title: string | null }[]>([]);
const projectsLoading = ref(false);

const form = reactive({
  contentProjectId: '',
  metricDate: new Date().toISOString().slice(0, 10),
  readCount: undefined as number | undefined,
  shareCount: undefined as number | undefined,
  favoriteCount: undefined as number | undefined,
  likeCount: undefined as number | undefined,
  followerIncrease: undefined as number | undefined,
  unfollowCount: undefined as number | undefined,
});
const saving = ref(false);
const formMsg = ref('');
const formErr = ref(false);

const pulling = ref(false);

async function loadDashboard(): Promise<void> {
  dashError.value = '';
  try {
    const params: Record<string, string> = {};
    if (filters.ownedAccountId) params.ownedAccountId = filters.ownedAccountId;
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    dashboard.value = await fetchMetricDashboard(dimension.value, params);
  } catch (e: unknown) {
    dashError.value = e instanceof Error ? e.message : String(e);
    dashboard.value = null;
  }
}

async function loadList(): Promise<void> {
  loading.value = true;
  listError.value = '';
  try {
    const params: Record<string, string> = {};
    if (filters.ownedAccountId) params.ownedAccountId = filters.ownedAccountId;
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    const r = await fetchMetrics(params);
    list.items = r.items;
    list.total = r.total;
  } catch (e: unknown) {
    listError.value = e instanceof Error ? e.message : String(e);
    list.items = [];
  } finally {
    loading.value = false;
  }
}

async function loadProjects(): Promise<void> {
  projectsLoading.value = true;
  try {
    projects.value = await fetchPublishedProjects();
  } catch {
    projects.value = [];
  } finally {
    projectsLoading.value = false;
  }
}

async function save(): Promise<void> {
  saving.value = true;
  formMsg.value = '';
  formErr.value = false;
  try {
    await createMetric({
      contentProjectId: form.contentProjectId,
      metricDate: form.metricDate,
      readCount: form.readCount ?? 0,
      shareCount: form.shareCount ?? 0,
      favoriteCount: form.favoriteCount ?? 0,
      likeCount: form.likeCount ?? 0,
      followerIncrease: form.followerIncrease ?? 0,
      unfollowCount: form.unfollowCount ?? 0,
      source: 'manual',
    });
    formMsg.value = '已保存';
    await Promise.all([loadDashboard(), loadList()]);
  } catch (e: unknown) {
    formErr.value = true;
    formMsg.value = e instanceof Error ? e.message : String(e);
  } finally {
    saving.value = false;
  }
}

async function pull(): Promise<void> {
  pulling.value = true;
  try {
    const r = await pullWechatMetrics(7);
    formMsg.value = `拉取完成：${r.note}`;
    formErr.value = false;
    await Promise.all([loadDashboard(), loadList()]);
  } catch (e: unknown) {
    formErr.value = true;
    formMsg.value = e instanceof Error ? e.message : String(e);
  } finally {
    pulling.value = false;
  }
}

onMounted(() => {
  void loadDashboard();
  void loadList();
  void loadProjects();
});
</script>

<style scoped>
.metrics { display: flex; flex-direction: column; gap: 16px; }
.block { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; }
.head { display: flex; align-items: center; gap: 10px; }
h2 { font-size: 16px; margin: 0; }
.badge { font-size: 11px; background: var(--brand); color: var(--brand-ink); padding: 1px 8px; border-radius: 999px; }
.desc { color: var(--muted); line-height: 1.7; margin: 8px 0 0; }
h3 { font-size: 14px; margin: 0 0 10px; }
.tabs { display: flex; align-items: center; gap: 8px; }
.tab { background: var(--panel); border: 1px solid var(--border); color: var(--side-text); border-radius: 6px; padding: 6px 14px; cursor: pointer; }
.tab.active { background: var(--brand); color: var(--brand-ink); border-color: var(--brand); }
.spacer { flex: 1; }
.btn { background: var(--brand); color: var(--brand-ink); border: 0; border-radius: 6px; padding: 7px 14px; cursor: pointer; }
.btn:disabled { opacity: 0.6; cursor: default; }
.btn.pull { background: transparent; color: var(--brand); border: 1px solid var(--brand); }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 10px; }
.card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 4px; }
.card .k { color: var(--muted); font-size: 12px; }
.card .v { font-size: 22px; font-weight: 700; }
.v.up, .num.up { color: #2f9e44; }
.v.down, .num.down { color: #e03131; }
.grid { width: 100%; border-collapse: collapse; font-size: 13px; }
.grid th, .grid td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); }
.grid th.num, .grid td.num { text-align: right; font-variant-numeric: tabular-nums; }
.grid td.lbl { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.grid .empty { text-align: center; color: var(--muted); padding: 18px; }
.src { font-size: 11px; color: var(--muted); }
.filters, .form { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.inp { background: var(--panel); border: 1px solid var(--border); color: var(--side-text); border-radius: 6px; padding: 7px 10px; min-width: 140px; }
.inp.num { max-width: 90px; }
.error { color: var(--warn); margin-top: 8px; }
.hint { color: var(--muted); margin-top: 8px; font-size: 12px; }
</style>
