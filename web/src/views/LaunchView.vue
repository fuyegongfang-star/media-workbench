<template>
  <div class="launch">
    <div class="head">
      <div>
        <h1>起号计划</h1>
        <p class="muted">公众号图文 / 贴图起号的基础任务管理（T4.1 图文 + T4.2 贴图起号计划）。建立计划 → 拆解任务/图片组 → 关联内容项目 → 发布后状态自动回写；贴图计划支持图片组拖拽预览与每图配文。</p>
      </div>
      <button class="btn" type="button" :disabled="busy" @click="toggleCreate">{{ showCreate ? '收起' : '新建计划' }}</button>
    </div>

    <p v-if="error" class="error">请求失败：{{ error }}</p>

    <!-- 新建计划 -->
    <div v-if="showCreate" class="card form">
      <div class="row">
        <label>归属账号
          <select v-model="form.ownedAccountId">
            <option value="">— 请选择 —</option>
            <option v-for="a in ownedAccounts" :key="a.id" :value="a.id">{{ a.name }}（{{ a.platform }}）</option>
          </select>
        </label>
        <label>类型
          <select v-model="form.type">
            <option value="article">图文</option>
            <option value="image">贴图</option>
          </select>
        </label>
        <label>状态
          <select v-model="form.status">
            <option value="draft">草稿</option>
            <option value="active">进行中</option>
            <option value="paused">暂停</option>
            <option value="done">完成</option>
          </select>
        </label>
      </div>
      <label>目标
        <input v-model="form.goal" type="text" placeholder="本阶段起号目标，如：30 天起号到 500 粉" />
      </label>
      <div class="row">
        <label>开始
          <input v-model="form.start" type="date" />
        </label>
        <label>结束
          <input v-model="form.end" type="date" />
        </label>
        <label>频率
          <input v-model="form.frequency" type="text" placeholder="如 每周 3 篇" />
        </label>
      </div>
      <div class="actions">
        <button class="btn" type="button" :disabled="busy || !form.ownedAccountId || !form.goal" @click="submitCreate">创建</button>
        <span v-if="!form.ownedAccountId" class="muted">需先选择归属账号</span>
        <span v-if="!form.goal" class="muted">需填写目标</span>
      </div>
    </div>

    <!-- 计划列表 -->
    <div v-if="loading" class="muted">加载中…</div>
    <div v-else-if="plans.length === 0" class="empty">暂无起号计划，点击右上角「新建计划」开始。</div>

    <div v-for="plan in plans" :key="plan.id" class="card plan">
      <div class="plan-head">
        <span class="badge" :class="plan.type === 'article' ? 'badge-art' : 'badge-img'">{{ plan.type === 'article' ? '图文' : '贴图' }}</span>
        <span class="badge badge-status">{{ statusLabel(plan.status) }}</span>
        <strong class="goal">{{ plan.goal }}</strong>
        <div class="plan-actions">
          <button class="btn ghost" type="button" @click="toggleExpand(plan)">{{ expanded.has(plan.id) ? '收起任务' : '任务' }}</button>
          <button class="btn ghost" type="button" :disabled="busy" @click="syncPlan(plan)">同步</button>
          <button class="btn danger" type="button" :disabled="busy" @click="removePlan(plan)">删除</button>
        </div>
      </div>

      <!-- 进度条 -->
      <div class="progress">
        <div class="bar"><div class="fill" :style="{ width: progressOf(plan).completionRate + '%' }"></div></div>
        <span class="muted small">完成 {{ progressOf(plan).done }}/{{ progressOf(plan).total }}（{{ progressOf(plan).completionRate }}%）· 已关联项目 {{ progressOf(plan).linked }}</span>
      </div>

      <!-- 任务区 -->
      <div v-if="expanded.has(plan.id)" class="tasks">
        <div class="task-add">
          <input v-model="taskForm[plan.id].title" type="text" :placeholder="plan.type === 'image' ? '图片组标题（如：第 1 组九宫格）' : '任务标题（如：第 1 篇图文）'" />
          <select v-model="taskForm[plan.id].projectId">
            <option value="">— 关联内容项目（可选）—</option>
            <option v-for="p in projects" :key="p.id" :value="p.id">{{ projectLabel(p) }}</option>
          </select>
          <button class="btn" type="button" :disabled="busy || !taskForm[plan.id].title" @click="addTask(plan)">添加任务</button>
        </div>

        <div v-if="!plan.tasks || plan.tasks.length === 0" class="muted small">该计划暂无任务。</div>
        <div v-for="t in plan.tasks" :key="t.id" class="task">
          <span class="t-title">{{ t.title || '（无标题）' }}</span>
          <span v-if="t.projectId" class="muted small">→ 已关联项目</span>
          <span v-else class="muted small">→ 未关联</span>
          <select v-model="t.status" @change="changeTaskStatus(plan, t)">
            <option value="pending">待办</option>
            <option value="in_progress">进行中</option>
            <option value="done">已完成</option>
            <option value="skipped">已跳过</option>
          </select>
          <button class="btn ghost" type="button" :disabled="busy" @click="syncTask(t)">回写状态</button>
          <button class="btn danger" type="button" :disabled="busy" @click="removeTask(plan, t)">删除</button>

          <!-- T4.2 贴图图片组：拖拽预览 + 每图配文 -->
          <div v-if="plan.type === 'image'" class="image-group">
            <div class="ig-head muted small">
              图片组（{{ (t.imageItems ?? []).length }} 张，可拖拽调整顺序）
            </div>
            <div class="ig-grid">
              <div
                v-for="(item, idx) in t.imageItems"
                :key="item.id"
                class="ig-item"
                draggable="true"
                @dragstart="onImageDragStart(t, idx)"
                @dragover.prevent
                @drop="onImageDrop(t, idx)"
              >
                <img class="ig-thumb" :src="mediaFileUrl(item.assetId)" alt="预览" />
                <textarea
                  v-model="item.caption"
                  class="ig-caption"
                  rows="2"
                  placeholder="本图配文"
                  @blur="saveImageCaption(t, item)"
                ></textarea>
                <div class="ig-actions">
                  <span class="muted small">#{{ idx + 1 }}</span>
                  <button class="btn danger" type="button" :disabled="busy" @click="removeImage(t, item)">移除</button>
                </div>
              </div>
            </div>
            <div v-if="imagePicker[t.id]" class="ig-add">
              <select v-model="imagePicker[t.id].assetId">
                <option value="">— 从媒体库选择图片 —</option>
                <option v-for="m in mediaAssets" :key="m.id" :value="m.id">{{ m.source || m.id }}</option>
              </select>
              <input v-model="imagePicker[t.id].caption" type="text" placeholder="配文（可选）" />
              <button class="btn" type="button" :disabled="busy || !imagePicker[t.id].assetId" @click="addImage(t)">添加图片</button>
            </div>
            <div v-else class="muted small">图片组加载中…</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import {
  listLaunchPlans,
  getLaunchPlan,
  createLaunchPlan,
  deleteLaunchPlan,
  syncLaunchPlan,
  createLaunchTask,
  updateLaunchTask,
  deleteLaunchTask,
  syncLaunchTask,
  listLaunchImageItems,
  addLaunchImageItem,
  updateLaunchImageItem,
  deleteLaunchImageItem,
  reorderLaunchImageItems,
  listMediaAssets,
  mediaFileUrl,
  listOwnedAccounts,
  listContentProjects,
  type LaunchPlan,
  type LaunchPlanType,
  type LaunchPlanStatus,
  type LaunchTask,
  type LaunchImageItem,
  type MediaAssetItem,
  type OwnedAccountItem,
  type ContentProjectItem,
} from '../api/http';

