<template>
  <div class="sys">
    <!-- 开发期令牌：系统设置写入接口需鉴权；生产由登录流程下发，此处仅用于本地联调 -->
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
      <p class="hint">提示：登录后从 /api/auth/login 响应中取 accessToken 填入；未填则设置读写接口返回 401。</p>
    </section>

    <!-- 状态总览：把已完成的认证/任务中心/备份/健康接入系统设置页（此前前端空白的根因） -->
    <section class="card">
      <h2 class="card-title">状态总览</h2>
      <div class="status-grid">
        <div class="status-card">
          <div class="status-head">认证</div>
          <div class="status-body">
            <span class="pill ok">JWT + argon2</span>
            <ul class="tiny">
              <li v-for="e in status.auth.implemented" :key="e">{{ e }}</li>
            </ul>
            <p class="note">{{ status.auth.note }}</p>
          </div>
        </div>
        <div class="status-card">
          <div class="status-head">任务中心</div>
          <div class="status-body">
            <span class="pill" :class="status.tasks.queueAvailable ? 'ok' : 'warn'">
              {{ status.tasks.queueAvailable ? '队列在线' : '队列待环境' }}
            </span>
            <ul class="tiny">
              <li v-for="e in status.tasks.implemented" :key="e">{{ e }}</li>
            </ul>
            <p class="note">{{ status.tasks.note }}</p>
          </div>
        </div>
        <div class="status-card">
          <div class="status-head">备份与恢复</div>
          <div class="status-body">
            <span class="pill ok">脚本就绪</span>
            <ul class="tiny">
              <li v-for="s in status.backup.scripts" :key="s">{{ s }}</li>
              <li>定时：{{ status.backup.cronExample }}</li>
              <li>手册：{{ status.backup.manual }}</li>
            </ul>
            <p class="note">{{ status.backup.note }}</p>
          </div>
        </div>
        <div class="status-card">
          <div class="status-head">依赖健康</div>
          <div class="status-body">
            <div class="kv"><span>PostgreSQL</span><b :class="healthUp(status.health.postgres)">{{ status.health.postgres }}</b></div>
            <div class="kv"><span>Redis</span><b :class="healthUp(status.health.redis)">{{ status.health.redis }}</b></div>
          </div>
        </div>
      </div>
    </section>

    <!-- 站点设置单例：基础信息 / 默认公众号(AppID 加密) / 合规开关 -->
    <section class="card">
      <h2 class="card-title">站点设置（单例）</h2>

      <div class="field">
        <label>站点名称</label>
        <input v-model="form.siteName" class="input" type="text" maxlength="80" />
      </div>

      <div class="field">
        <label>站点描述</label>
        <textarea v-model="form.siteDesc" class="input" rows="2" maxlength="200" placeholder="可选" />
      </div>

      <div class="field">
        <label>默认公众号 AppID</label>
        <input
          v-model="form.defaultWechatAppId"
          class="input mono"
          type="text"
          maxlength="64"
          placeholder="留空表示清空；提交后服务端 AES-256-GCM 加密入库"
        />
        <p class="hint">
          当前状态：<b>{{ settings.appIdConfigured ? '已配置（脱敏）' : '未配置' }}</b>
          <span v-if="settings.defaultWechatAppIdMasked"> · {{ settings.defaultWechatAppIdMasked }}</span>
        </p>
      </div>

      <!-- T3.9 公众号发布执行所需 AppSecret（与 AppID 配套，AES 加密入库） -->
      <div class="field">
        <label>默认公众号 AppSecret（T3.9 发布执行）</label>
        <input
          v-model="form.defaultWechatAppSecret"
          class="input mono"
          type="password"
          maxlength="128"
          placeholder="留空表示清空；提交后服务端 AES-256-GCM 加密入库，日志绝不打印明文"
        />
        <p class="hint">
          当前状态：<b>{{ settings.appSecretConfigured ? '已配置' : '未配置' }}</b>
          · 与 AppID 配套用于换取 access_token，完成草稿同步/发布/群发。
        </p>
      </div>

      <div class="field">
        <label>合规开关</label>
        <div class="checks">
          <label class="check"><input type="checkbox" v-model="form.compliance.aiDisclosureRequired" /> AI 生成内容需声明标识（必填，深入设计 §12）</label>
          <label class="check"><input type="checkbox" v-model="form.compliance.autoSaveEnabled" /> 编辑器自动保存</label>
          <label class="check"><input type="checkbox" v-model="form.compliance.strictReview" /> 严格审核（发布前强制复核）</label>
        </div>
      </div>

      <div class="row">
        <button class="btn primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存设置' }}</button>
        <span v-if="settings.updatedAt" class="hint">上次更新：{{ settings.updatedAt }}</span>
      </div>
    </section>

    <!-- 通知与告警（T1.10）：企业微信/钉钉 Webhook + 邮件 SMTP；敏感字段服务端加密入库 -->
    <section class="card">
      <h2 class="card-title">通知与告警（T1.10）</h2>
      <p class="hint">企业微信/钉钉 Webhook 与邮件 SMTP 凭据仅存于服务端（AES-256-GCM 加密入库），前端仅见脱敏。任务成功/失败与备份失败/配额/存活告警将推送至启用的渠道。</p>

      <div class="notif-grid">
        <div class="notif-card">
          <div class="notif-head"><label class="check"><input type="checkbox" v-model="notifForm.wecom.enabled" /> 企业微信 Webhook</label></div>
          <div class="field"><label>Webhook 地址</label>
            <input v-model="notifForm.wecom.webhookUrl" class="input wide mono" type="text" placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..." />
          </div>
          <button class="btn" :disabled="busy==='wecom'" @click="test('wecom')">测试</button>
        </div>

        <div class="notif-card">
          <div class="notif-head"><label class="check"><input type="checkbox" v-model="notifForm.dingtalk.enabled" /> 钉钉 Webhook</label></div>
          <div class="field"><label>Webhook 地址</label>
            <input v-model="notifForm.dingtalk.webhookUrl" class="input wide mono" type="text" placeholder="https://oapi.dingtalk.com/robot/send?access_token=..." />
          </div>
          <div class="field"><label>加签密钥（可选）</label>
            <input v-model="notifForm.dingtalk.secret" class="input wide mono" type="text" placeholder="SEC..." />
          </div>
          <button class="btn" :disabled="busy==='dingtalk'" @click="test('dingtalk')">测试</button>
        </div>

        <div class="notif-card">
          <div class="notif-head"><label class="check"><input type="checkbox" v-model="notifForm.email.enabled" /> 邮件 SMTP</label></div>
          <div class="field"><label>SMTP 主机</label><input v-model="notifForm.email.smtpHost" class="input wide mono" type="text" placeholder="smtp.example.com" /></div>
          <div class="row">
            <div class="field" style="flex:1"><label>端口</label><input v-model.number="notifForm.email.smtpPort" class="input" type="number" /></div>
            <div class="field" style="flex:1;display:flex;align-items:center;gap:6px"><label style="margin:0">SSL(465)</label><input type="checkbox" v-model="notifForm.email.secure" /></div>
          </div>
          <div class="field"><label>用户名</label><input v-model="notifForm.email.smtpUser" class="input wide mono" type="text" /></div>
          <div class="field"><label>密码</label><input v-model="notifForm.email.smtpPassword" class="input wide mono" type="password" placeholder="留空则不鉴权" /></div>
          <div class="field"><label>发件人</label><input v-model="notifForm.email.from" class="input wide" type="text" /></div>
          <div class="field"><label>收件人（逗号分隔）</label><input v-model="notifForm.email.toText" class="input wide" type="text" placeholder="a@x.com,b@y.com" /></div>
          <button class="btn" :disabled="busy==='email'" @click="test('email')">测试</button>
        </div>
      </div>

      <div class="field" style="margin-top:14px">
        <label>转发以下告警类型</label>
        <div class="checks">
          <label class="check"><input type="checkbox" v-model="forwardKinds.task_failed" /> 任务失败</label>
          <label class="check"><input type="checkbox" v-model="forwardKinds.backup_failed" /> 备份失败</label>
          <label class="check"><input type="checkbox" v-model="forwardKinds.liveness" /> 服务存活</label>
          <label class="check"><input type="checkbox" v-model="forwardKinds.quota" /> 配额预警</label>
          <label class="check"><input type="checkbox" v-model="forwardKinds.task_success" /> 任务成功</label>
          <label class="check"><input type="checkbox" v-model="forwardKinds.generic" /> 通用通知</label>
        </div>
      </div>

      <div class="row" style="margin-top:12px">
        <button class="btn primary" :disabled="savingNotif" @click="saveNotif">{{ savingNotif ? '保存中…' : '保存通知配置' }}</button>
        <button class="btn" :disabled="busy==='alert'" @click="sendTestAlert">发送测试告警</button>
        <span v-if="notifStatus" class="hint">已启用渠道：{{ notifStatus.enabledChannels }} / 共 {{ notifStatus.totalChannels }}</span>
      </div>
    </section>

    <p v-if="message" class="message" :class="messageType">{{ message }}</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import {
  fetchSystemStatus,
  fetchSystemSettings,
  saveSystemSettings,
  fetchNotificationStatus,
  fetchNotificationChannels,
  saveNotificationChannels,
  testNotification,
  sendAlert,
  type SiteSettingsView,
  type SystemStatus,
  type NotificationChannel,
  type NotificationChannelType,
  type NotificationAlertKind,
  type NotificationSettings,
  type NotificationStatus,
} from '../api/http';

