<script setup lang="ts">
import { computed } from 'vue'
import type { Instance } from '../api'
import { formatDateTime, formatInt, formatMs, formatPercent, parseUtc } from '../format'
import StatusBadge from './StatusBadge.vue'

/** Servisin çalışan kopyaları: biri diğerlerinden belirgin yavaş ya da hatalıysa işaretlenir. */
const props = defineProps<{ rows: Instance[]; thresholdMs: number }>()

const ACTIVE_MS = 2 * 60_000
const SLOWER_RATIO = 1.3

const overallAvg = computed(() => {
  const total = props.rows.reduce((s, r) => s + r.count, 0)
  return total ? props.rows.reduce((s, r) => s + r.avgMs * r.count, 0) / total : 0
})

function status(row: Instance) {
  if (row.errorRate >= 0.05) return { kind: 'error' as const, label: 'Hata oranı yüksek' }
  if (props.rows.length > 1 && row.count >= 10 && row.avgMs > overallAvg.value * SLOWER_RATIO) return { kind: 'slow' as const, label: 'Diğerlerinden yavaş' }
  return { kind: 'ok' as const, label: 'Normal' }
}
const isActive = (row: Instance) => Date.now() - parseUtc(row.lastSeen).getTime() < ACTIVE_MS
</script>

<template>
  <div class="table-wrap">
    <table v-if="rows.length" class="data">
      <thead>
        <tr>
          <th>Durum</th>
          <th>Instance</th>
          <th class="num">İstek</th>
          <th class="num">Ortalama</th>
          <th class="num">p95</th>
          <th class="num">Eşiği aşan</th>
          <th class="num">Hata</th>
          <th>Çalıştığı aralık</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.instanceId">
          <td><StatusBadge v-bind="status(r)" /></td>
          <td>
            <div class="mono" :title="r.instanceId">{{ r.instanceId ? `${r.instanceId.slice(0, 8)}…` : 'bilinmiyor' }}</div>
            <div v-if="r.host" class="muted tiny">{{ r.host }}</div>
          </td>
          <td class="num">{{ formatInt(r.count) }}</td>
          <td class="num" :class="{ over: r.avgMs > thresholdMs }">{{ formatMs(r.avgMs) }}</td>
          <td class="num" :class="{ over: r.p95Ms > thresholdMs }">{{ formatMs(r.p95Ms) }}</td>
          <td class="num">{{ formatInt(r.slowCount) }}</td>
          <td class="num">
            {{ formatInt(r.errorCount) }}
            <span class="muted pct">{{ formatPercent(r.errorRate) }}</span>
          </td>
          <td class="nowrap secondary">
            {{ formatDateTime(r.firstSeen) }} – <span v-if="isActive(r)" class="active">şu an</span><template v-else>{{ formatDateTime(r.lastSeen) }}</template>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-else class="empty">Bu aralıkta veri yok</div>
  </div>
</template>

<style scoped>
.over { color: var(--status-critical); font-weight: 600; }
.pct { font-size: 11px; margin-left: 4px; }
.tiny { font-size: 11.5px; }
.nowrap { white-space: nowrap; }
.active { color: var(--status-good); font-weight: 600; }
</style>
