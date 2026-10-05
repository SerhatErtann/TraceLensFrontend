<script setup lang="ts">
import { computed } from 'vue'
import type { RequestRow } from '../api'
import { formatBytes, formatDateTime, formatMs } from '../format'
import StatusBadge from './StatusBadge.vue'

const props = defineProps<{ rows: RequestRow[]; app: 'service' | 'scheduler'; thresholdFor: (row: RequestRow) => number }>()

// Resmi OpenTelemetry paketleri yanıt boyutunu kaydetmez; hiçbir satırda yoksa boş sütun gösterilmez.
const showSize = computed(() => props.app === 'service' && props.rows.some(r => r.responseBytes != null))

function status(row: RequestRow) {
  if (row.status === 'Error') {
    return { kind: 'error' as const, label: row.httpStatusCode ?? (row.jobStatus === 'failed' ? 'Başarısız' : 'Hata') }
  }
  return { kind: 'ok' as const, label: row.httpStatusCode ?? (row.jobStatus === 'succeeded' ? 'Başarılı' : 'OK') }
}
</script>

<template>
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
        <tr v-for="row in rows" :key="row.spanId" class="clickable"
            @click="$router.push(`/traces/${row.traceId}`)">
          <td class="nowrap secondary">{{ formatDateTime(row.timestamp) }}</td>
          <td class="secondary">{{ row.service }}</td>
          <td class="mono">{{ row.operation }}</td>
          <td class="num" :class="{ over: row.durationMs > thresholdFor(row) }">
            <span v-if="row.durationMs > thresholdFor(row)" class="sr">Eşik üstü: </span>{{ formatMs(row.durationMs) }}
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
.nowrap { white-space: nowrap; }
.msg { font-size: 11.5px; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
