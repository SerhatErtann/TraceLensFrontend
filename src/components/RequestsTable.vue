<script setup lang="ts">
import { computed } from 'vue'
import type { RequestRow } from '../api'
import { formatBytes, formatDateTime, formatMs } from '../format'
import StatusBadge from './StatusBadge.vue'

const props = defineProps<{ rows: RequestRow[]; app: 'service' | 'scheduler'; thresholdFor: (row: RequestRow) => number }>()

// Resmi OpenTelemetry paketleri yanıt boyutunu kaydetmez; hiçbir satırda yoksa boş sütun gösterilmez.
const showSize = computed(() => props.app === 'service' && props.rows.some(r => r.responseBytes != null))

const isError = (row: RequestRow) => row.status === 'Error'
const isSlow = (row: RequestRow) => row.durationMs > props.thresholdFor(row)

// Hatalı satır tamamen kırmızı zeminli; hatasız ama eşiği aşan satırda turuncu şerit
const rowClass = (row: RequestRow) => ({ 'row-error': isError(row), 'row-slow': !isError(row) && isSlow(row) })

function status(row: RequestRow) {
  if (row.status === 'Error') {
    return { kind: 'error' as const, label: row.httpStatusCode ?? (row.jobStatus === 'failed' ? 'Başarısız' : 'Hata') }
  }
  return { kind: 'ok' as const, label: row.httpStatusCode ?? (row.jobStatus === 'succeeded' ? 'Başarılı' : 'OK') }
}
</script>

<template>
  <div v-if="rows.length" class="legend" aria-hidden="true">
    <span><i class="sw error" />Hatalı</span>
    <span><i class="sw slow" />Eşiği aşan</span>
  </div>
  <div class="table-wrap">
    <table class="data">
      <thead>
        <tr>
          <th>Zaman</th>
          <th>{{ app === 'service' ? 'Servis' : 'Scheduler' }}</th>
          <th>Operasyon</th>
          <th class="num">Süre</th>
          <th>Sonuç</th>
          <th v-if="showSize" class="num">Yanıt boyutu</th>
          <th>Trace</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.spanId" class="clickable" :class="rowClass(row)"
            @click="$router.push(`/traces/${row.traceId}`)">
          <td class="nowrap secondary">
            <span v-if="isError(row)" class="sr">Hatalı istek: </span>{{ formatDateTime(row.timestamp) }}
          </td>
          <td class="secondary">{{ row.service }}</td>
          <td class="mono">{{ row.operation }}</td>
          <td class="num" :class="{ over: isSlow(row) }">
            <span v-if="isSlow(row)" class="sr">Eşik üstü: </span>{{ formatMs(row.durationMs) }}
          </td>
          <td>
            <StatusBadge v-bind="status(row)" />
            <div v-if="row.statusMessage" class="msg muted" :title="row.statusMessage">{{ row.statusMessage }}</div>
          </td>
          <td v-if="showSize" class="num secondary">{{ formatBytes(row.responseBytes) }}</td>
          <td><RouterLink :to="`/traces/${row.traceId}`" class="mono" @click.stop>{{ row.traceId.slice(0, 12) }}…</RouterLink></td>
        </tr>
      </tbody>
    </table>
    <div v-if="!rows.length" class="empty">Filtreye uyan istek yok</div>
  </div>
</template>

<style scoped>
.table-wrap { overflow-x: auto; }
.over { color: var(--status-critical); font-weight: 600; }

/* Hatalı istek: tüm satır kırmızı zemin + solda koyu kırmızı şerit */
tr.row-error td { background: var(--status-critical-soft); }
tr.row-error td:first-child { box-shadow: inset 4px 0 0 var(--status-critical); }
tr.row-error:hover td { background: color-mix(in srgb, var(--status-critical-soft) 75%, var(--status-critical)); }
tr.row-error .secondary, tr.row-error .muted { color: var(--text-primary); }
/* Hatasız ama eşiği aşan: solda turuncu şerit */
tr.row-slow td:first-child { box-shadow: inset 4px 0 0 var(--status-serious); }

.legend { display: flex; gap: 16px; padding: 0 16px 8px; font-size: 12px; color: var(--text-secondary); }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.sw { width: 12px; height: 12px; border-radius: 2px; display: inline-block; }
.sw.error { background: var(--status-critical-soft); box-shadow: inset 3px 0 0 var(--status-critical); border: 1px solid var(--status-critical); }
.sw.slow { background: var(--surface-1); box-shadow: inset 3px 0 0 var(--status-serious); border: 1px solid var(--border-strong); }
.nowrap { white-space: nowrap; }
.msg { font-size: 11.5px; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
