<template>
  <div class="ov">
    <header class="ov-head">
      <div>
        <h1 class="ov-title">业务总览</h1>
        <p class="ov-sub">选题、生产、发布与复盘的关键数据，一屏掌握内容流水线的推进情况。</p>
      </div>
      <div class="ov-head-actions">
        <span v-if="data" class="ov-time">更新于 {{ formatTime(data.generatedAt) }}</span>
        <button class="btn" type="button" :disabled="loading" @click="load">
          {{ loading ? '刷新中…' : '刷新数据' }}
        </button>
      </div>
    </header>

    <p v-if="error" class="ov-alert">数据加载失败：{{ error }}</p>
    <p v-else-if="data && !data.available" class="ov-alert">
      业务数据暂时不可用，请稍后重试；服务状态可到「系统管理 → 版本与运维」查看。
    </p>

    <!-- 核心 KPI -->
    <div class="ov-kpis">
      <div class="ov-kpi card">
        <span class="ov-kpi-label">选题库</span>
        <strong class="ov-kpi-value">{{ n(data?.topics.total) }}</strong>
        <span class="ov-kpi-foot">本周新增 <b>{{ n(data?.topics.thisWeek) }}</b> 条</span>
      </div>
      <div class="ov-kpi card">
        <span class="ov-kpi-label">标题候选</span>
        <strong class="ov-kpi-value">{{ n(data?.titles.total) }}</strong>
        <span class="ov-kpi-foot">已选用 <b>{{ n(data?.titles.selected) }}</b> 条</span>
      </div>
      <div class="ov-kpi card">
        <span class="ov-kpi-label">内容项目</span>
        <strong class="ov-kpi-value">{{ n(data?.projects.total) }}</strong>
        <span class="ov-kpi-foot">进行中 <b>{{ n(data?.projects.inProgress) }}</b> 个</span>
      </div>
      <div class="ov-kpi card">
        <span class="ov-kpi-label">待审核</span>
        <strong class="ov-kpi-value ov-accent">{{ n(data?.projects.pendingReview) }}</strong>
        <span class="ov-kpi-foot">需要人工确认的项目</span>
      </div>
      <div class="ov-kpi card">
        <span class="ov-kpi-label">已发布</span>
        <strong class="ov-kpi-value ov-good">{{ n(data?.projects.published) }}</strong>
        <span class="ov-kpi-foot">累计完成发布</span>
      </div>
      <div class="ov-kpi card">
        <span class="ov-kpi-label">本月 AI 成本</span>
        <strong class="ov-kpi-value">¥{{ cost(data?.generation.monthCost) }}</strong>
        <span class="ov-kpi-foot">{{ n(data?.generation.monthRuns) }} 次生成 · 成功率 {{ n(data?.generation.successRate) }}%</span>
      </div>
    </div>

    <div class="ov-cols">
      <!-- 项目进度分布 -->
      <section class="card ov-panel">
        <div class="ov-panel-head">
          <h2>内容项目进度</h2>
          <router-link class="ov-link" to="/content">查看全部 →</router-link>
        </div>
        <p class="ov-panel-desc">按项目当前状态统计，帮助判断瓶颈集中在创作还是审核环节。</p>
        <div v-if="statusRows.length" class="ov-bars">
          <div v-for="row in statusRows" :key="row.key" class="ov-bar-row">
            <span class="ov-bar-label">{{ row.label }}</span>
            <div class="ov-bar-track">
              <div class="ov-bar-fill" :style="{ width: row.width + '%', background: row.color }"></div>
            </div>
            <span class="ov-bar-num">{{ row.count }}</span>
          </div>
        </div>
        <p v-else class="ov-empty">暂无内容项目，从「选题雷达」或「内容项目」开始创建第一篇。</p>
      </section>

      <!-- 最近选题简报 -->
      <section class="card ov-panel">
        <div class="ov-panel-head">
          <h2>最近选题简报</h2>
          <router-link class="ov-link" to="/radar">前往雷达 →</router-link>
        </div>
        <template v-if="data?.radar">
          <div class="ov-radar">
            <span class="ov-radar-date">{{ data.radar.runDate }}</span>
            <span class="pill" :class="radarOk ? 'pill-ok' : 'pill-warn'">{{ radarStatusText }}</span>
          </div>
          <div class="ov-radar-stats">
            <div><strong>{{ n(data.radar.itemCount) }}</strong><span>采集条目</span></div>
            <div><strong>{{ n(data.radar.featuredCount) }}</strong><span>精选推荐</span></div>
          </div>
          <p class="ov-panel-desc">最新一轮采集已完成，可在选题雷达中一键转为选题或调整数据源。</p>
        </template>
        <p v-else class="ov-empty">还没有采集记录。到「选题雷达」配置数据源并运行一次采集即可生成简报。</p>
      </section>
    </div>

    <div class="ov-cols">
      <!-- 运营待办 -->
      <section class="card ov-panel">
        <div class="ov-panel-head">
          <h2>运营待办</h2>
        </div>
        <div class="ov-todo">
          <router-link class="ov-todo-item" to="/launch">
            <span>起号计划待办任务</span><strong>{{ n(data?.planner.pendingTasks) }}</strong>
          </router-link>
          <router-link class="ov-todo-item" to="/system/ops">
            <span>队列中的任务</span><strong>{{ n(data?.queue.queued) }}</strong>
          </router-link>
          <router-link class="ov-todo-item" to="/metrics">
            <span>近 30 天效果记录</span><strong>{{ n(data?.metrics.last30Days) }}</strong>
          </router-link>
          <router-link class="ov-todo-item" to="/account">
            <span>已配置自有账号</span><strong>{{ n(data?.accounts) }}</strong>
          </router-link>
        </div>
      </section>

      <!-- 快捷入口 -->
      <section class="card ov-panel">
        <div class="ov-panel-head">
          <h2>常用入口</h2>
          <router-link class="ov-link" to="/system/guide">使用教程 →</router-link>
        </div>
        <p class="ov-panel-desc">按内容生产流程排列，第一次使用建议先看使用教程完成基础配置。</p>
        <div class="ov-shortcuts">
          <router-link v-for="s in shortcuts" :key="s.to" class="ov-shortcut" :to="s.to">
            <span class="ov-shortcut-icon">{{ s.icon }}</span>
            <span class="ov-shortcut-text"><b>{{ s.label }}</b><small>{{ s.desc }}</small></span>
          </router-link>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { fetchBusinessOverview, type BusinessOverview } from '../api/http';

