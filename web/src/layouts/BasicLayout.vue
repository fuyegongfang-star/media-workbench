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
        <span class="badge">T1.1 工程骨架</span>
      </header>
      <section class="content">
        <router-view />
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { navItems } from '../router';

const route = useRoute();
const currentLabel = computed(() => {
  const hit = navItems.find((item) => item.path === route.path);
  return hit ? hit.label : '工作台';
});
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

.content {
  padding: 20px;
  min-width: 0;
}
</style>
