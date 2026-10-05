<script setup lang="ts">
import type { Delta } from '../format'

/** Tıklanınca ilgili sayfaya/bölüme götüren özet kutusu. Nereye gittiği altta yazar; varsa önceki döneme göre değişim. */
defineProps<{ label: string; value: string; sub?: string; bad?: boolean; hint: string; delta?: Delta | null }>()
defineEmits<{ go: [] }>()
</script>

<template>
  <button class="card kpi" type="button" @click="$emit('go')">
    <span class="arrow" aria-hidden="true">→</span>
    <span class="label">{{ label }}</span>
    <span class="value">{{ value }}</span>
    <span class="sub" :class="{ bad }">{{ sub || ' ' }}</span>
    <span v-if="delta" class="delta" :class="delta.tone">{{ delta.text }}</span>
    <span class="hint">{{ hint }}</span>
  </button>
</template>

<style scoped>
.kpi {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 14px 16px;
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: inherit;
}
.kpi:hover { border-color: var(--border-strong); background: var(--surface-2); }
.arrow { position: absolute; top: 12px; right: 14px; color: var(--text-muted); transition: transform 0.15s; }
.kpi:hover .arrow { color: var(--accent); transform: translateX(2px); }
.label { font-size: 12px; color: var(--text-secondary); }
.value { font-size: 26px; font-weight: 600; font-variant-numeric: tabular-nums; margin-top: 2px; }
.sub { font-size: 12px; color: var(--text-muted); }
.sub.bad { color: var(--status-critical); font-weight: 600; }
.delta { font-size: 11.5px; margin-top: 2px; font-variant-numeric: tabular-nums; color: var(--text-muted); }
.delta.bad { color: var(--status-critical); }
.delta.good { color: var(--status-good); }
/* Yan yana kutularda "nereye gider" satırı hep en altta hizalı */
.hint { font-size: 11.5px; color: var(--accent); margin-top: auto; padding-top: 6px; }
@media (prefers-reduced-motion: reduce) { .arrow { transition: none; } }
</style>