const token = ref<string>(localStorage.getItem('wb_token') ?? '');
const status = ref<SystemStatus>({
  auth: { implemented: [], note: '' },
  tasks: { implemented: [], queueAvailable: false, note: '' },
  backup: { scripts: [], cronExample: '', manual: '', note: '' },
  health: { postgres: '—', redis: '—' },
});

const settings = ref<SiteSettingsView>({
  siteName: '',
  siteDesc: null,
  defaultWechatAppIdMasked: '',
  appIdConfigured: false,
  appSecretConfigured: false,
  compliance: { aiDisclosureRequired: true, autoSaveEnabled: true, strictReview: false },
  updatedAt: null,
});

const form = reactive({
  siteName: '',
  siteDesc: '',
  defaultWechatAppId: '',
  defaultWechatAppSecret: '',
  compliance: { aiDisclosureRequired: true, autoSaveEnabled: true, strictReview: false },
});

const saving = ref(false);
const message = ref('');
const messageType = ref<'ok' | 'err'>('ok');

// ---- 通知与告警（T1.10）----
const notifStatus = ref<NotificationStatus | null>(null);
const notifForm = reactive({
  wecom: { enabled: false, webhookUrl: '' },
  dingtalk: { enabled: false, webhookUrl: '', secret: '' },
  email: {
    enabled: false,
    smtpHost: '',
    smtpPort: 465,
    smtpUser: '',
    smtpPassword: '',
    secure: true,
    from: '',
    toText: '',
  },
});
const forwardKinds = reactive<Record<string, boolean>>({
  task_failed: true,
  backup_failed: true,
  liveness: true,
  quota: true,
  task_success: false,
  generic: false,
});
const savingNotif = ref(false);
const busy = ref('');

