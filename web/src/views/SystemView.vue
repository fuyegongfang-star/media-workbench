<template>
  <div class="sys">
    <SettingsHeader :active="section" />

    <!-- 用户与权限：当前账号 -->
    <section v-if="section === 'users'" class="card">
      <h2 class="card-title">当前账号</h2>
      <div class="row">
        <span class="pill ok">{{ currentUser?.username ?? '未登录' }}</span>
        <span class="pill">{{ roleLabel }}</span>
        <span class="hint">登录态已自动管理；令牌过期会跳转登录页。</span>
      </div>
      <div class="row" style="margin-top:10px">
        <div class="field" style="flex:1;min-width:200px">
          <label>修改本人口令</label>
          <div class="row">
            <input v-model="pwdForm.oldPassword" class="input" type="password" placeholder="原密码" />
            <input v-model="pwdForm.newPassword" class="input" type="password" placeholder="新密码（至少 8 位）" />
            <button class="btn" :disabled="changingPwd" @click="onChangePassword">{{ changingPwd ? '提交中…' : '修改' }}</button>
          </div>
        </div>
      </div>
    </section>

    <!-- 版本与运维：在线更新 -->
    <section v-if="section === 'ops'" class="card">
      <h2 class="card-title">
        版本与在线更新
        <span class="pill" :class="updateStatus.available ? 'ok' : 'warn'">
          {{ updateStatus.available ? '更新服务在线' : '更新服务未启用' }}
        </span>
      </h2>
      <p class="hint">
        代码来自 GitHub 仓库 <code>main</code> 分支。更新由服务器上独立的 updater 容器执行
        （拉取代码 → 自动备份 → 重建 api / web），服务会短暂中断 1-3 分钟，本页自动显示进度。
      </p>

      <div class="status-grid" style="margin-top:12px">
        <div class="status-card">
          <div class="status-head">当前部署版本</div>
          <div class="status-body"><code>{{ updateStatus.currentCommit || '未知' }}</code></div>
        </div>
        <div class="status-card">
          <div class="status-head">远端最新版本</div>
          <div class="status-body">
            <code>{{ (updateStatus.check?.remoteCommit || updateStatus.remoteCommit || '未检查').slice(0, 12) }}</code>
          </div>
        </div>
        <div class="status-card">
          <div class="status-head">执行状态</div>
          <div class="status-body">
            <span class="pill" :class="phaseClass">{{ phaseLabel }}</span>
            <div class="hint" style="margin-top:6px">
              {{ updateStatus.pendingRequestId ? '请求已提交，等待更新服务接手…' : (updateStatus.message || '—') }}
            </div>
          </div>
        </div>
      </div>

      <div class="row" style="margin-top:12px">
        <button class="btn" :disabled="!canTriggerUpdate" @click="onCheckUpdate">
          {{ checkingUpdate ? '提交中…' : '检查更新' }}
        </button>
        <button v-if="isOwner" class="btn primary" :disabled="!canTriggerUpdate" @click="onApplyUpdate">
          {{ hasNewCommits ? '一键更新' : '重新部署' }}
        </button>
        <span v-else class="hint">仅「所有者」可执行更新</span>
        <span v-if="hasNewCommits" class="pill warn">有 {{ updateStatus.check?.behindBy }} 个新提交</span>
        <span v-else-if="updateStatus.check?.upToDate" class="pill ok">已是最新</span>
        <span v-if="updateStatus.check?.checkedAt" class="hint">检查于 {{ formatTime(updateStatus.check.checkedAt) }}</span>
      </div>

      <div v-if="updateStatus.log.length" class="update-log">
        <div class="status-head">执行日志（最近 {{ updateStatus.log.length }} 行）</div>
        <pre>{{ updateStatus.log.join('\n') }}</pre>
      </div>

      <p v-if="!updateStatus.pendingRequestId && updateStatus.phase === 'success' && updateStatus.type === 'apply'" class="message ok">
        更新已完成。如界面仍是旧版，请强制刷新浏览器（Ctrl+F5）。
      </p>
      <p v-else-if="!updateStatus.pendingRequestId && updateStatus.phase === 'failed'" class="message err">
        上次执行失败：{{ updateStatus.message }}。详情见上方日志；旧版本服务通常未受影响。
      </p>
    </section>

    <!-- 版本与运维：状态总览 -->
    <section v-if="section === 'ops'" class="card">
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

    <!-- 站点设置：基础信息与全局开关（密钥统一收敛到「AI 与密钥」） -->
    <section v-if="section === 'site'" class="card">
      <h2 class="card-title">站点信息与合规</h2>

      <div class="field">
        <label>站点名称</label>
        <input v-model="form.siteName" class="input" type="text" maxlength="80" />
      </div>

      <div class="field">
        <label>站点描述</label>
        <textarea v-model="form.siteDesc" class="input" rows="2" maxlength="200" placeholder="可选" />
      </div>

      <p class="hint">
        全站 API Key、第三方凭据统一在「AI 与密钥」页配置与查看状态，不再散落在各业务页面。
      </p>

      <div class="field">
        <label>合规开关</label>
        <div class="checks">
          <label class="check"><input type="checkbox" v-model="form.compliance.aiDisclosureRequired" /> AI 生成内容需声明标识（必填，深入设计 §12）</label>
          <label class="check"><input type="checkbox" v-model="form.compliance.autoSaveEnabled" /> 编辑器自动保存</label>
          <label class="check"><input type="checkbox" v-model="form.compliance.strictReview" /> 严格审核（发布前强制复核）</label>
        </div>
      </div>

      <div class="field">
        <label>账号注册</label>
        <div class="checks">
          <label class="check">
            <input type="checkbox" v-model="form.allowRegistration" />
            允许自助注册（开启后登录页显示注册入口，新账号默认为「编辑」角色）
          </label>
        </div>
        <p class="hint">默认关闭。开启前请确认已设置好初始管理员账号；注册用户无法自行提升角色。</p>
      </div>

      <div class="row">
        <button class="btn primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存设置' }}</button>
        <span v-if="settings.updatedAt" class="hint">上次更新：{{ settings.updatedAt }}</span>
      </div>
    </section>

    <!-- AI 与密钥：全站凭据状态总览 -->
    <section v-if="section === 'ai'" class="card">
      <h2 class="card-title">密钥与集成总览</h2>
      <p class="hint">
        下列凭据全部由服务端以 AES-256-GCM 加密保存，前端只显示配置状态与脱敏串，绝不回显明文。
        请在此集中维护，不要在各业务功能页重复填写。
      </p>
      <div class="key-grid">
        <div class="key-item">
          <span class="key-name">AI 模型 API Key</span>
          <span class="key-state">
            {{ providers.length ? `已配置 ${providers.length} 个供应商` : '尚未配置（未配置时 AI 能力以模板兜底）' }}
          </span>
          <span class="key-foot"><a href="#llm-form" class="btn small">去配置</a></span>
        </div>
        <div class="key-item">
          <span class="key-name">公众号 AppID</span>
          <span class="key-state">{{ settings.appIdConfigured ? `已配置 · ${settings.defaultWechatAppIdMasked}` : '未配置' }}</span>
          <span class="key-foot"><a href="#wechat-cred" class="btn small">去配置</a></span>
        </div>
        <div class="key-item">
          <span class="key-name">公众号 AppSecret</span>
          <span class="key-state">{{ settings.appSecretConfigured ? '已配置（加密入库）' : '未配置' }}</span>
          <span class="key-foot"><a href="#wechat-cred" class="btn small">去配置</a></span>
        </div>
        <div class="key-item">
          <span class="key-name">通知渠道凭据</span>
          <span class="key-state">
            {{ notifStatus ? `已启用 ${notifStatus.enabledChannels} / ${notifStatus.totalChannels} 个渠道` : '未加载状态' }}
          </span>
          <span class="key-foot"><router-link class="btn small" to="/system/notifications">去配置</router-link></span>
        </div>
        <div class="key-item">
          <span class="key-name">选题雷达数据源</span>
          <span class="key-state">头条 / B站 / HN RSS / 搜狗微信 / X / YouTube，零 Key 可用</span>
          <span class="key-foot"><router-link class="btn small" to="/radar">配置赛道</router-link></span>
        </div>
        <div class="key-item">
          <span class="key-name">主加密密钥 APP_MASTER_KEY</span>
          <span class="key-state">服务端环境变量，前端不可读取。轮换会使已加密数据无法解密，请勿随意更改。</span>
          <span class="key-foot"><span class="pill">只读</span></span>
        </div>
      </div>
    </section>

    <!-- AI 与密钥：公众号平台凭据（原站点设置里的密钥字段迁移至此） -->
    <section v-if="section === 'ai'" id="wechat-cred" class="card">
      <h2 class="card-title">平台凭据 · 微信公众号</h2>
      <p class="hint">
        用于内容项目发布执行（草稿同步 / 发布 / 群发）。出于安全，明文永不回填：输入框留空表示保持原值，
        只提交你本次填写的字段；确需移除凭据请点「清空凭据」。提交后服务端 AES-256-GCM 加密入库，日志绝不打印明文。
      </p>
      <div class="field">
        <label>默认公众号 AppID</label>
        <input
          v-model="form.defaultWechatAppId"
          class="input wide mono"
          type="text"
          maxlength="64"
          placeholder="填写新的 AppID（留空保持原值）"
        />
        <p class="hint">
          当前状态：<b>{{ settings.appIdConfigured ? '已配置（脱敏）' : '未配置' }}</b>
          <span v-if="settings.defaultWechatAppIdMasked"> · {{ settings.defaultWechatAppIdMasked }}</span>
        </p>
      </div>
      <div class="field">
        <label>默认公众号 AppSecret</label>
        <input
          v-model="form.defaultWechatAppSecret"
          class="input wide mono"
          type="password"
          maxlength="128"
          placeholder="填写新的 AppSecret（留空保持原值）"
        />
        <p class="hint">当前状态：<b>{{ settings.appSecretConfigured ? '已配置' : '未配置' }}</b></p>
      </div>
      <div class="row">
        <button class="btn primary" :disabled="savingCred" @click="saveCredentials">
          {{ savingCred ? '保存中…' : '保存平台凭据' }}
        </button>
        <button
          v-if="settings.appIdConfigured || settings.appSecretConfigured"
          class="btn"
          :disabled="savingCred"
          @click="clearCredentials"
        >清空凭据</button>
        <span class="hint">站点名称、合规开关等仍在「站点设置」页维护。</span>
      </div>
      <p v-if="credMessage" class="message" :class="credType">{{ credMessage }}</p>
    </section>

    <!-- LLM 供应商（T6.2）：SystemConfig 的 CRUD，密钥 AES 加密入库、前端仅见脱敏 -->
    <section v-if="section === 'ai'" id="llm-form" class="card">
      <h2 class="card-title">AI 模型供应商（密钥加密存储）</h2>
      <p class="hint">
        选题雷达的赛道打分与标题生成、以及全站 AI 能力都依赖这里。支持 OpenAI 兼容协议（OpenAI / DeepSeek / Moonshot 等）。
        密钥仅在服务端以 AES-256-GCM 加密入库，列表只显示脱敏串，绝不回显明文。留空表示保持原密钥。
      </p>

      <div v-for="p in providers" :key="p.id" class="provider-row">
        <div class="provider-head">
          <span class="pill" :class="p.enabled ? 'ok' : 'warn'">{{ p.enabled ? '已启用' : '已停用' }}</span>
          <b>{{ p.label }}</b>
          <span class="muted">{{ p.provider }} / {{ p.model }}</span>
          <button class="btn small ghost" @click="toggleProvider(p)">{{ p.enabled ? '停用' : '启用' }}</button>
          <button class="btn small ghost" @click="removeProvider(p)">删除</button>
        </div>
        <div class="provider-meta muted">
          Base URL：{{ p.baseUrl || '默认 https://api.openai.com/v1' }} · 密钥：{{ p.apiKeyConfigured ? p.apiKeyMasked : '未配置' }}
          · 月预算：{{ p.monthlyBudget ?? '不限' }}
        </div>
      </div>
      <p v-if="!providers.length" class="hint">尚未配置任何供应商。没有供应商时雷达标题用模板兜底，AI 相关任务会如实报「待配置」。</p>

      <div class="provider-form">
        <div class="row">
          <div class="field" style="flex:1;min-width:140px"><label>供应商标识</label><input v-model="providerForm.provider" class="input" placeholder="deepseek" /></div>
          <div class="field" style="flex:1;min-width:140px"><label>显示名称</label><input v-model="providerForm.label" class="input" placeholder="DeepSeek" /></div>
          <div class="field" style="flex:1;min-width:200px"><label>模型</label><input v-model="providerForm.model" class="input" placeholder="deepseek-chat" /></div>
        </div>
        <div class="field"><label>Base URL（可选）</label><input v-model="providerForm.baseUrl" class="input wide" placeholder="https://api.deepseek.com/v1" /></div>
        <div class="row">
          <div class="field" style="flex:1;min-width:220px"><label>API Key（明文仅提交一次）</label><input v-model="providerForm.apiKey" class="input wide mono" type="password" placeholder="留空则保持原密钥（新增时必填）" /></div>
          <div class="field" style="width:140px"><label>月预算（0=不限）</label><input v-model.number="providerForm.monthlyBudget" class="input" type="number" min="0" /></div>
        </div>
        <div class="row">
          <button class="btn primary" :disabled="savingProvider" @click="addProvider">{{ savingProvider ? '保存中…' : '新增 / 覆盖' }}</button>
          <span class="hint">按「供应商标识 + 模型」唯一；同标识同模型再次提交会覆盖配置。</span>
        </div>
      </div>
    </section>

    <!-- 通知与告警 -->
    <section v-if="section === 'notifications'" class="card">
      <h2 class="card-title">通知与告警</h2>
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

    <!-- 用户与权限：仅 owner/admin 可管理 -->
    <section v-if="section === 'users' && canManageUsers" class="card">
      <h2 class="card-title">用户管理</h2>
      <p class="hint">管理可登录本工作台的账号。角色：所有者(owner) 拥有全部权限，管理员(admin) 可管理用户，编辑(editor) 仅使用业务功能。不能删除或禁用自己，也不能降级最后一个所有者。</p>

      <div class="user-list">
        <div v-for="u in users" :key="u.id" class="user-row">
          <div class="user-main">
            <span class="pill" :class="u.status === 'active' ? 'ok' : 'warn'">{{ u.status === 'active' ? '正常' : '已禁用' }}</span>
            <b>{{ u.username }}</b>
            <span class="pill">{{ roleLabelOf(u.role) }}</span>
            <span class="muted">{{ u.id === currentUser?.id ? '（我）' : '' }}</span>
          </div>
          <div class="user-meta muted">
            最近登录：{{ u.lastLoginAt ? formatDate(u.lastLoginAt) : '从未' }} · 创建：{{ formatDate(u.createdAt) }}
          </div>
          <div class="user-actions" v-if="u.id !== currentUser?.id">
            <select class="input small-select" :value="u.role" @change="onRoleChange(u, ($event.target as HTMLSelectElement).value)">
              <option value="owner">所有者</option>
              <option value="admin">管理员</option>
              <option value="editor">编辑</option>
            </select>
            <button class="btn small ghost" @click="onToggleStatus(u)">{{ u.status === 'active' ? '禁用' : '启用' }}</button>
            <button class="btn small ghost" @click="openReset(u)">重置密码</button>
            <button class="btn small danger" @click="onDeleteUser(u)">删除</button>
          </div>
        </div>
        <p v-if="!users.length" class="hint">尚未加载到用户列表。</p>
      </div>

      <div class="create-user">
        <h3 class="sub-title">新建账号</h3>
        <div class="row">
          <div class="field" style="flex:1;min-width:140px"><label>用户名</label><input v-model="newUser.username" class="input" placeholder="2-32 位字母数字" /></div>
          <div class="field" style="flex:1;min-width:140px"><label>初始密码</label><input v-model="newUser.password" class="input" type="password" placeholder="至少 8 位" /></div>
          <div class="field" style="width:130px"><label>角色</label>
            <select v-model="newUser.role" class="input">
              <option value="editor">编辑</option>
              <option value="admin">管理员</option>
              <option value="owner">所有者</option>
            </select>
          </div>
          <button class="btn primary" :disabled="creatingUser" @click="onCreateUser">{{ creatingUser ? '创建中…' : '创建' }}</button>
        </div>
      </div>

      <div v-if="resetTarget" class="reset-box">
        <div class="row">
          <span>为 <b>{{ resetTarget.username }}</b> 设置新密码：</span>
          <input v-model="resetPassword" class="input" type="password" placeholder="至少 8 位" />
          <button class="btn primary" :disabled="resetting" @click="onResetPassword">{{ resetting ? '提交中…' : '确认重置' }}</button>
          <button class="btn ghost" @click="resetTarget = null">取消</button>
        </div>
      </div>
    </section>

    <section v-if="section === 'users' && !canManageUsers" class="card">
      <h2 class="card-title">用户管理</h2>
      <p class="hint">仅「所有者 / 管理员」可管理账号。如需调整权限或重置密码，请联系管理员。</p>
    </section>

    <p v-if="message" class="message" :class="messageType">{{ message }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { systemSections } from '../router';
import SettingsHeader from '../components/SettingsHeader.vue';
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
  fetchProviders, saveProvider, updateProvider, deleteProvider,
  type ProviderView,
} from '../api/http';
import {
  getUser, changePassword,
  listUsers, createUser, updateUserRole, updateUserStatus,
  resetUserPassword, deleteUser,
  type UserView,
} from '../api/auth';
import {
  fetchUpdateStatus, checkUpdate, applyUpdate,
  type UpdateStatus,
} from '../api/update';

