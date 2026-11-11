<template>
  <div class="an">
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
      <p class="hint">提示：登录后从 /api/auth/login 响应取 accessToken 填入；导入与写接口需令牌，未填返回 401。</p>
    </section>

    <!-- 对标账号列表 -->
    <section class="card">
      <div class="row" style="justify-content: space-between">
        <h2 class="card-title" style="margin: 0">对标账号（ReferenceAccount）</h2>
        <button class="btn" :disabled="loading" @click="loadList">刷新</button>
      </div>
      <p v-if="listError" class="message err">{{ listError }}</p>
      <table v-if="accounts.length" class="tbl">
        <thead>
          <tr><th>名称</th><th>平台</th><th>主页</th><th>域名</th><th>备注</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="a in accounts" :key="a.id">
            <td>{{ a.name }}</td>
            <td><span class="pill">{{ a.platform }}</span></td>
            <td class="mono sm">{{ a.homepageUrl || '—' }}</td>
            <td class="sm">{{ a.domain || '—' }}</td>
            <td class="sm">{{ a.note || '—' }}</td>
            <td><button class="btn ghost sm" @click="removeAccount(a)">删除</button></td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="!listError" class="hint">暂无对标账号。可在右侧新建，或用下方批量导入。</p>
    </section>

    <!-- 新建对标账号 -->
    <section class="card">
      <h2 class="card-title">新建对标账号</h2>
      <div class="form-grid">
        <div class="field"><label>名称 *</label><input v-model="form.name" class="input wide" maxlength="200" placeholder="如：某头部公众号" /></div>
        <div class="field"><label>平台</label>
          <select v-model="form.platform" class="input"><option value="wechat">wechat</option></select>
        </div>
        <div class="field"><label>主页 URL</label><input v-model="form.homepageUrl" class="input wide mono" placeholder="https://..." /></div>
        <div class="field"><label>域名（留空自动派生）</label><input v-model="form.domain" class="input wide mono" placeholder="example.com" /></div>
        <div class="field" style="grid-column: 1 / -1"><label>备注</label><input v-model="form.note" class="input wide" maxlength="500" /></div>
      </div>
      <button class="btn primary" :disabled="creating" @click="createAccount">{{ creating ? '创建中…' : '创建' }}</button>
    </section>

    <!-- 批量导入 -->
    <section class="card">
      <h2 class="card-title">批量导入对标账号</h2>
      <p class="hint">支持 CSV（首行可含表头 name,platform,homepageUrl,domain,note）/ JSON 数组 / 每行「名称 - URL」。预览会标记与已有同名或批次内重复项，提交时仅创建勾选项。</p>
      <div class="row">
        <select v-model="importFormat" class="input">
          <option value="csv">CSV</option>
          <option value="json">JSON</option>
          <option value="lines">每行文本</option>
        </select>
        <button class="btn" :disabled="previewing" @click="preview">解析并预览</button>
      </div>
      <textarea v-model="importRaw" class="input mono area" rows="8"
        placeholder='CSV 示例：
