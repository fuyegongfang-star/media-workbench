<template>
  <div class="ct">
    <!-- 顶栏 -->
    <div class="topbar">
      <button class="btn ghost" @click="goBack">← 返回内容项目</button>
      <div class="title-wrap">
        <h2 class="card-title" style="margin: 0">
          {{ ctx?.title?.text || detail?.selectedTitle?.text || '内容项目' }}
        </h2>
        <span v-if="loading" class="badge">加载中…</span>
        <span v-else-if="detail" class="badge badge-ok">已加载</span>
      </div>
    </div>

    <p v-if="error" class="message err">{{ error }}</p>
    <p v-if="genMsg" class="message">{{ genMsg }}</p>

    <div class="layout">
      <!-- 主区：编辑器 + 版本历史 -->
      <div class="main">
        <!-- 编辑器（T3.4） -->
        <section class="card">
          <div class="editor-head">
            <h3 class="sub-title" style="margin: 0">正文编辑器（Markdown）</h3>
            <div class="editor-head-right">
              <span class="save-state" :class="saveStateClass">{{ saveStateText }}</span>
              <div class="seg">
                <button class="seg-btn" :class="{ on: mode === 'edit' }" @click="mode = 'edit'">编辑</button>
                <button class="seg-btn" :class="{ on: mode === 'preview' }" @click="mode = 'preview'">预览</button>
              </div>
            </div>
          </div>
          <p class="hint">
            键入后 2 秒自动保存为缓冲（<span class="mono">workingContent</span>，不入版本）；点「保存版本」才落一条可追溯版本。
          </p>

          <textarea
            v-show="mode === 'edit'"
            class="editor"
            :value="editorContent"
            @input="onInput"
            placeholder="在此撰写正文（支持 Markdown）…"
            spellcheck="false"
          ></textarea>
          <div v-show="mode === 'preview'" class="preview markdown" v-html="previewHtml"></div>

          <div class="editor-foot">
            <input
              v-model="versionNote"
              class="note-input"
              type="text"
              maxlength="80"
              placeholder="版本备注（可选，如：人工润色第2段）"
            />
            <button class="btn primary" :disabled="busy" @click="saveVersion">保存版本</button>
            <span v-if="detail?.currentVersionId" class="badge">当前版本已绑定</span>
            <span v-else class="badge">尚未保存版本</span>
          </div>
        </section>

        <!-- 版本历史（T3.4） -->
        <section class="card">
          <h3 class="sub-title">版本历史（恢复 = 设当前版本 + 还原缓冲）</h3>
          <p v-if="versions.length === 0" class="hint">暂无版本。编辑后点「保存版本」即可生成第一条版本。</p>
          <ul v-else class="ver-list">
            <li
              v-for="v in versions"
              :key="v.id"
              class="ver-item"
              :class="{ current: v.id === detail?.currentVersionId, staging: isStaging(v) }"
            >
              <div class="ver-main">
                <span class="ver-no">v{{ v.versionNo }}</span>
                <span class="ver-src">{{ versionSourceLabel(v.source) }}</span>
                <span v-if="v.id === detail?.currentVersionId" class="ver-badge">当前</span>
                <span v-else-if="isStaging(v)" class="ver-badge ver-staging">待采纳</span>
              </div>
              <div class="ver-meta">
                <span v-if="v.note" class="ver-note">「{{ v.note }}」</span>
                <span class="ver-by">{{ v.createdBy?.username || '未知' }}</span>
                <span class="ver-time">{{ formatTime(v.createdAt) }}</span>
              </div>
              <div class="ver-actions">
                <button
                  v-if="v.id !== detail?.currentVersionId"
                  class="btn small"
                  :class="{ primary: isStaging(v) }"
                  :disabled="busy"
                  @click="isStaging(v) ? adopt(v) : restore(v)"
                >
                  {{ isStaging(v) ? '采纳' : '恢复此版本' }}
                </button>
                <button
                  v-if="isStaging(v) && v.id !== detail?.currentVersionId"
                  class="btn small"
                  :disabled="busy"
                  @click="discard(v)"
                >
                  放弃
                </button>
              </div>
            </li>
          </ul>
        </section>

        <section class="card">
          <h3 class="sub-title">生成运行记录（ARTICLE_GEN）</h3>
          <p class="hint">
            每次触发生成/续写/改写/压缩/扩写都会落一条 GenerationRun（含状态、模型、耗时、关联 staging 版本）。
            配置 LLM 密钥 + PostgreSQL/Redis 后，由 T3.5 处理器真实生成并写出 staging 版本；本机无环境时任务保留 queued（待环境）。
          </p>
          <p v-if="genRuns.length === 0" class="hint">
            暂无生成记录。点击右侧「AI 操作入口」即可发起生成任务。
          </p>
          <ul v-else class="run-list">
            <li v-for="r in genRuns" :key="r.id" class="run-item">
              <div class="run-main">
                <span class="run-stage">{{ stageLabel(r.stage) }}</span>
                <span class="run-status" :class="runStatusClass(r.status)">{{ r.status }}</span>
                <span v-if="r.outputVersion" class="run-out">→ v{{ r.outputVersion.versionNo }}</span>
              </div>
              <div class="run-meta">
                <span class="run-model">{{ r.model }}</span>
                <span v-if="r.durationMs != null" class="run-time">{{ (r.durationMs / 1000).toFixed(1) }}s</span>
                <span class="run-at">{{ formatTime(r.createdAt) }}</span>
              </div>
              <div v-if="r.error" class="run-err">⚠ {{ r.error }}</div>
            </li>
          </ul>
        </section>

        <!-- 朱雀检测 / 第三方润色（T3.7） -->
        <section class="card">
          <h3 class="sub-title">朱雀检测 / 第三方润色（T3.7）</h3>
          <p class="hint">
            朱雀检测绑定当前版本、<b>不改文</b>，结果写检测记录（文章修改后旧结果自动标「旧版本结果」）；
            第三方润色生成一条 <b>polish 待采纳版本</b>，可在上方「版本历史」中采纳或放弃。
            检测/润色服务不可用时，创作链路不阻断，前端显示「服务不可用，已跳过」。
          </p>
          <div class="detect-actions">
            <button
              class="btn primary"
              :disabled="busy || !detail?.currentVersionId"
              :title="detail?.currentVersionId ? '' : '请先保存至少一个版本'"
              @click="doDetect"
            >
              检测当前版本
            </button>
            <span v-if="!detail?.currentVersionId" class="badge">尚无版本可检测</span>
          </div>
          <p v-if="detectMsg" class="message">{{ detectMsg }}</p>
          <p v-if="textReviews.length === 0" class="hint">
            暂无检测记录。点击「检测当前版本」发起朱雀/LLM 检测。
          </p>
          <ul v-else class="review-run-list">
            <li
              v-for="r in textReviews"
              :key="r.id"
              class="review-run-item"
              :class="{ 'st-failed': r.status === 'failed', 'st-stale': r.stale }"
            >
              <div class="rr-main">
                <span class="rr-service">{{ serviceLabel(r.service) }}</span>
                <span class="rr-status" :class="runStatusClass(r.status)">{{ r.status }}</span>
                <span v-if="r.stale" class="rr-badge rr-stale">旧版本结果</span>
                <span v-if="r.userDecision" class="rr-badge">已{{ decisionLabel(r.userDecision) }}</span>
              </div>
              <div class="rr-summary">{{ r.summary || '（无摘要）' }}</div>
              <div class="rr-meta">
                <span v-if="r.serviceVersion" class="rr-ver">引擎 {{ r.serviceVersion }}</span>
                <span v-if="r.detectedAt" class="rr-at">{{ formatTime(r.detectedAt) }}</span>
              </div>
              <div v-if="r.status === 'failed'" class="rr-err">⚠ 服务不可用，已跳过（创作链路不受影响）</div>
              <div v-else-if="!r.userDecision" class="rr-actions">
                <button class="btn small" :disabled="busy" @click="decideReview(r, 'accepted')">标记采纳</button>
                <button class="btn small" :disabled="busy" @click="decideReview(r, 'flagged')">标红存疑</button>
                <button class="btn small" :disabled="busy" @click="decideReview(r, 'ignored')">忽略</button>
              </div>
            </li>
          </ul>
        </section>

        <section class="card">
          <h3 class="sub-title">审核状态机（T3.6）</h3>
          <p class="hint">
            审核流程：创建中 CREATING → 待审核 PENDING_REVIEW → 已审核 APPROVED（或退回 NEEDS_REVISION）。
            合规预审（T3.11）命中阻断级风险词时将在送审处提示。
          </p>
          <div v-if="reviewMsg" class="message">{{ reviewMsg }}</div>

          <!-- 审核清单 -->
          <div class="chk-list">
            <label v-for="it in (review?.checklist ?? [])" :key="it.id" class="chk-item">
              <input type="checkbox" :checked="it.checked" @change="toggleChecklist(it)" />
              <span class="chk-label">{{ it.label }}</span>
              <input
                v-if="it.checked"
                v-model="it.note"
                class="chk-note"
                type="text"
                maxlength="500"
                placeholder="备注（可选）"
              />
            </label>
          </div>
          <button class="btn small" :disabled="busy" @click="saveChecklist">保存清单</button>

          <!-- 退回意见展示 -->
          <p v-if="detail?.status === 'NEEDS_REVISION' && review?.comment" class="review-comment">
            上次退回意见：{{ review.comment }}
          </p>

          <!-- 状态相关操作 -->
          <div class="review-actions">
            <button
              v-if="detail?.status === 'CREATING' || detail?.status === 'NEEDS_REVISION'"
              class="btn primary"
              :disabled="busy || !detail?.currentVersionId"
              :title="detail?.currentVersionId ? '' : '请先保存至少一个版本'"
              @click="doSubmit"
            >
              标记待审核
            </button>

            <!-- T3.11 合规硬卡点：存在阻断级风险词且未覆盖时，提供「覆盖提交」入口 -->
            <button
              v-if="(detail?.status === 'CREATING' || detail?.status === 'NEEDS_REVISION') && hasBlockingRisk"
              class="btn danger"
              :disabled="busy"
              title="已确认风险并强制送审（保留合规预审记录备查）"
              @click="doSubmitOverride"
            >
              覆盖提交（已知风险）
            </button>

            <div v-if="detail?.status === 'PENDING_REVIEW'" class="review-pending-actions">
              <button
                class="btn primary"
                :disabled="busy || !reviewAllChecked"
                :title="reviewAllChecked ? '' : '请先勾选全部审核清单项'"
                @click="doApprove"
              >
                通过
              </button>
              <textarea
                v-model="reviewComment"
                class="review-textarea"
                maxlength="500"
                placeholder="退回修改意见（必填）"
              ></textarea>
              <button class="btn" :disabled="busy || !reviewComment.trim()" @click="doSendBack">退回修改</button>
            </div>

            <p v-if="detail?.status === 'APPROVED' || detail?.status === 'PUBLISHED' || detail?.status === 'ARCHIVED'" class="review-ok">
              ✓ 已审核通过；可由 T3.8 录入发布信息并回写。
            </p>
          </div>
        </section>

        

        <!-- T3.9 公众号发布执行：草稿箱同步 / 发布 / 群发（可定时） -->
        <section class="card">
          <h3 class="sub-title">公众号发布执行（T3.9）</h3>
          <p class="hint">
            审核通过后可执行：① 同步草稿箱（<span class="mono">add_draft</span>，回写 media_id）② 正式发布（<span class="mono">freepublish</span>，回写文章链接）③ 群发（可定时）。
            公众号 AppID / AppSecret（AES 加密入库）需在系统设置中配置。
          </p>
          <div class="publish-actions">
            <button class="btn primary" :disabled="wechatBusy" @click="doSyncDraft">① 同步草稿箱</button>
            <button class="btn primary" :disabled="wechatBusy" @click="doSubmitPublish">② 正式发布</button>
            <span class="schedule-wrap">
              <input v-model="massSchedule" class="note-input" type="datetime-local" title="定时群发时间" />
              <button class="btn" :disabled="wechatBusy" @click="doMassPublish">③ 群发</button>
            </span>
          </div>

          <div v-if="publishState" class="publish-state">
            <span class="badge" :class="publishStatusClass">{{ publishState.publishStatus || '未发布' }}</span>
            <span v-if="publishState.externalMediaId" class="kv">media_id: <code>{{ publishState.externalMediaId }}</code></span>
            <span v-if="publishState.externalUrl" class="kv">
              链接: <a :href="publishState.externalUrl" target="_blank" rel="noopener">{{ publishState.externalUrl }}</a>
            </span>
            <span v-if="publishState.scheduledAt" class="kv">定时: {{ formatTime(publishState.scheduledAt) }}</span>
            <span v-if="publishState.publishError" class="kv err">错误: {{ publishState.publishError }}</span>
          </div>
          <p v-if="wechatMsg" class="message">{{ wechatMsg }}</p>
        </section>
      </div>

      <!-- 侧栏：创作上下文面板（T3.3 核心） -->
      <aside class="sidebar">
        <section class="card ctx">
          <div class="ctx-head">
            <h3 class="sub-title" style="margin: 0">创作上下文（继承依据）</h3>
            <button class="btn small ghost" :disabled="ctxBusy" title="重新从标题/选题/策略/分析定格快照" @click="refreshCtx">
              {{ ctxBusy ? '刷新中…' : '刷新快照' }}
            </button>
          </div>
          <p class="hint ctx-note">
            下列依据在「选中标题一键建项目」时定格（账户/标题/选题/策略摘要/分析摘要），
            仅策略版本号与提示词模板版本号取实时绑定值。来源漂移由快照隔离，避免默认继承出错。
            <span class="origin-legend"><span class="origin-tag frozen">定格</span> 创建时快照，源改名不影响；<span class="origin-tag live">实时</span> 随绑定关系更新。</span>
          </p>

          <div class="ctx-item">
            <div class="ctx-k">归属账号 <span class="origin-tag live">实时</span></div>
            <div class="ctx-v">{{ ctx?.account?.name || '—' }}</div>
          </div>

          <div class="ctx-item">
            <div class="ctx-k">选中标题 <span class="origin-tag frozen">定格</span></div>
            <div class="ctx-v">{{ ctx?.title?.text || '—' }}</div>
            <div v-if="ctx?.title?.basis" class="ctx-sub">{{ ctx.title.basis }}</div>
          </div>

          <div class="ctx-item">
            <div class="ctx-k">选题 <span class="origin-tag frozen">定格</span></div>
            <div class="ctx-v">{{ ctx?.topic?.title || '—' }}</div>
            <div v-if="ctx?.topic?.audience" class="ctx-sub">受众：{{ ctx.topic.audience }}</div>
            <div v-if="ctx?.topic?.angle" class="ctx-sub">角度：{{ ctx.topic.angle }}</div>
            <div v-if="ctx?.topic?.tags" class="ctx-sub">标签：{{ formatTags(ctx.topic.tags) }}</div>
          </div>

          <div class="ctx-item">
            <div class="ctx-k">策略版本 <span class="origin-tag live">实时</span></div>
            <div v-if="ctx?.strategy" class="ctx-v">
              v{{ ctx.strategy.version }}
            </div>
            <div v-else class="ctx-v">—</div>
            <div v-if="ctx?.strategy?.summary" class="ctx-summary">{{ ctx.strategy.summary }}</div>
          </div>

          <div class="ctx-item">
            <div class="ctx-k">提示词模板版本 <span class="origin-tag live">实时</span></div>
            <div v-if="ctx?.promptTemplate" class="ctx-v">
              v{{ ctx.promptTemplate.version }}
            </div>
            <div v-else class="ctx-v">—（T3.2 创建时未启用 article_draft 模板）</div>
          </div>

          <div class="ctx-item">
            <div class="ctx-k">分析摘要 <span class="origin-tag frozen">定格</span></div>
            <pre v-if="ctx?.analysisSummary" class="ctx-pre">{{ ctx.analysisSummary }}</pre>
            <div v-else class="ctx-v">—（无关联分析）</div>
          </div>
        </section>

        <!-- AI 操作入口（T3.3） -->
        <section class="card">
          <h3 class="sub-title">AI 操作入口</h3>
          <p class="hint">触发 ARTICLE_GEN 异步任务；实际 LLM 调用与版本写出由 T3.5 注册的处理器完成。</p>
          <div class="ai-grid">
            <button class="btn" :disabled="busy" @click="gen('draft')">生成初稿</button>
            <button class="btn" :disabled="busy" @click="gen('continue')">续写</button>
            <button class="btn" :disabled="busy" @click="gen('rewrite')">改写</button>
            <button class="btn" :disabled="busy" @click="gen('compress')">压缩</button>
            <button class="btn" :disabled="busy" @click="gen('expand')">扩写</button>
          </div>
          <!-- T3.7 第三方润色：触发 TEXT_POLISH，原稿不变，结果写 polish 待采纳版本 -->
          <div class="polish-row">
            <input
              v-model="polishTone"
              class="tone-input"
              type="text"
              maxlength="50"
              placeholder="语气基调（可选，如：更口语化）"
            />
            <button class="btn" :disabled="busy" @click="doPolish">AI 润色</button>
          </div>
          <p v-if="polishMsg" class="hint">{{ polishMsg }}</p>
          <p v-if="lastTask" class="hint">
            已提交任务 <span class="mono">{{ lastTask.taskId.slice(0, 8) }}</span>
            （stage={{ lastTask.stage }}，dispatched={{ lastTask.dispatched }}）。
            <span v-if="!lastTask.dispatched">本机无 Redis/Worker → 任务保留 queued（待环境）；T3.5 处理器就绪后才会真正生成。</span>
            <span v-else>已入队，等待 Worker 处理。</span>
          </p>
        </section>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  adoptContentVersion,
  approveReview,
  decideTextReview,
  detectVersion,
  discardContentVersion,
  getContentProject,
  getContentProjectContext,
  getContentProjectReview,
  refreshContentProjectContext,
  listContentVersions,
  listGenerationRuns,
  listTextReviews,
  polishProject,
  restoreContentVersion,
  saveContentVersion,
  sendBackForRevision,
  submitForReview,
  triggerProjectGeneration,
  updateContentProject,
  updateReviewChecklist,
  checkCompliance,
  exportContentProject,
  recordPublication,
  syncWeChatDraft,
  submitWeChatPublish,
  massWeChatPublish,
  getWeChatPublishState,
  type WeChatPublishState,
  type ComplianceCheckResult,
  type ContentProjectDetail,
  type ContentReview,
  type ContentVersionItem,
  type GenerationRunItem,
  type ProjectContext,
  type ProjectStage,
  type ReviewChecklistItem,
  type TextReviewDecision,
  type TextReviewRunItem,
  REVIEW_STATUS_LABELS,
} from '../api/http';

