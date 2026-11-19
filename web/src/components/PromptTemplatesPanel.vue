<template>
  <div class="pt-panel">
    <div class="pt-intro card">
      <p class="hint" style="margin: 0">
        各环节 AI 提示词模板集中管理：<b>内置预设</b>可停用、可「另存为新版本」后修改；<b>自定义模板</b>按版本号自动生效（取最新启用版）。
        选择「仅某账号」即可让该账号在对应环节使用专属风格提示词，未命中时自动回退到全局模板。
        模板里用 <code>{{ placeholderExample }}</code> 这类占位符引用变量，各环节的可用变量见下方。
      </p>
    </div>

    <div class="pt-toolbar card">
      <div class="row" style="gap: 10px; flex-wrap: wrap; align-items: center">
        <select v-model="groupFilter" class="input sm" style="min-width: 140px">
          <option value="">全部环节</option>
          <option v-for="g in groups" :key="g" :value="g">{{ g }}</option>
        </select>
        <select v-model="taskFilter" class="input sm" style="min-width: 180px">
          <option value="">全部类型</option>
          <option v-for="(m, k) in taskMeta" :key="k" :value="k">{{ m.label }}</option>
        </select>
        <span class="sm muted">共 {{ filtered.length }} 个模板</span>
        <span style="flex: 1"></span>
        <button class="btn" :disabled="loading" @click="load">刷新</button>
        <button class="btn primary" @click="openCreate">+ 新建自定义模板</button>
      </div>
    </div>

    <p v-if="message" class="message" :class="messageType">{{ message }}</p>

    <!-- 新建 / 编辑表单 -->
    <div v-if="editing" class="card pt-form">
      <h3 class="sub-title" style="margin-top: 0">{{ editing.id ? '编辑模板' : '新建自定义模板' }}</h3>
      <div class="pt-form-grid">
        <div class="field">
          <label>环节 *</label>
          <select v-model="editing.taskType" class="input wide" :disabled="!!editing.id">
            <option v-for="(m, k) in taskMeta" :key="k" :value="k">{{ m.label }}（{{ m.group }}）</option>
          </select>
        </div>
        <div class="field">
          <label>模板名称 *</label>
          <input v-model="editing.label" class="input wide" maxlength="80" placeholder="如：科技号犀利风初稿" />
        </div>
        <div class="field">
          <label>适用范围</label>
          <select v-model="editing.scope" class="input wide">
            <option value="global">全局（所有账号可用）</option>
            <option value="account">仅指定账号（账号专属风格）</option>
          </select>
        </div>
        <div class="field" v-if="editing.scope === 'account'">
          <label>归属账号 *</label>
          <select v-model="editing.ownedAccountId" class="input wide">
            <option value="">请选择账号</option>
            <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </div>
      </div>
      <div class="field" style="margin-top: 10px">
        <label>模板内容 *（可用占位符：<span class="mono">{{ currentVars.join(' / ') || '见环节说明' }}</span>）</label>
        <textarea v-model="editing.content" class="pt-textarea" rows="10" :placeholder="contentPlaceholder"></textarea>
        <p v-if="currentDesc" class="hint" style="margin: 4px 0 0">{{ currentDesc }}</p>
      </div>
      <div class="row" style="gap: 10px; margin-top: 12px">
        <button class="btn primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
        <button class="btn ghost" :disabled="saving" @click="editing = null">取消</button>
      </div>
    </div>

    <!-- 模板列表：按环节分组 -->
    <div v-for="g in visibleGroups" :key="g" class="pt-group">
      <h3 class="sub-title pt-group-title">{{ g }}</h3>
      <div v-for="t in grouped[g]" :key="t.id" class="card pt-card" :class="{ off: !t.enabled }">
        <div class="pt-card-head">
          <div>
            <strong>{{ t.label }}</strong>
            <span class="pill" style="margin-left: 8px">v{{ t.version }}</span>
            <span v-if="t.builtin" class="pill" style="margin-left: 6px">内置预设</span>
            <span v-else class="pill ok" style="margin-left: 6px">自定义</span>
            <span v-if="t.scope === 'account'" class="pill warn" style="margin-left: 6px">账号专属</span>
            <span v-if="!t.enabled" class="pill warn" style="margin-left: 6px">已停用</span>
          </div>
          <div class="row" style="gap: 6px">
            <button class="btn ghost sm" @click="toggleEnabled(t)">{{ t.enabled ? '停用' : '启用' }}</button>
            <button class="btn ghost sm" @click="openEdit(t)">编辑</button>
            <button v-if="t.builtin" class="btn ghost sm" @click="cloneAsCustom(t)">另存为新版本</button>
            <button v-else class="btn ghost sm" @click="remove(t)">删除</button>
          </div>
        </div>
        <p class="hint" style="margin: 6px 0">{{ t.taskLabel }} · {{ taskMeta[t.taskType]?.desc || '' }}</p>
        <pre class="pt-preview">{{ t.content.slice(0, 240) }}{{ t.content.length > 240 ? '…' : '' }}</pre>
      </div>
    </div>

    <p v-if="!loading && filtered.length === 0" class="hint">没有匹配的模板。点「新建自定义模板」添加一个。</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, reactive } from 'vue';
import {
  fetchPromptTemplates,
  createPromptTemplate,
  updatePromptTemplate,
  deletePromptTemplate,
  listOwnedAccounts,
  type PromptTemplateView,
  type PromptTaskMeta,
  type OwnedAccountItem,
} from '../api/http';

// 含 {{ }} 的示例文本放在 JS 常量里，避免 Vue 模板编译器把字面 {{ 当作插值起点。
const placeholderExample = '{{title}}';
const contentPlaceholder = '例如：请以 {{strategySummary}} 为风格基调，围绕标题 {{title}} 写一篇公众号文章…';

