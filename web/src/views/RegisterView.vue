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
        当前未开放自助注册，请联系管理员在「系统管理 → 站点设置」中开启。
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

      <div class="foot">已有账号？<router-link to="/login">返回登录</router-link> · <router-link to="/">返回首页</router-link></div>
      <div class="tip">自助注册账号默认为「编辑」角色，仅管理员可调整权限。忘记密码请联系管理员重置。</div>
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
.notice.closed {
  background: var(--warn-soft);
  border-color: #f0d3a6;
  color: var(--warn);
}

.back {
  margin-top: 10px;
}
</style>
