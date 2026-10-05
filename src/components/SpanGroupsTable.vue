<script setup lang="ts">
import { computed, ref } from 'vue'
import { spanGroupKey, type SpanCategory, type SpanGroup } from '../api'
import { formatInt, formatMs, formatPercent } from '../format'
import StatusBadge from './StatusBadge.vue'

/** Servis Detayı'ndaki Metodlar / DB sorguları / Dış çağrılar tablosu. Görünüm OperationsTable ile aynı. */
const props = defineProps<{ rows: SpanGroup[]; category: SpanCategory; selected?: string }>()
const emit = defineEmits<{ select: [row: SpanGroup] }>()

type SortKey = 'name' | 'count' | 'callsPerRequest' | 'avgMs' | 'p95Ms' | 'maxMs' | 'errorCount' | 'share'
const sortKey = ref<SortKey>('share')
const sortDesc = ref(true)

const nameLabel: Record<SpanCategory, string> = { method: 'Metod', db: 'Sorgu', call: 'Çağrı' }

const columns = computed<{ key: SortKey; label: string; numeric: boolean }[]>(() => [
  { key: 'name', label: nameLabel[props.category], numeric: false },
  { key: 'count', label: 'Çağrılma', numeric: true },
  { key: 'callsPerRequest', label: 'İstek başına', numeric: true },
  { key: 'avgMs', label: 'Ortalama', numeric: true },
  { key: 'p95Ms', label: 'p95', numeric: true },
  { key: 'maxMs', label: 'Max', numeric: true },
  { key: 'errorCount', label: 'Hata', numeric: true }
])

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
    sortDesc.value = key !== 'name'
  }
}

function status(row: SpanGroup) {
  if (row.suspectedNPlusOne) return { kind: 'slow' as const, label: 'N+1 şüphesi' }
  if (row.avgMs > row.thresholdMs) return { kind: 'slow' as const, label: 'Yavaş' }
  if (row.errorRate >= 0.05) return { kind: 'error' as const, label: 'Hata oranı yüksek' }
  return { kind: 'ok' as const, label: 'Normal' }
}

// Pay çubuğu: en büyük satır dolu görünsün diye en büyük paya göre ölçeklenir; yazan değer gerçek pay
const maxShare = computed(() => Math.max(...props.rows.map(r => r.share), 0.0001))

const emptyText: Record<SpanCategory, string> = {
  method: "Bu aralıkta metod span'i yok. Metod süreleri için kodda ActivitySource ile span açılmalı (README).",
  db: 'Bu aralıkta veritabanı sorgusu yok.',
  call: 'Bu aralıkta başka servise çağrı yok.'
}
</script>

<template>
  <div class="table-wrap">
    <table class="data">
      <thead>
        <tr>
          <th>Durum</th>
          <th v-for="c in columns" :key="c.key" class="sortable" :class="{ num: c.numeric }" @click="sortBy(c.key)"
              :aria-sort="sortKey === c.key ? (sortDesc ? 'descending' : 'ascending') : 'none'">
            {{ c.label }}<span v-if="sortKey === c.key" class="arrow">{{ sortDesc ? '↓' : '↑' }}</span>
          </th>
          <th class="num">Eşik</th>
          <th class="sortable" :aria-sort="sortKey === 'share' ? (sortDesc ? 'descending' : 'ascending') : 'none'"
              @click="sortBy('share')">
            Toplam sürenin payı<span v-if="sortKey === 'share'" class="arrow">{{ sortDesc ? '↓' : '↑' }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in sorted" :key="spanGroupKey(row)" class="clickable"
            :class="{ selected: selected === spanGroupKey(row) }" @click="emit('select', row)">
          <td><StatusBadge v-bind="status(row)" /></td>
          <td class="name-cell">
            <div class="mono op">
              <template v-for="(part, i) in row.name.split('/')" :key="i"><wbr v-if="i" />{{ i ? '/' : '' }}{{ part }}</template>
            </div>
            <div v-if="row.target" class="muted tiny">{{ row.target }}</div>
            <div v-if="row.suspectedNPlusOne" class="tiny warn">
              İstek başına ortalama {{ row.callsPerRequest.toLocaleString('tr-TR') }} kez çalışıyor: döngü içinde sorgu (N+1) olabilir
            </div>
          </td>
          <td class="num">{{ formatInt(row.count) }}</td>
          <td class="num" :class="{ over: row.suspectedNPlusOne }">{{ row.callsPerRequest.toLocaleString('tr-TR') }}×</td>
          <td class="num" :class="{ over: row.avgMs > row.thresholdMs }">{{ formatMs(row.avgMs) }}</td>
          <td class="num" :class="{ over: row.p95Ms > row.thresholdMs }">{{ formatMs(row.p95Ms) }}</td>
          <td class="num">{{ formatMs(row.maxMs) }}</td>
          <td class="num">
            {{ formatInt(row.errorCount) }}
            <span class="muted pct">{{ formatPercent(row.errorRate) }}</span>
          </td>
          <td class="num muted">{{ formatMs(row.thresholdMs) }}</td>
          <td class="share-cell">
            <div class="share">
              <div class="bar"><i :style="{ width: `${Math.max((row.share / maxShare) * 100, 1.5)}%` }" /></div>
              <span class="num">{{ formatPercent(row.share) }}</span>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="!rows.length" class="empty">{{ emptyText[category] }}</div>
  </div>
</template>

<style scoped>
.table-wrap { overflow-x: auto; }
.name-cell { min-width: 220px; }
.over { color: var(--status-critical); font-weight: 600; }
.pct { font-size: 11px; margin-left: 4px; }
.arrow { margin-left: 3px; }
.tiny { font-size: 11.5px; }
.warn { color: var(--status-critical); margin-top: 2px; }
.share-cell { min-width: 150px; }
.share { display: flex; align-items: center; gap: 8px; }
.share .bar { flex: 1; height: 8px; border-radius: 4px; background: var(--surface-2); overflow: hidden; }
.share .bar i { display: block; height: 100%; border-radius: 4px; background: var(--accent); }
.share .num { min-width: 44px; }
</style>