const data = ref<BusinessOverview | null>(null);
const error = ref('');
const loading = ref(false);

const STATUS_LABELS: Record<string, string> = {
  TOPIC_SELECTING: '选题待定',
  PENDING_CREATION: '待创作',
  CREATING: '创作中',
  PENDING_REVIEW: '待审核',
  NEEDS_REVISION: '需修改',
  APPROVED: '已通过',
  PUBLISHED: '已发布',
  ARCHIVED: '已归档',
};

const shortcuts = [
  { to: '/radar', icon: '⌖', label: '选题雷达', desc: '采集热点并生成每日简报' },
  { to: '/analysis', icon: '◎', label: '对标分析', desc: '拆解优质内容与账号策略' },
  { to: '/content', icon: '✎', label: '内容项目', desc: '起草、审核与版本留痕' },
  { to: '/calendar', icon: '▦', label: '内容日历', desc: '排期与发布节奏管理' },
  { to: '/metrics', icon: '▥', label: '效果看板', desc: '阅读、互动与复盘数据' },
  { to: '/system/guide', icon: '?', label: '使用教程', desc: '从配置到出稿的完整指引' },
];

const statusRows = computed(() => {
  const raw = data.value?.projects.byStatus ?? {};
  const total = data.value?.projects.total ?? 0;
  const palette = ['#2f6fed', '#5a8df6', '#7aa5f8', '#e0a63c', '#d97a45', '#3aa981', '#38a58a', '#9aa5b5'];
  return Object.entries(raw)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count], i) => ({
      key,
      label: STATUS_LABELS[key] ?? key,
      count,
      width: total ? Math.max(4, Math.round((count / total) * 100)) : 0,
      color: palette[i % palette.length],
    }));
});