const route = useRoute();
const router = useRouter();
const projectId = (route.params.id as string) || '';

const detail = ref<ContentProjectDetail | null>(null);
const ctx = ref<ProjectContext | null>(null);
const editorContent = ref('');
const versions = ref<ContentVersionItem[]>([]);
const error = ref('');
const genMsg = ref('');
const loading = ref(false);
const busy = ref(false);
const lastTask = ref<{ taskId: string; dispatched: boolean; stage: string } | null>(null);
const genRuns = ref<GenerationRunItem[]>([]);

// T3.7 朱雀检测 / 第三方润色
const textReviews = ref<TextReviewRunItem[]>([]);
const detectMsg = ref('');
const polishMsg = ref('');
const polishTone = ref('');

// T3.6 审核状态机
const review = ref<ContentReview | null>(null);
const reviewComment = ref('');
const reviewMsg = ref('');

// T3.11 合规预审（广告法极限词/敏感词，送审前自动标红硬卡点）
const compliance = ref<ComplianceCheckResult | null>(null);
const complianceMsg = ref('');
const complianceBusy = ref(false);
const complianceOverride = ref(false);

// T3.8 复制/导出 + 发布信息录入 + AI 生成标识声明入口
const aiGenerated = ref(true);
const aiDeclaration = ref('');
const declSaved = ref(false);
const exportMsg = ref('');
const publishAt = ref('');
const publishUrl = ref('');
const publishNote = ref('');
const publishMsg = ref('');

