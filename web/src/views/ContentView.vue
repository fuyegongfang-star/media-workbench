<template>
  <div class="ct">
    <!-- 页签 -->
    <div class="tabs">
      <button :class="['tab', { active: tab === 'topics' }]" @click="tab = 'topics'">选题管理</button>
      <button :class="['tab', { active: tab === 'titles' }]" @click="tab = 'titles'">标题管理</button>
      <button :class="['tab', { active: tab === 'projects' }]" @click="openProjects">内容项目</button>
    </div>

      <p v-if="error" class="message err">{{ error }}</p>
      <p v-if="flowMsg" class="message" :class="flowMsgType">{{ flowMsg }}</p>

    <!-- 选题管理 -->
    <section v-if="tab === 'topics'" class="card">
      <div class="row" style="justify-content: space-between">
        <h2 class="card-title" style="margin: 0">选题（Topic）</h2>
        <button class="btn" :disabled="loading" @click="loadTopics">刷新</button>
      </div>
      <p class="hint" style="color:var(--accent)">完整链路：点「标题」→ 生成/选标题 → 建内容项目 → 打开项目写正文。「归属策略」决定写作风格；选题雷达转来的选题默认未绑定，建项目时在标题页顶部选归属账号即可（会自动用该账号的默认策略）。</p>

      <table v-if="topics.length" class="tbl">
        <thead>
          <tr>
            <th>标题</th><th>来源</th><th>状态</th><th>归属策略</th><th>受众</th><th>角度</th><th>标签</th><th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in topics" :key="t.id">
            <td>{{ t.title }}</td>
            <td><span class="pill">{{ t.sourceType }}</span></td>
            <td><span class="pill" :class="statusClass(t.status)">{{ t.status }}</span></td>
            <td class="sm">
              <select
                class="input sm"
                :value="t.strategyId || ''"
                :disabled="bindingTopicId === t.id"
                @change="bindTopicStrategy(t, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">— 未绑定（建项目时选账号）—</option>
                <option v-for="s in allStrategies" :key="s.id" :value="s.id">
                  {{ strategyLabel(s) }}
                </option>
              </select>
            </td>
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
          <p class="hint">基于策略与/或对标分析，异步产出候选选题（返回任务 ID；需配置模型供应商且服务就绪后才会写入）。</p>
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
        <div class="row" style="gap:12px;flex-wrap:wrap;margin-bottom:10px">
          <label class="hint" style="display:flex;align-items:center;gap:8px">
            建项目归属账号
            <select v-model="projectAccountId" class="input sm" style="min-width:180px">
              <option value="">{{ activeTopic.strategyId ? '按选题策略自动归属' : '选择自有账号（无策略选题）' }}</option>
              <option v-for="a in ownedAccounts" :key="a.id" :value="a.id">{{ a.name }}（{{ a.platform }}）</option>
            </select>
          </label>
          <span class="hint">{{ activeTopic.strategyId ? '该选题已绑定策略，默认按策略归属；选账号可覆盖。' : '该选题未绑定策略，请选一个归属账号（有多个账号时必须选）。' }}</span>
        </div>
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

    <!-- 草稿箱 / 内容项目 -->
    <section v-if="tab === 'projects'" class="card">
      <div class="row" style="justify-content: space-between">
        <h2 class="card-title" style="margin: 0">草稿箱 / 内容项目</h2>
        <button class="btn" :disabled="loadingP" @click="loadProjects">刷新</button>
      </div>
      <!-- 草稿快速定位：搜索标题 + 状态筛选 + 最近编辑排序 -->
      <div class="row" style="gap: 10px; flex-wrap: wrap; margin: 12px 0">
        <input
          v-model="draftSearch"
          class="input sm"
          type="text"
          maxlength="60"
          style="min-width: 240px; flex: 1"
          placeholder="搜索标题 / 选题 / 正文内容…"
          @keyup.enter="loadProjects"
        />
        <select v-model="draftStatus" class="input sm" @change="loadProjects">
          <option value="draft">草稿（未发布）</option>
          <option value="">全部状态</option>
          <option value="published">已发布 / 归档</option>
          <option value="CREATING">创作中</option>
          <option value="PENDING_REVIEW">待审核</option>
          <option value="APPROVED">已通过</option>
        </select>
        <select v-model="draftSort" class="input sm" @change="loadProjects">
          <option value="updated">最近编辑优先</option>
          <option value="created">创建时间优先</option>
        </select>
        <button class="btn primary sm" :disabled="loadingP" @click="loadProjects">查找</button>
      </div>
      <p v-if="projMsg" class="message">{{ projMsg }}</p>
      <table v-if="projects.length" class="tbl">
        <thead>
          <tr><th>标题</th><th>归属账号</th><th>状态</th><th>最近编辑</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="p in projects" :key="p.id">
            <td>
              <div style="font-weight: 600">{{ projectTitle(p) }}</div>
              <div class="sm muted">{{ p.topic?.title || p.id.slice(0, 8) }}</div>
            </td>
            <td>{{ p.ownedAccount?.name || p.ownedAccountId.slice(0, 8) }}</td>
            <td><span class="pill" :class="statusClass(p.status)">{{ statusLabel(p.status) }}</span></td>
            <td class="sm">{{ fmtTime(p.updatedAt) }}</td>
            <td><button class="btn ghost sm" @click="openProject(p)">继续创作 →</button></td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="!loadingP" class="hint">
        没有匹配的草稿。可换个关键词或状态筛选，或到「标题管理」选中标题后点「建内容项目」新建。
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
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
  listOwnedAccounts,
  listStrategies,
  updateTopic,
  type TopicItem,
  type TitleCandidateItem,
  type TopicSourceType,
  type ContentProjectItem,
  type OwnedAccountItem,
  type StrategyItem,
} from '../api/http';

