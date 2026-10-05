<script setup lang="ts">
import { computed } from 'vue'
import type { TimeSplit } from '../api'
import { formatMs, formatPercent } from '../format'

/** "Süre nereye gidiyor?" çubuğu: kendi kodu / başka servislere çağrılar / veritabanı / diğer. */
const props = defineProps<{ parts: TimeSplit[]; msSuffix?: string }>()

const META: Record<TimeSplit['category'], { label: string; color: string }> = {
  own: { label: 'Kendi kodu', color: 'var(--series-1)' },
  call: { label: 'Başka servislere çağrılar', color: 'var(--series-2)' },
  db: { label: 'Veritabanı', color: 'var(--series-3)' },
  other: { label: 'Diğer', color: 'var(--border-strong)' }
}
const shown = computed(() => props.parts.filter(p => p.share > 0).map(p => ({ ...p, ...META[p.category] })))
const aria = computed(() => shown.value.map(p => `${p.label} ${formatPercent(p.share)}`).join(', '))
</script>

<template>
  <div class="split">
    <div class="bar" role="img" :aria-label="aria">
      <i v-for="p in shown" :key="p.category" :style="{ width: `${p.share * 100}%`, background: p.color }" :title="`${p.label} ${formatPercent(p.share)}`" />
    </div>
    <div class="legend">
      <span v-for="p in shown" :key="p.category">
        <i :style="{ background: p.color }" />{{ p.label }} <b>{{ formatPercent(p.share) }}</b>
        <span class="muted">{{ formatMs(p.totalMs) }}{{ msSuffix ?? '' }}</span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.bar { display: flex; height: 22px; border-radius: 4px; overflow: hidden; gap: 2px; }
.bar i { display: block; height: 100%; min-width: 3px; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 10px; font-size: 12.5px; color: var(--text-secondary); }
.legend > span { display: inline-flex; align-items: center; gap: 6px; }
.legend i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.legend b { color: var(--text-primary); font-variant-numeric: tabular-nums; }
</style>