// T3.9 公众号发布执行：草稿箱同步 / 发布 / 群发（可定时）
const publishState = ref<WeChatPublishState | null>(null);
const wechatBusy = ref(false);
const wechatMsg = ref('');
const massSchedule = ref('');
const publishBusy = ref(false);

const mode = ref<'edit' | 'preview'>('edit');
const versionNote = ref('');
const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
const lastSavedAt = ref<Date | null>(null);
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// T5.2 刷新上下文快照（一键重新定格）
const ctxBusy = ref(false);
async function refreshCtx() {
  if (!ctx.value) return;
  ctxBusy.value = true;
  error.value = '';
  try {
    ctx.value = await refreshContentProjectContext(projectId);
  } catch (e) {
    error.value = '刷新上下文失败：' + (e as Error).message;
  } finally {
    ctxBusy.value = false;
  }
}

const saveStateClass = computed(() => ({
  'st-idle': saveStatus.value === 'idle',
  'st-saving': saveStatus.value === 'saving',
  'st-saved': saveStatus.value === 'saved',
  'st-error': saveStatus.value === 'error',
}));
const saveStateText = computed(() => {
  switch (saveStatus.value) {
    case 'saving':
      return '保存中…';
    case 'saved':
      return lastSavedAt.value ? `已保存 ${formatTime(lastSavedAt.value.toISOString())}` : '已保存';
    case 'error':
      return '保存失败';
    default:
      return '尚未编辑';
  }
});

