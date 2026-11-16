<template>
  <div class="auth-shell">
    <div class="auth-card">
      <div class="brand">
        <div class="brand-mark">✦</div>
        <h1>登录工作台</h1>
        <p class="sub">继续管理你的内容生产流程</p>
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

      <div class="auth-links">
        <router-link to="/forgot-password">忘记密码？</router-link>
        <router-link to="/register">注册账号</router-link>
      </div>

      <div class="foot">
        <div>{{ regEnabled ? '新账号默认为「编辑」角色' : '当前未开放自助注册，可联系管理员在设置中心开启' }}</div>
        <div style="margin-top: 6px"><router-link to="/">← 返回站点首页</router-link></div>
      </div>
      <div class="tip">初始管理员账号与口令由部署脚本生成，保存在服务器 .env 的 INITIAL_PASSWORD。登录后可开启自助注册、修改本人口令。</div>
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
