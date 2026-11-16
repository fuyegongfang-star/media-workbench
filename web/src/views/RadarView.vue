<template>
  <div class="radar">
    <header class="page-head">
      <div>
        <h1 class="page-title">选题雷达</h1>
        <p class="page-sub">配置驱动的每日选题简报：免费源采集 → 指纹去重 → 赛道打分 → 出标题 → 一键转选题</p>
      </div>
      <div class="head-actions">
        <span class="pill" :class="scheduler?.available ? 'ok' : 'warn'">
          {{ scheduler?.available ? '定时已就绪' : '仅手动触发（Redis 待环境）' }}
        </span>
        <button class="btn primary" :disabled="collecting" @click="collect">
          {{ collecting ? '采集中…' : '立即采集' }}
        </button>
      </div>
    </header>

    <nav class="tabs">
      <button v-for="t in tabs" :key="t.key" class="tab" :class="{ active: tab === t.key }" @click="tab = t.key">
        {{ t.label }}
      </button>
    </nav>

    <p v-if="message" class="message" :class="messageType">{{ message }}</p>

    <!-- 今日简报 -->
    <section v-if="tab === 'today'" class="panel">
      <template v-if="brief">
        <div class="brief-head">
          <div class="brief-meta">
            <h2 class="brief-title">📅 {{ brief.runDate }} 选题简报</h2>
            <span class="pill" :class="brief.status === 'success' ? 'ok' : 'warn'">{{ brief.status }}</span>
            <span class="muted">共 {{ brief.itemCount }} 条 · 主推 {{ brief.featuredCount }} 条</span>
          </div>
          <div class="source-stats" v-if="Object.keys(brief.sourceStats || {}).length">
            <span v-for="(v, k) in brief.sourceStats" :key="String(k)" class="src-chip">
              {{ SOURCE_LABEL[String(k)] || String(k) }}：{{ (v as {count?: number})?.count ?? '—' }}
            </span>
          </div>
        </div>

        <div v-if="featured.length" class="section-title">🔥 今日主推（{{ featured.length }}）</div>
        <article v-for="item in featured" :key="item.id" class="item featured">
          <div class="item-top">
            <span class="rank">#{{ item.rank }}</span>
            <a v-if="item.sourceUrl" :href="item.sourceUrl" target="_blank" rel="noopener" class="item-title link">{{ item.title }}</a>
            <span v-else class="item-title">{{ item.title }}</span>
            <span class="score">相关度 {{ Math.round((item.relevance || 0) * 100) }}%</span>
          </div>
          <p class="angle">{{ item.angle }}</p>
          <div class="title-list">
            <div v-for="(t, i) in item.titles" :key="i" class="title-line">
              <span class="title-text">{{ t.text }}</span>
              <span v-if="t.basis" class="basis">{{ t.basis }}</span>
            </div>
          </div>
          <div class="item-foot">
            <span class="src-tag">{{ SOURCE_LABEL[item.sourceName] || item.sourceName }}</span>
            <span v-if="item.niche" class="niche-tag">{{ item.niche }}</span>
            <button class="btn small" :disabled="!!item.convertedTopicId || converting === item.id" @click="convert(item)">
              {{ item.convertedTopicId ? '已转选题' : converting === item.id ? '转换中…' : '一键转选题' }}
            </button>
          </div>
        </article>

        <div v-if="candidates.length" class="section-title">📦 备选池（{{ candidates.length }}）</div>
        <div class="candidate-grid">
          <article v-for="item in candidates" :key="item.id" class="item candidate">
            <a v-if="item.sourceUrl" :href="item.sourceUrl" target="_blank" rel="noopener" class="item-title link">{{ item.title }}</a>
            <span v-else class="item-title">{{ item.title }}</span>
            <div class="candidate-foot">
              <span class="src-tag">{{ SOURCE_LABEL[item.sourceName] || item.sourceName }}</span>
              <button class="btn small ghost" :disabled="!!item.convertedTopicId || converting === item.id" @click="convert(item)">
                {{ item.convertedTopicId ? '已转' : '转选题' }}
              </button>
            </div>
          </article>
        </div>
      </template>
      <div v-else class="empty">
        <p>还没有简报。点右上角「立即采集」跑一次，或到「雷达配置」开启定时。</p>
        <p class="muted">采集依赖免费热榜入口可达；公众号（搜狗微信）可能触发反爬而跳过，属正常降级。</p>
      </div>
    </section>

    <!-- 历史归档 -->
    <section v-if="tab === 'history'" class="panel">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>日期</th><th>状态</th><th>条数</th><th>主推</th><th>采集时间</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="b in briefs" :key="b.id">
              <td>{{ b.runDate }}</td>
              <td><span class="pill" :class="b.status === 'success' ? 'ok' : 'warn'">{{ b.status }}</span></td>
              <td>{{ b.itemCount }}</td>
              <td>{{ b.featuredCount }}</td>
              <td class="muted">{{ b.createdAt.replace('T', ' ').slice(0, 19) }}</td>
              <td><button class="btn small" @click="openBrief(b.id)">查看</button></td>
            </tr>
            <tr v-if="!briefs.length"><td colspan="6" class="muted center">暂无历史简报</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 雷达配置 -->
    <section v-if="tab === 'config'" class="panel">
      <div class="config-grid">
        <div class="config-card">
          <h3 class="config-title">赛道词库</h3>
          <p class="hint">雷达拿这些词去各平台捞内容；可随时增删改，保存后下次采集生效。</p>
          <div v-for="(n, ni) in config.niches" :key="ni" class="niche-block">
            <div class="niche-head">
              <input v-model="n.name" class="input" placeholder="赛道名" />
              <label class="check"><input type="checkbox" v-model="n.enabled" /> 启用</label>
              <button class="btn small ghost" @click="config.niches.splice(ni, 1)">删除</button>
            </div>
            <input
              :value="n.keywords.join(', ')"
              class="input wide"
              placeholder="关键词，逗号分隔"
              @input="n.keywords = ($event.target as HTMLInputElement).value.split(',').map(s => s.trim()).filter(Boolean)"
            />
          </div>
          <button class="btn small" @click="config.niches.push({ name: '', enabled: true, keywords: [] })">+ 添加赛道</button>
        </div>

        <div class="config-card">
          <h3 class="config-title">数据源</h3>
          <div class="checks">
            <label v-for="(label, key) in SOURCE_LABEL" :key="key" class="check">
              <input type="checkbox" v-model="config.sources[key]" /> {{ label }}
            </label>
          </div>
          <h3 class="config-title" style="margin-top:18px">输出</h3>
          <div class="field"><label>每日总条数</label><input v-model.number="config.output.totalItems" class="input" type="number" min="5" max="100" /></div>
          <div class="field"><label>其中主推条数</label><input v-model.number="config.output.featuredItems" class="input" type="number" min="1" max="20" /></div>
          <div class="field"><label>每条候选标题数</label><input v-model.number="config.output.titlesPerItem" class="input" type="number" min="1" max="5" /></div>
        </div>

        <div class="config-card">
          <h3 class="config-title">定时推送</h3>
          <label class="check"><input type="checkbox" v-model="config.schedule.enabled" /> 启用每天定时采集</label>
          <div class="field" style="margin-top:10px"><label>时间（Asia/Shanghai）</label><input v-model="config.schedule.time" class="input" type="time" /></div>
          <p class="hint">{{ scheduler?.available ? 'Redis 在线，保存后定时任务即时生效。' : 'Redis 待环境：保存配置可成功，但定时不生效，需手动采集。' }}</p>

          <h3 class="config-title" style="margin-top:18px">监控账号（已启用 · 零 Key）</h3>
          <div class="field"><label>X 用户名（逗号分隔）</label>
            <input :value="config.monitoredAccounts.x.join(', ')" class="input wide" placeholder="elonmusk, OpenAI"
              @input="config.monitoredAccounts.x = splitList(($event.target as HTMLInputElement).value)" />
          </div>
          <div class="field"><label>YouTube 频道（逗号分隔）</label>
            <input :value="config.monitoredAccounts.youtube.join(', ')" class="input wide" placeholder="UC..., @handle"
              @input="config.monitoredAccounts.youtube = splitList(($event.target as HTMLInputElement).value)" />
          </div>
          <p class="hint">填好账号并保存，下次采集自动盯这些号：X 走社区镜像 RSS（多实例容错，无需 Felo/付费 Key），YouTube 走频道页直采。留空则该源跳过；上方「数据源」里可单独关掉。</p>
          <div class="field" style="margin-top:12px"><label>盯号去重窗口（天）</label>
            <input v-model.number="config.accountDedupeDays" class="input" type="number" min="0" max="90" />
          </div>
          <p class="hint">监控账号发布的同一条内容在该窗口内只推一次，避免每日简报重复刷旧内容；填 <b>0</b> 则关闭去重（每轮全量）。默认 7 天，仅对 X / YouTube 盯号生效，不影响热榜。</p>
        </div>
      </div>
      <div class="row" style="margin-top:14px">
        <button class="btn primary" :disabled="savingConfig" @click="saveConfig">{{ savingConfig ? '保存中…' : '保存配置' }}</button>
        <button class="btn ghost" @click="loadConfig">重新载入</button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import {
  fetchRadarConfig, saveRadarConfig, triggerRadarCollect, fetchRadarBriefs, fetchRadarBrief,
  convertRadarItem, fetchRadarStatus,
  type RadarConfig, type RadarBriefSummary, type RadarBriefDetail, type RadarItemView, type RadarStatus,
} from '../api/http';