// 二级菜单：/system/:section 决定本页只展示对应分类，避免所有设置挤在一屏
const route = useRoute();
const section = computed(() => {
  const raw = typeof route.params.section === 'string' ? route.params.section : 'site';
  return systemSections.some((s) => s.key === raw) ? raw : 'site';
});

const currentUser = computed(() => getUser());
const roleLabel = computed(() => {
  const r = currentUser.value?.role;
  return r === 'owner' ? '所有者' : r === 'admin' ? '管理员' : r === 'editor' ? '编辑' : '';
});
const canManageUsers = computed(() => ['owner', 'admin'].includes(currentUser.value?.role ?? ''));
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
  allowRegistration: false,
  updatedAt: null,
});

const form = reactive({
  siteName: '',
  siteDesc: '',
  defaultWechatAppId: '',
  defaultWechatAppSecret: '',
  compliance: { aiDisclosureRequired: true, autoSaveEnabled: true, strictReview: false },
  allowRegistration: false,
});

const saving = ref(false);
const savingCred = ref(false);
const credMessage = ref('');
const credType = ref<'ok' | 'err'>('ok');
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

// ---- 用户管理（T6.4）----
const users = ref<UserView[]>([]);
const creatingUser = ref(false);
const newUser = reactive({ username: '', password: '', role: 'editor' as UserView['role'] });
const resetTarget = ref<UserView | null>(null);
const resetPassword = ref('');
const resetting = ref(false);
const pwdForm = reactive({ oldPassword: '', newPassword: '' });
const changingPwd = ref(false);

