<template>
  <div class="cal">
    <!-- 令牌（与系统设置页共用 localStorage 'wb_token'；无令牌时接口返回 401） -->
    <div class="token-row">
      <label class="token-label">Bearer 令牌</label>
      <input
        class="token-input"
        type="password"
        placeholder="粘贴系统设置页的 Bearer 令牌（无则只读/401）"
        :value="token"
        @input="onTokenInput"
      />
      <span v-if="token" class="badge badge-ok">已装载</span>
      <span v-else class="badge">未设置</span>
    </div>

    <!-- 工具条：月份导航 + 视图切换 + 类型筛选 -->
    <div class="toolbar">
      <div class="nav-group">
        <button class="btn" type="button" @click="prevMonth">‹ 上月</button>
        <button class="btn" type="button" @click="goToday">今天</button>
        <button class="btn" type="button" @click="nextMonth">下月 ›</button>
        <span class="month-label">{{ monthLabel }}</span>
      </div>
      <div class="toolbar-right">
        <div class="kinds">
          <button
            v-for="k in kindList"
            :key="k"
            type="button"
            class="kind-chip"
            :class="['k-' + k, { off: !kindFilter[k] }]"
            @click="toggleKind(k)"
          >
            {{ CALENDAR_KIND_LABELS[k] }}
          </button>
        </div>
        <div class="view-toggle">
          <button class="btn" :class="{ active: viewMode === 'month' }" type="button" @click="viewMode = 'month'">月历</button>
          <button class="btn" :class="{ active: viewMode === 'agenda' }" type="button" @click="viewMode = 'agenda'">列表</button>
        </div>
        <button class="btn" type="button" :disabled="loading" @click="load">刷新</button>
      </div>
    </div>

    <p v-if="error" class="error">请求失败：{{ error }}</p>
    <p v-else-if="!loading && totalInView === 0" class="hint">
      当前范围内暂无排期项。为选题设置「计划日」、为内容项目设置「计划发布日」、为起号任务设置「计划日」后，将自动出现在日历中。
    </p>

    <!-- 月历视图 -->
    <div v-if="viewMode === 'month' && !error" class="month">
      <div class="weekdays">
        <span v-for="w in weekHeaders" :key="w" class="weekday">{{ w }}</span>
      </div>
      <div class="grid">
        <div
          v-for="cell in grid"
          :key="cell.key"
          class="cell"
          :class="{ out: !cell.inMonth, today: cell.isToday, drop: dragging }"
          @dragover.prevent
          @drop="onDrop($event, cell.key)"
        >
          <div class="cell-head">
            <span class="day-num">{{ cell.dayNum }}</span>
            <span v-if="cell.isToday" class="today-tag">今</span>
          </div>
          <div class="cell-items">
            <router-link
              v-for="it in (grouped[cell.key] || [])"
              :key="it.kind + it.id"
              class="chip"
              :class="'k-' + it.kind"
              :to="it.link"
              draggable="true"
              @dragstart="onDragStart($event, it)"
              @dragend="dragging = null"
              :title="`${CALENDAR_KIND_LABELS[it.kind]} · ${it.accountName || '未绑定账号'}`"
            >
              <span class="chip-kind">{{ CALENDAR_KIND_LABELS[it.kind] }}</span>
              <span class="chip-title">{{ it.title }}</span>
            </router-link>
          </div>
        </div>
      </div>
      <p class="dnd-hint">提示：拖拽某条目到其他日期即可改期（选题/标题/内容项目/起号任务）。</p>
    </div>

    <!-- 列表（日程）视图 -->
    <div v-else-if="viewMode === 'agenda' && !error" class="agenda">
      <div v-for="day in agendaDays" :key="day.key" class="agenda-day">
        <div class="agenda-date">
          <span class="d-num">{{ day.dayNum }}</span>
          <span class="d-week">{{ day.weekLabel }}</span>
          <span class="d-month">{{ day.monthLabel }}</span>
        </div>
        <router-link
          v-for="it in day.items"
          :key="it.kind + it.id"
          class="agenda-item"
          :class="'k-' + it.kind"
          :to="it.link"
          draggable="true"
          @dragstart="onDragStart($event, it)"
          @dragend="dragging = null"
        >
          <span class="chip-kind">{{ CALENDAR_KIND_LABELS[it.kind] }}</span>
          <span class="chip-title">{{ it.title }}</span>
          <span class="agenda-account">{{ it.accountName || '未绑定账号' }}</span>
        </router-link>
      </div>
    </div>

    <p v-if="loading" class="hint">加载中…</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  fetchCalendar,
  rescheduleCalendarItem,
  CALENDAR_KIND_LABELS,
  type CalendarItem,
  type CalendarKind,
} from '../api/http';

