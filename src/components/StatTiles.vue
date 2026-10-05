<script setup lang="ts">
import { computed } from 'vue'
import type { OperationSummary } from '../api'
import { formatInt, formatMs, formatPercent } from '../format'

const props = defineProps<{ totals: OperationSummary | null; thresholdMs: number }>()

const tiles = computed(() => {
  const t = props.totals
  if (!t) return []
  const slowRatio = t.count ? t.slowCount / t.count : 0
  const errorRatio = t.count ? t.errorCount / t.count : 0
  return [
    { label: 'Toplam istek', value: formatInt(t.count), sub: '' , alert: false },
    { label: 'Ortalama süre', value: formatMs(t.avgMs), sub: `eşik ${formatMs(props.thresholdMs)}`, alert: t.avgMs > props.thresholdMs },
    { label: 'p95', value: formatMs(t.p95Ms), sub: `max ${formatMs(t.maxMs)}`, alert: t.p95Ms > props.thresholdMs },
    { label: 'Eşiği aşan', value: formatInt(t.slowCount), sub: formatPercent(slowRatio), alert: false },
    { label: 'Hatalı', value: formatInt(t.errorCount), sub: formatPercent(errorRatio), alert: false }
  ]
})
</script>

<template>
  <div class="tiles">
    <div v-for="tile in tiles" :key="tile.label" class="card tile">
      <div class="label">{{ tile.label }}</div>
      <div class="value">
        {{ tile.value }}
        <span v-if="tile.alert" class="over" title="Eşiğin üstünde">▲ eşik üstü</span>
      </div>
      <div class="sub muted">{{ tile.sub || ' ' }}</div>
    </div>
  </div>
</template>

<style scoped>
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
}
.tile { padding: 14px 16px; }
.label { font-size: 12px; color: var(--text-secondary); }
.value {
  font-size: 26px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  margin-top: 2px;
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.over {
  font-size: 11px;
  font-weight: 600;
  color: var(--status-critical);
}
.sub { font-size: 12px; }
</style>
