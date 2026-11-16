<template>
  <router-view />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { applyHead, loadSiteInfo } from './api/site';

// 布局与导航在 BasicLayout.vue。
// T6.7：公开站点配置只需拉一次；路由切换时按当前路径刷新 title / canonical / JSON-LD。
const router = useRouter();
onMounted(() => {
  void loadSiteInfo();
});
router.afterEach(() => applyHead());
applyHead();
</script>
