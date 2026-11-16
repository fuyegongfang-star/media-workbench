<template>
  <div class="auth-shell">
    <div class="auth-card">
      <div class="brand">
        <div class="brand-mark">✦</div>
        <h1>注册账号</h1>
        <p class="sub">加入自媒体工作台</p>
      </div>

      <div v-if="checking" class="notice">正在检查注册开关…</div>
      <div v-else-if="!enabled" class="notice closed">
        当前未开放自助注册，请联系管理员在系统设置中开启。
        <div class="back"><router-link to="/login">返回登录</router-link></div>
      </div>

      <form v-else @submit.prevent="onRegister">
        <label class="field">
          <span>用户名</span>
          <input
            v-model="username"
            autocomplete="username"
            placeholder="字母、数字、下划线，2-32 位"
            required
          />
        </label>
        <label class="field">
          <span>密码</span>
          <input
            v-model="password"
            type="password"
            autocomplete="new-password"
            placeholder="至少 8 位"
            required
          />
        </label>
        <label class="field">
          <span>确认密码</span>
          <input
            v-model="confirm"
            type="password"
            autocomplete="new-password"
            placeholder="再次输入密码"
            required
          />
        </label>
        <p v-if="error" class="error">{{ error }}</p>
        <button class="btn primary" type="submit" :disabled="loading">
          {{ loading ? '注册中…' : '注册并登录' }}
        </button>
      </form>

      <div class="foot">已有账号？<router-link to="/login">返回登录</router-link></div>
      <div class="tip">自助注册账号默认为「编辑」角色，仅管理员可调整权限。</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { register, saveTokens, fetchRegistrationStatus } from '../api/auth';

const router = useRouter();
const username = ref('');
const password = ref('');
const confirm = ref('');
const error = ref('');
const loading = ref(false);
const checking = ref(true);
const enabled = ref(false);

onMounted(async () => {
  try {
    const s = await fetchRegistrationStatus();
    enabled.value = s.enabled;
  } catch {
    enabled.value = false;
  } finally {
    checking.value = false;
  }
});

async function onRegister() {
  error.value = '';
  if (password.value !== confirm.value) {
    error.value = '两次输入的密码不一致';
    return;
  }
  loading.value = true;
  try {
    const tokens = await register(username.value.trim(), password.value);
    saveTokens(tokens);
    router.replace('/dashboard');
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '注册失败，请重试';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.auth-shell {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1f2733 0%, #2b3a50 100%);
  padding: 20px;
}
.auth-card {
  width: 100%;
  max-width: 380px;
  background: #fff;
  border-radius: 12px;
  padding: 32px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.25);
}
.brand {
  text-align: center;
  margin-bottom: 24px;
}
.brand-mark {
  width: 48px;
  height: 48px;
  margin: 0 auto 12px;
  border-radius: 12px;
  background: var(--brand);
  color: #fff;
  font-size: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.brand h1 {
  margin: 0;
  font-size: 20px;
}
.sub {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 13px;
}
.field {
  display: block;
  margin-bottom: 16px;
}
.field span {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
}
.field input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 14px;
  outline: none;
}
.field input:focus {
  border-color: var(--brand);
}
.btn {
  width: 100%;
  padding: 11px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}
.btn.primary {
  background: var(--brand);
  color: #fff;
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.error {
  color: #c0392b;
  font-size: 13px;
  margin: -6px 0 12px;
}
.notice {
  padding: 14px;
  background: #eef4ff;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.7;
  color: #2b3a50;
}
.notice.closed {
  background: #fff4e5;
  color: #8a5a00;
}
.back {
  margin-top: 10px;
}
.back a,
.foot a {
  color: var(--brand);
}
.foot {
  text-align: center;
  margin-top: 18px;
  font-size: 13px;
  color: var(--muted);
}
.tip {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
  font-size: 12px;
  color: var(--muted);
  line-height: 1.6;
}
</style>
