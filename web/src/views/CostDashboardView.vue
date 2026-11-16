<template>
  <div class="cost">
    <div class="block">
      <div class="head">
        <h2>成本与配额看板</h2>
        <span class="badge">T4.6</span>
      </div>
      <p class="desc">
        基于生成运行（GenerationRun）的花费 / 耗时 / 模型 / 阶段做汇总，并按各供应商模型配置的月度预算做配额预警。
        预算请在「系统管理 → AI 与密钥 → AI 模型供应商」为每个供应商模型填写 <code>月度预算</code>。
      </p>
    </div>

    <div class="tabs">
      <button
        v-for="p in periods"
        :key="p.key"
        type="button"
        class="tab"
        :class="{ active: period === p.key }"
        @click="period = p.key; load()"
      >
        {{ p.label }}
      </button>
      <div class="spacer" />
      <button class="btn" type="button" :disabled="loading" @click="load">刷新</button>
    </div>

    <div v-if="error" class="error">看板加载失败：{{ error }}</div>

    <div v-if="data" class="cards">
      <div class="card"><span class="k">总花费</span><span class="v">¥{{ fmtMoney(data.totals.totalCost) }}</span></div>
      <div class="card"><span class="k">生成次数</span><span class="v">{{ data.totals.totalRuns }}</span></div>
      <div class="card"><span class="k">成功率</span><span class="v up">{{ pct(data.totals.successRate) }}</span></div>
      <div class="card"><span class="k">平均时长</span><span class="v">{{ fmtDur(data.totals.avgDurationMs) }}</span></div>
      <div class="card"><span class="k">失败/取消</span><span class="v down">{{ data.totals.failedRuns }}/{{ data.totals.cancelledRuns }}</span></div>
    </div>

    <!-- 配额预警 -->
    <div v-if="data" class="block">
      <h3>配额预警（本月）</h3>
      <div v-if="data.quota.summary.anyExceeded" class="banner exceeded">⚠ 已有模型超出月度预算，请关注。</div>
      <div v-else-if="data.quota.summary.anyWarning" class="banner warning">⚠ 有模型已接近月度预算（≥80%）。</div>
      <div v-else-if="!data.quota.alerts.length" class="banner">未配置任何模型月度预算（在系统设置中为供应商模型填写「月度预算」后此处生效）。</div>

      <div v-if="data.quota.alerts.length" class="quota-grid">
        <div v-for="a in data.quota.alerts" :key="a.model" class="quota" :class="a.status">
          <div class="quota-top">
            <span class="quota-model">{{ a.model }}</span>
            <span class="quota-tag">{{ a.status === 'exceeded' ? '已超预算' : a.status === 'warning' ? '接近上限' : '正常' }}</span>
          </div>
          <div class="quota-sub">{{ a.provider }} · 已用 ¥{{ fmtMoney(a.spent) }} / 预算 ¥{{ fmtMoney(a.budget) }}</div>
          <div class="quota-bar"><div class="quota-fill" :style="{ width: barWidth(a.ratio) }" /></div>
          <div class="quota-ratio">{{ pct(a.ratio) }}</div>
        </div>
      </div>
      <div v-if="data.quota.summary.unconfiguredModels.length" class="hint">
        以下模型本月有花费但未配置预算：{{ data.quota.summary.unconfiguredModels.join('、') }}
      </div>
    </div>

    <!-- 按模型 -->
    <div v-if="data" class="block">
      <h3>按模型汇总</h3>
      <table class="grid">
        <thead>
          <tr>
            <th>模型</th><th class="num">次数</th><th class="num">成功</th><th class="num">失败</th>
            <th class="num">花费</th><th class="num">平均时长</th><th>占比</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in data.byModel" :key="m.model">
            <td class="lbl">{{ m.model }}</td>
            <td class="num">{{ m.runs }}</td>
            <td class="num up">{{ m.success }}</td>
            <td class="num down">{{ m.failed }}</td>
            <td class="num">¥{{ fmtMoney(m.totalCost) }}</td>
            <td class="num">{{ fmtDur(m.avgDurationMs) }}</td>
            <td>
              <div class="mini-bar"><div class="mini-fill" :style="{ width: modelPct(m.totalCost) }" /></div>
            </td>
          </tr>
          <tr v-if="!data.byModel.length"><td colspan="7" class="empty">暂无生成运行数据（待生产环境执行 AI 生成）</td></tr>
        </tbody>
      </table>
    </div>

    <!-- 按阶段 -->
    <div v-if="data" class="block">
      <h3>按阶段汇总</h3>
      <table class="grid">
        <thead>
          <tr><th>阶段</th><th class="num">次数</th><th class="num">成功</th><th class="num">失败</th><th class="num">花费</th><th class="num">平均时长</th></tr>
        </thead>
        <tbody>
          <tr v-for="s in data.byStage" :key="s.stage">
            <td class="lbl">{{ s.stage }}</td>
            <td class="num">{{ s.runs }}</td>
            <td class="num up">{{ s.success }}</td>
            <td class="num down">{{ s.failed }}</td>
            <td class="num">¥{{ fmtMoney(s.totalCost) }}</td>
            <td class="num">{{ fmtDur(s.avgDurationMs) }}</td>
          </tr>
          <tr v-if="!data.byStage.length"><td colspan="6" class="empty">暂无阶段数据</td></tr>
        </tbody>
      </table>
    </div>

    <!-- 日序列 -->
    <div v-if="data" class="block">
      <h3>每日花费趋势</h3>
      <div v-if="data.daily.length" class="chart">
        <div v-for="d in data.daily" :key="d.date" class="col" :title="`${d.date} · ¥${fmtMoney(d.totalCost)} · ${d.runs}次`">
          <div class="col-bar" :style="{ height: dayHeight(d.totalCost) }">
            <span class="col-val">{{ d.totalCost > 0 ? fmtMoney(d.totalCost) : '' }}</span>
          </div>
          <div class="col-date">{{ d.date.slice(5) }}</div>
        </div>
      </div>
      <div v-else class="hint">所选区间暂无数据。</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getCostOverview, type CostOverview, type CostPeriod } from '../api/http';

