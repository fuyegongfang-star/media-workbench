<template>
  <div class="radar">
    <header class="page-head">
      <div>
        <h1 class="page-title">选题雷达</h1>
        <p class="page-sub">配置驱动的每日选题简报：免费源采集 → 指纹去重 → 赛道打分 → 出标题 → 一键转选题</p>
      </div>
      <div class="head-actions">
        <span class="pill" :class="scheduler?.available ? 'ok' : 'warn'">
          {{ scheduler?.available ? '定时已就绪' : '仅手动触发（队列未就绪）' }}
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
    <div v-if="justConvertedTopicId" class="convert-cta">
      <span>刚采纳的选题已备好，直接开始创作 →</span>
      <button class="btn primary" @click="goCreateFromRadar">去创作（生成标题）</button>
      <button class="btn ghost small" @click="justConvertedTopicId = ''">知道了</button>
    </div>

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

        <!-- 主推：按国内 / 海外分栏 -->
        <template v-for="g in featuredGroups" :key="'f-' + g.region">
          <div v-if="g.items.length" class="section-title">
            {{ g.region === 'domestic' ? '🇨🇳 国内主推' : '🌍 海外主推' }}（{{ g.items.length }}）
          </div>
          <article v-for="item in g.items" :key="item.id" class="item featured">
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
              <span class="region-tag" :class="item.region">{{ item.region === 'domestic' ? '国内' : '海外' }}</span>
              <span v-if="item.publishedAt" class="time-tag" :title="fullTime(item.publishedAt)">🕒 {{ relativeTime(item.publishedAt) }}</span>
              <span v-else class="time-tag muted">时间未知</span>
              <span class="src-tag">{{ SOURCE_LABEL[item.sourceName] || item.sourceName }}</span>
              <span v-if="item.niche" class="niche-tag">{{ item.niche }}</span>
              <button class="btn small" :disabled="!!item.convertedTopicId || converting === item.id" @click="convert(item)">
                {{ item.convertedTopicId ? '已转选题' : converting === item.id ? '转换中…' : '一键转选题' }}
              </button>
            </div>
          </article>
        </template>

        <!-- 备选池：按国内 / 海外分栏 -->
        <template v-for="g in candidateGroups" :key="'c-' + g.region">
          <div v-if="g.items.length" class="section-title">
            {{ g.region === 'domestic' ? '🇨🇳 国内备选' : '🌍 海外备选' }}（{{ g.items.length }}）
          </div>
          <div class="candidate-grid">
            <article v-for="item in g.items" :key="item.id" class="item candidate">
              <a v-if="item.sourceUrl" :href="item.sourceUrl" target="_blank" rel="noopener" class="item-title link">{{ item.title }}</a>
              <span v-else class="item-title">{{ item.title }}</span>
              <div class="candidate-foot">
                <span class="region-tag small" :class="item.region">{{ item.region === 'domestic' ? '国内' : '海外' }}</span>
                <span v-if="item.publishedAt" class="time-tag muted" :title="fullTime(item.publishedAt)">{{ relativeTime(item.publishedAt) }}</span>
                <span class="src-tag">{{ SOURCE_LABEL[item.sourceName] || item.sourceName }}</span>
                <button class="btn small ghost" :disabled="!!item.convertedTopicId || converting === item.id" @click="convert(item)">
                  {{ item.convertedTopicId ? '已转' : '转选题' }}
                </button>
              </div>
            </article>
          </div>
        </template>
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
      <p class="hint" style="margin-bottom:14px">
        这里只配置业务参数（赛道词库、数据源、监控账号）。LLM API Key、公众号与通知渠道凭据统一在
        <router-link to="/system/ai">设置中心 → AI 与密钥</router-link> 维护，不在业务页重复填写。
      </p>
      <div class="config-grid">
        <div class="config-card">
          <h3 class="config-title">赛道词库 <span class="pill">按国内外归集</span></h3>
          <p class="hint">
            国内赛道的关键词只用于国内源（头条/B站/公众号），海外赛道只用于海外源（HN/X/YouTube），
            「通用」两边都参与。中文词筛不出英文标题，请按目标平台语言分别填词；存量赛道默认「通用」，可随时切换。
          </p>
          <div v-for="g in NICHE_GROUPS" :key="g.value" class="region-group niche-group">
            <div class="region-label" :class="g.value">
              {{ g.icon }} {{ g.label }}赛道
              <span class="muted">· {{ nicheGroupKeywords(g.value).length }} 个关键词 · {{ nichesOf(g.value).length }} 个赛道</span>
            </div>
            <p class="hint" style="margin:0 0 8px">{{ g.hint }}</p>
            <div v-for="n in nichesOf(g.value)" :key="n.key" class="niche-block">
              <div class="niche-head">
                <input v-model="n.name" class="input" placeholder="赛道名" style="flex:1;min-width:100px" />
                <select v-model="n.region" class="input" style="width:92px" title="切换赛道适用地区">
                  <option v-for="opt in NICHE_GROUPS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
                <label class="check"><input type="checkbox" v-model="n.enabled" /> 启用</label>
                <button class="btn small ghost" @click="removeNiche(n.key)">删除</button>
              </div>
              <input
                :value="n.keywords.join(', ')"
                class="input wide"
                placeholder="关键词，逗号分隔（建议用目标平台语言）"
                @input="n.keywords = ($event.target as HTMLInputElement).value.split(',').map(s => s.trim()).filter(Boolean)"
              />
            </div>
            <p v-if="!nichesOf(g.value).length" class="hint muted" style="margin:0 0 8px">暂无该地区的赛道，可点击下方按钮添加。</p>
            <button class="btn small" @click="addNiche(g.value)">+ 添加{{ g.label }}赛道</button>
          </div>
          <div class="niche-actions">
            <button class="btn small ghost" :disabled="applyingPreset" @click="applyPreset">
              {{ applyingPreset ? '应用中…' : '一键套用推荐词库（国内 2 组 + 海外 2 组 + 通用 1 组）' }}
            </button>
            <span class="hint">会替换当前赛道列表，套用后请点「保存配置」；适合快速起步或恢复默认。</span>
          </div>
        </div>

        <div class="config-card">
          <h3 class="config-title">数据源 <span class="pill">按地区自动归类</span></h3>
          <p class="hint">国内源只用「国内 + 通用」赛道词采集，海外源只用「海外 + 通用」赛道词采集；简报按国内/海外分栏展示。</p>
          <div class="region-group">
            <div class="region-label domestic">🇨🇳 国内</div>
            <div class="checks">
              <label v-for="key in DOMESTIC_SOURCES" :key="key" class="check">
                <input type="checkbox" v-model="config.sources[key]" /> {{ SOURCE_LABEL[key] }}
              </label>
            </div>
          </div>
          <div class="region-group">
            <div class="region-label overseas">🌍 海外</div>
            <div class="checks">
              <label v-for="key in OVERSEAS_SOURCES" :key="key" class="check">
                <input type="checkbox" v-model="config.sources[key]" /> {{ SOURCE_LABEL[key] }}
              </label>
            </div>
          </div>

          <h3 class="config-title" style="margin-top:18px">内容时效</h3>
          <div class="field">
            <label>只采集发布时间在</label>
            <select v-model.number="config.freshnessDays" class="input">
              <option :value="0">不限时间</option>
              <option :value="1">当天</option>
              <option :value="3">三天内</option>
              <option :value="7">一周内</option>
              <option :value="15">半个月内</option>
            </select>
          </div>
          <p class="hint">按来源发布时间过滤；头条/B站等热榜无精确时间，会保留并标注「时间未知」，不会被误删。</p>

          <h3 class="config-title" style="margin-top:18px">输出</h3>
          <div class="field"><label>每日总条数</label><input v-model.number="config.output.totalItems" class="input" type="number" min="5" max="100" /></div>
          <div class="field"><label>其中主推条数</label><input v-model.number="config.output.featuredItems" class="input" type="number" min="1" max="20" /></div>
          <div class="field"><label>每条候选标题数</label><input v-model.number="config.output.titlesPerItem" class="input" type="number" min="1" max="5" /></div>
        </div>

        <div class="config-card">
          <h3 class="config-title">定时推送</h3>
          <label class="check"><input type="checkbox" v-model="config.schedule.enabled" /> 启用每天定时采集</label>
          <div class="field" style="margin-top:10px"><label>时间（Asia/Shanghai）</label><input v-model="config.schedule.time" class="input" type="time" /></div>
          <p class="hint">{{ scheduler?.available ? 'Redis 在线，保存后定时任务即时生效。' : '任务队列未就绪：配置可保存，但定时采集暂不生效，请手动触发。' }}</p>

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

      <!-- 自定义数据源：管理员可接入自有 RSS / JSON 源 -->
      <div class="config-card custom-sources">
        <h3 class="config-title">自定义数据源 <span class="pill">RSS / JSON</span></h3>
        <p class="hint">
          除内置零 Key 源外，可接入自有 RSS / Atom 订阅或返回数组的 JSON 接口。
          JSON 支持顶层数组或 <code>items / data / results / list</code> 数组，条目取 <code>title</code> 与 <code>url</code>。
          仅接受 http(s) 地址；单个源失败不影响其它源。保存后下次采集生效。
        </p>
        <div v-for="(s, si) in config.customSources" :key="s.id || si" class="custom-source-row">
          <div class="row">
            <label class="check"><input type="checkbox" v-model="s.enabled" /> 启用</label>
            <input v-model="s.name" class="input" style="flex:1;min-width:140px" placeholder="来源名称" />
            <select v-model="s.format" class="input" style="width:120px">
              <option value="rss">RSS / Atom</option>
              <option value="json">JSON</option>
            </select>
            <select v-model="s.region" class="input" style="width:110px" title="该地区的内容在简报里归入对应分栏">
              <option value="domestic">国内</option>
              <option value="overseas">海外</option>
            </select>
            <button class="btn small ghost" :disabled="testingSource === si" @click="testSource(s, si)">
              {{ testingSource === si ? '测试中…' : '测试' }}
            </button>
            <button class="btn small ghost" @click="config.customSources.splice(si, 1)">删除</button>
          </div>
          <input v-model="s.url" class="input wide mono" placeholder="https://example.com/feed.xml 或 https://api.example.com/hot.json" />
          <input
            :value="s.keywords.join(', ')"
            class="input wide"
            placeholder="额外相关度关键词（逗号分隔，可选）"
            @input="s.keywords = splitList(($event.target as HTMLInputElement).value)"
          />
          <p v-if="sourceTest[si]" class="hint" :class="sourceTest[si].ok ? 'test-ok' : 'test-err'">
            {{ sourceTest[si].message }}
          </p>
        </div>
        <p v-if="!config.customSources.length" class="hint">尚未添加自定义数据源，内置源仍可正常采集。</p>
        <button class="btn small" @click="addCustomSource">+ 添加数据源</button>
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
import { useRouter } from 'vue-router';
import {
  fetchRadarConfig, saveRadarConfig, triggerRadarCollect, fetchRadarBriefs, fetchRadarBrief,
  convertRadarItem, fetchRadarStatus, testRadarCustomSource,
  type RadarConfig, type RadarNiche, type RadarBriefSummary, type RadarBriefDetail, type RadarItemView, type RadarStatus,
  type RadarCustomSource,
} from '../api/http';

