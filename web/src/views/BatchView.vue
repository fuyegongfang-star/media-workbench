<script setup lang="ts">
import { computed, ref } from 'vue';
import { runBatch, type BatchAction, type BatchParams, type BatchResult, type BatchType, type TagMode } from '../api/http';

type BatchTypeLocal = BatchType;
const types: { value: BatchTypeLocal; label: string }[] = [
  { value: 'topic', label: '选题' },
  { value: 'title', label: '标题候选' },
  { value: 'project', label: '草稿（内容项目）' },
];

const actions: { value: BatchAction; label: string }[] = [
  { value: 'setStatus', label: '批量状态变更' },
  { value: 'tag', label: '批量打标签' },
  { value: 'delete', label: '批量删除' },
  { value: 'publish', label: '批量发布（仅草稿）' },
];

const STATUS_OPTIONS: Record<BatchTypeLocal, string[]> = {
  topic: ['draft', 'active', 'archived'],
  title: ['draft', 'selected', 'rejected'],
  project: [
    'TOPIC_SELECTING',
    'PENDING_CREATION',
    'CREATING',
    'PENDING_REVIEW',
    'NEEDS_REVISION',
    'APPROVED',
    'PUBLISHED',
    'ARCHIVED',
  ],
};

const type = ref<BatchTypeLocal>('topic');
const action = ref<BatchAction>('setStatus');
const idsText = ref('');
const status = ref('');
const tagsText = ref('');
const tagMode = ref<TagMode>('add');
const loading = ref(false);
const error = ref('');
const result = ref<BatchResult | null>(null);

// 当切换类型时，状态默认值对齐该类型的第一个可选值
function onTypeChange() {
  status.value = STATUS_OPTIONS[type.value][0] ?? '';
}
onTypeChange();

const needStatus = computed(() => action.value === 'setStatus');
const needTags = computed(() => action.value === 'tag');
const ids = computed(() =>
  idsText.value
    .split(/[\n,，\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0),
);

async function submit() {
  error.value = '';
  result.value = null;
  if (ids.value.length === 0) {
    error.value = '请至少填写一个目标 ID';
    return;
  }
  const params: BatchParams = {
    type: type.value,
    action: action.value,
    ids: ids.value,
  };
  if (needStatus.value) {
    if (!status.value) {
      error.value = '请选择目标状态';
      return;
    }
    params.status = status.value;
  }
  if (needTags.value) {
    const tags = tagsText.value
      .split(/[\n,，\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (tags.length === 0) {
      error.value = '请至少填写一个标签';
      return;
    }
    params.tags = tags;
    params.tagMode = tagMode.value;
  }
  loading.value = true;
  try {
    result.value = await runBatch(params);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="batch-view">
    <header class="page-head">
      <h1>批量操作</h1>
      <p class="muted">对 选题 / 标题候选 / 草稿（内容项目）执行批量 状态变更、打标签、删除、发布。逐条执行，单条失败不阻断整批。</p>
    </header>

    <section class="card">
      <div class="form-grid">
        <label class="field">
          <span>对象类型</span>
          <select v-model="type" @change="onTypeChange">
            <option v-for="t in types" :key="t.value" :value="t.value">{{ t.label }}</option>
          </select>
        </label>

        <label class="field">
          <span>操作</span>
          <select v-model="action">
            <option v-for="a in actions" :key="a.value" :value="a.value">{{ a.label }}</option>
          </select>
        </label>

        <label class="field" v-if="needStatus">
          <span>目标状态</span>
          <select v-model="status">
            <option v-for="s in STATUS_OPTIONS[type]" :key="s" :value="s">{{ s }}</option>
          </select>
        </label>

        <label class="field" v-if="needTags">
          <span>标签模式</span>
          <select v-model="tagMode">
            <option value="add">add（追加）</option>
            <option value="remove">remove（移除）</option>
            <option value="replace">replace（替换）</option>
          </select>
        </label>
      </div>

      <label class="field block">
        <span>目标 ID（每行 / 逗号 / 空格 分隔，最多 200 个）</span>
        <textarea v-model="idsText" rows="6" placeholder="id-1&#10;id-2&#10;id-3"></textarea>
      </label>

      <label class="field block" v-if="needTags">
        <span>标签（每行 / 逗号 / 空格 分隔）</span>
        <textarea v-model="tagsText" rows="3" placeholder="爆款&#10;方法&#10;案例"></textarea>
      </label>

      <div class="actions">
        <button class="btn primary" :disabled="loading" @click="submit">
          {{ loading ? '执行中…' : '执行批量操作' }}
        </button>
        <span class="count muted">共 {{ ids.length }} 个目标</span>
      </div>

      <p v-if="error" class="error">⚠ {{ error }}</p>
    </section>

    <section class="card" v-if="result">
      <div class="result-summary">
        <span>总计 <b>{{ result.total }}</b></span>
        <span class="ok">成功 <b>{{ result.succeeded }}</b></span>
        <span class="fail" v-if="result.failed > 0">失败 <b>{{ result.failed }}</b></span>
      </div>
      <table class="result-table">
        <thead>
          <tr><th>ID</th><th>结果</th><th>说明</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in result.results" :key="r.id" :class="{ fail: !r.ok }">
            <td class="mono">{{ r.id }}</td>
            <td>{{ r.ok ? '成功' : '失败' }}</td>
            <td class="muted">{{ r.error ?? '' }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
.batch-view {
  padding: 20px 24px;
  max-width: 960px;
  margin: 0 auto;
}
.page-head h1 {
  margin: 0 0 4px;
  font-size: 22px;
}
.muted {
  color: var(--muted);
  font-size: 13px;
}
.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 18px 20px;
  margin-top: 16px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 14px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
}
.field.block {
  margin-top: 14px;
}
.field select,
.field textarea {
  background: var(--bg, #11151c);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 14px;
  font-family: inherit;
}
.field textarea {
  resize: vertical;
  line-height: 1.5;
}
.actions {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 14px;
}
.btn {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  border-radius: 8px;
  padding: 9px 18px;
  font-size: 14px;
  cursor: pointer;
}
.btn.primary {
  background: var(--brand);
  color: var(--brand-ink, #fff);
  border-color: var(--brand);
}
.btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.error {
  color: var(--warn);
  margin-top: 12px;
  font-size: 13px;
}
.result-summary {
  display: flex;
  gap: 18px;
  font-size: 14px;
  margin-bottom: 12px;
}
.result-summary .ok {
  color: #4caf80;
}
.result-summary .fail {
  color: var(--warn);
}
.result-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.result-table th,
.result-table td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}
.result-table tr.fail td {
  color: var(--warn);
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>