const SOURCE_LABEL: Record<string, string> = {
  toutiao: '今日头条', bilibili: 'B站', hnrss: 'Hacker News', sogou_wechat: '公众号(搜狗)',
  x_account: 'X 监控账号', youtube_account: 'YouTube 监控频道',
};

const tabs = [
  { key: 'today', label: '今日简报' },
  { key: 'history', label: '历史归档' },
  { key: 'config', label: '雷达配置' },
] as const;
type TabKey = typeof tabs[number]['key'];
const tab = ref<TabKey>('today');

const message = ref('');
const messageType = ref<'ok' | 'err'>('ok');
const collecting = ref(false);
const converting = ref('');
const savingConfig = ref(false);
const scheduler = ref<RadarStatus['scheduler'] | null>(null);

const briefs = ref<RadarBriefSummary[]>([]);
const brief = ref<RadarBriefDetail | null>(null);
const featured = computed(() => (brief.value?.items || []).filter((i) => i.tier === 'featured'));
const candidates = computed(() => (brief.value?.items || []).filter((i) => i.tier !== 'featured'));

const config = reactive<RadarConfig>({
  niches: [],
  sources: {},
  output: { totalItems: 20, featuredItems: 5, titlesPerItem: 3, saveToLibrary: true },
  schedule: { enabled: false, time: '08:00', timezone: 'Asia/Shanghai' },
  monitoredAccounts: { x: [], youtube: [] },
  accountDedupeDays: 7,
});