function roleLabelOf(role: UserView['role']): string {
  return role === 'owner' ? '所有者' : role === 'admin' ? '管理员' : '编辑';
}
function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('zh-CN', { hour12: false });
}
function notifyOk(text: string) {
  message.value = text;
  messageType.value = 'ok';
}
function notifyErr(e: unknown, prefix: string) {
  message.value = `${prefix}：${e instanceof Error ? e.message : String(e)}`;
  messageType.value = 'err';
}

async function loadUsers() {
  if (!canManageUsers.value) return;
  try {
    users.value = (await listUsers()).items;
  } catch (e) {
    notifyErr(e, '用户列表加载失败');
  }
}

async function onCreateUser() {
  creatingUser.value = true;
  try {
    await createUser({ username: newUser.username.trim(), password: newUser.password, role: newUser.role });
    newUser.username = '';
    newUser.password = '';
    notifyOk('账号已创建');
    await loadUsers();
  } catch (e) {
    notifyErr(e, '创建失败');
  } finally {
    creatingUser.value = false;
  }
}

async function onRoleChange(u: UserView, role: string) {
  try {
    await updateUserRole(u.id, role as UserView['role']);
    notifyOk(`${u.username} 角色已更新`);
    await loadUsers();
  } catch (e) {
    notifyErr(e, '改角色失败');
    await loadUsers();
  }
}