const radarOk = computed(() => ['success', 'done', 'completed'].includes(String(data.value?.radar?.status ?? '')));
const radarStatusText = computed(() => (radarOk.value ? '已完成' : '进行中'));

function n(value: number | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

function cost(value: number | undefined): string {
  const v = n(value);
  return v.toFixed(2);
}

function formatTime(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('zh-CN', { hour12: false });
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    data.value = await fetchBusinessOverview();
  } catch (cause: unknown) {
    data.value = null;
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.ov {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 1480px;
}

.ov-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.ov-title {
  font-size: 22px;
  margin: 0 0 6px;
  color: var(--text);
}

.ov-sub {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.7;
}

.ov-head-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ov-time {
  color: var(--muted);
  font-size: 12px;
}

.ov-alert {
  margin: 0;
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--warn, #e0a63c);
  border-radius: var(--radius, 8px);
  background: var(--panel-soft);
  color: var(--text);
  font-size: 13px;
  line-height: 1.7;
}

.ov-kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 14px;
}

.ov-kpi {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 122px;
}

.ov-kpi-label {
  color: var(--muted);
  font-size: 12px;
  letter-spacing: 0.02em;
}

.ov-kpi-value {
  font-size: 28px;
  line-height: 1.1;
  color: var(--text);
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.ov-kpi-value.ov-accent {
  color: #c47a1f;
}

.ov-kpi-value.ov-good {
  color: #2f8f6b;
}

.ov-kpi-foot {
  color: var(--muted);
  font-size: 12px;
  margin-top: auto;
}

.ov-kpi-foot b {
  color: var(--text);
  font-weight: 600;
}

.ov-cols {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 16px;
}

.ov-panel {
  min-width: 0;
}

.ov-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}

.ov-panel-head h2 {
  font-size: 16px;
  margin: 0;
  color: var(--text);
}

.ov-link {
  color: var(--brand);
  font-size: 12px;
  text-decoration: none;
  white-space: nowrap;
}

.ov-link:hover {
  text-decoration: underline;
}

.ov-panel-desc {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.7;
  margin: 0 0 16px;
}

.ov-empty {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.8;
  background: var(--panel-soft);
  border: 1px dashed var(--border);
  border-radius: 8px;
  padding: 18px;
  margin: 8px 0 0;
}

.ov-bars {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ov-bar-row {
  display: grid;
  grid-template-columns: 76px 1fr 34px;
  align-items: center;
  gap: 12px;
  font-size: 12px;
}

.ov-bar-label {
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ov-bar-track {
  height: 9px;
  background: var(--panel-soft);
  border-radius: 99px;
  overflow: hidden;
}

.ov-bar-fill {
  height: 100%;
  border-radius: 99px;
  transition: width 0.35s ease;
}

.ov-bar-num {
  text-align: right;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.ov-radar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 4px 0 14px;
}

.ov-radar-date {
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.pill-ok {
  background: var(--ok-soft) !important;
  color: #2f8f6b !important;
}

.pill-warn {
  background: #fdf3e2 !important;
  color: #a06a13 !important;
}

.ov-radar-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}

.ov-radar-stats > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-soft);
}

.ov-radar-stats strong {
  font-size: 22px;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.ov-radar-stats span {
  font-size: 12px;
  color: var(--muted);
}

.ov-todo {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ov-todo-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-soft);
  color: var(--text);
  font-size: 13px;
  text-decoration: none;
  transition: border-color 0.15s ease, transform 0.15s ease;
}

.ov-todo-item:hover {
  border-color: var(--brand);
  transform: translateX(2px);
}

.ov-todo-item strong {
  font-size: 16px;
  font-variant-numeric: tabular-nums;
  color: var(--brand);
}

.ov-shortcuts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 10px;
}

.ov-shortcut {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-soft);
  text-decoration: none;
  color: var(--text);
  transition: border-color 0.15s ease;
}

.ov-shortcut:hover {
  border-color: var(--brand);
}

.ov-shortcut-icon {
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  background: var(--brand-soft);
  color: var(--brand);
  font-size: 15px;
}

.ov-shortcut-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ov-shortcut-text b {
  font-size: 13px;
}

.ov-shortcut-text small {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 780px) {
  .ov-cols {
    grid-template-columns: 1fr;
  }
}
</style>
