<script setup lang="ts">
import { computed } from 'vue'
import type { OperationSummary } from '../api'
import { compare, formatInt, formatMs, formatPercent } from '../format'
import KpiTile from './KpiTile.vue'

/** Servisler/Görevler sayfasının özet kutuları. Her biri sayfadaki ilgili bölüme götürür. */
export type TileAction = 'requests' | 'chart' | 'slowest' | 'slow' | 'errors'

const props = defineProps<{
  totals: OperationSummary | null
  thresholdMs: number
  app: 'service' | 'scheduler'
  /** Bir önceki eşit uzunluktaki dönem; verilirse her kutuda değişim yazar */
  previous?: OperationSummary | null
}>()
const emit = defineEmits<{ go: [action: TileAction] }>()

const ratio = (part: number, total: number) => (total ? part / total : 0)

const tiles = computed(() => {
  const t = props.totals
  if (!t) return []
  const p = props.previous
  const isService = props.app === 'service'
  const slowRatio = ratio(t.slowCount, t.count)
  const errorRatio = ratio(t.errorCount, t.count)
  // Eşiği aşan / hatalı: sayı istek hacmiyle değiştiği için oran karşılaştırılır
  return [
    { action: 'requests' as const, label: isService ? 'Toplam istek' : 'Toplam çalışma', value: formatInt(t.count),
      sub: '', bad: false, hint: isService ? 'İstekleri listele' : 'Çalışmaları listele',
      delta: p ? compare(t.count, p.count, formatInt(p.count), null) : null },
    { action: 'chart' as const, label: 'Ortalama süre', value: formatMs(t.avgMs),
      sub: `eşik ${formatMs(props.thresholdMs)}${t.avgMs > props.thresholdMs ? ' · ▲ üstünde' : ''}`, bad: t.avgMs > props.thresholdMs, hint: 'Süre grafiğini aç',
      delta: p ? compare(t.avgMs, p.avgMs, formatMs(p.avgMs), true) : null },
    { action: 'slowest' as const, label: 'p95 · en yavaş %5', value: formatMs(t.p95Ms),
      sub: `max ${formatMs(t.maxMs)}`, bad: t.p95Ms > props.thresholdMs, hint: 'En yavaşları listele',
      delta: p ? compare(t.p95Ms, p.p95Ms, formatMs(p.p95Ms), true) : null },
    { action: 'slow' as const, label: 'Eşiği aşan', value: formatInt(t.slowCount),
      sub: `oran ${formatPercent(slowRatio)}`, bad: false, hint: 'Eşiği aşanları listele',
      delta: p ? compare(slowRatio, ratio(p.slowCount, p.count), `oran ${formatPercent(ratio(p.slowCount, p.count))}`, true) : null },
    { action: 'errors' as const, label: 'Hatalı', value: formatInt(t.errorCount),
      sub: `oran ${formatPercent(errorRatio)}`, bad: errorRatio >= 0.05, hint: 'Hatalıları listele',
      delta: p ? compare(errorRatio, ratio(p.errorCount, p.count), `oran ${formatPercent(ratio(p.errorCount, p.count))}`, true) : null }
  ]
})
</script>

<template>
  <div class="tiles">
    <KpiTile v-for="tile in tiles" :key="tile.action" :label="tile.label" :value="tile.value" :sub="tile.sub"
             :bad="tile.bad" :hint="tile.hint" :delta="tile.delta" @go="emit('go', tile.action)" />
  </div>
</template>

<style scoped>
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
}
</style>