const previewHtml = computed(() => renderMarkdown(editorContent.value));

// T3.6 审核状态机：状态标签与清单完整性
const reviewStatusLabel = computed(() =>
  detail.value ? REVIEW_STATUS_LABELS[detail.value.status] ?? detail.value.status : '—',
);
const reviewAllChecked = computed(() => {
  const items = review.value?.checklist ?? [];
  return items.length > 0 && items.every((it) => it.checked);
});
const reviewBadgeClass = computed(() => {
  switch (detail.value?.status) {
    case 'CREATING':
      return 'st-creating';
    case 'PENDING_REVIEW':
      return 'st-review';
    case 'NEEDS_REVISION':
      return 'st-revision';
    case 'APPROVED':
    case 'PUBLISHED':
    case 'ARCHIVED':
      return 'st-approved';
    default:
      return '';
  }
});

function goBack() {
  router.push('/content');
}
function formatTags(tags: unknown): string {
  if (Array.isArray(tags)) return (tags as unknown[]).join('、');
  if (typeof tags === 'string' && tags) return tags;
  return '—';
}
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function versionSourceLabel(source: string): string {
  const map: Record<string, string> = {
    manual: '人工保存',
    draft: 'AI 初稿',
    continue: '续写',
    rewrite: '改写',
    compress: '压缩',
    expand: '扩写',
    polish: '润色',
    detect: '检测',
  };
  return map[source] ?? source ?? '未知';
}
function isStaging(v: ContentVersionItem): boolean {
  return !!v.source && v.source !== 'manual';
}
function stageLabel(stage: string): string {
  const map: Record<string, string> = {
    draft: '初稿',
    continue: '续写',
    rewrite: '改写',
    compress: '压缩',
    expand: '扩写',
  };
  return map[stage] ?? stage ?? '未知';
}
function runStatusClass(status: string): string {
  switch (status) {
    case 'running':
      return 'st-running';
    case 'success':
      return 'st-ok';
    case 'failed':
      return 'st-err';
    case 'queued':
      return 'st-idle';
    default:
      return 'st-warn';
  }
}
function serviceLabel(service: string): string {
  const map: Record<string, string> = {
    zhuque: '朱雀检测',
    llm: 'LLM 基准检测',
    unavailable: '未配置',
  };
  return map[service] ?? service ?? '未知';
}
function decisionLabel(decision: TextReviewDecision): string {
  const map: Record<TextReviewDecision, string> = {
    accepted: '采纳',
    ignored: '忽略',
    flagged: '标红',
  };
  return map[decision] ?? decision;
}

// 轻量、安全的 Markdown 预览（先转义 HTML 再应用基础语法，避免 XSS）
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function inlineMd(s: string): string {
  let t = escapeHtml(s);
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
  t = t.replace(/`([^`]+?)`/g, '<code>$1</code>');
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return t;
}
function renderMarkdown(src: string): string {
  if (!src) return '<p class="empty">（空）</p>';
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let inCode = false;
  let inList = false;
  const closeList = () => {
    if (inList) {
      html += '</ul>';
      inList = false;
    }
  };
  for (const raw of lines) {
    if (/^```/.test(raw)) {
      if (inCode) {
        html += '</code></pre>';
        inCode = false;
      } else {
        closeList();
        html += '<pre><code>';
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      html += escapeHtml(raw) + '\n';
      continue;
    }
    const h = raw.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList();
      const lvl = h[1].length;
      html += `<h${lvl}>${inlineMd(h[2])}</h${lvl}>`;
      continue;
    }
    const q = raw.match(/^>\s?(.*)$/);
    if (q) {
      closeList();
      html += `<blockquote>${inlineMd(q[1])}</blockquote>`;
      continue;
    }
    const li = raw.match(/^[-*]\s+(.*)$/);
    if (li) {
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += `<li>${inlineMd(li[1])}</li>`;
      continue;
    }
    if (!raw.trim()) {
      closeList();
      continue;
    }
    closeList();
    html += `<p>${inlineMd(raw)}</p>`;
  }
  if (inCode) html += '</code></pre>';
  closeList();
  return html;
}

// 编辑器输入（程序化赋值不会触发 @input，避免初始化/恢复时误触发自动保存）
function onInput(e: Event) {
  editorContent.value = (e.target as HTMLTextAreaElement).value;
  scheduleSave();
}
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(doAutoSave, 2000);
}
async function doAutoSave() {
  saveStatus.value = 'saving';
  try {
    await updateContentProject(projectId, { workingContent: editorContent.value });
    saveStatus.value = 'saved';
    lastSavedAt.value = new Date();
  } catch (e) {
    saveStatus.value = 'error';
    error.value = (e as Error).message;
  }
}