const TOKEN_KEY = 'wb_token';

const token = ref<string>(localStorage.getItem(TOKEN_KEY) || '');
function onTokenInput(e: Event) {
  const v = (e.target as HTMLInputElement).value.trim();
  token.value = v;
  if (v) localStorage.setItem(TOKEN_KEY, v);
  else localStorage.removeItem(TOKEN_KEY);
  load();
}

const kindList: CalendarKind[] = ['topic', 'title', 'content', 'launch'];
const kindFilter = ref<Record<CalendarKind, boolean>>({
  topic: true,
  title: true,
  content: true,
  launch: true,
});
function toggleKind(k: CalendarKind) {
  kindFilter.value[k] = !kindFilter.value[k];
}

// 视图月份（默认当前月）
const now = new Date();
const viewYear = ref(now.getFullYear());
const viewMonth = ref(now.getMonth()); // 0-based
const monthLabel = computed(() => `${viewYear.value} 年 ${viewMonth.value + 1} 月`);

const weekHeaders = ['一', '二', '三', '四', '五', '六', '日'];

// 构建 6×7 网格（周一起始）
interface Cell {
  key: string;
  dayNum: number;
  inMonth: boolean;
  isToday: boolean;
}
function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function keyOf(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}
function buildGrid(): Cell[] {
  const first = new Date(viewYear.value, viewMonth.value, 1);
  const startOffset = (first.getDay() + 6) % 7; // 周一为 0
  const start = new Date(viewYear.value, viewMonth.value, 1 - startOffset);
  const todayKey = keyOf(now.getFullYear(), now.getMonth(), now.getDate());
  const cells: Cell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const inMonth = d.getMonth() === viewMonth.value && d.getFullYear() === viewYear.value;
    cells.push({
      key: keyOf(d.getFullYear(), d.getMonth(), d.getDate()),
      dayNum: d.getDate(),
      inMonth,
      isToday: d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate() && todayKey === keyOf(d.getFullYear(), d.getMonth(), d.getDate()),
    });
  }
  return cells;
}
const grid = ref<Cell[]>(buildGrid());

// 原始条目 + 客户端类型过滤
const items = ref<CalendarItem[]>([]);
const loading = ref(false);
const error = ref('');
const viewMode = ref<'month' | 'agenda'>('month');
const dragging = ref<CalendarItem | null>(null);

function filtered(): CalendarItem[] {
  return items.value.filter((it) => kindFilter.value[it.kind]);
}

const grouped = computed<Record<string, CalendarItem[]>>(() => {
  const map: Record<string, CalendarItem[]> = {};
  for (const it of filtered()) {
    (map[it.date] ??= []).push(it);
  }
  return map;
});

const totalInView = computed(() => filtered().length);

// 列表视图：按日期排序的日组
const agendaDays = computed(() => {
  const keys = Object.keys(grouped.value).sort();
  return keys.map((k) => {
    const [y, m, d] = k.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    const weekNames = ['日', '一', '二', '三', '四', '五', '六'];
    return {
      key: k,
      dayNum: d,
      monthLabel: `${m} 月`,
      weekLabel: `周${weekNames[dt.getDay()]}`,
      items: grouped.value[k],
    };
  });
});

function prevMonth() {
  if (viewMonth.value === 0) {
    viewMonth.value = 11;
    viewYear.value -= 1;
  } else {
    viewMonth.value -= 1;
  }
  grid.value = buildGrid();
  load();
}
function nextMonth() {
  if (viewMonth.value === 11) {
    viewMonth.value = 0;
    viewYear.value += 1;
  } else {
    viewMonth.value += 1;
  }
  grid.value = buildGrid();
  load();
}
function goToday() {
  viewYear.value = now.getFullYear();
  viewMonth.value = now.getMonth();
  grid.value = buildGrid();
  load();
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  const g = grid.value;
  const from = g[0].key;
  const to = g[g.length - 1].key;
  try {
    const res = await fetchCalendar({ from, to });
    items.value = res.items;
  } catch (cause: unknown) {
    error.value = cause instanceof Error ? cause.message : String(cause);
    items.value = [];
  } finally {
    loading.value = false;
  }
}

