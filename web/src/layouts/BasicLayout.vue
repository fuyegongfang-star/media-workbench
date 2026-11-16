<template>
  <div class="shell">
    <aside class="side">
      <div class="brand">
        <span class="brand-title">自媒体工作台</span>
        <span class="brand-sub">v0.1.0 · 骨架</span>
      </div>
      <nav class="nav">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          class="nav-item"
          active-class="active"
          :to="item.path"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span class="nav-label">{{ item.label }}</span>
          <span class="nav-phase">{{ item.phase }}</span>
        </router-link>
      </nav>
    </aside>
    <main class="main">
      <header class="header">
        <h1 class="title">{{ currentLabel }}</h1>
        <span class="badge">v0.1.0</span>
        <div class="user-area">
          <span class="user-name">{{ currentUser?.username ?? '未登录' }}</span>
          <span class="user-role">{{ roleLabel }}</span>
          <button class="logout" type="button" @click="onLogout">退出</button>
        </div>
      </header>
      <section class="content">
        <router-view />
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { navItems } from '../router';
import { getUser, clearTokens, type AuthUser } from '../api/auth';

const route = useRoute();
const router = useRouter();
const currentLabel = computed(() => {
  const hit = navItems.find((item) => item.path === route.path);
  return hit ? hit.label : '工作台';
});

const currentUser = computed<AuthUser | null>(() => getUser());
const roleLabel = computed(() => {
  const r = currentUser.value?.role;
  return r === 'owner' ? '所有者' : r === 'admin' ? '管理员' : r === 'editor' ? '编辑' : '';
});

function onLogout() {
  clearTokens();
  router.replace('/login');
}
</script>

<style scoped>
.shell {
  display: flex;
  min-height: 100vh;
}

.side {
  width: 220px;
  background: var(--side);
  color: var(--side-text);
  padding: 18px 12px;
  flex: 0 0 220px;
}

.brand {
  padding: 4px 8px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 12px;
}

.brand-title {
  display: block;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
}

.brand-sub {
  display: block;
  font-size: 12px;
  color: #8a94a2;
  margin-top: 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border-radius: 6px;
  color: var(--side-text);
  margin-bottom: 2px;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.nav-item.active {
  background: var(--brand);
  color: var(--brand-ink);
}

.nav-icon {
  width: 18px;
  text-align: center;
}

.nav-label {
  flex: 1;
}

.nav-phase {
  font-size: 11px;
  opacity: 0.7;
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}

.title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
}

.user-area {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-name {
  font-size: 13px;
  font-weight: 600;
}

.user-role {
  font-size: 12px;
  color: var(--muted);
}

.logout {
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  color: var(--muted);
  cursor: pointer;
}

.logout:hover {
  color: var(--brand);
  border-color: var(--brand);
}

.content {
  padding: 20px;
  min-width: 0;
}
</style>
