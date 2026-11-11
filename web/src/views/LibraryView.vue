<template>
  <div class="lib">
    <!-- 开发期令牌：素材库接口需鉴权；生产由登录流程下发，此处仅用于本地联调 -->
    <section class="card">
      <h2 class="card-title">访问令牌（开发/QA）</h2>
      <div class="row">
        <input v-model="token" class="input wide" type="text" placeholder="粘贴 Bearer 令牌（本地联调用，存于浏览器 localStorage）" />
        <button class="btn" @click="saveToken">保存令牌</button>
        <button class="btn ghost" @click="clearToken">清除</button>
      </div>
      <p class="hint">提示：登录后从 /api/auth/login 响应中取 accessToken 填入；未填则接口返回 401。</p>
    </section>

    <div class="tabs">
      <button class="tab" :class="{ active: tab === 'list' }" @click="switchTab('list')">素材库</button>
      <button class="tab" :class="{ active: tab === 'recycle' }" @click="switchTab('recycle')">回收站</button>
      <span v-if="tab === 'recycle' && recycleTotal > 0" class="badge">{{ recycleTotal }}</span>
    </div>

    <!-- 素材列表 -->
    <section v-if="tab === 'list'" class="card">
      <h2 class="card-title">素材库 · 跨类型搜索与筛选</h2>
      <div class="filters">
        <input v-model="q.q" class="input" type="text" placeholder="关键词（标题/正文/作者/来源）" />
        <select v-model="q.referenceAccountId" class="input">
          <option value="">全部对标账号</option>
          <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
        <select v-model="q.platform" class="input">
          <option value="">全部平台</option>
          <option value="wechat">公众号</option>
          <option value="xiaohongshu">小红书</option>
          <option value="x">X</option>
        </select>
        <input v-model="q.tags" class="input" type="text" placeholder="标签（逗号分隔）" />
        <input v-model="q.author" class="input" type="text" placeholder="作者" />
        <select v-model="q.favorite" class="input">
          <option value="">收藏：全部</option>
          <option value="true">已收藏</option>
          <option value="false">未收藏</option>
        </select>
        <select v-model="q.archived" class="input">
          <option value="">归档：全部</option>
          <option value="true">已归档</option>
          <option value="false">未归档</option>
        </select>
        <select v-model="q.hasAnalysis" class="input">
          <option value="">拆解：全部</option>
          <option value="true">已拆解</option>
          <option value="false">未拆解</option>
        </select>
        <input v-model="q.dateFrom" class="input" type="date" title="导入起始" />
        <input v-model="q.dateTo" class="input" type="date" title="导入结束" />
        <select v-model="q.sort" class="input">
          <option value="newest">最新创建</option>
          <option value="oldest">最早创建</option>
          <option value="imported">最新导入</option>
          <option value="collected">最新采集</option>
        </select>
        <button class="btn primary" :disabled="loading" @click="load(1)">查询</button>
      </div>

      <div v-if="tagSuggestions.length" class="chips">
        <span class="chip-label">热门标签：</span>
        <button v-for="t in tagSuggestions" :key="t.tag" class="chip" @click="toggleTag(t.tag)">
          {{ t.tag }} <span class="chip-count">{{ t.count }}</span>
        </button>
      </div>

      <div v-if="error" class="message err">{{ error }}</div>

      <table v-if="result.items.length" class="tbl">
        <thead>
          <tr>
            <th>标题</th>
            <th>对标账号</th>
            <th>标签</th>
            <th>状态</th>
            <th>导入时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in result.items" :key="m.id">
            <td class="title">
              <span :title="m.title">{{ short(m.title, 28) }}</span>
              <span v-if="m.isDuplicate" class="flag dup" title="重复副本">副本</span>
              <span v-if="m.hasAnalysis" class="flag ok" title="已拆解">拆</span>
            </td>
            <td>{{ m.referenceAccountName ?? '—' }}<span v-if="m.platform" class="muted"> · {{ m.platform }}</span></td>
            <td class="tags-cell">
              <span v-for="t in m.tags" :key="t" class="mini-tag">{{ t }}</span>
              <span v-if="!m.tags.length" class="muted">—</span>
            </td>
            <td>
              <span :class="['dot', m.favorite ? 'on' : '']" :title="m.favorite ? '已收藏' : '未收藏'">★</span>
              <span :class="['dot', m.archived ? 'on' : '']" :title="m.archived ? '已归档' : '未归档'">▣</span>
            </td>
            <td class="mono">{{ fmt(m.importedAt) }}</td>
            <td class="actions">
              <button class="btn xs" @click="toggleFav(m)">{{ m.favorite ? '取消收藏' : '收藏' }}</button>
              <button class="btn xs ghost" @click="toggleArchive(m)">{{ m.archived ? '取消归档' : '归档' }}</button>
              <button class="btn xs ghost" @click="openTagEditor(m)">标签</button>
              <button class="btn xs ghost" @click="openGraph(m)">关系</button>
              <button class="btn xs danger" @click="removeMaterial(m)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="!error" class="empty">暂无素材（待 PG 环境联调，或当前筛选无命中）。</p>

      <div v-if="result.total > 0" class="pager">
        <button class="btn ghost" :disabled="result.page <= 1 || loading" @click="load(result.page - 1)">上一页</button>
        <span class="hint">第 {{ result.page }} 页 / 共 {{ Math.ceil(result.total / result.pageSize) }} 页（{{ result.total }} 条）</span>
        <button class="btn ghost" :disabled="result.page * result.pageSize >= result.total || loading" @click="load(result.page + 1)">下一页</button>
      </div>
    </section>

    <!-- 标签编辑 -->
    <section v-if="tagEditor" class="card">
      <h2 class="card-title">编辑标签 · {{ short(tagEditor.title, 20) }}</h2>
      <div class="row">
        <input v-model="tagInput" class="input wide" type="text" placeholder="逗号分隔，如：爆款,方法,案例" />
        <button class="btn primary" :disabled="saving" @click="saveTags">保存</button>
        <button class="btn ghost" @click="tagEditor = null">取消</button>
      </div>
    </section>

    <!-- 关系回溯 -->
    <section v-if="graph" class="card">
      <h2 class="card-title">关系回溯 · {{ short(graph.material?.title ?? '', 24) }}</h2>
      <div class="graph">
        <div class="g-node"><b>素材</b><span class="mono">{{ short(graph.material?.id ?? '', 8) }}</span></div>
        <div class="g-edge">↳ 分析（{{ graph.analyses.length }}）</div>
        <div v-for="a in graph.analyses" :key="a.id" class="g-node sub">
          <span class="g-kind">{{ a.kind }}</span>
          选题（{{ a.topics.length }}）
          <ul>
            <li v-for="t in a.topics" :key="t.id">{{ short(t.title, 24) }}</li>
          </ul>
        </div>
        <div class="g-edge">↳ 标题候选（{{ graph.titleCandidates.length }}）· 内容项目（{{ graph.contentProjects.length }}）</div>
        <div class="g-node sub">生成运行（{{ graph.generationRuns.length }}）· 起号任务（{{ graph.launchTasks.length }}）</div>
      </div>
      <button class="btn ghost" @click="graph = null">关闭</button>
    </section>

    <!-- 回收站 -->
    <section v-else-if="tab === 'recycle'" class="card">
      <h2 class="card-title">回收站（软删素材 + 恢复入口）</h2>
      <div class="filters">
        <button class="btn primary" :disabled="loading" @click="loadRecycle">刷新</button>
      </div>
      <div v-if="recycleError" class="message err">{{ recycleError }}</div>
      <table v-if="recycle.length" class="tbl">
        <thead>
          <tr><th>标题</th><th>对标账号</th><th>删除时间</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="d in recycle" :key="d.id">
            <td class="title">{{ short(d.title, 36) }}</td>
            <td class="mono">{{ short(d.referenceAccountId, 8) }}</td>
            <td class="mono">{{ fmt(d.deletedAt) }}</td>
            <td><button class="btn xs primary" :disabled="saving" @click="restore(d)">恢复</button></td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="!recycleError" class="empty">回收站为空。</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import {
  deleteMaterial,
  fetchDeletedMaterials,
  fetchMaterialGraph,
  fetchMaterialTags,
  fetchReferenceAccounts,
  restoreMaterial,
  searchMaterials,
  updateMaterial,
  type DeletedMaterial,
  type MaterialGraph,
  type MaterialListItem,
  type MaterialSearchResult,
  type TagCount,
} from '../api/http';

