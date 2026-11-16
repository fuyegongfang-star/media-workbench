<template>
  <div class="auth-shell">
    <div class="auth-card">
      <div class="brand">
        <div class="brand-mark">✦</div>
        <h1>找回密码</h1>
        <p class="sub">密码由管理员重置，不提供在线自助找回</p>
      </div>

      <div class="notice">
        本工作台是自托管系统，账号口令用 argon2 单向散列保存，<b>无法在浏览器里自助找回</b>，
        也不会发送验证邮件（避免在没有配置 SMTP 时给出假的成功提示）。请按下面的方式处理：
      </div>

      <ol class="steps">
        <li v-for="s in steps" :key="s.title">
          <b>{{ s.title }}</b>
          <span>{{ s.desc }}</span>
        </li>
      </ol>

      <div class="row" style="justify-content: space-between; margin-top: 18px">
        <button class="btn" type="button" @click="copyGuide">{{ copied ? '已复制' : '复制说明给管理员' }}</button>
        <router-link class="btn primary" to="/login">返回登录</router-link>
      </div>

      <div class="foot"><router-link to="/">← 返回站点首页</router-link></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const copied = ref(false);
const steps = [
  { title: '还记得原密码', desc: '登录后进入「系统管理 → 用户与权限 → 当前账号」，可直接修改本人口令。' },
  { title: '已忘记密码', desc: '联系所有者或管理员，在「系统管理 → 用户与权限 → 用户管理」点「重置密码」。' },
  { title: '管理员也无法登录', desc: '在服务器上检查 /opt/media-workbench/.env 的 INITIAL_PASSWORD（仅首次初始化时写入），或由运维直接重置数据库账号。' },
];

const guide = [
  '【自媒体工作台 · 重置密码申请】',
  '请在后台「系统管理 → 用户与权限 → 用户管理」中找到我的账号，点击「重置密码」并设置临时口令。',
  '我拿到临时口令后会立即登录，并在「当前账号」中修改为自己的新密码。',
].join('\n');

async function copyGuide() {
  try {
    await navigator.clipboard.writeText(guide);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    copied.value = false;
  }
}
</script>

<style scoped>
.notice {
  background: var(--brand-soft);
  border: 1px solid #cfe0ff;
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--text);
}

.steps {
  padding-left: 20px;
  margin: 18px 0 0;
  font-size: 13px;
}

.steps li {
  margin-bottom: 12px;
  line-height: 1.7;
}

.steps b {
  display: block;
  color: var(--text);
}

.steps span {
  color: var(--muted);
}
</style>
