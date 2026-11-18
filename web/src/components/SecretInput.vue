<template>
  <div class="secret-wrap">
    <input
      ref="inputEl"
      class="input wide"
      :class="{ mono: mono }"
      :type="visible ? 'text' : 'password'"
      :value="displayValue"
      :placeholder="placeholder"
      autocomplete="off"
      @focus="onFocus"
      @blur="onBlur"
      @input="onInput"
    />
    <button
      type="button"
      class="secret-eye"
      :aria-label="visible ? '隐藏已输入内容' : '显示已输入内容'"
      :title="visible ? '隐藏' : '显示'"
      @click="visible = !visible"
    >
      <svg v-if="visible" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
        <path d="M2 2l20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        <path d="M6.7 6.8C4.6 8.2 3.2 10 2.5 12c1.6 4 5.3 6.5 9.5 6.5 1.5 0 2.9-.3 4.2-.9M9.9 5.6c.7-.1 1.4-.1 2.1-.1 4.2 0 7.9 2.5 9.5 6.5-.6 1.5-1.6 2.8-2.9 3.9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
      <svg v-else viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
        <path d="M2 12s3.9-6.5 10-6.5S22 12 22 12s-3.9 6.5-10 6.5S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
        <circle cx="12" cy="12" r="2.7" fill="none" stroke="currentColor" stroke-width="1.8" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    /** 服务端已保存过凭据（前端拿不到明文），用于显示占位圆点。 */
    configured?: boolean;
    maskText?: string;
    mono?: boolean;
  }>(),
  { configured: false, maskText: '••••••••', mono: true },
);

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>();

const visible = ref(false);
const focused = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);

/** 未输入新值且已配置时显示圆点；聚焦即清空，避免把圆点当成真实 Token 提交。 */
const displayValue = computed(() => {
  if (props.modelValue) return props.modelValue;
  if (props.configured && !focused.value) return props.maskText;
  return '';
});

function onFocus(): void {
  focused.value = true;
  if (!props.modelValue) {
    void nextTick(() => {
      if (inputEl.value) inputEl.value.value = '';
    });
  }
}

function onBlur(): void {
  focused.value = false;
}

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value);
}
</script>

<style scoped>
.secret-wrap {
  position: relative;
  display: flex;
  width: 100%;
}
.secret-wrap :deep(.input) {
  width: 100%;
  padding-right: 38px;
}
.secret-eye {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--muted, #5b6675);
  cursor: pointer;
}
.secret-eye:hover {
  background: var(--panel-soft, #f3f6fb);
  color: var(--brand, #2f6fed);
}
</style>