const token = ref<string>(localStorage.getItem('wb_token') ?? '');
const tab = ref<'list' | 'recycle'>('list');
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const recycleError = ref('');

const result = reactive<MaterialSearchResult>({ items: [], total: 0, page: 1, pageSize: 20 });
const recycle = ref<DeletedMaterial[]>([]);
const recycleTotal = ref(0);
const accounts = ref<Array<{ id: string; name: string }>>([]);
const tagSuggestions = ref<TagCount[]>([]);
const graph = ref<MaterialGraph | null>(null);

const q = reactive<Record<string, string>>({
  q: '', referenceAccountId: '', platform: '', tags: '',
  author: '', favorite: '', archived: '', hasAnalysis: '',
  dateFrom: '', dateTo: '', sort: 'newest',
});

const tagEditor = ref<MaterialListItem | null>(null);
const tagInput = ref('');

function saveToken() {
  if (token.value.trim()) localStorage.setItem('wb_token', token.value.trim());
  else localStorage.removeItem('wb_token');
}
function clearToken() {
  localStorage.removeItem('wb_token');
  token.value = '';
}
function short(s: string | null | undefined, n = 12): string {
  if (!s) return '—';
  return s.length > n ? s.slice(0, n) + '…' : s;
}
function fmt(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toISOString().slice(0, 16).replace('T', ' ');
}

