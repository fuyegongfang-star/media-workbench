<template>
  <div class="panel">
    <div class="head">
      <h2>{{ label }} <span class="badge">{{ phase }}</span></h2>
      <span class="badge badge-warn">骨架占位 · 待实现</span>
    </div>
    <p class="desc">{{ description }}</p>
    <h3>待落地任务</h3>
    <ul>
      <li v-for="(item, index) in todo" :key="index">{{ item }}</li>
    </ul>
    <p class="hint">本模块已按技术方案 §3 建立 Nest 模块边界与路由占位，业务逻辑由后续夜间巡检逐条续跑。</p>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
  phase: string;
  description: string;
  todo: string[];
}>();
</script>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

h2 {
  font-size: 16px;
  margin: 0;
}

h3 {
  font-size: 13px;
  color: var(--muted);
  margin: 18px 0 8px;
}

.desc {
  color: var(--muted);
  line-height: 1.7;
}

ul {
  margin: 0;
  padding-left: 20px;
  line-height: 1.9;
}

.hint {
  margin-top: 18px;
  padding-top: 12px;
  border-top: 1px dashed var(--border);
  color: var(--muted);
  font-size: 12px;
}
</style>