function splitList(s: string): string[] {
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

function notify(msg: string, err = false) {
  message.value = msg;
  messageType.value = err ? 'err' : 'ok';
}

async function loadConfig() {
  try {
    const c = await fetchRadarConfig();
    Object.assign(config, c);
  } catch (e) { notify(`配置加载失败：${(e as Error).message}`, true); }
}

async function loadBriefs() {
  try {
    briefs.value = (await fetchRadarBriefs()).briefs;
    const today = new Date().toISOString().slice(0, 10);
    const todayBrief = briefs.value.find((b) => b.runDate === today) || briefs.value[0];
    if (todayBrief) await openBrief(todayBrief.id);
    else brief.value = null;
  } catch (e) { notify(`简报列表加载失败：${(e as Error).message}`, true); }
}

async function openBrief(id: string) {
  try {
    brief.value = await fetchRadarBrief(id);
    tab.value = 'today';
  } catch (e) { notify(`简报加载失败：${(e as Error).message}`, true); }
}

async function collect() {
  collecting.value = true;
  try {
    const r = await triggerRadarCollect();
    notify(r.dispatched ? `采集任务已提交（${r.taskId}），稍后刷新查看简报` : '任务已创建，但 Redis 待环境未入队；请配置 Redis 后重试', !r.dispatched);
    setTimeout(() => { void loadBriefs(); }, 8000);
  } catch (e) { notify(`采集触发失败：${(e as Error).message}`, true); }
  finally { collecting.value = false; }
}

async function convert(item: RadarItemView) {
  converting.value = item.id;
  try {
    const r = await convertRadarItem(item.id);
    item.convertedTopicId = r.topicId;
    notify(`已转为选题（${r.topicId}），可在「内容项目 → 选题管理」查看`);
  } catch (e) { notify(`转选题失败：${(e as Error).message}`, true); }
  finally { converting.value = ''; }
}

async function saveConfig() {
  savingConfig.value = true;
  try {
    const r = await saveRadarConfig(JSON.parse(JSON.stringify(config)) as RadarConfig);
    scheduler.value = r.scheduler;
    notify('雷达配置已保存' + (r.scheduler.available ? '（定时已按新配置生效）' : '（Redis 待环境，定时未生效）'));
  } catch (e) { notify(`保存失败：${(e as Error).message}`, true); }
  finally { savingConfig.value = false; }
}

onMounted(async () => {
  await Promise.all([loadConfig(), loadBriefs()]);
  try { scheduler.value = (await fetchRadarStatus()).scheduler; } catch { /* 只读状态，失败静默 */ }
});
</script>

<style scoped>
.radar { display: flex; flex-direction: column; gap: 16px; }
.page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.page-title { font-size: 20px; margin: 0 0 6px; color: var(--text, #e6e8ef); }
.page-sub { font-size: 12px; color: var(--side-text, #9aa3b2); margin: 0; }
.head-actions { display: flex; align-items: center; gap: 10px; }
.tabs { display: flex; gap: 6px; border-bottom: 1px solid var(--border, #2a2c3a); }
.tab { background: none; border: none; color: var(--side-text, #9aa3b2); padding: 10px 16px; cursor: pointer; font-size: 13px; border-bottom: 2px solid transparent; }
.tab.active { color: var(--brand, #4f8cff); border-bottom-color: var(--brand, #4f8cff); }
.panel { background: var(--panel, #1e2030); border: 1px solid var(--border, #2a2c3a); border-radius: 10px; padding: 16px 18px; }
.brief-head { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.brief-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.brief-title { font-size: 16px; margin: 0; color: var(--text, #e6e8ef); }
.source-stats { display: flex; gap: 6px; flex-wrap: wrap; }
.src-chip { font-size: 11px; padding: 3px 8px; border-radius: 999px; background: var(--input, #15161f); color: var(--side-text, #9aa3b2); }
.section-title { font-size: 14px; font-weight: 600; margin: 18px 0 10px; color: var(--text, #e6e8ef); }
.item { background: var(--input, #15161f); border: 1px solid var(--border, #2a2c3a); border-radius: 8px; padding: 12px 14px; margin-bottom: 10px; }
.item.featured { border-left: 3px solid var(--brand, #4f8cff); }
.item-top { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.rank { font-size: 12px; color: var(--brand, #4f8cff); font-weight: 600; }
.item-title { font-size: 14px; color: var(--text, #e6e8ef); flex: 1; min-width: 240px; }
.link { color: var(--brand, #4f8cff); text-decoration: none; }
.link:hover { text-decoration: underline; }
.score { font-size: 11px; color: #7fb0ff; }
.angle { font-size: 12px; color: var(--side-text, #9aa3b2); margin: 8px 0; }
.title-list { display: flex; flex-direction: column; gap: 4px; margin: 8px 0; padding-left: 10px; border-left: 2px solid var(--border, #2a2c3a); }
.title-line { font-size: 13px; color: var(--text, #e6e8ef); }
.basis { font-size: 11px; color: var(--side-text, #9aa3b2); margin-left: 8px; }
.item-foot, .candidate-foot { display: flex; align-items: center; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.src-tag, .niche-tag { font-size: 11px; padding: 2px 8px; border-radius: 4px; background: var(--border, #2a2c3a); color: var(--side-text, #9aa3b2); }
.niche-tag { background: rgba(79, 140, 255, 0.16); color: #7fb0ff; }
.candidate-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
.item.candidate { margin-bottom: 0; }
.btn { background: var(--panel, #1e2030); border: 1px solid var(--border, #2a2c3a); color: var(--text, #e6e8ef); border-radius: 6px; padding: 7px 12px; cursor: pointer; font-size: 12px; }
.btn:hover { border-color: var(--brand, #4f8cff); }
.btn.primary { background: var(--brand, #4f8cff); color: #fff; border-color: transparent; }
.btn.ghost { background: transparent; }
.btn.small { padding: 4px 9px; font-size: 11px; }
.btn:disabled { opacity: 0.55; cursor: not-allowed; }
.pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; background: var(--border, #2a2c3a); color: var(--side-text, #9aa3b2); }
.pill.ok { background: rgba(79, 140, 255, 0.16); color: #7fb0ff; }
.pill.warn { background: rgba(255, 170, 70, 0.16); color: #ffba6b; }
.muted { color: var(--side-text, #9aa3b2); font-size: 12px; }
.center { text-align: center; }
.table-wrap { overflow-x: auto; }
.table { width: 100%; border-collapse: collapse; font-size: 12px; }
.table th, .table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border, #2a2c3a); color: var(--text, #e6e8ef); }
.table th { color: var(--side-text, #9aa3b2); font-weight: 500; }
.config-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
.config-card { background: var(--input, #15161f); border: 1px solid var(--border, #2a2c3a); border-radius: 8px; padding: 14px; }
.config-title { font-size: 14px; margin: 0 0 10px; color: var(--text, #e6e8ef); }
.niche-block { background: var(--panel, #1e2030); border: 1px solid var(--border, #2a2c3a); border-radius: 6px; padding: 10px; margin-bottom: 10px; }
.niche-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.input { background: var(--panel, #1e2030); border: 1px solid var(--border, #2a2c3a); color: var(--text, #e6e8ef); border-radius: 6px; padding: 7px 9px; font-size: 12px; outline: none; }
.input:focus { border-color: var(--brand, #4f8cff); }
.input.wide { width: 100%; }
.field { margin-bottom: 10px; }
.field label { display: block; font-size: 11px; color: var(--side-text, #9aa3b2); margin-bottom: 4px; }
.checks { display: flex; flex-direction: column; gap: 7px; }
.check { font-size: 12px; color: var(--text, #e6e8ef); display: flex; align-items: center; gap: 6px; }
.hint { font-size: 11px; color: var(--side-text, #9aa3b2); line-height: 1.6; margin: 6px 0; }
.row { display: flex; gap: 10px; flex-wrap: wrap; }
.empty { padding: 30px; text-align: center; color: var(--side-text, #9aa3b2); font-size: 13px; }
.message { font-size: 12px; padding: 9px 12px; border-radius: 8px; margin: 0; }
.message.ok { background: rgba(79, 140, 255, 0.12); color: #9fc1ff; }
.message.err { background: rgba(255, 90, 90, 0.12); color: #ff9b9b; }
</style>