function saveToken() {
  localStorage.setItem('wb_token', token.value.trim());
  message.value = '令牌已保存到本地（仅本浏览器）';
  messageType.value = 'ok';
}
function clearToken() {
  localStorage.removeItem('wb_token');
  token.value = '';
  message.value = '令牌已清除';
  messageType.value = 'ok';
}

function healthUp(v: string): string {
  return v.startsWith('up') ? 'ok' : 'warn';
}

function hydrateForm(s: SiteSettingsView) {
  form.siteName = s.siteName;
  form.siteDesc = s.siteDesc ?? '';
  form.defaultWechatAppId = '';
  form.defaultWechatAppSecret = ''; // 出于安全，明文不回填，仅作占位
  form.compliance = {
    aiDisclosureRequired: Boolean(s.compliance.aiDisclosureRequired),
    autoSaveEnabled: Boolean(s.compliance.autoSaveEnabled),
    strictReview: Boolean(s.compliance.strictReview),
  };
}

async function loadAll() {
  message.value = '';
  try {
    status.value = await fetchSystemStatus();
  } catch (e) {
    message.value = `状态总览加载失败：${(e as Error).message}`;
    messageType.value = 'err';
  }
  try {
    const s = await fetchSystemSettings();
    settings.value = s;
    hydrateForm(s);
  } catch (e) {
    message.value = `设置加载失败：${(e as Error).message}`;
    messageType.value = 'err';
  }
}

