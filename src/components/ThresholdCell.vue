<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { api } from '../api'
import { formatMs } from '../format'

const props = defineProps<{
  service: string
  operation: string
  thresholdMs: number
  isCustom: boolean
  defaultMs: number
}>()
const emit = defineEmits<{ changed: [] }>()

const editing = ref(false)
const saving = ref(false)
const value = ref<number | null>(null)
const error = ref<string | null>(null)
const input = ref<HTMLInputElement>()

async function startEdit() {
  value.value = props.thresholdMs
  error.value = null
  editing.value = true
  await nextTick()
  input.value?.select()
}

async function run(action: () => Promise<unknown>) {
  saving.value = true
  error.value = null
  try {
    await action()
    editing.value = false
    emit('changed')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

const save = () => {
  if (value.value === null || Number.isNaN(value.value)) {
    error.value = 'Bir değer girin'
    return
  }
  // Varsayılanla aynı değeri "özel" olarak kaydetmek anlamsız; özel eşik varsa kaldırılır.
  if (value.value === props.defaultMs) {
    if (props.isCustom) return run(() => api.deleteThreshold(props.service, props.operation))
    editing.value = false
    return
  }
  return run(() => api.setThreshold(props.service, props.operation, value.value!))
}

const resetToDefault = () => run(() => api.deleteThreshold(props.service, props.operation))
</script>

<template>
  <div class="cell" @click.stop>
    <div v-if="!editing" class="row">
      <span class="value" :class="{ custom: isCustom }">{{ formatMs(thresholdMs) }}</span>
      <span v-if="isCustom" class="tag" title="Bu operasyona özel eşik">özel</span>
      <button class="icon-btn" :aria-label="`${operation} eşiğini düzenle`" title="Eşiği düzenle" @click="startEdit">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11 2.5l2.5 2.5L6 12.5H3.5V10z" /></svg>
      </button>
    </div>

    <form v-else class="editor" @submit.prevent="save" @keydown.esc="editing = false">
      <input ref="input" v-model.number="value" type="number" min="1" max="600000" step="any"
             :aria-label="`${operation} eşiği (ms)`" :disabled="saving" />
      <span class="muted">ms</span>
      <button class="btn small primary" type="submit" :disabled="saving">Kaydet</button>
      <button class="btn small" type="button" :disabled="saving" @click="editing = false">İptal</button>
      <button v-if="isCustom" class="btn small" type="button" :disabled="saving"
              :title="`Varsayılan eşiğe (${formatMs(defaultMs)}) döner`" @click="resetToDefault">
        Varsayılana dön
      </button>
    </form>
    <div v-if="error" class="error">{{ error }}</div>
  </div>
</template>

<style scoped>
.cell { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
/* Değer, özel etiketi ve kalem tek satırda kalır */
.row { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.value { color: var(--text-muted); font-variant-numeric: tabular-nums; }
.value.custom { color: var(--text-primary); font-weight: 600; }
.tag {
  font-size: 10.5px;
  font-weight: 600;
  padding: 0 6px;
  border-radius: 8px;
  background: var(--accent-soft);
  color: var(--text-primary);
  line-height: 17px;
}
.icon-btn {
  border: none;
  background: none;
  padding: 3px;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-muted);
  display: inline-flex;
}
.icon-btn:hover { background: var(--surface-2); color: var(--text-primary); }
.icon-btn svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linejoin: round; }
.editor { display: flex; align-items: center; gap: 5px; }
.editor input { width: 86px; padding: 2px 6px; text-align: right; }
.btn.small { padding: 2px 8px; font-size: 12px; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn.primary:hover:not(:disabled) { background: var(--accent); filter: brightness(1.08); }
.error { text-align: right; font-size: 11.5px; color: var(--status-critical); }
</style>