const periods: { key: CostPeriod; label: string }[] = [
  { key: '7d', label: '近 7 天' },
  { key: '30d', label: '近 30 天' },
  { key: 'thisMonth', label: '本月' },
  { key: 'all', label: '全部' },
];

const period = ref<CostPeriod>('30d');
const data = ref<CostOverview | null>(null);
const error = ref('');
const loading = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    data.value = await getCostOverview({ period: period.value });
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : String(e);
    data.value = null;
  } finally {
    loading.value = false;
  }
}

function fmtMoney(n: number): string {
  return (n ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pct(r: number): string {
  return `${Math.round((r ?? 0) * 100)}%`;
}
function fmtDur(ms: number): string {
  const n = ms ?? 0;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${n}ms`;
}
function barWidth(ratio: number): string {
  return `${Math.min(100, Math.round((ratio ?? 0) * 100))}%`;
}

const maxCost = ref(0);
function modelPct(cost: number): string {
  if (!maxCost.value) return '0%';
  return `${Math.min(100, Math.round((cost / maxCost.value) * 100))}%`;
}
function dayHeight(cost: number): string {
  if (!data.value || !data.value.daily.length) return '0%';
  const max = Math.max(1, ...data.value.daily.map((d) => d.totalCost));
  return `${Math.round((cost / max) * 100)}%`;
}

onMounted(async () => {
  await load();
  if (data.value) maxCost.value = data.value.byModel.reduce((m, x) => Math.max(m, x.totalCost), 0);
});
</script>

<style scoped>
.cost { padding: 0 0 40px; max-width: 1100px; margin: 0 auto; }
.block { margin-top: 22px; }
.head { display: flex; align-items: center; gap: 10px; }
.head h2 { font-size: 18px; margin: 0; color: var(--text); }
.badge { font-size: 12px; color: var(--muted); border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px; background: var(--panel-soft); }
.desc { color: var(--muted); font-size: 13px; line-height: 1.6; margin: 8px 0 0; }
.desc code { background: var(--panel-soft); padding: 1px 5px; border-radius: 4px; color: var(--text); }
h3 { font-size: 15px; margin: 0 0 10px; color: var(--text); }

.tabs { display: flex; align-items: center; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
.tab { background: var(--panel); color: var(--muted); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); padding: 5px 12px; cursor: pointer; font-size: 13px; }
.tab.active { background: var(--brand); color: var(--brand-ink); border-color: var(--brand); }
.spacer { flex: 1; }
.btn { background: var(--brand); color: var(--brand-ink); border: 1px solid var(--brand); border-radius: var(--radius-sm); padding: 6px 14px; cursor: pointer; font-size: 13px; }
.btn:disabled { opacity: 0.5; cursor: default; }

.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-top: 14px; }
.card { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; box-shadow: var(--shadow); }
.card .k { font-size: 12px; color: var(--muted); }
.card .v { font-size: 22px; font-weight: 600; color: var(--text); }
.up { color: var(--ok); }
.down { color: var(--danger); }

.error { background: var(--danger-soft); color: var(--danger); border: 1px solid #eec4bf; border-radius: var(--radius-sm); padding: 8px 12px; margin-top: 10px; font-size: 13px; }
.empty { text-align: center; color: var(--muted); padding: 14px; }
.hint { color: var(--muted); font-size: 12px; margin-top: 8px; }

.grid { width: 100%; border-collapse: collapse; font-size: 13px; }
.grid th, .grid td { border-bottom: 1px solid var(--border); padding: 8px 10px; text-align: left; color: var(--text); }
.grid th { color: var(--muted); font-weight: 600; background: var(--panel-soft); }
.grid .num { text-align: right; }
.grid .lbl { color: var(--text); }

.banner { border-radius: var(--radius-sm); padding: 8px 12px; font-size: 13px; margin-bottom: 10px; }
.banner.warning { background: var(--warn-soft); color: var(--warn); border: 1px solid #f0d3a6; }
.banner.exceeded { background: var(--danger-soft); color: var(--danger); border: 1px solid #eec4bf; }
.banner:not(.warning):not(.exceeded) { background: var(--panel-soft); color: var(--muted); border: 1px solid var(--border); }

.quota-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
.quota { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; }
.quota.ok { border-left: 3px solid var(--ok); }
.quota.warning { border-left: 3px solid #d19b00; }
.quota.exceeded { border-left: 3px solid var(--danger); }
.quota-top { display: flex; justify-content: space-between; align-items: center; }
.quota-model { font-weight: 600; color: var(--text); }
.quota-tag { font-size: 12px; padding: 1px 8px; border-radius: 10px; }
.quota.ok .quota-tag { background: var(--ok-soft); color: var(--ok); }
.quota.warning .quota-tag { background: var(--warn-soft); color: var(--warn); }
.quota.exceeded .quota-tag { background: var(--danger-soft); color: var(--danger); }
.quota-sub { font-size: 12px; color: var(--muted); margin: 6px 0 8px; }
.quota-bar { height: 8px; background: #e9edf3; border-radius: 4px; overflow: hidden; }
.quota-fill { height: 100%; background: linear-gradient(90deg, var(--brand), #55b98d); }
.quota.warning .quota-fill { background: linear-gradient(90deg, #c79a2e, #e9bb5c); }
.quota.exceeded .quota-fill { background: linear-gradient(90deg, #b03a3c, var(--danger)); }
.quota-ratio { text-align: right; font-size: 12px; color: var(--muted); margin-top: 4px; }

.mini-bar { height: 6px; background: #e9edf3; border-radius: 3px; overflow: hidden; min-width: 60px; }
.mini-fill { height: 100%; background: var(--brand); }

.chart { display: flex; align-items: flex-end; gap: 4px; height: 160px; padding: 8px 0; overflow-x: auto; }
.col { flex: 0 0 auto; width: 26px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
.col-bar { width: 18px; background: linear-gradient(180deg, #5b91f5, var(--brand)); border-radius: 3px 3px 0 0; position: relative; min-height: 2px; display: flex; align-items: flex-start; justify-content: center; }
.col-val { position: absolute; top: -16px; font-size: 9px; color: var(--muted); white-space: nowrap; }
.col-date { font-size: 9px; color: var(--muted); margin-top: 3px; transform: rotate(0deg); }
</style>
