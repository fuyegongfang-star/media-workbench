<template>
  <div class="auth-shell">
    <div class="auth-card">
      <div class="brand">
        <div class="brand-mark">✦</div>
        <h1>自媒体工作台</h1>
        <p class="sub">登录后开始管理你的内容生产流程</p>
      </div>

      <form @submit.prevent="onLogin">
        <label class="field">
          <span>用户名</span>
          <input v-model="username" autocomplete="username" placeholder="请输入用户名" required />
        </label>
        <label class="field">
          <span>密码</span>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            placeholder="请输入密码"
            required
          />
        </label>
        <p v-if="error" class="error">{{ error }}</p>
        <button class="btn primary" type="submit" :disabled="loading">
          {{ loading ? '登录中…' : '登录' }}
        </button>
      </form>

      <div v-if="regEnabled" class="foot">
        还没有账号？<router-link to="/register">立即注册</router-link>
      </div>
      <div class="tip">默认账号为管理员在系统设置中配置的初始账号，登录后可开启自助注册。</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { login, saveTokens, fetchRegistrationStatus } from '../api/auth';

const router = useRouter();
const route = useRoute();
const username = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);
const regEnabled = ref(false);

onMounted(async () => {
  try {
    const s = await fetchRegistrationStatus();
    regEnabled.value = s.enabled;
  } catch {
    regEnabled.value = false;
  }
});

async function onLogin() {
  error.value = '';
  loading.value = true;
  try {
    const tokens = await login(username.value.trim(), password.value);
    saveTokens(tokens);
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard';
    router.replace(redirect);
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '登录失败，请重试';
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
  color: var(--text);
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
.error {
  color: #c0392b;
  font-size: 13px;
  margin: -6px 0 12px;
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
.foot {
  text-align: center;
  margin-top: 18px;
  font-size: 13px;
  color: var(--muted);
}
.foot a {
  color: var(--brand);
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
