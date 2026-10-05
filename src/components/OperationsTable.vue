<script setup lang="ts">
import { computed, ref } from 'vue'
import { thresholdKey, type OperationSummary } from '../api'
import { formatInt, formatMs, formatPercent, relativeTime } from '../format'
import StatusBadge from './StatusBadge.vue'
import ThresholdCell from './ThresholdCell.vue'

const props = defineProps<{
  rows: OperationSummary[]
  selected?: string
  app: 'service' | 'scheduler'
  /** Özel eşik tanımlı operasyonların anahtarları ("servis|operasyon"). */
  customThresholds: Set<string>
  defaultThresholdMs: number
}>()
const emit = defineEmits<{ select: [row: OperationSummary]; thresholdChanged: [] }>()

type SortKey = 'operation' | 'count' | 'avgMs' | 'p95Ms' | 'maxMs' | 'slowCount' | 'errorCount'
const sortKey = ref<SortKey>('avgMs')
const sortDesc = ref(true)

const columns: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'operation', label: 'Operasyon', numeric: false },
  { key: 'count', label: 'İstek', numeric: true },
  { key: 'avgMs', label: 'Ortalama', numeric: true },
  { key: 'p95Ms', label: 'p95', numeric: true },
  { key: 'maxMs', label: 'Max', numeric: true },
  { key: 'slowCount', label: 'Eşiği aşan', numeric: true },
  { key: 'errorCount', label: 'Hata', numeric: true }
]

const sorted = computed(() =>
  [...props.rows].sort((a, b) => {
    const av = a[sortKey.value]
    const bv = b[sortKey.value]
    const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
    return sortDesc.value ? -cmp : cmp
  })
)

function sortBy(key: SortKey) {
  if (sortKey.value === key) sortDesc.value = !sortDesc.value
  else {
    sortKey.value = key
    sortDesc.value = key !== 'operation'
  }
}

function status(row: OperationSummary) {
  if (row.isAvgOverThreshold) return { kind: 'slow' as const, label: 'Yavaş' }
  if (row.errorRate >= 0.05) return { kind: 'error' as const, label: 'Hata oranı yüksek' }
  return { kind: 'ok' as const, label: 'Normal' }
}

const rowKey = (r: OperationSummary) => `${r.service}|${r.operation}`
</script>

<template>
  <div class="table-wrap">
    <table class="data">
      <thead>
        <tr>
          <th>Durum</th>
          <th>{{ app === 'service' ? 'Servis' : 'Uygulama' }}</th>
          <th v-for="c in columns" :key="c.key" class="sortable" :class="{ num: c.numeric }" @click="sortBy(c.key)"
              :aria-sort="sortKey === c.key ? (sortDesc ? 'descending' : 'ascending') : 'none'">
            {{ c.label }}<span v-if="sortKey === c.key" class="arrow">{{ sortDesc ? '↓' : '↑' }}</span>
          </th>
          <th class="num">Eşik</th>
          <th>Son istek</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in sorted" :key="rowKey(row)" class="clickable"
            :class="{ selected: selected === row.operation }" @click="emit('select', row)">
          <td><StatusBadge v-bind="status(row)" /></td>
          <td class="secondary">{{ row.service }}</td>
          <td class="mono op">{{ row.operation }}</td>
          <td class="num">{{ formatInt(row.count) }}</td>
          <td class="num" :class="{ over: row.avgMs > row.thresholdMs }">{{ formatMs(row.avgMs) }}</td>
          <td class="num" :class="{ over: row.p95Ms > row.thresholdMs }">{{ formatMs(row.p95Ms) }}</td>
          <td class="num">{{ formatMs(row.maxMs) }}</td>
          <td class="num">
            {{ formatInt(row.slowCount) }}
            <span class="muted pct">{{ formatPercent(row.count ? row.slowCount / row.count : 0) }}</span>
          </td>
          <td class="num">
            {{ formatInt(row.errorCount) }}
            <span class="muted pct">{{ formatPercent(row.errorRate) }}</span>
          </td>
          <td class="num">
            <ThresholdCell :service="row.service" :operation="row.operation" :threshold-ms="row.thresholdMs"
                           :is-custom="customThresholds.has(thresholdKey(row.service, row.operation))"
                           :default-ms="defaultThresholdMs" @changed="emit('thresholdChanged')" />
          </td>
          <td class="muted nowrap">{{ relativeTime(row.lastSeen) }}</td>
        </tr>
      </tbody>
    </table>
    <div v-if="!rows.length" class="empty">Bu aralıkta istek yok</div>
  </div>
</template>

<style scoped>
.table-wrap { overflow-x: auto; }
.op { word-break: break-all; }
.over { color: var(--status-critical); font-weight: 600; }
.pct { font-size: 11px; margin-left: 4px; }
.arrow { margin-left: 3px; }
.nowrap { white-space: nowrap; }
</style>
