<template>
  <div class="shell">
    <aside class="side">
      <router-link class="brand" to="/">
        <span class="brand-mark">✦</span>
        <span class="brand-text">
          <span class="brand-title">自媒体工作台</span>
          <span class="brand-sub">内容生产中枢 · v0.1.0</span>
        </span>
      </router-link>

      <nav class="nav">
        <div v-for="group in navGroups" :key="group.key" class="nav-group">
          <button class="group-head" type="button" @click="toggle(group.key)">
            <span>{{ group.label }}</span>
            <span class="chevron" :class="{ closed: collapsed[group.key] }">⌄</span>
          </button>
          <div v-show="!collapsed[group.key]" class="group-items">
            <router-link
              v-for="item in group.items"
              :key="item.path"
              class="nav-item"
              :class="{ active: isActive(item.path), sub: group.key === 'system' }"
              :to="item.path"
            >
              <span class="nav-icon">{{ item.icon }}</span>
              <span class="nav-label">{{ item.label }}</span>
            </router-link>
          </div>
        </div>
      </nav>

      <div class="side-foot">
        <router-link to="/" class="side-link">← 返回站点首页</router-link>
      </div>
    </aside>

    <main class="main">
      <header class="header">
        <div class="crumb">
          <span class="crumb-group">{{ currentGroup }}</span>
          <span class="crumb-sep">/</span>
          <h1 class="title">{{ currentLabel }}</h1>
        </div>
        <div class="user-area">
          <router-link class="header-link" to="/system/site">设置中心</router-link>
          <span class="user-chip">
            <span class="avatar">{{ (currentUser?.username ?? 'U').slice(0, 1).toUpperCase() }}</span>
            <span class="user-meta">
              <span class="user-name">{{ currentUser?.username ?? '未登录' }}</span>
              <span class="user-role">{{ roleLabel }}</span>
            </span>
          </span>
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
import { computed, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { navGroups, navItems, systemSections } from '../router';
import { getUser, clearTokens, type AuthUser } from '../api/auth';

const route = useRoute();
const router = useRouter();

const collapsed = reactive<Record<string, boolean>>({});

function toggle(key: string) {
  collapsed[key] = !collapsed[key];
}

function isActive(path: string): boolean {
  if (route.path === path) return true;
  return path === '/content' && route.path.startsWith('/content-projects/');
}

const currentLabel = computed(() => {
  const hit = navItems.find((item) => isActive(item.path));
  if (hit) return hit.label;
  if (route.path.startsWith('/content-projects/')) return '内容项目详情';
  if (route.path.startsWith('/system/')) {
    const key = route.params.section as string | undefined;
    return systemSections.find((s) => s.key === key)?.label ?? '系统管理';
  }
  return '工作台';
});

const currentGroup = computed(() => {
  const group = navGroups.find((g) => g.items.some((item) => isActive(item.path)));
  if (group) return group.label;
  if (route.path.startsWith('/content-projects/')) return '内容生产';
  if (route.path.startsWith('/system/')) return '系统管理';
  return '总览';
});

const currentUser = computed<AuthUser | null>(() => getUser());
const roleLabel = computed(() => {
  const r = currentUser.value?.role;
  return r === 'owner' ? '所有者' : r === 'admin' ? '管理员' : r === 'editor' ? '编辑' : '';
});

function onLogout() {
  clearTokens();
  router.replace('/');
}
</script>

<style scoped>
.shell {
  display: flex;
  min-height: 100vh;
}

.side {
  width: 232px;
  flex: 0 0 232px;
  background: var(--side);
  color: var(--side-ink);
  padding: 18px 12px 12px;
  display: flex;
  flex-direction: column;
  max-height: 100vh;
  position: sticky;
  top: 0;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 12px;
  color: inherit;
}

.brand:hover {
  text-decoration: none;
}

.brand-mark {
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  border-radius: 9px;
  background: var(--brand);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
}

.brand-text {
  min-width: 0;
}

.brand-title {
  display: block;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}

.brand-sub {
  display: block;
  font-size: 11px;
  color: #8a94a2;
  margin-top: 2px;
  white-space: nowrap;
}

.nav {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 2px;
}

.nav-group {
  margin-bottom: 12px;
}

.group-head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: transparent;
  border: 0;
  color: #7f8b9b;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  padding: 6px 10px;
  cursor: pointer;
}

.group-head:hover {
  color: #c7d0da;
}

.chevron {
  font-size: 14px;
  transition: transform 0.15s;
}

.chevron.closed {
  transform: rotate(-90deg);
}

.group-items {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border-radius: 7px;
  color: var(--side-ink);
  font-size: 13px;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.07);
  text-decoration: none;
}

.nav-item.active {
  background: var(--brand);
  color: var(--brand-ink);
  font-weight: 500;
}

.nav-item.sub {
  padding-left: 20px;
  font-size: 12.5px;
}

.nav-item.sub .nav-icon {
  font-size: 11px;
  opacity: 0.85;
}

.nav-icon {
  width: 16px;
  text-align: center;
  flex: 0 0 16px;
}

.nav-label {
  flex: 1;
  white-space: nowrap;
}

.side-foot {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 12px;
  margin-top: 8px;
}

.side-link {
  display: block;
  padding: 6px 10px;
  color: #8a94a2;
  font-size: 12px;
}

.side-link:hover {
  color: #fff;
  text-decoration: none;
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
  padding: 12px 24px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
  min-height: 62px;
}

.crumb {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.crumb-group {
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}

.crumb-sep {
  color: var(--border-strong);
}

.title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-area {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-link {
  font-size: 12px;
  color: var(--muted);
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 8px;
}

.avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--brand-soft);
  color: var(--brand);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 13px;
}

.user-meta {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}

.user-name {
  font-size: 13px;
  font-weight: 600;
}

.user-role {
  font-size: 11px;
  color: var(--muted);
}

.logout {
  border: 1px solid var(--border-strong);
  background: var(--panel);
  border-radius: var(--radius-sm);
  padding: 5px 12px;
  font-size: 12px;
  color: var(--muted);
  cursor: pointer;
}

.logout:hover {
  color: var(--brand);
  border-color: var(--brand);
}

.content {
  padding: 22px 24px 40px;
  min-width: 0;
  flex: 1;
}

@media (max-width: 900px) {
  .side {
    width: 190px;
    flex-basis: 190px;
  }
  .content {
    padding: 16px;
  }
  .header {
    padding: 12px 16px;
  }
}
</style>
