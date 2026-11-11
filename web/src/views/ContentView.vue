<template>
  <div class="ct">
    <!-- 开发期令牌 -->
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
      <p class="hint">提示：登录后从 /api/auth/login 响应取 accessToken 填入；写接口需令牌，未填返回 401。</p>
    </section>

    <!-- 页签 -->
    <div class="tabs">
      <button :class="['tab', { active: tab === 'topics' }]" @click="tab = 'topics'">选题管理</button>
      <button :class="['tab', { active: tab === 'titles' }]" @click="tab = 'titles'">标题管理</button>
      <button :class="['tab', { active: tab === 'projects' }]" @click="openProjects">内容项目</button>
    </div>

    <p v-if="error" class="message err">{{ error }}</p>

    <!-- 选题管理 -->
    <section v-if="tab === 'topics'" class="card">
      <div class="row" style="justify-content: space-between">
        <h2 class="card-title" style="margin: 0">选题（Topic）</h2>
        <button class="btn" :disabled="loading" @click="loadTopics">刷新</button>
      </div>

      <table v-if="topics.length" class="tbl">
        <thead>
          <tr>
            <th>标题</th><th>来源</th><th>状态</th><th>受众</th><th>角度</th><th>标签</th><th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in topics" :key="t.id">
            <td>{{ t.title }}</td>
            <td><span class="pill">{{ t.sourceType }}</span></td>
            <td><span class="pill" :class="statusClass(t.status)">{{ t.status }}</span></td>
            <td class="sm">{{ t.audience || '—' }}</td>
            <td class="sm">{{ t.angle || '—' }}</td>
            <td class="sm">{{ formatTags(t.tags) }}</td>
            <td>
              <button class="btn ghost sm" @click="openTitles(t)">标题</button>
              <button class="btn ghost sm" @click="removeTopic(t)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="!loading" class="hint">暂无选题。可在右侧新建，或点「AI 生成选题」。</p>

      <div class="grid2">
        <div class="sub">
          <h3 class="sub-title">新建选题</h3>
          <div class="field"><label>标题 *</label><input v-model="topicForm.title" class="input wide" maxlength="300" /></div>
          <div class="field"><label>来源</label>
            <select v-model="topicForm.sourceType" class="input">
              <option value="manual">manual</option>
              <option value="ai_gen">ai_gen</option>
              <option value="derived">derived</option>
            </select>
          </div>
          <div class="field"><label>关联策略 ID</label><input v-model="topicForm.strategyId" class="input wide mono" placeholder="可选（AccountStrategy.id）" /></div>
          <div class="field"><label>关联分析 ID</label><input v-model="topicForm.analysisId" class="input wide mono" placeholder="可选（Analysis.id）" /></div>
          <div class="field"><label>受众</label><input v-model="topicForm.audience" class="input wide" maxlength="500" /></div>
          <div class="field"><label>角度</label><input v-model="topicForm.angle" class="input wide" maxlength="500" /></div>
          <div class="field"><label>标签（逗号分隔）</label><input v-model="topicForm.tags" class="input wide" placeholder="如：干货,职场" /></div>
          <button class="btn primary" :disabled="creating" @click="createTopic">{{ creating ? '创建中…' : '创建选题' }}</button>
        </div>

        <div class="sub">
          <h3 class="sub-title">AI 生成选题（TOPIC_GEN）</h3>
          <p class="hint">基于策略与/或对标分析，异步产出候选选题（返回任务 ID；需配置 LLM 供应商并待环境就绪才会真正落库）。</p>
          <div class="field"><label>策略 ID</label><input v-model="genTopicForm.strategyId" class="input wide mono" placeholder="可选" /></div>
          <div class="field"><label>分析 ID</label><input v-model="genTopicForm.analysisId" class="input wide mono" placeholder="可选" /></div>
          <div class="field"><label>数量</label><input v-model.number="genTopicForm.count" class="input" type="number" min="1" max="20" /></div>
          <button class="btn" :disabled="genTopicing" @click="genTopics">{{ genTopicing ? '提交中…' : 'AI 生成选题' }}</button>
          <p v-if="genTopicMsg" class="message">{{ genTopicMsg }}</p>
        </div>
      </div>
    </section>

    <!-- 标题管理 -->
    <section v-if="tab === 'titles'" class="card">
      <div class="row" style="justify-content: space-between">
        <h2 class="card-title" style="margin: 0">
          标题候选
          <span v-if="activeTopic" class="pill ok">{{ activeTopic.title }}</span>
        </h2>
        <button class="btn ghost" @click="tab = 'topics'">← 返回选题</button>
      </div>

      <p v-if="!activeTopic" class="hint">请先在「选题管理」中点击某选题的「标题」按钮，进入其标题候选管理。</p>

      <template v-else>
        <table v-if="titles.length" class="tbl">
          <thead>
            <tr><th>标题文案</th><th>评分</th><th>依据</th><th>标签</th><th>选中</th><th>状态</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="c in titles" :key="c.id">
              <td>{{ c.text }}</td>
              <td class="sm">{{ c.score ?? '—' }}</td>
              <td class="sm">{{ c.basis || '—' }}</td>
              <td class="sm">{{ formatTags(c.tags) }}</td>
              <td>{{ c.selected ? '★' : '—' }}</td>
              <td><span class="pill" :class="statusClass(c.status)">{{ c.status }}</span></td>
              <td>
                <button class="btn ghost sm" :disabled="c.selected" @click="pickTitle(c)">选为选中</button>
                <button class="btn ghost sm" :disabled="creatingP" @click="createProject(c)">建内容项目</button>
                <button class="btn ghost sm" @click="removeTitle(c)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="hint">该选题暂无标题候选。可在右侧新建，或点「AI 生成标题」。</p>

        <div class="grid2">
          <div class="sub">
            <h3 class="sub-title">新建标题候选</h3>
            <div class="field"><label>标题文案 *</label><input v-model="titleForm.text" class="input wide" maxlength="500" /></div>
            <div class="field"><label>依据/卖点</label><input v-model="titleForm.basis" class="input wide" maxlength="1000" /></div>
            <div class="field"><label>评分</label><input v-model.number="titleForm.score" class="input" type="number" min="0" max="100" /></div>
            <div class="field"><label>标签（逗号分隔）</label><input v-model="titleForm.tags" class="input wide" placeholder="如：悬念,数字" /></div>
            <button class="btn primary" :disabled="creatingT" @click="createTitle">{{ creatingT ? '创建中…' : '创建标题' }}</button>
          </div>

          <div class="sub">
            <h3 class="sub-title">AI 生成标题（TITLE_GEN）</h3>
            <p class="hint">基于当前选题与（若有）其关联策略，异步产出标题候选（返回任务 ID）。</p>
            <div class="field"><label>数量</label><input v-model.number="genTitleForm.count" class="input" type="number" min="1" max="20" /></div>
            <button class="btn" :disabled="genTitleing" @click="genTitles">{{ genTitleing ? '提交中…' : 'AI 生成标题' }}</button>
            <p v-if="genTitleMsg" class="message">{{ genTitleMsg }}</p>
          </div>
        </div>
      </template>
    </section>

    <!-- 内容项目（T3.2：选中标题一键建内容项目）-->
    <section v-if="tab === 'projects'" class="card">
      <div class="row" style="justify-content: space-between">
        <h2 class="card-title" style="margin: 0">内容项目（T3.2）</h2>
        <button class="btn" :disabled="loadingP" @click="loadProjects">刷新</button>
      </div>
      <p v-if="projMsg" class="message">{{ projMsg }}</p>
      <table v-if="projects.length" class="tbl">
        <thead>
          <tr><th>ID</th><th>归属账号</th><th>选题</th><th>标题</th><th>状态</th><th>模板版本</th><th>创建时间</th></tr>
        </thead>
        <tbody>
          <tr v-for="p in projects" :key="p.id">
            <td class="sm mono">{{ p.id.slice(0, 8) }}</td>
            <td>{{ p.ownedAccount?.name || p.ownedAccountId.slice(0, 8) }}</td>
            <td>{{ p.topic?.title || '—' }}</td>
            <td>{{ projectTitle(p) }}</td>
            <td><span class="pill" :class="statusClass(p.status)">{{ p.status }}</span></td>
            <td class="sm mono">{{ p.promptTemplateVersionId ? p.promptTemplateVersionId.slice(0, 8) : '—' }}</td>
            <td class="sm">{{ fmtTime(p.createdAt) }}</td>
            <td><button class="btn ghost sm" @click="openProject(p)">打开</button></td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="!loadingP" class="hint">暂无内容项目。在「标题管理」中选中一个标题后点「建内容项目」即可一键创建并继承上下文。</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import {
  listTopics,
  createTopic,
  deleteTopic,
  generateTopics,
  listTitles,
  createTitle,
  deleteTitle,
  selectTitle,
  generateTitles,
  createContentProjectFromTitle,
  listContentProjects,
  type TopicItem,
  type TitleCandidateItem,
  type TopicSourceType,
  type ContentProjectItem,
} from '../api/http';