const plans = ref<LaunchPlan[]>([]);
const ownedAccounts = ref<OwnedAccountItem[]>([]);
const projects = ref<ContentProjectItem[]>([]);
const loading = ref(false);
const busy = ref(false);
const error = ref('');
const showCreate = ref(false);
const expanded = reactive(new Set<string>());

const form = reactive({
  ownedAccountId: '',
  type: 'article' as LaunchPlanType,
  goal: '',
  start: '',
  end: '',
  frequency: '',
  status: 'draft' as LaunchPlanStatus,
});

// 每个计划独立的"添加任务"表单
const taskForm = reactive<Record<string, { title: string; projectId: string }>>({});

// T4.2：图片组相关状态
const mediaAssets = ref<MediaAssetItem[]>([]);
const imagePicker = reactive<Record<string, { assetId: string; caption: string }>>({});
const dragState = reactive<{ taskId: string | null; index: number }>({ taskId: null, index: -1 });

function progressOf(plan: LaunchPlan) {
  const tasks = plan.tasks ?? [];
  const byStatus: Record<string, number> = { pending: 0, in_progress: 0, done: 0, skipped: 0 };
  let done = 0;
  let linked = 0;
  for (const t of tasks) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    if (t.status === 'done') done += 1;
    if (t.projectId) linked += 1;
  }
  const total = tasks.length;
  return {
    total,
    byStatus,
    done,
    linked,
    completionRate: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

function statusLabel(s: string): string {
  return (
    { draft: '草稿', active: '进行中', paused: '暂停', done: '完成' } as Record<string, string>
  )[s] ?? s;
}

function projectLabel(p: ContentProjectItem): string {
  return p.topic?.title ?? p.id;
}

function ensureTaskForm(planId: string) {
  if (!taskForm[planId]) taskForm[planId] = { title: '', projectId: '' };
}

function toggleExpand(plan: LaunchPlan) {
  if (expanded.has(plan.id)) {
    expanded.delete(plan.id);
    return;
  }
  expanded.add(plan.id);
  ensureTaskForm(plan.id);
  // 懒加载计划详情（含任务与图片组），补齐列表接口未返回的 tasks
  void loadPlanDetail(plan);
}

async function loadPlanDetail(plan: LaunchPlan): Promise<void> {
  try {
    const detail = await getLaunchPlan(plan.id);
    const idx = plans.value.findIndex((p) => p.id === plan.id);
    if (idx >= 0) plans.value[idx] = { ...plans.value[idx], tasks: detail.tasks };
    if (plan.type === 'image') {
      await ensureMediaAssets();
      if (!imagePicker[plan.id]) imagePicker[plan.id] = { assetId: '', caption: '' };
    }
  } catch (cause: unknown) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
}

async function ensureMediaAssets(): Promise<void> {
  if (mediaAssets.value.length > 0) return;
  try {
    mediaAssets.value = await listMediaAssets({ type: 'image', take: 200 });
  } catch {
    mediaAssets.value = [];
  }
}

// ============ 图片组（T4.2） ============
async function addImage(task: LaunchTask): Promise<void> {
  const pick = imagePicker[task.id];
  if (!pick || !pick.assetId) return;
  busy.value = true;
  error.value = '';
  try {
    const item = await addLaunchImageItem(task.id, {
      assetId: pick.assetId,
      caption: pick.caption || undefined,
    });
    if (!task.imageItems) task.imageItems = [];
    task.imageItems.push(item);
    pick.assetId = '';
    pick.caption = '';
  } catch (cause: unknown) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

async function saveImageCaption(task: LaunchTask, item: LaunchImageItem): Promise<void> {
  busy.value = true;
  error.value = '';
  try {
    const updated = await updateLaunchImageItem(task.id, item.id, { caption: item.caption ?? undefined });
    Object.assign(item, updated);
  } catch (cause: unknown) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

async function removeImage(task: LaunchTask, item: LaunchImageItem): Promise<void> {
  busy.value = true;
  error.value = '';
  try {
    await deleteLaunchImageItem(task.id, item.id);
    task.imageItems = (task.imageItems ?? []).filter((x) => x.id !== item.id);
  } catch (cause: unknown) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

function onImageDragStart(task: LaunchTask, index: number): void {
  dragState.taskId = task.id;
  dragState.index = index;
}

function onImageDrop(task: LaunchTask, index: number): void {
  if (dragState.taskId !== task.id || dragState.index < 0 || dragState.index === index) {
    dragState.taskId = null;
    dragState.index = -1;
    return;
  }
  const items = task.imageItems ?? [];
  const arr = [...items];
  const [moved] = arr.splice(dragState.index, 1);
  arr.splice(index, 0, moved);
  task.imageItems = arr;
  dragState.taskId = null;
  dragState.index = -1;
  void persistReorder(task, arr.map((x) => x.id));
}

async function persistReorder(task: LaunchTask, orderedIds: string[]): Promise<void> {
  try {
    const updated = await reorderLaunchImageItems(task.id, orderedIds);
    task.imageItems = updated;
  } catch (cause: unknown) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
}

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const [plansRes, accounts, projs] = await Promise.all([
      listLaunchPlans(),
      listOwnedAccounts().catch(() => [] as OwnedAccountItem[]),
      listContentProjects().catch(() => [] as ContentProjectItem[]),
    ]);
    plans.value = plansRes;
    ownedAccounts.value = accounts;
    projects.value = projs;
    // 预建任务表单占位
    for (const p of plansRes) ensureTaskForm(p.id);
  } catch (cause: unknown) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    loading.value = false;
  }
}

function toIso(v: string): string | undefined {
  if (!v) return undefined;
  return new Date(`${v}T00:00:00Z`).toISOString();
}

async function submitCreate(): Promise<void> {
  busy.value = true;
  error.value = '';
  try {
    const created = await createLaunchPlan({
      ownedAccountId: form.ownedAccountId,
      type: form.type,
      goal: form.goal,
      start: toIso(form.start),
      end: toIso(form.end),
      frequency: form.frequency || undefined,
      status: form.status,
    });
    plans.value = [created, ...plans.value];
    ensureTaskForm(created.id);
    showCreate.value = false;
    form.goal = '';
    form.start = '';
    form.end = '';
    form.frequency = '';
    form.ownedAccountId = '';
  } catch (cause: unknown) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

async function syncPlan(plan: LaunchPlan): Promise<void> {
  busy.value = true;
  error.value = '';
  try {
    const progress = await syncLaunchPlan(plan.id);
    // 重新拉取计划详情以刷新任务状态
    const updated = await listLaunchPlans();
    plans.value = updated;
    for (const p of updated) ensureTaskForm(p.id);
    void progress;
  } catch (cause: unknown) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

async function addTask(plan: LaunchPlan): Promise<void> {
  const tf = taskForm[plan.id];
  if (!tf || !tf.title) return;
  busy.value = true;
  error.value = '';
  try {
    const task = await createLaunchTask(plan.id, {
      type: plan.type,
      title: tf.title,
      projectId: tf.projectId || undefined,
    });
    if (!plan.tasks) plan.tasks = [];
    plan.tasks.push(task as LaunchTask);
    tf.title = '';
    tf.projectId = '';
  } catch (cause: unknown) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

async function changeTaskStatus(plan: LaunchPlan, t: LaunchTask): Promise<void> {
  busy.value = true;
  error.value = '';
  try {
    const updated = await updateLaunchTask(t.id, { status: t.status });
    Object.assign(t, updated);
    // 若手动置为已完成，刷新计划进度显示
    void plan;
  } catch (cause: unknown) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

async function syncTask(t: LaunchTask): Promise<void> {
  busy.value = true;
  error.value = '';
  try {
    const updated = await syncLaunchTask(t.id);
    Object.assign(t, updated);
  } catch (cause: unknown) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

async function removeTask(plan: LaunchPlan, t: LaunchTask): Promise<void> {
  busy.value = true;
  error.value = '';
  try {
    await deleteLaunchTask(t.id);
    plan.tasks = (plan.tasks ?? []).filter((x) => x.id !== t.id);
  } catch (cause: unknown) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

async function removePlan(plan: LaunchPlan): Promise<void> {
  if (!confirm(`确认删除计划「${plan.goal}」？其子任务将一并清理（计划软删）。`)) return;
  busy.value = true;
  error.value = '';
  try {
    await deleteLaunchPlan(plan.id);
    plans.value = plans.value.filter((x) => x.id !== plan.id);
    expanded.delete(plan.id);
  } catch (cause: unknown) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.launch {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
h1 {
  font-size: 20px;
  margin: 0 0 4px;
}
.muted {
  color: var(--muted);
  line-height: 1.6;
}
.small {
  font-size: 12px;
}
.btn {
  background: var(--brand);
  color: var(--brand-ink);
  border: 0;
  border-radius: 6px;
  padding: 7px 14px;
  cursor: pointer;
}
.btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.btn.ghost {
  background: transparent;
  color: var(--brand);
  border: 1px solid var(--border);
}
.btn.danger {
  background: transparent;
  color: var(--warn);
  border: 1px solid var(--warn);
}
.card {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 16px;
  background: var(--card, #fff);
}
.form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  flex: 1;
  min-width: 160px;
}
input,
select {
  padding: 7px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--input, #fff);
  color: inherit;
}
.actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.plan {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.plan-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.goal {
  flex: 1;
  min-width: 200px;
}
.plan-actions {
  display: flex;
  gap: 8px;
}
.badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
}
.badge-art {
  background: #e7f0ff;
  color: #1d4ed8;
}
.badge-img {
  background: #fde8ff;
  color: #a21caf;
}
.badge-status {
  background: #eef2f7;
  color: #475569;
}
.progress {
  display: flex;
  align-items: center;
  gap: 10px;
}
.bar {
  flex: 1;
  height: 8px;
  background: #eef2f7;
  border-radius: 999px;
  overflow: hidden;
}
.fill {
  height: 100%;
  background: var(--brand);
  transition: width 0.2s ease;
}
.tasks {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px dashed var(--border);
  padding-top: 10px;
}
.task-add {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.task-add input {
  flex: 2;
  min-width: 180px;
}
.task-add select {
  flex: 2;
  min-width: 180px;
}
.task {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.image-group {
  flex-basis: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 6px;
  padding: 10px;
  border: 1px dashed var(--border);
  border-radius: 8px;
  background: var(--bg-soft, #fafbfc);
}
.ig-head {
  font-weight: 600;
}
.ig-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
}
.ig-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card, #fff);
  cursor: grab;
}
.ig-item:active {
  cursor: grabbing;
}
.ig-thumb {
  width: 100%;
  height: 110px;
  object-fit: cover;
  border-radius: 6px;
  background: #eef2f7;
  border: 1px solid var(--border);
}
.ig-caption {
  width: 100%;
  resize: vertical;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--input, #fff);
  color: inherit;
  font-size: 12px;
}
.ig-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.ig-add {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.ig-add select,
.ig-add input {
  flex: 2;
  min-width: 160px;
}
.t-title {
  font-weight: 600;
  min-width: 160px;
}
.error {
  color: var(--warn);
}
.empty {
  color: var(--muted);
  padding: 24px;
  text-align: center;
  border: 1px dashed var(--border);
  border-radius: 10px;
}
</style>