function switchTab(t: 'list' | 'recycle') {
  tab.value = t;
  graph.value = null;
  if (t === 'recycle') loadRecycle();
}

async function load(page = 1) {
  loading.value = true;
  error.value = '';
  try {
    const params: Record<string, string> = { page: String(page) };
    for (const [k, v] of Object.entries(q)) {
      if (v) params[k] = v;
    }
    const data = await searchMaterials(params);
    result.items = data.items;
    result.total = data.total;
    result.page = data.page;
    result.pageSize = data.pageSize;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

async function loadRecycle() {
  loading.value = true;
  recycleError.value = '';
  try {
    const data = await fetchDeletedMaterials();
    recycle.value = data;
    recycleTotal.value = data.length;
  } catch (e) {
    recycleError.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

async function toggleFav(m: MaterialListItem) {
  saving.value = true;
  try {
    await updateMaterial(m.id, { favorite: !m.favorite });
    m.favorite = !m.favorite;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}

async function toggleArchive(m: MaterialListItem) {
  saving.value = true;
  try {
    await updateMaterial(m.id, { archived: !m.archived });
    m.archived = !m.archived;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}

function openTagEditor(m: MaterialListItem) {
  tagEditor.value = m;
  tagInput.value = m.tags.join(',');
}
async function saveTags() {
  if (!tagEditor.value) return;
  saving.value = true;
  try {
    const updated = await updateMaterial(tagEditor.value.id, {
      tags: tagInput.value.split(',').map((s) => s.trim()).filter(Boolean),
    });
    tagEditor.value.tags = updated.tags;
    tagEditor.value = null;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}

async function openGraph(m: MaterialListItem) {
  try {
    graph.value = await fetchMaterialGraph(m.id);
  } catch (e) {
    error.value = (e as Error).message;
  }
}

async function removeMaterial(m: MaterialListItem) {
  if (!confirm(`确认软删素材「${m.title}」？可于回收站恢复。`)) return;
  saving.value = true;
  try {
    await deleteMaterial(m.id);
    await load(result.page);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}

async function restore(d: DeletedMaterial) {
  saving.value = true;
  try {
    await restoreMaterial(d.id);
    await loadRecycle();
  } catch (e) {
    recycleError.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}

function toggleTag(tag: string) {
  const cur = q.tags ? q.tags.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const i = cur.indexOf(tag);
  if (i >= 0) cur.splice(i, 1);
  else cur.push(tag);
  q.tags = cur.join(',');
}

onMounted(async () => {
  try {
    accounts.value = await fetchReferenceAccounts();
  } catch {
    accounts.value = [];
  }
  try {
    tagSuggestions.value = await fetchMaterialTags();
  } catch {
    tagSuggestions.value = [];
  }
  await load(1);
});
</script>

<style scoped>
.lib { padding: 16px; display: flex; flex-direction: column; gap: 16px; }
.card { background: #1b1f2a; border: 1px solid #2a3142; border-radius: 10px; padding: 16px; }
.card-title { margin: 0 0 12px; font-size: 16px; color: #e6e9f0; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.input { background: #11151f; border: 1px solid #2a3142; color: #e6e9f0; border-radius: 6px; padding: 6px 8px; font-size: 13px; }
.wide { flex: 1; min-width: 280px; }
.btn { background: #2a3142; color: #e6e9f0; border: 1px solid #3a4255; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 13px; }
.btn:hover { background: #333c4f; }
.btn.primary { background: #3b82f6; border-color: #3b82f6; }
.btn.ghost { background: transparent; }
.btn.danger { color: #ff6b6b; border-color: #5a2a2a; }
.btn.xs { padding: 3px 8px; font-size: 12px; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.tabs { display: flex; gap: 8px; align-items: center; }
.tab { background: #11151f; color: #9aa3b2; border: 1px solid #2a3142; border-radius: 6px; padding: 6px 14px; cursor: pointer; }
.tab.active { color: #e6e9f0; border-color: #3b82f6; background: #1b2436; }
.badge { background: #ff6b6b; color: #fff; border-radius: 10px; padding: 1px 7px; font-size: 12px; }
.filters { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
.hint { color: #7a8494; font-size: 12px; }
.message.err { color: #ff8a8a; background: #2a1b1b; border: 1px solid #5a2a2a; padding: 8px; border-radius: 6px; }
.empty { color: #7a8494; padding: 16px; text-align: center; }
.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.tbl th, .tbl td { border-bottom: 1px solid #2a3142; padding: 8px; text-align: left; }
.tbl th { color: #9aa3b2; font-weight: 600; }
.title { max-width: 260px; }
.mono { font-family: ui-monospace, monospace; color: #9aa3b2; font-size: 12px; }
.muted { color: #6b7484; }
.tags-cell { max-width: 220px; }
.mini-tag { display: inline-block; background: #243049; color: #b9c4d8; border-radius: 4px; padding: 1px 6px; margin: 1px; font-size: 11px; }
.flag { font-size: 10px; padding: 1px 5px; border-radius: 4px; margin-left: 4px; }
.flag.dup { background: #3a2f1b; color: #d9b36b; }
.flag.ok { background: #1b3a2a; color: #6bd99a; }
.dot { color: #4a5163; margin-right: 4px; }
.dot.on { color: #f5c542; }
.actions { white-space: nowrap; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; align-items: center; }
.chip-label { color: #7a8494; font-size: 12px; }
.chip { background: #243049; color: #b9c4d8; border: 1px solid #2a3142; border-radius: 12px; padding: 2px 10px; cursor: pointer; font-size: 12px; }
.chip-count { color: #6b7484; margin-left: 4px; }
.pager { display: flex; gap: 12px; align-items: center; justify-content: center; margin-top: 12px; }
.graph { background: #11151f; border: 1px solid #2a3142; border-radius: 8px; padding: 12px; font-size: 13px; display: flex; flex-direction: column; gap: 6px; }
.g-node { background: #1b2233; border: 1px solid #2a3142; border-radius: 6px; padding: 8px; }
.g-node.sub { background: #161c2a; }
.g-edge { color: #7a8494; font-size: 12px; margin-left: 8px; }
.g-kind { color: #6bd99a; font-size: 11px; margin-right: 6px; }
.g-node ul { margin: 4px 0 0; padding-left: 18px; }
</style>
