<script setup lang="ts">
import { computed } from 'vue'
import type { OperationSummary } from '../api'
import { formatInt, formatMs, formatPercent } from '../format'
import KpiTile from './KpiTile.vue'

/** Servisler/Görevler sayfasının özet kutuları. Her biri sayfadaki ilgili bölüme götürür. */
export type TileAction = 'requests' | 'chart' | 'slowest' | 'slow' | 'errors'

const props = defineProps<{ totals: OperationSummary | null; thresholdMs: number; app: 'service' | 'scheduler' }>()
const emit = defineEmits<{ go: [action: TileAction] }>()

const tiles = computed(() => {
  const t = props.totals
  if (!t) return []
  const isService = props.app === 'service'
  const slowRatio = t.count ? t.slowCount / t.count : 0
  const errorRatio = t.count ? t.errorCount / t.count : 0
  return [
    { action: 'requests' as const, label: isService ? 'Toplam istek' : 'Toplam çalışma', value: formatInt(t.count),
      sub: '', bad: false, hint: isService ? 'İstekleri listele' : 'Çalışmaları listele' },
    { action: 'chart' as const, label: 'Ortalama süre', value: formatMs(t.avgMs),
      sub: `eşik ${formatMs(props.thresholdMs)}${t.avgMs > props.thresholdMs ? ' · ▲ üstünde' : ''}`, bad: t.avgMs > props.thresholdMs, hint: 'Süre grafiğini aç' },
    { action: 'slowest' as const, label: 'p95', value: formatMs(t.p95Ms),
      sub: `max ${formatMs(t.maxMs)}`, bad: t.p95Ms > props.thresholdMs, hint: 'En yavaşları listele' },
    { action: 'slow' as const, label: 'Eşiği aşan', value: formatInt(t.slowCount),
      sub: `oran ${formatPercent(slowRatio)}`, bad: false, hint: 'Eşiği aşanları listele' },
    { action: 'errors' as const, label: 'Hatalı', value: formatInt(t.errorCount),
      sub: `oran ${formatPercent(errorRatio)}`, bad: errorRatio >= 0.05, hint: 'Hatalıları listele' }
  ]
})
</script>

<template>
  <div class="tiles">
    <KpiTile v-for="tile in tiles" :key="tile.action" :label="tile.label" :value="tile.value" :sub="tile.sub"
             :bad="tile.bad" :hint="tile.hint" @go="emit('go', tile.action)" />
  </div>
</template>

<style scoped>
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
}
</style>