const router = useRouter();
const route = useRoute();

const tab = ref<'topics' | 'titles' | 'projects'>('topics');
const error = ref('');
const flowMsg = ref('');
const flowMsgType = ref<'ok' | 'err'>('ok');
function notifyFlow(msg: string, type: 'ok' | 'err' = 'ok') {
  flowMsg.value = msg;
  flowMsgType.value = type;
}

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
// 草稿箱筛选：搜索词 / 状态语义 / 排序
const draftSearch = ref('');
const draftStatus = ref('draft');
const draftSort = ref('updated');

const topicForm = reactive({ title: '', sourceType: 'manual' as TopicSourceType, strategyId: '', analysisId: '', audience: '', angle: '', tags: '' });
const genTopicForm = reactive({ strategyId: '', analysisId: '', count: 5 });
const titleForm = reactive({ text: '', basis: '', score: null as number | null, tags: '' });
const genTitleForm = reactive({ count: 8 });

// 自有账号 + 全部策略（供「归属策略」下拉与无策略选题的归属账号选择）
const ownedAccounts = ref<OwnedAccountItem[]>([]);
const allStrategies = ref<StrategyItem[]>([]);
const bindingTopicId = ref('');
const projectAccountId = ref('');

async function loadAccountsAndStrategies() {
  try {
    ownedAccounts.value = await listOwnedAccounts();
    const groups = await Promise.all(ownedAccounts.value.map((a) => listStrategies(a.id).catch(() => [] as StrategyItem[])));
    allStrategies.value = groups.flat().sort((a, b) => b.version - a.version);
  } catch (e) {
    // 账号/策略加载失败不阻断选题主流程，只在建无策略项目时由后端给出明确提示
    ownedAccounts.value = [];
    allStrategies.value = [];
    void e;
  }
}