const SOURCE_LABEL: Record<string, string> = {
  toutiao: '今日头条', bilibili: 'B站', hnrss: 'Hacker News', sogou_wechat: '公众号(搜狗)',
  x_account: 'X 监控账号', youtube_account: 'YouTube 监控频道',
};
/** 内置源按地区分组（与后端 SOURCE_REGION 一致）。 */
const DOMESTIC_SOURCES = ['toutiao', 'bilibili', 'sogou_wechat'];
const OVERSEAS_SOURCES = ['hnrss', 'x_account', 'youtube_account'];

type NicheRegion = RadarNiche['region'];
/** 赛道按地区分组（与后端 NicheRegion / NICHE_REGION_OPTIONS 一致）。 */
const NICHE_GROUPS: Array<{ value: NicheRegion; label: string; icon: string; hint: string }> = [
  { value: 'domestic', label: '国内', icon: '🇨🇳', hint: '中文关键词 → 今日头条 / B站 / 公众号（搜狗）' },
  { value: 'overseas', label: '海外', icon: '🌍', hint: '英文关键词 → Hacker News / X / YouTube' },
  { value: 'both', label: '通用', icon: '🌐', hint: '两边源都参与；存量赛道升级后默认归到这里，可随时切换' },
];
/** 推荐词库：与后端 DEFAULT_RADAR_CONFIG.niches 保持一致，供「一键套用」。 */
const PRESET_NICHES: RadarNiche[] = [
  { name: '副业与网赚', enabled: true, region: 'domestic', keywords: ['副业', '网赚', '变现', '被动收入', '项目拆解', '私域', '引流'] },
  { name: 'AI与效率工具', enabled: true, region: 'domestic', keywords: ['AI', 'AI工具', 'ChatGPT', '智能体', '自动化', 'AIGC', '提示词'] },
  { name: 'Indie Hacker / 独立开发', enabled: true, region: 'overseas', keywords: ['indie hacker', 'side project', 'SaaS', 'bootstrapped', 'MRR', 'build in public', 'solopreneur'] },
  { name: 'AI & Dev Tools', enabled: true, region: 'overseas', keywords: ['AI', 'LLM', 'open source', 'developer tools', 'agent', 'coding', 'startup'] },
  { name: '重大产品发布（通用）', enabled: false, region: 'both', keywords: ['launch', '发布', 'release', '上线'] },
];