async function onToggleStatus(u: UserView) {
  try {
    await updateUserStatus(u.id, u.status === 'active' ? 'disabled' : 'active');
    notifyOk(`${u.username} 状态已更新`);
    await loadUsers();
  } catch (e) {
    notifyErr(e, '状态更新失败');
  }
}

function openReset(u: UserView) {
  resetTarget.value = u;
  resetPassword.value = '';
}

async function onResetPassword() {
  if (!resetTarget.value) return;
  resetting.value = true;
  try {
    await resetUserPassword(resetTarget.value.id, resetPassword.value);
    notifyOk(`${resetTarget.value.username} 密码已重置`);
    resetTarget.value = null;
    resetPassword.value = '';
  } catch (e) {
    notifyErr(e, '重置失败');
  } finally {
    resetting.value = false;
  }
}

async function onDeleteUser(u: UserView) {
  if (!window.confirm(`确认删除用户「${u.username}」？该操作不可自行恢复（管理员可重建同名账号）。`)) return;
  try {
    await deleteUser(u.id);
    notifyOk(`${u.username} 已删除`);
    await loadUsers();
  } catch (e) {
    notifyErr(e, '删除失败');
  }
}

async function onChangePassword() {
  changingPwd.value = true;
  try {
    await changePassword(pwdForm.oldPassword, pwdForm.newPassword);
    pwdForm.oldPassword = '';
    pwdForm.newPassword = '';
    notifyOk('密码已修改');
  } catch (e) {
    notifyErr(e, '修改失败');
  } finally {
    changingPwd.value = false;
  }
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
  form.allowRegistration = Boolean(s.allowRegistration);
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
  await loadUsers();
}