async function save() {
  saving.value = true;
  message.value = '';
  const payload = {
    siteName: form.siteName,
    siteDesc: form.siteDesc,
    defaultWechatAppId: form.defaultWechatAppId,
    defaultWechatAppSecret: form.defaultWechatAppSecret,
    compliance: { ...form.compliance },
  };
  try {
    const s = await saveSystemSettings(payload);
    settings.value = s;
    form.defaultWechatAppId = '';
    form.defaultWechatAppSecret = '';
    message.value = '站点设置已保存（AppID / AppSecret 已加密入库）';
    messageType.value = 'ok';
  } catch (e) {
    message.value = `保存失败：${(e as Error).message}`;
    messageType.value = 'err';
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await loadAll();
  await loadNotif();
});

// ---- 通知与告警（T1.10）逻辑 ----
function buildNotifPayload(): NotificationSettings {
  const channels: NotificationChannel[] = [];
  if (notifForm.wecom.webhookUrl || notifForm.wecom.enabled) {
    channels.push({ type: 'wecom', enabled: notifForm.wecom.enabled, webhookUrl: notifForm.wecom.webhookUrl || undefined });
  }
  if (notifForm.dingtalk.webhookUrl || notifForm.dingtalk.enabled) {
    channels.push({
      type: 'dingtalk',
      enabled: notifForm.dingtalk.enabled,
      webhookUrl: notifForm.dingtalk.webhookUrl || undefined,
      secret: notifForm.dingtalk.secret || undefined,
    });
  }
  if (notifForm.email.smtpHost || notifForm.email.enabled) {
    const to = notifForm.email.toText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    channels.push({
      type: 'email',
      enabled: notifForm.email.enabled,
      smtpHost: notifForm.email.smtpHost || undefined,
      smtpPort: Number(notifForm.email.smtpPort) || 465,
      smtpUser: notifForm.email.smtpUser || undefined,
      smtpPassword: notifForm.email.smtpPassword || undefined,
      secure: notifForm.email.secure,
      from: notifForm.email.from || undefined,
      to: to.length ? to : undefined,
    });
  }
  const forwardKindsArr = (Object.keys(forwardKinds) as NotificationAlertKind[]).filter((k) => forwardKinds[k]);
  return { channels, forwardKinds: forwardKindsArr };
}

function hydrateNotif(s: NotificationSettings) {
  const map: Record<string, NotificationChannel> = {};
  for (const c of s.channels) map[c.type] = c;
  notifForm.wecom.enabled = Boolean(map.wecom?.enabled);
  notifForm.wecom.webhookUrl = map.wecom?.webhookUrl ?? '';
  notifForm.dingtalk.enabled = Boolean(map.dingtalk?.enabled);
  notifForm.dingtalk.webhookUrl = map.dingtalk?.webhookUrl ?? '';
  notifForm.dingtalk.secret = map.dingtalk?.secret ?? '';
  notifForm.email.enabled = Boolean(map.email?.enabled);
  notifForm.email.smtpHost = map.email?.smtpHost ?? '';
  notifForm.email.smtpPort = map.email?.smtpPort ?? 465;
  notifForm.email.smtpUser = map.email?.smtpUser ?? '';
  notifForm.email.smtpPassword = '';
  notifForm.email.secure = map.email?.secure ?? true;
  notifForm.email.from = map.email?.from ?? '';
  notifForm.email.toText = (map.email?.to ?? []).join(',');
  for (const k of Object.keys(forwardKinds)) {
    forwardKinds[k] = s.forwardKinds.includes(k as NotificationAlertKind);
  }
}