const loading = ref(false);
const saving = ref(false);
const message = ref('');
const messageType = ref<'ok' | 'err'>('ok');
function notify(msg: string, err = false) {
  message.value = msg;
  messageType.value = err ? 'err' : 'ok';
}

const templates = ref<PromptTemplateView[]>([]);
const taskMeta = reactive<Record<string, PromptTaskMeta>>({});
const accounts = ref<OwnedAccountItem[]>([]);
const groupFilter = ref('');
const taskFilter = ref('');

const groups = ['对标拆解', '选题标题', '正文创作', '润色检测'];

interface Editing {
  id?: string;
  taskType: string;
  label: string;
  content: string;
  scope: 'global' | 'account';
  ownedAccountId: string;
}
const editing = ref<Editing | null>(null);

const currentVars = computed(() => (editing.value ? taskMeta[editing.value.taskType]?.variables ?? [] : []));
const currentDesc = computed(() => (editing.value ? taskMeta[editing.value.taskType]?.desc ?? '' : ''));

const filtered = computed(() =>
  templates.value.filter((t) => {
    if (groupFilter.value && t.taskGroup !== groupFilter.value) return false;
    if (taskFilter.value && t.taskType !== taskFilter.value) return false;
    return true;
  }),
);
const visibleGroups = computed(() => groups.filter((g) => grouped.value[g]?.length));
const grouped = computed(() => {
  const m: Record<string, PromptTemplateView[]> = {};
  for (const t of filtered.value) (m[t.taskGroup] ||= []).push(t);
  return m;
});

async function load() {
  loading.value = true;
  try {
    const [r, acc] = await Promise.all([fetchPromptTemplates(), listOwnedAccounts()]);
    templates.value = r.templates;
    Object.keys(taskMeta).forEach((k) => delete taskMeta[k]);
    Object.assign(taskMeta, r.taskMeta);
    accounts.value = acc;
  } catch (e) {
    notify(`加载失败：${(e as Error).message}`, true);
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function openCreate() {
  editing.value = {
    taskType: taskFilter.value || Object.keys(taskMeta)[0] || 'article_draft',
    label: '',
    content: '',
    scope: 'global',
    ownedAccountId: '',
  };
}
function openEdit(t: PromptTemplateView) {
  editing.value = {
    id: t.id,
    taskType: t.taskType,
    label: t.label,
    content: t.content,
    scope: t.scope,
    ownedAccountId: t.ownedAccountId ?? '',
  };
}
function cloneAsCustom(t: PromptTemplateView) {
  editing.value = {
    taskType: t.taskType,
    label: `${t.taskLabel} · 自定义`,
    content: t.content,
    scope: t.scope,
    ownedAccountId: t.ownedAccountId ?? '',
  };
}

async function save() {
  const e = editing.value;
  if (!e) return;
  if (!e.label.trim()) return notify('请填写模板名称', true);
  if (!e.content.trim()) return notify('请填写模板内容', true);
  if (e.scope === 'account' && !e.ownedAccountId) return notify('账号专属模板请选择归属账号', true);
  saving.value = true;
  try {
    if (e.id) {
      await updatePromptTemplate(e.id, {
        label: e.label, content: e.content, scope: e.scope,
        ownedAccountId: e.scope === 'account' ? e.ownedAccountId : '',
      });
    } else {
      await createPromptTemplate({
        taskType: e.taskType, label: e.label, content: e.content,
        scope: e.scope, ownedAccountId: e.scope === 'account' ? e.ownedAccountId : undefined,
      });
    }
    notify('✓ 模板已保存，将在对应环节自动生效（取最新启用版本）。');
    editing.value = null;
    await load();
  } catch (err) {
    notify(`保存失败：${(err as Error).message}`, true);
  } finally {
    saving.value = false;
  }
}

async function toggleEnabled(t: PromptTemplateView) {
  try {
    await updatePromptTemplate(t.id, { enabled: !t.enabled });
    notify(`✓ 已${t.enabled ? '停用' : '启用'}「${t.label}」`);
    await load();
  } catch (e) {
    notify(`操作失败：${(e as Error).message}`, true);
  }
}

async function remove(t: PromptTemplateView) {
  if (!confirm(`确认删除自定义模板「${t.label}」？（实为停用，不会物理删除以保留历史快照引用）`)) return;
  try {
    await deletePromptTemplate(t.id);
    notify('✓ 已删除');
    await load();
  } catch (e) {
    notify(`删除失败：${(e as Error).message}`, true);
  }
}
</script>

<style scoped>
.pt-panel { display: flex; flex-direction: column; gap: 14px; }
.pt-intro, .pt-toolbar { padding: 12px 16px; }
.pt-form { padding: 16px; }
.pt-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.pt-textarea {
  width: 100%; box-sizing: border-box; font-family: var(--mono, monospace); font-size: 13px;
  line-height: 1.6; padding: 10px; border: 1px solid var(--border); border-radius: var(--radius-sm);
  background: var(--input); color: var(--text); resize: vertical;
}
.pt-group-title { margin: 6px 0 2px; }
.pt-card { padding: 14px 16px; }
.pt-card.off { opacity: 0.66; }
.pt-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.pt-preview {
  margin: 8px 0 0; padding: 10px; background: var(--bg-soft); border: 1px solid var(--border);
  border-radius: var(--radius-sm); font-size: 12px; color: var(--muted); white-space: pre-wrap;
  word-break: break-word; max-height: 120px; overflow: hidden;
}
@media (max-width: 720px) { .pt-form-grid { grid-template-columns: 1fr; } }
</style>