/**
 * 站点设置保存：只提交站点字段。
 * 不能携带 defaultWechatAppId/AppSecret —— 后端语义是「传空串即清空」，
 * 而明文凭据出于安全从不回填，若在此带上空串会误清已配置的公众号凭据。
 */
async function save() {
  saving.value = true;
  message.value = '';
  const payload = {
    siteName: form.siteName,
    siteDesc: form.siteDesc,
    compliance: { ...form.compliance },
    allowRegistration: form.allowRegistration,
  };
  try {
    settings.value = await saveSystemSettings(payload);
    message.value = '站点设置已保存（平台凭据保持原值）';
    messageType.value = 'ok';
  } catch (e) {
    message.value = `保存失败：${(e as Error).message}`;
    messageType.value = 'err';
  } finally {
    saving.value = false;
  }
}

/** 平台凭据保存：只提交本次实际填写的字段，未填字段保持原值。 */
async function saveCredentials() {
  savingCred.value = true;
  credMessage.value = '';
  const appId = form.defaultWechatAppId.trim();
  const appSecret = form.defaultWechatAppSecret.trim();
  if (!appId && !appSecret) {
    credMessage.value = '未填写新凭据，未做任何更改；如需移除请点「清空凭据」。';
    credType.value = 'ok';
    savingCred.value = false;
    return;
  }
  const payload: { defaultWechatAppId?: string; defaultWechatAppSecret?: string } = {};
  if (appId) payload.defaultWechatAppId = appId;
  if (appSecret) payload.defaultWechatAppSecret = appSecret;
  try {
    settings.value = await saveSystemSettings(payload);
    form.defaultWechatAppId = '';
    form.defaultWechatAppSecret = '';
    credMessage.value = '平台凭据已加密入库；未填写的字段保持原值。';
    credType.value = 'ok';
  } catch (e) {
    credMessage.value = `保存失败：${(e as Error).message}`;
    credType.value = 'err';
  } finally {
    savingCred.value = false;
  }
}