name,platform,homepageUrl
某账号,wechat,https://mp.weixin.qq.com/xxx'></textarea>

      <p v-if="previewError" class="message err">{{ previewError }}</p>
      <div v-if="preview" class="import-preview">
        <div class="row" style="justify-content: space-between">
          <span class="hint">解析 {{ preview.parsed }} 行 · 跳过 {{ preview.skipped.length }} 行 · 去重命中 {{ duplicateCount }} 项 · {{ preview.dbChecked ? '已比对库内数据' : '未比对库内数据（无 DB）' }}</span>
          <button class="btn primary" :disabled="committing" @click="commit">{{ committing ? '导入中…' : `导入选中（${selectedNewCount}）` }}</button>
        </div>
        <table class="tbl">
          <thead><tr><th>导入</th><th>名称</th><th>平台</th><th>主页</th><th>状态</th></tr></thead>
          <tbody>
            <tr v-for="c in preview.candidates" :key="c.index">
              <td><input type="checkbox" v-model="selected[c.index]" :disabled="c.status === 'duplicate'" /></td>
              <td>{{ c.name }}</td>
              <td><span class="pill">{{ c.platform || 'wechat' }}</span></td>
              <td class="mono sm">{{ c.homepageUrl || '—' }}</td>
              <td>
                <span v-if="c.status === 'new'" class="pill ok">可导入</span>
                <span v-else class="pill warn">重复{{ c.reason ? '· ' + c.reason : '' }}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="preview.skipped.length" class="hint">跳过行：{{ preview.skipped.join('；') }}</p>
      </div>
    </section>

    <!-- 素材批量导入（T2.2：对标账号素材收集） -->
    <section class="card">
      <h2 class="card-title">素材批量导入（对标账号素材收集）</h2>
      <p class="hint">支持 CSV / JSON（数组或单条）/ Markdown（按标题拆分）/ 每行「标题 - 正文」/ 单条表单 / Excel(.xlsx)。预览按指纹（标题+正文）去重，提交时三选一：跳过 / 合并（duplicateOfId 指向原记录）/ 保留副本。</p>
      <div class="row">
        <label class="lbl">对标账号</label>
        <select v-model="matRefId" class="input">
          <option value="">— 请选择对标账号 —</option>
          <option v-for="a in accounts" :key="a.id" :value="a.id">{{ a.name }}</option>
        </select>
        <label class="lbl">格式</label>
        <select v-model="matFormat" class="input">
          <option value="csv">CSV</option>
          <option value="json">JSON</option>
          <option value="markdown">Markdown</option>
          <option value="lines">每行文本</option>
          <option value="form">单条表单(JSON)</option>
          <option value="excel">Excel</option>
        </select>
        <button class="btn" :disabled="matPreviewing" @click="previewMaterials">解析并预览</button>
      </div>

      <input
        v-if="matFormat === 'excel'"
        type="file"
        accept=".xlsx,.xls"
        class="file-in"
        @change="onExcelFile"
      />
      <textarea
        v-else
        v-model="matRaw"
        class="input mono area"
        rows="8"
        :placeholder="matPlaceholder"
      ></textarea>

      <p v-if="matPreviewError" class="message err">{{ matPreviewError }}</p>
      <div v-if="matPreview" class="import-preview">
        <div class="row" style="justify-content: space-between">
          <span class="hint">解析 {{ matPreview.parsed }} 行 · 跳过 {{ matPreview.skipped.length }} 行 · 重复命中 {{ matDupCount }} 项 · {{ matPreview.dbChecked ? '已比对库内数据' : '未比对库内数据（无 DB 降级）' }}</span>
          <button class="btn ghost sm" @click="resetMatActions">重置为默认动作</button>
          <button class="btn primary" :disabled="matCommitting" @click="commitMaterials">{{ matCommitting ? '导入中…' : '提交导入' }}</button>
        </div>
        <table class="tbl">
          <thead>
            <tr><th>动作</th><th>标题</th><th>正文</th><th>来源链接</th><th>状态</th></tr>
          </thead>
          <tbody>
            <tr v-for="c in matPreview.candidates" :key="c.index">
              <td>
                <select v-model="c.action" class="input sm">
                  <option value="create">导入</option>
                  <option value="skip">跳过</option>
                  <option value="merge">合并(指向原)</option>
                  <option value="copy">保留副本</option>
                </select>
              </td>
              <td>{{ c.title }}</td>
              <td class="mono sm">{{ c.body ? c.body.slice(0, 40) + (c.body.length > 40 ? '…' : '') : '—' }}</td>
              <td class="mono sm">{{ c.sourceUrl || '—' }}</td>
              <td>
                <span v-if="c.status === 'new'" class="pill ok">可导入</span>
                <span v-else class="pill warn">重复{{ c.reason ? '· ' + c.reason : '' }}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="matPreview.skipped.length" class="hint">跳过行：{{ matPreview.skipped.join('；') }}</p>
      </div>
    </section>

    <!-- 单篇拆解（T2.3：ANALYSIS_SINGLE） -->
    <section class="card">
      <div class="row" style="justify-content: space-between">
        <h2 class="card-title" style="margin: 0">单篇拆解（ANALYSIS_SINGLE）</h2>
        <button class="btn" :disabled="runsLoading" @click="loadRuns">刷新任务</button>
      </div>
      <p class="hint">对一条对标素材调用 LLM 做结构化拆解（主题/痛点/钩子/结构/可延伸选题/调性/摘要），写入 AnalysisRun + Analysis。需先在系统设置配置启用的 LLM 供应商（SystemConfig）。</p>
      <div class="row">
        <input
          v-model="decompId"
          class="input wide mono"
          type="text"
          placeholder="素材 ID（source_material 的 id）"
        />
        <button class="btn primary" :disabled="decomping" @click="doDecompose">{{ decomping ? '提交中…' : '触发拆解' }}</button>
      </div>
      <p v-if="decompResult" class="hint">
        已创建任务 <span class="mono">{{ decompResult.taskId }}</span>
        <template v-if="decompResult.dispatched">，已进入队列待 Worker 消费</template>
        <template v-else>；本地 Redis 不可用，任务保留 queued（待环境），连接后由 Worker 消费</template>
      </p>

      <p v-if="runsError" class="message err">{{ runsError }}</p>
      <table v-if="runs.length" class="tbl">
        <thead>
          <tr><th>任务 ID</th><th>模型</th><th>状态</th><th>创建时间</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="r in runs" :key="r.id">
            <td class="mono sm">{{ r.id.slice(0, 8) }}</td>
            <td class="sm">{{ r.model || '—' }}</td>
            <td><span class="pill" :class="r.status === 'success' ? 'ok' : ''">{{ r.status }}</span></td>
            <td class="sm">{{ new Date(r.createdAt).toLocaleString() }}</td>
            <td><button class="btn ghost sm" @click="openRun(r)">查看结果</button></td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="!runsError" class="hint">暂无拆解任务。</p>

      <div v-if="activeRun" class="import-preview">
        <div class="row" style="justify-content: space-between">
          <span class="hint">任务 {{ activeRun.id.slice(0, 8) }} · 共 {{ activeRun.analyses?.length ?? 0 }} 条结果</span>
          <button class="btn ghost sm" @click="activeRun = null">关闭</button>
        </div>
        <pre v-for="a in activeRun.analyses" :key="a.id" class="code">{{ pretty(a.structured) }}</pre>
      </div>
    </section>

    <!-- 账号级汇总（T2.4：ANALYSIS_ACCOUNT_SUMMARY → 策略草稿） -->
    <section class="card">
      <div class="row" style="justify-content: space-between">
        <h2 class="card-title" style="margin: 0">账号级汇总（ANALYSIS_ACCOUNT_SUMMARY）</h2>
        <button class="btn" :disabled="accountRunsLoading" @click="loadAccountRuns">刷新任务</button>
      </div>
      <p class="hint">聚合若干「单篇拆解」结果，调用 LLM 生成一份账号内容策略草稿，写入该自有账号的 AccountStrategy（新版本，草稿态）。需先在系统设置配置启用的 LLM 供应商。</p>
      <div class="row">
        <input v-model="sumOwnedId" class="input wide mono" type="text" placeholder="自有账号 ID（owned_account 的 id）" />
        <textarea v-model="sumAnalysisIds" class="input mono area" rows="3" placeholder="选中的拆解结果 ID，每行一个（来自上方单篇拆解任务结果里的 analyses[].id）"></textarea>
      </div>
      <button class="btn primary" :disabled="summing" @click="doSummarize">{{ summing ? '提交中…' : '触发账号级汇总' }}</button>
      <p v-if="sumResult" class="hint">
        已创建任务 <span class="mono">{{ sumResult.taskId }}</span>
        <template v-if="sumResult.dispatched">，已进入队列待 Worker 消费</template>
        <template v-else>；本地 Redis 不可用，任务保留 queued（待环境），连接后由 Worker 消费</template>
      </p>

      <p v-if="accountRunsError" class="message err">{{ accountRunsError }}</p>
      <table v-if="accountRuns.length" class="tbl">
        <thead>
          <tr><th>任务 ID</th><th>模型</th><th>状态</th><th>创建时间</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in accountRuns" :key="r.id">
            <td class="mono sm">{{ r.id.slice(0, 8) }}</td>
            <td class="sm">{{ r.model || '—' }}</td>
            <td><span class="pill" :class="r.status === 'success' ? 'ok' : ''">{{ r.status }}</span></td>
            <td class="sm">{{ new Date(r.createdAt).toLocaleString() }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="!accountRunsError" class="hint">暂无账号级汇总任务。</p>
    </section>

    <!-- 策略版本（T1.7 后端 + T2.4 前端 + T2.5 绑定到自有账号） -->
    <section class="card">
      <h2 class="card-title">策略版本（查看 / 编辑 / 绑定为账号默认）</h2>
      <p class="hint">账号级汇总产出的草稿、以及手动创建的版本都在此管理。点击某版本可编辑字段卡，保存后写回；「绑定为账号默认」会原子地把该版本绑定到自有账号（写 OwnedAccount.defaultStrategyVersionId 并同步 isDefault），供后续内容项目（T3.2）继承，解除绑定即取消当前默认。</p>
      <div class="row">
        <input v-model="stratOwnedId" class="input wide mono" type="text" placeholder="自有账号 ID（与上方汇总同）" />
        <button class="btn" :disabled="stratLoading" @click="loadStrategies">加载版本</button>
      </div>
      <p v-if="stratError" class="message err">{{ stratError }}</p>
      <table v-if="stratList.length" class="tbl">
        <thead>
          <tr><th>版本</th><th>状态</th><th>账号默认</th><th>来源拆解数</th><th>更新时间</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="s in stratList" :key="s.id">
            <td class="mono sm">v{{ s.version }}</td>
            <td><span class="pill" :class="s.status === 'active' ? 'ok' : ''">{{ s.status }}</span></td>
            <td><span v-if="s.isDefault" class="pill ok">已绑定·默认</span><span v-else class="pill">—</span></td>
            <td class="sm">{{ (s.sourceAnalysisIds || []).length }}</td>
            <td class="sm">{{ new Date(s.updatedAt).toLocaleString() }}</td>
            <td class="row" style="gap: 6px">
              <button class="btn ghost sm" @click="openStrategy(s)">编辑</button>
              <button class="btn ghost sm" :disabled="s.isDefault || bindingStrat" @click="bindAsDefault(s)">绑定为账号默认</button>
              <button v-if="s.isDefault" class="btn ghost sm" :disabled="bindingStrat" @click="unbind(s)">解除绑定</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="!stratError" class="hint">该账号暂无策略版本。可先用上方「账号级汇总」生成一份草稿。</p>

      <div v-if="activeStrategy" class="import-preview">
        <div class="row" style="justify-content: space-between">
          <span class="hint">编辑 策略 v{{ activeStrategy.version }}（{{ activeStrategy.id.slice(0, 8) }}）· 状态 {{ activeStrategy.status }}</span>
          <button class="btn ghost sm" @click="activeStrategy = null">关闭</button>
        </div>
        <div class="field"><label>定位 position（JSON 对象）</label><textarea v-model="stratEdits.position" class="input mono area" rows="3"></textarea></div>
        <div class="field"><label>受众 audience（JSON 对象）</label><textarea v-model="stratEdits.audience" class="input mono area" rows="3"></textarea></div>
        <div class="field"><label>栏目支柱 pillars（JSON 数组）</label><textarea v-model="stratEdits.pillars" class="input mono area" rows="2"></textarea></div>
        <div class="field"><label>标题偏好 titlePref（JSON 对象）</label><textarea v-model="stratEdits.titlePref" class="input mono area" rows="2"></textarea></div>
        <div class="field"><label>结构范式 structure（文本或 JSON）</label><textarea v-model="stratEdits.structure" class="input mono area" rows="2"></textarea></div>
        <div class="field"><label>调性 tone（JSON 对象）</label><textarea v-model="stratEdits.tone" class="input mono area" rows="2"></textarea></div>
        <div class="field"><label>边界 boundaries（JSON 数组）</label><textarea v-model="stratEdits.boundaries" class="input mono area" rows="2"></textarea></div>
        <div class="row">
          <button class="btn primary" :disabled="savingStrat" @click="saveStrategy">{{ savingStrat ? '保存中…' : '保存修改' }}</button>
          <span class="hint">保存为 PATCH，仅传已改动字段。</span>
        </div>
      </div>
    </section>

    <p v-if="message" class="message" :class="messageType">{{ message }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import {
  fetchReferenceAccounts,
  createReferenceAccount,
  deleteReferenceAccount,
  previewReferenceImport,
  commitReferenceImport,
  previewMaterialImport,
  commitMaterialImport,
  decomposeMaterial,
  listAnalysisRuns,
  summarizeAccount,
  listAccountRuns,
  listStrategies,
  getStrategy,
  updateStrategy,
  bindStrategy,
  type ReferenceAccount,
  type ImportPreviewResult,
  type ReferenceImportFormat,
  type MaterialImportFormat,
  type MaterialImportPreviewResult,
  type AnalysisRunItem,
  type StrategyItem,
} from '../api/http';

const token = ref<string>(localStorage.getItem('wb_token') ?? '');
const accounts = ref<ReferenceAccount[]>([]);
const listError = ref('');
const loading = ref(false);

const form = reactive({ name: '', platform: 'wechat', homepageUrl: '', domain: '', note: '' });
const creating = ref(false);

const importFormat = ref<ReferenceImportFormat>('csv');
const importRaw = ref('');
const previewing = ref(false);
const preview = ref<ImportPreviewResult | null>(null);
const previewError = ref('');
const selected = reactive<Record<number, boolean>>({});
const committing = ref(false);

// ---- 素材批量导入（T2.2）----
const matRefId = ref('');
const matFormat = ref<MaterialImportFormat>('csv');
const matRaw = ref('');
const matPreviewing = ref(false);
const matPreview = ref<MaterialImportPreviewResult | null>(null);
const matPreviewError = ref('');
const matCommitting = ref(false);

const matPlaceholder = computed(() => {
  switch (matFormat.value) {
    case 'csv':
      return 'title,body,sourceUrl\n某爆款标题,开头钩子+观点,https://...\n';
    case 'json':
      return '[{ "title": "标题", "body": "正文", "sourceUrl": "https://..." }]';
    case 'markdown':
      return '# 文档标题（可忽略）\n## 素材一标题\n素材一正文\n## 素材二标题\n素材二正文';
    case 'lines':
      return '标题一 - 正文一\n标题二：正文二';
    case 'form':
      return '{ "title": "单条标题", "body": "单条正文" }';
    case 'excel':
      return '请选择 .xlsx/.xls 文件（首个工作表，首行为表头：title,body,sourceUrl,...）';
    default:
      return '';
  }
});

const message = ref('');
const messageType = ref<'ok' | 'err'>('ok');

function flash(msg: string, type: 'ok' | 'err' = 'ok') {
  message.value = msg;
  messageType.value = type;
}

function saveToken() {
  localStorage.setItem('wb_token', token.value.trim());
  flash('令牌已保存到本地（仅本浏览器）');
}
function clearToken() {
  localStorage.removeItem('wb_token');
  token.value = '';
  flash('令牌已清除');
}

async function loadList() {
  loading.value = true;
  listError.value = '';
  try {
    accounts.value = await fetchReferenceAccounts();
  } catch (e) {
    listError.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}

async function createAccount() {
  if (!form.name.trim()) {
    flash('请填写名称', 'err');
    return;
  }
  creating.value = true;
  try {
    await createReferenceAccount({
      name: form.name.trim(),
      platform: form.platform,
      homepageUrl: form.homepageUrl.trim() || undefined,
      domain: form.domain.trim() || undefined,
      note: form.note.trim() || undefined,
    });
    form.name = '';
    form.homepageUrl = '';
    form.domain = '';
    form.note = '';
    flash('对标账号已创建');
    await loadList();
  } catch (e) {
    flash((e as Error).message, 'err');
  } finally {
    creating.value = false;
  }
}

async function removeAccount(a: ReferenceAccount) {
  if (!confirm(`确认删除对标账号「${a.name}」？（软删）`)) return;
  try {
    await deleteReferenceAccount(a.id);
    flash('已删除');
    await loadList();
  } catch (e) {
    flash((e as Error).message, 'err');
  }
}

async function previewImport() {
  previewing.value = true;
  previewError.value = '';
  preview.value = null;
  try {
    const r = await previewReferenceImport({ format: importFormat.value, raw: importRaw.value });
    preview.value = r;
    // 默认勾选所有可导入（new）项
    for (const c of r.candidates) selected[c.index] = c.status === 'new';
  } catch (e) {
    previewError.value = (e as Error).message;
  } finally {
    previewing.value = false;
  }
}

const duplicateCount = computed(
  () => (preview.value?.candidates ?? []).filter((c) => c.status === 'duplicate').length,
);
const selectedNewCount = computed(() => {
  if (!preview.value) return 0;
  return preview.value.candidates.filter((c) => c.status === 'new' && selected[c.index]).length;
});

async function commit() {
  if (!preview.value) return;
  const rows = preview.value.candidates
    .filter((c) => selected[c.index])
    .map((c) => ({
      name: c.name,
      platform: c.platform,
      homepageUrl: c.homepageUrl,
      domain: c.domain,
      note: c.note,
      action: 'create' as const,
    }));
  if (rows.length === 0) {
    flash('没有勾选任何可导入项', 'err');
    return;
  }
  committing.value = true;
  try {
    const r = await commitReferenceImport(rows);
    flash(`导入完成：新建 ${r.created}，跳过 ${r.skipped}`);
    preview.value = null;
    importRaw.value = '';
    Object.keys(selected).forEach((k) => delete selected[Number(k)]);
    await loadList();
  } catch (e) {
    flash((e as Error).message, 'err');
  } finally {
    committing.value = false;
  }
}

const matDupCount = computed(
  () => (matPreview.value?.candidates ?? []).filter((c) => c.status === 'duplicate').length,
);

async function previewMaterials() {
  if (!matRefId.value) {
    flash('请先选择对标账号', 'err');
    return;
  }
  if (!matRaw.value.trim()) {
    flash('请粘贴导入内容或选择 Excel 文件', 'err');
    return;
  }
  matPreviewing.value = true;
  matPreviewError.value = '';
  matPreview.value = null;
  try {
    const r = await previewMaterialImport({
      referenceAccountId: matRefId.value,
      format: matFormat.value,
      raw: matRaw.value,
    });
    matPreview.value = r;
  } catch (e) {
    matPreviewError.value = (e as Error).message;
  } finally {
    matPreviewing.value = false;
  }
}

/** Excel 文件读为 base64 交由后端解析。 */
function onExcelFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const buf = new Uint8Array(reader.result as ArrayBuffer);
    let bin = '';
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    matRaw.value = btoa(bin);
    flash(`已读取 ${file.name}（${buf.length} 字节），点击「解析并预览」`);

  };
  reader.readAsArrayBuffer(file);
}

/** 将预览候选动作重置为默认值（new→导入 / duplicate→跳过）。 */
function resetMatActions() {
  if (!matPreview.value) return;
  for (const c of matPreview.value.candidates) {
    c.action = c.status === 'new' ? 'create' : 'skip';
  }
}

async function commitMaterials() {
  if (!matPreview.value || !matRefId.value) return;
  const rows = matPreview.value.candidates.map((c) => ({
    action: c.action,
    title: c.title,
    body: c.body,
    sourceUrl: c.sourceUrl,
    author: c.author,
    collectedAt: c.collectedAt,
    licenseNote: c.licenseNote,
    existingId: c.existingId,
  }));
  matCommitting.value = true;
  try {
    const r = await commitMaterialImport(matRefId.value, rows);
    flash(`导入完成：新建 ${r.created}，跳过 ${r.skipped}`);
    matPreview.value = null;
    matRaw.value = '';
  } catch (e) {
    flash((e as Error).message, 'err');
  } finally {
    matCommitting.value = false;
  }
}

// ---- 单篇拆解（T2.3）----
const decompId = ref('');
const decomping = ref(false);
const decompResult = ref<{ taskId: string; dispatched: boolean } | null>(null);
const runs = ref<AnalysisRunItem[]>([]);
const runsLoading = ref(false);
const runsError = ref('');
const activeRun = ref<AnalysisRunItem | null>(null);

async function doDecompose() {
  if (!decompId.value.trim()) {
    flash('请填写素材 ID', 'err');
    return;
  }
  decomping.value = true;
  decompResult.value = null;
  try {
    const r = await decomposeMaterial(decompId.value.trim());
    decompResult.value = r;
    flash(`已创建拆解任务 ${r.taskId.slice(0, 8)}`);
    await loadRuns();
  } catch (e) {
    flash((e as Error).message, 'err');
  } finally {
    decomping.value = false;
  }
}

async function loadRuns() {
  runsLoading.value = true;
  runsError.value = '';
  try {
    runs.value = await listAnalysisRuns();
  } catch (e) {
    runsError.value = (e as Error).message;
  } finally {
    runsLoading.value = false;
  }
}

function openRun(r: AnalysisRunItem) {
  activeRun.value = r;
}

function pretty(obj: unknown): string {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}

// ---- 账号级汇总（T2.4）----
const sumOwnedId = ref('');
const sumAnalysisIds = ref('');
const summing = ref(false);
const sumResult = ref<{ taskId: string; dispatched: boolean } | null>(null);
const accountRuns = ref<AnalysisRunItem[]>([]);
const accountRunsLoading = ref(false);
const accountRunsError = ref('');

function parseIdLines(raw: string): string[] {
  return raw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function doSummarize() {
  const ownedId = sumOwnedId.value.trim();
  const ids = parseIdLines(sumAnalysisIds.value);
  if (!ownedId) {
    flash('请填写自有账号 ID', 'err');
    return;
  }
  if (ids.length === 0) {
    flash('请至少填写一个拆解结果 ID', 'err');
    return;
  }
  summing.value = true;
  sumResult.value = null;
  try {
    const r = await summarizeAccount(ownedId, ids);
    sumResult.value = r;
    flash(`已创建汇总任务 ${r.taskId.slice(0, 8)}`);
    await loadAccountRuns();
  } catch (e) {
    flash((e as Error).message, 'err');
  } finally {
    summing.value = false;
  }
}

async function loadAccountRuns() {
  accountRunsLoading.value = true;
  accountRunsError.value = '';
  try {
    accountRuns.value = await listAccountRuns();
  } catch (e) {
    accountRunsError.value = (e as Error).message;
  } finally {
    accountRunsLoading.value = false;
  }
}

// ---- 策略版本（T1.7 后端 + T2.4 前端）----
const stratOwnedId = ref('');
const stratLoading = ref(false);
const bindingStrat = ref(false);
const stratList = ref<StrategyItem[]>([]);
const stratError = ref('');
const activeStrategy = ref<StrategyItem | null>(null);
const savingStrat = ref(false);
const stratEdits = reactive({
  position: '',
  audience: '',
  pillars: '',
  titlePref: '',
  structure: '',
  tone: '',
  boundaries: '',
});

function loadStratEdits(s: StrategyItem) {
  stratEdits.position = pretty(s.position);
  stratEdits.audience = pretty(s.audience);
  stratEdits.pillars = pretty(s.pillars);
  stratEdits.titlePref = pretty(s.titlePref);
  stratEdits.structure = typeof s.structure === 'string' ? s.structure : pretty(s.structure);
  stratEdits.tone = pretty(s.tone);
  stratEdits.boundaries = pretty(s.boundaries);
}

async function loadStrategies() {
  const ownedId = stratOwnedId.value.trim();
  if (!ownedId) {
    flash('请填写自有账号 ID', 'err');
    return;
  }
  stratLoading.value = true;
  stratError.value = '';
  try {
    stratList.value = await listStrategies(ownedId);
    activeStrategy.value = null;
  } catch (e) {
    stratError.value = (e as Error).message;
  } finally {
    stratLoading.value = false;
  }
}

async function openStrategy(s: StrategyItem) {
  try {
    const full = await getStrategy(s.id);
    activeStrategy.value = full;
    loadStratEdits(full);
  } catch (e) {
    flash((e as Error).message, 'err');
  }
}

async function saveStrategy() {
  if (!activeStrategy.value) return;
  const id = activeStrategy.value.id;
  const parseObj = (str: string): Record<string, unknown> => {
    const t = str.trim();
    if (!t) return {};
    try {
      const v = JSON.parse(t);
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch {
      return {};
    }
  };
  const parseArr = (str: string): unknown[] => {
    const t = str.trim();
    if (!t) return [];
    try {
      const v = JSON.parse(t);
      return Array.isArray(v) ? v : [t];
    } catch {
      return [t];
    }
  };
  const parseStructure = (str: string): unknown => {
    const t = str.trim();
    if (!t) return '';
    try {
      return JSON.parse(t);
    } catch {
      return t; // 纯文本也允许
    }
  };
  const dto = {
    position: parseObj(stratEdits.position),
    audience: parseObj(stratEdits.audience),
    pillars: parseArr(stratEdits.pillars),
    titlePref: parseObj(stratEdits.titlePref),
    structure: parseStructure(stratEdits.structure),
    tone: parseObj(stratEdits.tone),
    boundaries: parseArr(stratEdits.boundaries),
  };
  savingStrat.value = true;
  try {
    const updated = await updateStrategy(id, dto);
    flash(`策略 v${updated.version} 已保存`);
    await loadStrategies();
    activeStrategy.value = null;
  } catch (e) {
    flash((e as Error).message, 'err');
  } finally {
    savingStrat.value = false;
  }
}

async function bindAsDefault(s: StrategyItem) {
  const ownedId = stratOwnedId.value.trim();
  if (!ownedId) {
    flash('请先填写自有账号 ID', 'err');
    return;
  }
  bindingStrat.value = true;
  try {
    await bindStrategy(ownedId, s.id);
    flash(`已将策略 v${s.version} 绑定为账号默认`);
    await loadStrategies();
  } catch (e) {
    flash((e as Error).message, 'err');
  } finally {
    bindingStrat.value = false;
  }
}

async function unbind(s: StrategyItem) {
  const ownedId = stratOwnedId.value.trim();
  if (!ownedId) {
    flash('请先填写自有账号 ID', 'err');
    return;
  }
  bindingStrat.value = true;
  try {
    await bindStrategy(ownedId, null);
    flash(`已解除账号默认策略绑定`);
    await loadStrategies();
  } catch (e) {
    flash((e as Error).message, 'err');
  } finally {
    bindingStrat.value = false;
  }
}

onMounted(loadList);
</script>

<style scoped>
.an {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.card {
  background: var(--panel, #1e2030);
  border: 1px solid var(--border, #2a2c3a);
  border-radius: 10px;
  padding: 16px 18px;
}
.card-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 12px;
  color: var(--text, #e6e8ef);
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.input {
  background: var(--input, #15161f);
  border: 1px solid var(--border, #2a2c3a);
  color: var(--text, #e6e8ef);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 13px;
  outline: none;
}
.input:focus {
  border-color: var(--brand, #4f8cff);
}
.input.wide {
  flex: 1;
  min-width: 260px;
}
.input.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.input.area {
  width: 100%;
  margin-top: 10px;
  resize: vertical;
}
.input.sm {
  padding: 4px 6px;
  font-size: 12px;
  min-width: 120px;
}
.lbl {
  font-size: 12px;
  color: var(--side-text, #9aa3b2);
}
.file-in {
  margin-top: 10px;
  color: var(--text, #e6e8ef);
  font-size: 13px;
}
select.input {
  min-width: 120px;
}
.field {
  margin-bottom: 14px;
}
.field label {
  display: block;
  font-size: 12px;
  color: var(--side-text, #9aa3b2);
  margin-bottom: 6px;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.hint {
  font-size: 12px;
  color: var(--side-text, #9aa3b2);
  margin: 6px 0 0;
}
.btn {
  background: var(--panel, #1e2030);
  border: 1px solid var(--border, #2a2c3a);
  color: var(--text, #e6e8ef);
  border-radius: 6px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 13px;
}
.btn:hover {
  border-color: var(--brand, #4f8cff);
}
.btn.primary {
  background: var(--brand, #4f8cff);
  color: var(--brand-ink, #fff);
  border-color: transparent;
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.btn.ghost {
  background: transparent;
}
.btn.sm {
  padding: 4px 8px;
  font-size: 12px;
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
  font-size: 13px;
}
.tbl th,
.tbl td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border, #2a2c3a);
  color: var(--text, #e6e8ef);
}
.tbl th {
  color: var(--side-text, #9aa3b2);
  font-weight: 600;
}
.sm {
  font-size: 12px;
  color: var(--side-text, #9aa3b2);
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  background: var(--border, #2a2c3a);
  color: var(--side-text, #9aa3b2);
}
.pill.ok {
  background: rgba(79, 140, 255, 0.16);
  color: #7fb0ff;
}
.pill.warn {
  background: rgba(255, 170, 70, 0.16);
  color: #ffba6b;
}
.import-preview {
  margin-top: 14px;
  border-top: 1px dashed var(--border, #2a2c3a);
  padding-top: 12px;
}
.message {
  font-size: 13px;
  padding: 10px 12px;
  border-radius: 8px;
}
.message.ok {
  background: rgba(79, 140, 255, 0.12);
  color: #9fc1ff;
}
.message.err {
  background: rgba(255, 90, 90, 0.12);
  color: #ff9b9b;
}
</style>