/** 相对时间：「刚刚 / N 分钟前 / N 小时前 / N 天前 / 具体日期」。 */
function relativeTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '时间未知';
  const diff = Date.now() - ms;
  if (diff < 0) return '刚刚';
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day} 天前`;
  return new Date(ms).toISOString().slice(0, 10);
}
/** 完整时间（title 悬浮提示），显示到分钟，按本地时区。 */
function fullTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const tabs = [
  { key: 'today', label: '今日简报' },
  { key: 'history', label: '历史归档' },
  { key: 'config', label: '雷达配置' },
] as const;
type TabKey = typeof tabs[number]['key'];
const tab = ref<TabKey>('today');

const message = ref('');
const messageType = ref<'ok' | 'err'>('ok');
const router = useRouter();
/** 最近一次转选题成功的 topicId：显示「去创作」直达按钮，减少手动找菜单。 */
const justConvertedTopicId = ref('');
function goCreateFromRadar() {
  if (!justConvertedTopicId.value) return;
  router.push(`/content?topic=${encodeURIComponent(justConvertedTopicId.value)}`);
}
const collecting = ref(false);
const converting = ref('');
const savingConfig = ref(false);
const scheduler = ref<RadarStatus['scheduler'] | null>(null);

const briefs = ref<RadarBriefSummary[]>([]);
const brief = ref<RadarBriefDetail | null>(null);
const featured = computed(() => (brief.value?.items || []).filter((i) => i.tier === 'featured'));
const candidates = computed(() => (brief.value?.items || []).filter((i) => i.tier !== 'featured'));
/** 按地区分栏：国内在前、海外在后，空组不渲染（模板里用 v-if 控制）。 */
function groupByRegion(list: RadarItemView[]) {
  return (['domestic', 'overseas'] as const).map((region) => ({
    region,
    items: list.filter((i) => (i.region || 'domestic') === region),
  }));
}
const featuredGroups = computed(() => groupByRegion(featured.value));
const candidateGroups = computed(() => groupByRegion(candidates.value));

/** 赛道行附加一个纯前端的稳定 key（不入库，保存时剥离），保证切换地区/删除时渲染不错乱。 */
type NicheRow = RadarNiche & { key: string };
let nicheKeySeq = 0;
const newNicheKey = () => `niche-${++nicheKeySeq}`;

const config = reactive<Omit<RadarConfig, 'niches'> & { niches: NicheRow[] }>({
  niches: [],
  sources: {},
  output: { totalItems: 20, featuredItems: 5, titlesPerItem: 3, saveToLibrary: true },
  schedule: { enabled: false, time: '08:00', timezone: 'Asia/Shanghai' },
  monitoredAccounts: { x: [], youtube: [] },
  accountDedupeDays: 7,
  freshnessDays: 0,
  customSources: [],
});
const applyingPreset = ref(false);

/** 取某地区的赛道（存量缺 region 时按 both 兼容）。 */
function nichesOf(region: NicheRegion): NicheRow[] {
  return config.niches.filter((n) => (n.region || 'both') === region);
}
/** 某地区已启用赛道的去重关键词，用于分组标题上的统计。 */
function nicheGroupKeywords(region: NicheRegion): string[] {
  const set = new Set<string>();
  for (const n of nichesOf(region)) {
    if (!n.enabled) continue;
    for (const k of n.keywords) {
      const kw = k.trim();
      if (kw) set.add(kw.toLowerCase());
    }
  }
  return [...set];
}
function addNiche(region: NicheRegion) {
  config.niches.push({ key: newNicheKey(), name: '', enabled: true, region, keywords: [] });
}
function removeNiche(key: string) {
  const i = config.niches.findIndex((n) => n.key === key);
  if (i >= 0) config.niches.splice(i, 1);
}
function applyPreset() {
  applyingPreset.value = true;
  try {
    config.niches = PRESET_NICHES.map((n) => ({ ...n, keywords: [...n.keywords], key: newNicheKey() }));
    notify('已套用推荐词库（国内 2 组 + 海外 2 组 + 通用 1 组），请点「保存配置」生效');
  } finally { applyingPreset.value = false; }
}

const testingSource = ref<number | null>(null);
const sourceTest = reactive<Record<number, { ok: boolean; message: string }>>({});

function addCustomSource() {
  config.customSources.push({
    id: `src_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    url: '',
    format: 'rss',
    enabled: true,
    keywords: [],
    region: 'domestic',
  } as RadarCustomSource);
}