function onDragStart(e: DragEvent, it: CalendarItem) {
  dragging.value = it;
  e.dataTransfer?.setData('text/plain', JSON.stringify({ kind: it.kind, id: it.id }));
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}

async function onDrop(e: DragEvent, dayKey: string): Promise<void> {
  e.preventDefault();
  const it = dragging.value;
  dragging.value = null;
  if (!it) return;
  if (it.date === dayKey) return; // 同日期无需变更
  loading.value = true;
  error.value = '';
  try {
    await rescheduleCalendarItem(it.kind, it.id, dayKey);
    // 本地乐观更新锚点，避免整页闪烁
    it.date = dayKey;
    // 重新拉取以确保跨月/越界一致
    await load();
  } catch (cause: unknown) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch([viewYear, viewMonth], () => {
  /* 已在导航函数内触发 load */
});
</script>

<style scoped>
.cal {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.token-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.token-label {
  font-size: 13px;
  color: var(--muted);
  white-space: nowrap;
}

.token-input {
  flex: 0 1 420px;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  color: var(--text);
  font-size: 13px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.nav-group,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.month-label {
  font-weight: 600;
  margin-left: 6px;
}

.btn {
  background: var(--panel);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 13px;
}

.btn.active {
  background: var(--brand);
  color: var(--brand-ink);
  border-color: var(--brand);
}

.btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.kind-chip {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  background: var(--panel);
  color: var(--text);
}

.kind-chip.off {
  opacity: 0.4;
  text-decoration: line-through;
}

.badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(128, 128, 128, 0.18);
  color: var(--muted);
}

.badge-ok {
  background: rgba(46, 160, 67, 0.18);
  color: #3fb950;
}

.month {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--panel);
}

.weekdays,
.grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}

.weekday {
  text-align: center;
  font-size: 12px;
  color: var(--muted);
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  background: rgba(128, 128, 128, 0.06);
}

.cell {
  min-height: 104px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cell:nth-child(7n) {
  border-right: 0;
}

.cell.out {
  background: rgba(128, 128, 128, 0.04);
  opacity: 0.7;
}

.cell.today {
  outline: 1px solid var(--brand);
  outline-offset: -1px;
}

.cell.drop {
  background: rgba(86, 156, 255, 0.08);
}

.cell-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.day-num {
  font-size: 13px;
  color: var(--text);
  font-weight: 600;
}

.today-tag {
  font-size: 10px;
  background: var(--brand);
  color: var(--brand-ink);
  border-radius: 4px;
  padding: 0 4px;
}

.cell-items {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.chip {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  padding: 2px 5px;
  border-radius: 4px;
  text-decoration: none;
  color: var(--text);
  border: 1px solid transparent;
  cursor: grab;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.chip:hover {
  filter: brightness(1.08);
}

.chip-kind {
  flex: 0 0 auto;
  font-size: 10px;
  padding: 0 4px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.18);
}

.chip-title {
  overflow: hidden;
  text-overflow: ellipsis;
}

.k-topic {
  background: rgba(56, 139, 253, 0.16);
  border-color: rgba(56, 139, 253, 0.4);
}
.k-title {
  background: rgba(45, 206, 196, 0.16);
  border-color: rgba(45, 206, 196, 0.4);
}
.k-content {
  background: rgba(163, 113, 247, 0.16);
  border-color: rgba(163, 113, 247, 0.4);
}
.k-launch {
  background: rgba(240, 158, 62, 0.16);
  border-color: rgba(240, 158, 62, 0.4);
}

.dnd-hint {
  font-size: 12px;
  color: var(--muted);
  padding: 8px 10px;
}

.agenda {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.agenda-day {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.agenda-date {
  display: flex;
  align-items: baseline;
  gap: 8px;
  border-bottom: 1px dashed var(--border);
  padding-bottom: 4px;
}

.d-num {
  font-size: 16px;
  font-weight: 600;
}

.d-week,
.d-month {
  font-size: 12px;
  color: var(--muted);
}

.agenda-item {
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  color: var(--text);
  font-size: 13px;
  padding: 5px 8px;
  border-radius: 5px;
  border: 1px solid transparent;
}

.agenda-item:hover {
  filter: brightness(1.08);
}

.agenda-account {
  margin-left: auto;
  font-size: 11px;
  color: var(--muted);
}

.error {
  color: var(--warn);
}

.hint {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.7;
}
</style>
