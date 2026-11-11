<template>
  <div class="grid">
    <div class="panel">
      <div class="head">
        <h2>服务健康检查</h2>
        <span class="badge" :class="ok ? 'badge-ok' : 'badge-warn'">{{ ok ? '接口正常' : '未连接 / 异常' }}</span>
      </div>
      <p class="desc">
        接口 <code>/api/health</code> 不依赖 PostgreSQL，供 T1.1 冒烟与夜间巡检使用。
        数据库不可用时仍返回 200，并在 <code>dependencies.postgres</code> 如实标注「待环境」。
      </p>
      <button class="btn" type="button" :disabled="loading" @click="load">
        {{ loading ? '检查中…' : '重新检查' }}
      </button>
      <p v-if="error" class="error">请求失败：{{ error }}</p>
      <pre v-else-if="payload" class="result">{{ pretty }}</pre>
      <pre v-else class="result">尚未取得响应</pre>
    </div>

    <div class="panel">
      <h2>工程骨架状态</h2>
      <ul class="lines">
        <li>server：NestJS 11 模块（7 导航 + 4 跨切面）+ Prisma schema</li>
        <li>web：Vue3 / Vite / vue-router / Pinia，7 模块导航骨架</li>
        <li>docker-compose：PostgreSQL 16 + Redis 7</li>
        <li>配置：.env.example 占位，密钥不硬编码、不写日志</li>
      </ul>
      <p class="hint">T0.x 原型已合并为可运行前端骨架（无人值守不做纯静态原型）。</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { fetchHealth, type HealthPayload } from '../api/http';

const payload = ref<HealthPayload | null>(null);
const error = ref('');
const loading = ref(false);
const ok = computed(() => payload.value?.status === 'ok');
const pretty = computed(() => JSON.stringify(payload.value, null, 2));

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    payload.value = await fetchHealth();
  } catch (cause: unknown) {
    payload.value = null;
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

h2 {
  font-size: 16px;
  margin: 0 0 10px;
}

.desc {
  color: var(--muted);
  line-height: 1.7;
}

.btn {
  background: var(--brand);
  color: var(--brand-ink);
  border: 0;
  border-radius: 6px;
  padding: 7px 14px;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.result {
  margin-top: 14px;
  padding: 12px;
  background: #f6f8fa;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
  overflow: auto;
  max-height: 320px;
}

.error {
  color: var(--warn);
  margin-top: 14px;
}

.lines {
  line-height: 2;
  padding-left: 18px;
}

.hint {
  color: var(--muted);
  font-size: 12px;
  border-top: 1px dashed var(--border);
  padding-top: 12px;
  margin-top: 14px;
}

code {
  background: #f1f3f5;
  padding: 1px 5px;
  border-radius: 4px;
}
</style>