async function testSource(s: RadarCustomSource, index: number) {
  if (!s.url.trim()) {
    sourceTest[index] = { ok: false, message: '请先填写数据源 URL' };
    return;
  }
  testingSource.value = index;
  delete sourceTest[index];
  try {
    const r = await testRadarCustomSource({ url: s.url.trim(), format: s.format });
    const first = r.sample[0]?.title;
    sourceTest[index] = {
      ok: r.ok,
      message: r.ok
        ? `连接成功，解析出 ${r.count} 条${first ? `，示例：${first}` : ''}`
        : `连接失败：${r.error || '未解析出条目'}`,
    };
  } catch (e) {
    sourceTest[index] = { ok: false, message: `测试失败：${(e as Error).message}` };
  } finally {
    testingSource.value = null;
  }
}

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
    // 兼容旧实例：配置里还没有 customSources 时补空数组，避免模板 v-for 报错。
    if (!Array.isArray(config.customSources)) config.customSources = [];
    // 兼容旧实例：自定义源缺 region / 配置缺 freshnessDays / 赛道缺 region 时补默认值。
    for (const s of config.customSources) if (s.region !== 'overseas') s.region = 'domestic';
    if (config.freshnessDays === undefined || config.freshnessDays === null) config.freshnessDays = 0;
    // 存量赛道没有 region（升级前存的），一律按「通用」兼容，行为不变；同时补前端稳定 key。
    config.niches = (config.niches || []).map((n) => ({
      ...n,
      region: n.region === 'domestic' || n.region === 'overseas' || n.region === 'both' ? n.region : 'both',
      keywords: Array.isArray(n.keywords) ? n.keywords : [],
      key: newNicheKey(),
    }));
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
    notify(r.dispatched ? `采集任务已提交（${r.taskId}），稍后刷新查看简报` : '任务已创建，但队列未就绪未入队；请稍后重试', !r.dispatched);
    setTimeout(() => { void loadBriefs(); }, 8000);
  } catch (e) { notify(`采集触发失败：${(e as Error).message}`, true); }
  finally { collecting.value = false; }
}