async function saveVersion() {
  error.value = '';
  busy.value = true;
  try {
    const v = await saveContentVersion(projectId, {
      content: editorContent.value,
      note: versionNote.value || undefined,
      source: 'manual',
    });
    versions.value = [v, ...versions.value.filter((x) => x.id !== v.id)];
    if (detail.value) detail.value.currentVersionId = v.id;
    versionNote.value = '';
    await doAutoSave(); // 同步 workingContent 为刚保存内容（幂等）
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

async function restore(v: ContentVersionItem) {
  error.value = '';
  busy.value = true;
  try {
    const restored = await restoreContentVersion(projectId, v.id);
    editorContent.value = restored.content; // 不触发 input：workingContent 已由接口还原
    if (detail.value) detail.value.currentVersionId = restored.id;
    versions.value = await listContentVersions(projectId);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

/** 采纳 staging 版本（设当前 + 还原缓冲），并刷新生成记录。 */
async function adopt(v: ContentVersionItem) {
  error.value = '';
  busy.value = true;
  try {
    const adopted = await adoptContentVersion(projectId, v.id);
    editorContent.value = adopted.content;
    if (detail.value) detail.value.currentVersionId = adopted.id;
    versions.value = await listContentVersions(projectId);
    genRuns.value = await listGenerationRuns(projectId);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

/** 放弃 staging 版本（硬删），从列表移除。 */
async function discard(v: ContentVersionItem) {
  error.value = '';
  busy.value = true;
  try {
    await discardContentVersion(projectId, v.id);
    versions.value = versions.value.filter((x) => x.id !== v.id);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

async function gen(stage: ProjectStage) {
  error.value = '';
  genMsg.value = '';
  busy.value = true;
  try {
    const r = await triggerProjectGeneration(projectId, stage);
    lastTask.value = r;
    genRuns.value = await listGenerationRuns(projectId); // 环境就绪后可见记录（当前多数为 queued/待环境）
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

async function loadAll() {
  error.value = '';
  loading.value = true;
  try {
    const [d, c, v, g, r, tr] = await Promise.all([
      getContentProject(projectId),
      getContentProjectContext(projectId),
      listContentVersions(projectId),
      listGenerationRuns(projectId),
      getContentProjectReview(projectId),
      listTextReviews(projectId),
    ]);
    detail.value = d;
    ctx.value = c;
    editorContent.value = d.workingContent ?? '';
    aiGenerated.value = d.aiGenerated ?? true;
    aiDeclaration.value = d.aiDeclaration ?? '';
    publishAt.value = isoToLocalInput(d.publishedAt);
    publishUrl.value = d.externalUrl ?? '';
    publishNote.value = d.publishNote ?? '';
    declSaved.value = false;
    versions.value = v;
    genRuns.value = g;
    review.value = r;
    textReviews.value = tr;
    saveStatus.value = d.workingContent ? 'saved' : 'idle';
    // T3.9 加载发布状态（media_id / 链接 / 定时 / 错误）
    await refreshPublishState();
    // T3.11 进入创作/修改阶段时自动跑一次合规预审，提前标红风险词
    if (d.status === 'CREATING' || d.status === 'NEEDS_REVISION') {
      await loadCompliance();
    }
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

// ============ T3.11 合规预审（广告法极限词/敏感词，送审前自动标红硬卡点）============

/** 运行合规预审（对当前生效版本正文扫描）。 */
async function loadCompliance() {
  complianceMsg.value = '';
  complianceBusy.value = true;
  try {
    compliance.value = await checkCompliance(projectId);
  } catch (e) {
    // 无令牌/未就绪时静默（不阻断主流程）；DB 待环境时后端会返回错误，这里仅记录
    complianceMsg.value = (e as Error).message;
  } finally {
    complianceBusy.value = false;
  }
}

/** 是否存在阻断级风险词（硬卡点）。 */
const hasBlockingRisk = computed(() => (compliance.value?.blockingCount ?? 0) > 0);

// T3.9 发布状态徽标配色
const publishStatusClass = computed(() => {
  const s = publishState.value?.publishStatus;
  if (s === 'PUBLISHED') return 'badge-ok';
  if (s === 'FAILED') return 'badge-err';
  if (s === 'SCHEDULED') return 'badge-warn';
  return '';
});

// ============ T3.7 朱雀检测 / 第三方润色 ============

/** 检测当前版本（TEXT_DETECT，绑定版本不改文）。 */
async function doDetect() {
  error.value = '';
  detectMsg.value = '';
  const versionId = detail.value?.currentVersionId;
  if (!versionId) {
    error.value = '请先保存至少一个版本再检测';
    return;
  }
  busy.value = true;
  try {
    const r = await detectVersion(projectId, versionId);
    detectMsg.value = `已提交检测任务 ${r.taskId.slice(0, 8)}（dispatched=${r.dispatched}）。${
      r.dispatched ? '等待 Worker 处理。' : '本机无 Redis/Worker → 任务保留 queued（待环境）。'
    }`;
    textReviews.value = await listTextReviews(projectId);
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

/** 记录对某条检测结果的决策（标记采纳 / 标红存疑 / 忽略）。 */
async function decideReview(r: TextReviewRunItem, decision: TextReviewDecision) {
  error.value = '';
  busy.value = true;
  try {
    const updated = await decideTextReview(projectId, r.id, decision);
    textReviews.value = textReviews.value.map((x) => (x.id === updated.id ? updated : x));
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

/** 触发生成润色（TEXT_POLISH，原稿不变，结果写 polish 待采纳版本）。 */
async function doPolish() {
  error.value = '';
  polishMsg.value = '';
  busy.value = true;
  try {
    const r = await polishProject(projectId, { tone: polishTone.value.trim() || undefined });
    polishMsg.value = `已提交润色任务 ${r.taskId.slice(0, 8)}（dispatched=${r.dispatched}）。${
      r.dispatched ? '等待 Worker 处理，完成后将在「版本历史」生成一条 polish 待采纳版本。' : '本机无 Redis/Worker → 任务保留 queued（待环境）。'
    }`;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

// ============ T3.6 审核状态机操作 ============

/** 切换某清单项勾选状态（仅改本地，需点「保存清单」才落库）。 */
function toggleChecklist(item: ReviewChecklistItem) {
  item.checked = !item.checked;
}
/** 保存审核清单（整体替换，白名单校验在服务端）。 */
async function saveChecklist() {
  if (!review.value) return;
  error.value = '';
  reviewMsg.value = '';
  busy.value = true;
  try {
    review.value = await updateReviewChecklist(
      projectId,
      (review.value.checklist as ReviewChecklistItem[]).map((it) => ({ ...it })),
    );
    reviewMsg.value = '审核清单已保存';
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
function onReviewError(e: unknown) {
  error.value = (e as Error).message;
}
async function doSubmit() {
  error.value = '';
  reviewMsg.value = '';
  // T3.11 客户端预校验：先跑合规预审，存在阻断级风险词且未显式覆盖则拦截（服务端仍是权威硬卡点）
  if (!complianceOverride.value) {
    try {
      compliance.value = await checkCompliance(projectId);
    } catch {
      /* 预审失败不阻断提交，交由服务端裁决 */
    }
    if ((compliance.value?.blockingCount ?? 0) > 0) {
      error.value = '送审被合规预审拦截：存在阻断级风险词（极限词/违禁词）。请修改正文后重试，或确认风险后点击「覆盖提交」。';
      complianceMsg.value = '';
      return;
    }
  }
  busy.value = true;
  try {
    const d = await submitForReview(projectId, { overrideCompliance: complianceOverride.value });
    if (detail.value) detail.value.status = d.status;
    review.value = await getContentProjectReview(projectId);
    reviewMsg.value = '已提交审核（待审核）';
    complianceOverride.value = false;
  } catch (e) {
    onReviewError(e);
  } finally {
    busy.value = false;
  }
}

/** T3.11 覆盖提交：确认已知合规风险后强制送审（后端仍记录预审结果备查）。 */
async function doSubmitOverride() {
  complianceOverride.value = true;
  await doSubmit();
}
async function doSendBack() {
  error.value = '';
  reviewMsg.value = '';
  if (!reviewComment.value.trim()) {
    error.value = '请先填写退回修改意见';
    return;
  }
  busy.value = true;
  try {
    const d = await sendBackForRevision(projectId, reviewComment.value.trim());
    if (detail.value) detail.value.status = d.status;
    review.value = await getContentProjectReview(projectId);
    reviewComment.value = '';
    reviewMsg.value = '已退回修改';
  } catch (e) {
    onReviewError(e);
  } finally {
    busy.value = false;
  }
}
async function doApprove() {
  error.value = '';
  reviewMsg.value = '';
  busy.value = true;
  try {
    const d = await approveReview(projectId);
    if (detail.value) detail.value.status = d.status;
    review.value = await getContentProjectReview(projectId);
    reviewMsg.value = '审核通过（已审核）';
  } catch (e) {
    onReviewError(e);
  } finally {
    busy.value = false;
  }
}

// ============ T3.8 复制/导出 + 发布信息录入 + AI 生成标识声明入口 ============

/** ISO(UTC) → 本地 datetime-local 字符串（YYYY-MM-DDTHH:mm）。 */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
/** 本地 datetime-local 字符串 → ISO；空串回 null。 */
function localInputToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** 保存 AI 生成标识声明（合规 §12）。 */
async function saveDeclaration() {
  error.value = '';
  declSaved.value = false;
  busy.value = true;
  try {
    const d = await updateContentProject(projectId, {
      aiGenerated: aiGenerated.value,
      aiDeclaration: aiDeclaration.value.trim(),
    });
    if (detail.value) {
      detail.value.aiGenerated = d.aiGenerated;
      detail.value.aiDeclaration = d.aiDeclaration;
    }
    declSaved.value = true;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

/** 拉取导出 Markdown 内容（供复制/下载共用）。 */
async function loadExport(): Promise<{ filename: string; content: string } | null> {
  exportMsg.value = '';
  try {
    return await exportContentProject(projectId);
  } catch (e) {
    exportMsg.value = '导出失败：' + (e as Error).message;
    return null;
  }
}

/** 复制 Markdown 纯文本到剪贴板。 */
async function copyMarkdown() {
  const r = await loadExport();
  if (!r) return;
  try {
    await navigator.clipboard.writeText(r.content);
    exportMsg.value = `已复制 Markdown 到剪贴板（${r.content.length} 字符）`;
  } catch {
    exportMsg.value = '剪贴板不可用，请改用「下载 .md」';
  }
}

/** 下载为 .md 文件。 */
async function downloadMarkdown() {
  const r = await loadExport();
  if (!r) return;
  const blob = new Blob([r.content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = r.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  exportMsg.value = `已下载 ${r.filename}`;
}

/** 记录发布信息（APPROVED → PUBLISHED + publishedAt/externalUrl/publishNote）。 */
async function doRecordPublication() {
  error.value = '';
  publishMsg.value = '';
  publishBusy.value = true;
  try {
    const payload: { publishedAt?: string; externalUrl?: string; publishNote?: string } = {};
    const iso = localInputToIso(publishAt.value);
    if (iso) payload.publishedAt = iso;
    if (publishUrl.value.trim()) payload.externalUrl = publishUrl.value.trim();
    if (publishNote.value.trim()) payload.publishNote = publishNote.value.trim();
    const d = await recordPublication(projectId, payload);
    if (detail.value) {
      detail.value.status = d.status;
      detail.value.publishedAt = d.publishedAt;
      detail.value.externalUrl = d.externalUrl;
      detail.value.publishNote = d.publishNote;
    }
    publishMsg.value = `已记录发布信息（状态 → ${d.status}）`;
  } catch (e) {
    publishMsg.value = (e as Error).message;
  } finally {
    publishBusy.value = false;
  }
}

onMounted(loadAll);

// ============ T3.9 公众号发布执行 ============

/** 读取当前发布状态（同步 media_id / 链接 / 定时 / 错误）。 */
async function refreshPublishState() {
  try {
    publishState.value = await getWeChatPublishState(projectId);
  } catch (e) {
    // 非阻断：状态读取失败不打断编辑
    publishState.value = null;
  }
}

/** 同步草稿箱（add_draft）。 */
async function doSyncDraft() {
  wechatMsg.value = '';
  wechatBusy.value = true;
  try {
    const d = await syncWeChatDraft(projectId);
    if (detail.value) Object.assign(detail.value, d);
    await refreshPublishState();
    wechatMsg.value = `已同步草稿箱（media_id=${d.externalMediaId ?? ''}）`;
  } catch (e) {
    wechatMsg.value = (e as Error).message;
  } finally {
    wechatBusy.value = false;
  }
}

/** 正式发布（freepublish），回写文章链接。 */
async function doSubmitPublish() {
  wechatMsg.value = '';
  wechatBusy.value = true;
  try {
    const d = await submitWeChatPublish(projectId);
    if (detail.value) Object.assign(detail.value, d);
    await refreshPublishState();
    wechatMsg.value =
      d.publishStatus === 'PUBLISHED'
        ? `已发布：${d.externalUrl ?? ''}`
        : '已提交发布，正在生效中，可稍后刷新状态';
  } catch (e) {
    wechatMsg.value = (e as Error).message;
  } finally {
    wechatBusy.value = false;
  }
}

/** 群发（可定时）。 */
async function doMassPublish() {
  wechatMsg.value = '';
  wechatBusy.value = true;
  try {
    const payload: { scheduleTime?: string } = {};
    if (massSchedule.value.trim()) payload.scheduleTime = massSchedule.value.trim();
    const d = await massWeChatPublish(projectId, payload);
    if (detail.value) Object.assign(detail.value, d);
    await refreshPublishState();
    wechatMsg.value =
      d.publishStatus === 'SCHEDULED'
        ? `已登记定时群发（${massSchedule.value}）`
        : '已提交群发';
  } catch (e) {
    wechatMsg.value = (e as Error).message;
  } finally {
    wechatBusy.value = false;
  }
}

</script>

<style scoped>
.ct {
  padding: 8px 0;
}
.topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 14px;
}
.title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}
.layout {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.sidebar {
  width: 360px;
  flex: 0 0 360px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
@media (max-width: 900px) {
  .layout {
    flex-direction: column;
  }
  .sidebar {
    width: 100%;
    flex: 1 1 auto;
  }
}

.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
}
.sub-title {
  margin: 0 0 10px;
  font-size: 14px;
}
.hint {
  color: var(--muted);
  font-size: 12px;
  margin: 4px 0 10px;
  line-height: 1.6;
}
.message {
  font-size: 13px;
  margin: 8px 0;
}
.message.err {
  color: var(--warn);
}
.message.warn {
  color: #b45309;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: var(--radius);
  padding: 6px 10px;
}

/* ===== T3.11 合规预审 ===== */
.compliance {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 12px;
  margin: 8px 0 4px;
  background: #fcfcfd;
}
.compliance-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.compliance-banner {
  font-size: 13px;
  padding: 6px 10px;
  border-radius: var(--radius);
  margin-bottom: 8px;
}
.compliance-banner.ok {
  color: #047857;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
}
.compliance-banner.blocked {
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
}
.compliance-preview {
  font-size: 13px;
  line-height: 1.7;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 8px 10px;
  margin-bottom: 8px;
  white-space: pre-wrap;
  word-break: break-word;
}
.compliance-preview .seg.hit-block {
  color: #b91c1c;
  background: #fee2e2;
  border-radius: 3px;
  padding: 0 2px;
  font-weight: 600;
}
.compliance-preview .seg.hit-warn {
  color: #b45309;
  background: #fef3c7;
  border-radius: 3px;
  padding: 0 2px;
}
.compliance-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.compliance-list li {
  font-size: 12px;
  border-bottom: 1px dashed var(--border);
  padding-bottom: 6px;
  line-height: 1.5;
}
.compliance-list li.blocking .tag {
  background: #fee2e2;
  color: #b91c1c;
}
.compliance-list li.warning .tag {
  background: #fef3c7;
  color: #b45309;
}
.compliance-list .tag {
  display: inline-block;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 8px;
  margin-right: 6px;
}
.compliance-list .cat {
  color: var(--muted);
  margin: 0 6px;
}
.compliance-list .sug {
  color: var(--muted);
  display: block;
}
.ph {
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  padding: 28px;
  text-align: center;
  color: var(--muted);
  background: #fafbfc;
}

/* 编辑器 */
.editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.editor-head-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.save-state {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
}
.st-idle {
  color: var(--muted);
}
.st-saving {
  color: var(--brand);
  border-color: var(--brand);
}
.st-saved {
  color: var(--ok);
  border-color: #b7e0cd;
  background: #eef8f3;
}
.st-error {
  color: var(--warn);
  border-color: #f1c0c0;
  background: #fdf0f0;
}
.seg {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}
.seg-btn {
  border: none;
  background: #fff;
  color: var(--text);
  padding: 5px 12px;
  cursor: pointer;
  font-size: 13px;
}
.seg-btn.on {
  background: var(--brand);
  color: #fff;
}
.editor {
  width: 100%;
  min-height: 320px;
  resize: vertical;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.7;
  background: #fff;
  color: var(--text);
}
.preview {
  min-height: 320px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 16px;
  background: #fff;
  overflow: auto;
}
.editor-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.note-input {
  flex: 1;
  min-width: 160px;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 13px;
  background: #fff;
  color: var(--text);
}

/* 版本历史 */
.ver-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ver-item {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 12px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 12px;
  align-items: center;
}
.ver-item.current {
  border-color: var(--brand);
  background: #f3f8ff;
}
.ver-main {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ver-no {
  font-weight: 700;
  font-size: 14px;
}
.ver-src {
  font-size: 12px;
  color: var(--muted);
}
.ver-badge {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--brand);
  color: #fff;
}
.ver-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--muted);
  grid-column: 1 / 2;
}
.ver-note {
  color: var(--text);
}
.ver-actions {
  grid-column: 2 / 3;
  grid-row: 1 / 3;
  align-self: center;
  display: flex;
  gap: 6px;
}
.ver-item.staging {
  border-color: #f0c14b;
  background: #fffaf0;
}
.ver-staging {
  background: #f0c14b;
  color: #5a3d00;
}

/* 生成运行记录 */
.run-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.run-item {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 12px;
}
.run-main {
  display: flex;
  align-items: center;
  gap: 8px;
}
.run-stage {
  font-weight: 700;
  font-size: 14px;
}
.run-status {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid var(--border);
}
.run-status.st-idle {
  color: var(--muted);
}
.run-status.st-running {
  color: var(--brand);
  border-color: var(--brand);
}
.run-status.st-ok {
  color: var(--ok);
  border-color: #b7e0cd;
  background: #eef8f3;
}
.run-status.st-err {
  color: var(--warn);
  border-color: #f1c0c0;
  background: #fdf0f0;
}
.run-status.st-warn {
  color: #a86a00;
  border-color: #f0c14b;
  background: #fffaf0;
}
.run-out {
  font-size: 12px;
  color: var(--brand);
}
.run-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--muted);
  margin-top: 4px;
}
.run-err {
  font-size: 12px;
  color: var(--warn);
  margin-top: 4px;
  word-break: break-all;
}

/* 审核状态机（T3.6） */
.review-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.review-badge {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: #f1f3f5;
  color: var(--muted);
}
.review-badge.st-review {
  background: #fffaf0;
  border-color: #f0c14b;
  color: #a86a00;
}
.review-badge.st-revision {
  background: #fdf0f0;
  border-color: #f1c0c0;
  color: var(--warn);
}
.review-badge.st-approved {
  background: #eef8f3;
  border-color: #b7e0cd;
  color: var(--ok);
}
.review-badge.st-creating {
  background: #eef3ff;
  border-color: #b9cdf5;
  color: var(--brand);
}
.chk-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 8px 0 10px;
}
.chk-item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px 10px;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
}
.chk-item input[type='checkbox'] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}
.chk-label {
  font-size: 13px;
}
.chk-note {
  grid-column: 2 / 3;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 12px;
  background: #fff;
  color: var(--text);
}
.review-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 10px;
}
.review-textarea {
  flex: 1;
  min-width: 180px;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 13px;
  background: #fff;
  color: var(--text);
  resize: vertical;
  min-height: 38px;
}
.review-comment {
  font-size: 12px;
  color: var(--warn);
  background: #fdf0f0;
  border: 1px solid #f1c0c0;
  border-radius: 6px;
  padding: 8px 10px;
  margin: 10px 0 0;
}
.review-ok {
  font-size: 13px;
  color: var(--ok);
  margin: 0;
}

/* 上下文面板 */
.ctx-note {
  margin-bottom: 12px;
}
.ctx-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}
.origin-legend {
  display: block;
  margin-top: 6px;
  color: var(--muted);
  font-size: 11px;
}
.origin-tag {
  display: inline-block;
  font-size: 10px;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 6px;
  margin-left: 4px;
  vertical-align: middle;
  font-weight: 600;
}
.origin-tag.frozen {
  color: #9a6700;
  background: #fef3c7;
  border: 1px solid #fde68a;
}
.origin-tag.live {
  color: #1d4ed8;
  background: #e0ecff;
  border: 1px solid #b9cdf5;
}
.ctx-item {
  padding: 10px 0;
  border-top: 1px solid var(--border);
}
.ctx-item:first-of-type {
  border-top: none;
}
.ctx-k {
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 4px;
}
.ctx-v {
  font-size: 14px;
  font-weight: 600;
  word-break: break-word;
}
.ctx-sub {
  font-size: 12px;
  color: var(--muted);
  margin-top: 2px;
}
.ctx-summary {
  font-size: 12px;
  color: var(--text);
  margin-top: 6px;
  max-height: 120px;
  overflow: auto;
  background: #f7f8fa;
  border-radius: 6px;
  padding: 8px;
  white-space: pre-wrap;
  word-break: break-word;
}
.ctx-pre {
  font-size: 12px;
  margin: 4px 0 0;
  max-height: 200px;
  overflow: auto;
  background: #f7f8fa;
  border-radius: 6px;
  padding: 8px;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.ai-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 8px;
}

.btn {
  border: 1px solid var(--border);
  background: #fff;
  color: var(--text);
  border-radius: 6px;
  padding: 7px 12px;
  cursor: pointer;
  font-size: 13px;
}
.btn:hover {
  border-color: var(--brand);
  color: var(--brand);
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn.primary {
  background: var(--brand);
  color: #fff;
  border-color: var(--brand);
}
.btn.primary:hover {
  color: #fff;
  filter: brightness(0.95);
}
.btn.danger {
  background: #dc2626;
  color: #fff;
  border-color: #dc2626;
}
.btn.danger:hover {
  color: #fff;
  filter: brightness(0.95);
}
.btn.small {
  padding: 5px 10px;
  font-size: 12px;
}
.btn.ghost {
  background: transparent;
}
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  border: 1px solid var(--border);
  background: #f1f3f5;
  color: var(--muted);
  margin-left: 6px;
}
.badge-ok {
  color: var(--ok);
  border-color: #b7e0cd;
  background: #eef8f3;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

/* T3.7 润色入口 + 检测记录 */
.polish-row {
  display: flex;
  gap: 8px;
  margin: 8px 0 4px;
}
.tone-input {
  flex: 1;
  min-width: 120px;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 13px;
  background: #fff;
  color: var(--text);
}
.detect-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.review-run-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.review-run-item {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 12px;
}
.review-run-item.st-failed {
  border-color: #f1c0c0;
  background: #fdf0f0;
}
.review-run-item.st-stale {
  opacity: 0.78;
}
.rr-main {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rr-service {
  font-weight: 700;
  font-size: 14px;
}
.rr-status {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid var(--border);
}
.rr-badge {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--brand);
  color: #fff;
}
.rr-badge.rr-stale {
  background: #999;
}
.rr-summary {
  font-size: 13px;
  margin-top: 6px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text);
}
.rr-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--muted);
  margin-top: 4px;
}
.rr-err {
  font-size: 12px;
  color: var(--warn);
  margin-top: 4px;
}
.rr-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

/* ===== T3.8 复制/导出 + 发布信息录入 + AI 生成标识声明 ===== */
.t38-block {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  margin: 10px 0;
  background: #fcfcfd;
}
.t38-sub {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
}
.t38-decl {
  width: 100%;
  margin-top: 8px;
  resize: vertical;
  font-size: 13px;
}
.t38-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.t38-publish-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 8px;
}
.t38-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--muted);
}
.t38-field-wide {
  grid-column: 1 / 3;
}
.t38-field input {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 13px;
  background: #fff;
  color: var(--text);
  width: 100%;
  box-sizing: border-box;
}
@media (max-width: 900px) {
  .t38-publish-grid {
    grid-template-columns: 1fr;
  }
  .t38-field-wide {
    grid-column: 1 / 2;
  }
}

/* 预览 Markdown 基础排版 */
.markdown :deep(h1),
.markdown :deep(h2),
.markdown :deep(h3),
.markdown :deep(h4),
.markdown :deep(h5),
.markdown :deep(h6) {
  margin: 12px 0 6px;
  line-height: 1.3;
}
.markdown :deep(p) {
  margin: 6px 0;
  line-height: 1.7;
}
.markdown :deep(ul) {
  margin: 6px 0;
  padding-left: 20px;
}
.markdown :deep(code) {
  background: #f1f3f5;
  border-radius: 4px;
  padding: 1px 5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}
.markdown :deep(pre) {
  background: #f1f3f5;
  border-radius: 6px;
  padding: 12px;
  overflow: auto;
}
.markdown :deep(pre code) {
  background: transparent;
  padding: 0;
}
.markdown :deep(blockquote) {
  margin: 6px 0;
  padding: 4px 12px;
  border-left: 3px solid var(--border);
  color: var(--muted);
}
.markdown :deep(a) {
  color: var(--brand);
}
.markdown .empty {
  color: var(--muted);
}

/* ===== T3.9 公众号发布执行 ===== */
.publish-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin: 4px 0 8px;
}
.schedule-wrap {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
.publish-state {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  align-items: center;
  padding: 8px 10px;
  background: var(--card-2, rgba(255, 255, 255, 0.04));
  border-radius: 8px;
  margin-top: 6px;
}
.publish-state .kv {
  font-size: 12px;
  color: var(--muted);
}
.publish-state .kv.err {
  color: var(--danger, #e5484d);
}
.publish-state code {
  background: rgba(127, 127, 127, 0.18);
  padding: 1px 5px;
  border-radius: 4px;
}
.badge-warn {
  background: rgba(245, 158, 11, 0.18);
  color: #f5a623;
}
.badge-err {
  background: rgba(229, 72, 77, 0.18);
  color: #e5484d;
}
</style>