/** 显式清空：需要二次确认，避免误操作导致发布执行中断。 */
async function clearCredentials() {
  if (!window.confirm('确认清空公众号 AppID 与 AppSecret？清空后内容发布执行将不可用。')) return;
  savingCred.value = true;
  credMessage.value = '';
  try {
    settings.value = await saveSystemSettings({
      defaultWechatAppId: '',
      defaultWechatAppSecret: '',
    });
    form.defaultWechatAppId = '';
    form.defaultWechatAppSecret = '';
    credMessage.value = '公众号凭据已清空。';
    credType.value = 'ok';
  } catch (e) {
    credMessage.value = `清空失败：${(e as Error).message}`;
    credType.value = 'err';
  } finally {
    savingCred.value = false;
  }
}

// ---- LLM 供应商管理（T6.2）----
const providers = ref<ProviderView[]>([]);
const providerForm = reactive({
  provider: '', label: '', model: '', baseUrl: '', apiKey: '', monthlyBudget: 0,
});
const savingProvider = ref(false);

async function loadProviders() {
  try {
    providers.value = (await fetchProviders()).providers;
  } catch {
    /* 需令牌：未登录时静默 */
  }
}

async function addProvider() {
  if (!providerForm.provider || !providerForm.model || !providerForm.label) {
    message.value = '请填写供应商标识、显示名称与模型';
    messageType.value = 'err';
    return;
  }
  savingProvider.value = true;
  try {
    await saveProvider({
      provider: providerForm.provider.trim(),
      label: providerForm.label.trim(),
      model: providerForm.model.trim(),
      baseUrl: providerForm.baseUrl.trim() || undefined,
      apiKey: providerForm.apiKey || undefined,
      monthlyBudget: providerForm.monthlyBudget || 0,
      enabled: true,
    });
    providerForm.apiKey = '';
    await loadProviders();
    message.value = '供应商已保存（密钥已加密入库，列表仅显示脱敏串）';
    messageType.value = 'ok';
  } catch (e) {
    message.value = `保存供应商失败：${(e as Error).message}`;
    messageType.value = 'err';
  } finally {
    savingProvider.value = false;
  }
}