async function convert(item: RadarItemView) {
  converting.value = item.id;
  try {
    const r = await convertRadarItem(item.id);
    item.convertedTopicId = r.topicId;
    justConvertedTopicId.value = r.topicId;
    notify(`✓ 已转为选题，可直接去创作（生成标题 → 建内容项目 → AI 一键成文）。`);
  } catch (e) { notify(`转选题失败：${(e as Error).message}`, true); }
  finally { converting.value = ''; }
}

async function saveConfig() {
  savingConfig.value = true;
  try {
    // 深拷贝并剥离纯前端的 key 字段，只提交后端契约字段。
    const cloned = JSON.parse(JSON.stringify(config)) as Omit<RadarConfig, 'niches'> & { niches: NicheRow[] };
    const payload: RadarConfig = {
      ...cloned,
      niches: cloned.niches.map(({ key: _key, ...n }) => n),
    };
    const r = await saveRadarConfig(payload);
    scheduler.value = r.scheduler;
    notify('雷达配置已保存' + (r.scheduler.available ? '（定时已按新配置生效）' : '（队列未就绪，定时未生效）'));
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
.region-tag { font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
.region-tag.domestic { background: rgba(231, 76, 60, 0.16); color: #ff8b7a; }
.region-tag.overseas { background: rgba(46, 204, 113, 0.14); color: #5fd39a; }
.region-tag.small { font-size: 10px; padding: 1px 6px; }
.time-tag { font-size: 11px; color: var(--side-text, #9aa3b2); }
.time-tag.muted { opacity: 0.75; }
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
.custom-sources { margin-top: 14px; }
.custom-source-row { display: flex; flex-direction: column; gap: 8px; padding: 10px; margin-bottom: 10px; border: 1px solid var(--border, #2a2c3a); border-radius: 8px; background: var(--panel-soft, #f5f7fa); }
.custom-source-row .row { flex-wrap: wrap; }
.test-ok { color: var(--ok, #16794b); }
.test-err { color: var(--danger, #c0392b); }
.niche-block { background: var(--panel, #1e2030); border: 1px solid var(--border, #2a2c3a); border-radius: 6px; padding: 10px; margin-bottom: 10px; }
.niche-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
.niche-group { border: 1px dashed var(--border, #2a2c3a); border-radius: 8px; padding: 10px; margin-bottom: 12px; }
.niche-group .region-label.both { color: #7fb0ff; }
.niche-actions { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; padding-top: 10px; border-top: 1px solid var(--border, #2a2c3a); }
.input { background: var(--panel, #1e2030); border: 1px solid var(--border, #2a2c3a); color: var(--text, #e6e8ef); border-radius: 6px; padding: 7px 9px; font-size: 12px; outline: none; }
.input:focus { border-color: var(--brand, #4f8cff); }
.input.wide { width: 100%; }
.field { margin-bottom: 10px; }
.field label { display: block; font-size: 11px; color: var(--side-text, #9aa3b2); margin-bottom: 4px; }
.checks { display: flex; flex-direction: column; gap: 7px; }
.region-group { margin-bottom: 12px; }
.region-label { font-size: 12px; font-weight: 600; margin-bottom: 6px; padding-left: 2px; }
.region-label.domestic { color: #ff8b7a; }
.region-label.overseas { color: #5fd39a; }
.check { font-size: 12px; color: var(--text, #e6e8ef); display: flex; align-items: center; gap: 6px; }
.hint { font-size: 11px; color: var(--side-text, #9aa3b2); line-height: 1.6; margin: 6px 0; }
.row { display: flex; gap: 10px; flex-wrap: wrap; }
.empty { padding: 30px; text-align: center; color: var(--side-text, #9aa3b2); font-size: 13px; }
.message { font-size: 12px; padding: 9px 12px; border-radius: 8px; margin: 0; }
.message.ok { background: rgba(79, 140, 255, 0.12); color: #9fc1ff; }
.message.err { background: rgba(255, 90, 90, 0.12); color: #ff9b9b; }
.convert-cta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 16px;
  margin: 0 0 14px;
  background: var(--brand-soft);
  border: 1px solid var(--brand);
  border-radius: var(--radius);
  font-size: 13px;
  color: var(--text);
}
</style>
