<template>
  <div class="settings-head">
    <div class="settings-intro">
      <h2 class="settings-title">{{ meta.label }}</h2>
      <p class="settings-desc">{{ meta.desc }}</p>
    </div>
    <div class="settings-tabs">
      <router-link
        v-for="s in tabs"
        :key="s.key"
        class="settings-tab"
        :class="{ active: active === s.key }"
        :to="`/system/${s.key}`"
      >
        {{ s.label }}
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { systemSections } from '../router';

const props = defineProps<{ active: string }>();

const tabs = [
  ...systemSections,
  { key: 'guide', label: '使用教程', desc: '从首次配置到日常出稿与复盘的完整操作指引' },
  { key: 'audit', label: '审计与回收站', desc: '审计日志与软删记录恢复' },
];

const meta = computed(() => tabs.find((t) => t.key === props.active) ?? tabs[0]);
</script>