async function loadNotif() {
  try {
    notifStatus.value = await fetchNotificationStatus();
  } catch {
    /* 概览接口公开，一般不应失败 */
  }
  try {
    const s = await fetchNotificationChannels();
    hydrateNotif(s);
  } catch {
    /* 需令牌：未登录时静默，用户粘贴令牌后重试即可 */
  }
}

async function saveNotif() {
  savingNotif.value = true;
  message.value = '';
  try {
    const s = await saveNotificationChannels(buildNotifPayload());
    notifStatus.value = {
      enabledChannels: s.channels.filter((c) => c.enabled).length,
      totalChannels: s.channels.length,
      forwardKinds: s.forwardKinds,
      note: '',
    };
    message.value = '通知配置已保存（敏感字段服务端加密入库）';
    messageType.value = 'ok';
  } catch (e) {
    message.value = `保存失败：${(e as Error).message}`;
    messageType.value = 'err';
  } finally {
    savingNotif.value = false;
  }
}

async function test(type: string) {
  busy.value = type;
  message.value = '';
  try {
    const r = await testNotification(type as NotificationChannelType, `[自媒体工作台] 测试通知 @ ${new Date().toLocaleString()}`);
    message.value = r.ok ? `测试发送成功（${type}）` : `测试失败（${type}）：${r.error ?? '未知错误'}`;
    messageType.value = r.ok ? 'ok' : 'err';
  } catch (e) {
    message.value = `测试失败：${(e as Error).message}`;
    messageType.value = 'err';
  } finally {
    busy.value = '';
  }
}

async function sendTestAlert() {
  busy.value = 'alert';
  message.value = '';
  try {
    const rs = await sendAlert('generic', '手动测试告警');
    const ok = rs.filter((r) => r.ok).length;
    message.value = `已尝试推送测试告警：成功 ${ok}/${rs.length}`;
    messageType.value = ok > 0 ? 'ok' : 'err';
  } catch (e) {
    message.value = `告警失败：${(e as Error).message}`;
    messageType.value = 'err';
  } finally {
    busy.value = '';
  }
}
</script>

<style scoped>
.sys {
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
.field {
  margin-bottom: 14px;
}
.field label {
  display: block;
  font-size: 12px;
  color: var(--side-text, #9aa3b2);
  margin-bottom: 6px;
}
.hint {
  font-size: 12px;
  color: var(--side-text, #9aa3b2);
  margin: 6px 0 0;
}
.checks {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.check {
  font-size: 13px;
  color: var(--text, #e6e8ef);
  display: flex;
  align-items: center;
  gap: 8px;
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
.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}
.status-card {
  background: var(--input, #15161f);
  border: 1px solid var(--border, #2a2c3a);
  border-radius: 8px;
  padding: 12px;
}
.status-head {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text, #e6e8ef);
}
.status-body {
  font-size: 12px;
  color: var(--side-text, #9aa3b2);
}
.tiny {
  margin: 8px 0;
  padding-left: 16px;
  line-height: 1.7;
}
.note {
  margin: 0;
  line-height: 1.6;
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
.kv {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  color: var(--side-text, #9aa3b2);
}
.kv b.ok {
  color: #7fb0ff;
}
.kv b.warn {
  color: #ffba6b;
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
.notif-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}
.notif-card {
  background: var(--input, #15161f);
  border: 1px solid var(--border, #2a2c3a);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.notif-head {
  font-size: 13px;
  font-weight: 600;
  color: var(--text, #e6e8ef);
}
.notif-card .btn {
  align-self: flex-start;
}
</style>