async function toggleProvider(p: ProviderView) {
  try {
    await updateProvider(p.id, { enabled: !p.enabled });
    await loadProviders();
  } catch (e) {
    message.value = `更新失败：${(e as Error).message}`;
    messageType.value = 'err';
  }
}

async function removeProvider(p: ProviderView) {
  try {
    await deleteProvider(p.id);
    await loadProviders();
  } catch (e) {
    message.value = `删除失败：${(e as Error).message}`;
    messageType.value = 'err';
  }
}

// ---- 在线更新（T6.5）----
const updateStatus = ref<UpdateStatus>({
  available: false,
  phase: 'unknown',
  type: '',
  requestId: '',
  message: '',
  currentCommit: '',
  remoteCommit: '',
  startedAt: '',
  finishedAt: '',
  updatedAt: '',
  pendingRequestId: '',
  pendingType: '',
  check: null,
  log: [],
  serverTime: '',
});
const checkingUpdate = ref(false);
const applyingUpdate = ref(false);
const isOwner = computed(() => currentUser.value?.role === 'owner');
const hasNewCommits = computed(() => (updateStatus.value.check?.behindBy ?? 0) > 0);
const canTriggerUpdate = computed(() =>
  updateStatus.value.available
  && updateStatus.value.phase !== 'running'
  && !updateStatus.value.pendingRequestId
  && !checkingUpdate.value
  && !applyingUpdate.value,
);
const phaseLabel = computed(() => {
  if (updateStatus.value.pendingRequestId) return '排队中';
  const labels: Record<string, string> = {
    idle: '空闲', running: '执行中', success: '成功', failed: '失败', unknown: '未知',
  };
  return labels[updateStatus.value.phase] ?? '未知';
});
const phaseClass = computed(() => {
  if (updateStatus.value.pendingRequestId) return 'warn';
  const classes: Record<string, string> = {
    idle: '', running: 'warn', success: 'ok', failed: 'warn', unknown: '',
  };
  return classes[updateStatus.value.phase] ?? '';
});

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