const accountName = (id: string): string => ownedAccounts.value.find((a) => a.id === id)?.name ?? id.slice(0, 8);
function strategyLabel(s: StrategyItem): string {
  return `${accountName(s.ownedAccountId)} · 策略 v${s.version}${s.isDefault ? '（默认）' : ''}`;
}

/** 给选题补绑/解绑策略：选题雷达转出的选题由此 Joined 到账号风格基线。 */
async function bindTopicStrategy(t: TopicItem, strategyId: string) {
  if (bindingTopicId.value) return;
  bindingTopicId.value = t.id;
  try {
    const updated = await updateTopic(t.id, { strategyId });
    t.strategyId = updated.strategyId;
    notifyFlow(strategyId ? `✓ 选题「${t.title.slice(0, 20)}」已绑定 ${strategyLabel(allStrategies.value.find((s) => s.id === strategyId)!)}` : '✓ 已解绑归属策略');
  } catch (e) {
    notifyFlow(`绑定失败：${(e as Error).message}`, 'err');
    await loadTopics(); // 回滚下拉显示
  } finally {
    bindingTopicId.value = '';
  }
}

function statusClass(s: string): string {
  if (s === 'active' || s === 'selected' || s === 'success' || s === 'APPROVED' || s === 'PUBLISHED') return 'ok';
  if (s === 'archived' || s === 'rejected' || s === 'failed' || s === 'NEEDS_REVISION') return 'warn';
  return '';
}
const PROJECT_STATUS_LABELS: Record<string, string> = {
  TOPIC_SELECTING: '选题中', PENDING_CREATION: '待创建', CREATING: '创作中',
  PENDING_REVIEW: '待审核', NEEDS_REVISION: '待修改', APPROVED: '已通过',
  PUBLISHED: '已发布', ARCHIVED: '已归档',
};
function statusLabel(s: string): string {
  return PROJECT_STATUS_LABELS[s] || s;
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
    genTopicMsg.value = `已提交，任务 ${r.taskId}（dispatched=${r.dispatched}）。服务就绪后产出选题。`;
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
  projectAccountId.value = ''; // 切换选题时清空上次选的归属账号，避免建错项目
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
    genTitleMsg.value = `已提交，任务 ${r.taskId}（dispatched=${r.dispatched}）。服务就绪后产出标题。`;
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
  if (p.selectedTitle?.text) return p.selectedTitle.text;
  const t = p.contextSnapshot?.title;
  return typeof t === 'string' && t ? t : '—';
}

async function createProject(c: TitleCandidateItem) {
  if (!confirm(`确认以标题「${c.text}」一键创建内容项目？（将继承账号/策略/选题上下文）`)) return;
  error.value = '';
  projMsg.value = '';
  creatingP.value = true;
  try {
    const r = await createContentProjectFromTitle(c.id, { ownedAccountId: projectAccountId.value || undefined });
    projMsg.value = `已创建内容项目 ${r.id.slice(0, 8)}（状态 ${r.status}）。已自动切到「内容项目」页签，可打开继续创作。`;
    tab.value = 'projects'; // 立项成功后直接带到下一步，不再让用户自己找页签
    await loadProjects();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    creatingP.value = false;
  }
}

onMounted(async () => {
  await loadTopics();
  void loadAccountsAndStrategies();
  // 从雷达/草稿入口带参跳转：?topic=xxx 定位到该选题的标题页；
  // ?tab=projects 或 /drafts 路由直达草稿箱页签。
  const qTopic = String(route.query.topic ?? '');
  const qTab = String(route.query.tab ?? '');
  if (qTopic) {
    const t = topics.value.find((x) => x.id === qTopic);
    if (t) await openTitles(t);
  } else if (qTab === 'projects' || route.path === '/drafts') {
    openProjects();
  }
});

async function loadProjects() {
  error.value = '';
  loadingP.value = true;
  try {
    projects.value = await listContentProjects({
      q: draftSearch.value || undefined,
      status: draftStatus.value || undefined,
      sort: draftSort.value || undefined,
    });
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