const router = useRouter();

const token = ref<string>(localStorage.getItem('wb_token') ?? '');
const tab = ref<'topics' | 'titles' | 'projects'>('topics');
const error = ref('');

const topics = ref<TopicItem[]>([]);
const titles = ref<TitleCandidateItem[]>([]);
const activeTopic = ref<TopicItem | null>(null);
const projects = ref<ContentProjectItem[]>([]);

const loading = ref(false);
const creating = ref(false);
const creatingT = ref(false);
const genTopicing = ref(false);
const genTitleing = ref(false);
const genTopicMsg = ref('');
const genTitleMsg = ref('');
const loadingP = ref(false);
const creatingP = ref(false);
const projMsg = ref('');

const topicForm = reactive({ title: '', sourceType: 'manual' as TopicSourceType, strategyId: '', analysisId: '', audience: '', angle: '', tags: '' });
const genTopicForm = reactive({ strategyId: '', analysisId: '', count: 5 });
const titleForm = reactive({ text: '', basis: '', score: null as number | null, tags: '' });
const genTitleForm = reactive({ count: 8 });

function saveToken() {
  localStorage.setItem('wb_token', token.value.trim());
}
function clearToken() {
  localStorage.removeItem('wb_token');
  token.value = '';
}
function statusClass(s: string): string {
  if (s === 'active' || s === 'selected' || s === 'success') return 'ok';
  if (s === 'archived' || s === 'rejected' || s === 'failed') return 'warn';
  return '';
}
function formatTags(tags: unknown): string {
  if (Array.isArray(tags)) return (tags as unknown[]).join('、');
  if (typeof tags === 'string' && tags) return tags;
  return '—';
}
function parseTags(s: string): string[] {
  return s
    .split(/[,，]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

async function loadTopics() {
  error.value = '';
  loading.value = true;
  try {
    topics.value = await listTopics();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

async function createTopic() {
  error.value = '';
  if (!topicForm.title.trim()) {
    error.value = '选题标题不能为空';
    return;
  }
  creating.value = true;
  try {
    await createTopic({
      title: topicForm.title.trim(),
      sourceType: topicForm.sourceType,
      strategyId: topicForm.strategyId || undefined,
      analysisId: topicForm.analysisId || undefined,
      audience: topicForm.audience || undefined,
      angle: topicForm.angle || undefined,
      tags: parseTags(topicForm.tags),
    });
    topicForm.title = '';
    topicForm.strategyId = '';
    topicForm.analysisId = '';
    topicForm.audience = '';
    topicForm.angle = '';
    topicForm.tags = '';
    await loadTopics();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    creating.value = false;
  }
}

async function removeTopic(t: TopicItem) {
  if (!confirm(`确认删除选题「${t.title}」？（软删）`)) return;
  error.value = '';
  try {
    await deleteTopic(t.id);
    if (activeTopic.value?.id === t.id) {
      activeTopic.value = null;
      titles.value = [];
      tab.value = 'topics';
    }
    await loadTopics();
  } catch (e) {
    error.value = (e as Error).message;
  }
}

async function genTopics() {
  error.value = '';
  genTopicMsg.value = '';
  genTopicing.value = true;
  try {
    const r = await generateTopics({
      strategyId: genTopicForm.strategyId || undefined,
      analysisId: genTopicForm.analysisId || undefined,
      count: genTopicForm.count,
    });
    genTopicMsg.value = `已提交，任务 ${r.taskId}（dispatched=${r.dispatched}）。待环境就绪后产出选题。`;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    genTopicing.value = false;
  }
}

async function openTitles(t: TopicItem) {
  activeTopic.value = t;
  tab.value = 'titles';
  error.value = '';
  genTitleMsg.value = '';
  await loadTitles(t.id);
}
async function loadTitles(topicId: string) {
  loading.value = true;
  try {
    titles.value = await listTitles(topicId);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

async function createTitle() {
  error.value = '';
  if (!activeTopic.value) return;
  if (!titleForm.text.trim()) {
    error.value = '标题文案不能为空';
    return;
  }
  creatingT.value = true;
  try {
    await createTitle(activeTopic.value.id, {
      text: titleForm.text.trim(),
      basis: titleForm.basis || undefined,
      score: titleForm.score ?? undefined,
      tags: parseTags(titleForm.tags),
    });
    titleForm.text = '';
    titleForm.basis = '';
    titleForm.score = null;
    titleForm.tags = '';
    await loadTitles(activeTopic.value.id);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    creatingT.value = false;
  }
}

async function removeTitle(c: TitleCandidateItem) {
  if (!activeTopic.value) return;
  error.value = '';
  try {
    await deleteTitle(activeTopic.value.id, c.id);
    await loadTitles(activeTopic.value.id);
  } catch (e) {
    error.value = (e as Error).message;
  }
}

async function pickTitle(c: TitleCandidateItem) {
  if (!activeTopic.value) return;
  error.value = '';
  try {
    await selectTitle(activeTopic.value.id, c.id);
    await loadTitles(activeTopic.value.id);
  } catch (e) {
    error.value = (e as Error).message;
  }
}

async function genTitles() {
  error.value = '';
  genTitleMsg.value = '';
  if (!activeTopic.value) return;
  genTitleing.value = true;
  try {
    const r = await generateTitles(activeTopic.value.id, { count: genTitleForm.count });
    genTitleMsg.value = `已提交，任务 ${r.taskId}（dispatched=${r.dispatched}）。待环境就绪后产出标题。`;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    genTitleing.value = false;
  }
}

function fmtTime(s: string): string {
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

function projectTitle(p: ContentProjectItem): string {
  const t = p.contextSnapshot?.title;
  return typeof t === 'string' && t ? t : '—';
}

async function createProject(c: TitleCandidateItem) {
  if (!confirm(`确认以标题「${c.text}」一键创建内容项目？（将继承账号/策略/选题上下文）`)) return;
  error.value = '';
  projMsg.value = '';
  creatingP.value = true;
  try {
    const r = await createContentProjectFromTitle(c.id);
    projMsg.value = `已创建内容项目 ${r.id.slice(0, 8)}（状态 ${r.status}）。可在「内容项目」页签查看继承的上下文。`;
    await loadProjects();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    creatingP.value = false;
  }
}

async function loadProjects() {
  error.value = '';
  loadingP.value = true;
  try {
    projects.value = await listContentProjects();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loadingP.value = false;
  }
}

function openProjects() {
  tab.value = 'projects';
  error.value = '';
  projMsg.value = '';
  void loadProjects();
}

function openProject(p: ContentProjectItem) {
  router.push(`/content-projects/${p.id}`);
}

loadTopics();
</script>