let updateTimer: number | null = null;
async function refreshUpdateStatus() {
  try {
    updateStatus.value = await fetchUpdateStatus();
  } catch {
    // 更新模块不可用时保留上一次状态，不打断系统设置其它区块
  }
}
function startUpdatePolling() {
  if (updateTimer !== null) return;
  updateTimer = window.setInterval(refreshUpdateStatus, 3000);
}
function stopUpdatePolling() {
  if (updateTimer !== null) {
    window.clearInterval(updateTimer);
    updateTimer = null;
  }
}

async function onCheckUpdate() {
  checkingUpdate.value = true;
  message.value = '';
  try {
    await checkUpdate();
    await refreshUpdateStatus();
    message.value = '检查任务已提交，正在连接 GitHub…';
    messageType.value = 'ok';
  } catch (e) {
    message.value = `检查更新失败：${(e as Error).message}`;
    messageType.value = 'err';
  } finally {
    checkingUpdate.value = false;
  }
}

async function onApplyUpdate() {
  const tip = hasNewCommits.value
    ? '将从 GitHub 拉取最新代码并重建 api / web。'
    : '当前已是最新版本，仍将重新构建并重启 api / web。';
  if (!window.confirm(`${tip}\n\n更新前会自动备份数据库与附件，服务将短暂中断 1-3 分钟。确认继续？`)) return;
  applyingUpdate.value = true;
  message.value = '';
  try {
    await applyUpdate();
    await refreshUpdateStatus();
    message.value = '更新任务已提交，正在后台执行，请勿关闭本页…';
    messageType.value = 'ok';
  } catch (e) {
    message.value = `提交更新失败：${(e as Error).message}`;
    messageType.value = 'err';
  } finally {
    applyingUpdate.value = false;
  }
}

onMounted(async () => {
  await loadAll();
  await loadNotif();
  await loadProviders();
  await refreshUpdateStatus();
  startUpdatePolling();
});
onUnmounted(stopUpdatePolling);

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
/* 在线更新（T6.5）*/
.update-log { margin-top: 12px; border: 1px solid var(--border, #2a2c3a); border-radius: 8px; padding: 10px 12px; background: var(--panel-soft, rgba(127, 127, 127, .06)); }
.update-log pre { margin: 6px 0 0; max-height: 220px; overflow: auto; font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-break: break-all; color: inherit; opacity: .85; }

/* 用户管理（T6.4）*/
.user-list { display: flex; flex-direction: column; gap: 8px; margin: 10px 0 16px; }
.user-row { border: 1px solid var(--border, #2a2c3a); border-radius: 8px; padding: 10px 12px; }
.user-main { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.user-meta { font-size: 12px; margin-top: 6px; }
.user-actions { display: flex; align-items: center; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.small-select { padding: 5px 8px; font-size: 12px; width: auto; }
.create-user { border-top: 1px solid var(--border, #2a2c3a); padding-top: 12px; }
.sub-title { font-size: 13px; font-weight: 600; margin: 0 0 10px; }
.reset-box { margin-top: 12px; padding: 10px; border: 1px dashed var(--brand, #4f8cff); border-radius: 8px; font-size: 13px; }
.btn.danger { color: #c0392b; border-color: #e6b0aa; }
.btn.danger:hover { background: #fdecea; }

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
.provider-row {
  background: var(--input, #15161f);
  border: 1px solid var(--border, #2a2c3a);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 8px;
}
.provider-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 13px;
}
.provider-meta {
  margin-top: 6px;
  font-size: 11px;
}
.provider-form {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed var(--border, #2a2c3a);
}
</style>
