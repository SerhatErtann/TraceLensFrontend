<script setup lang="ts">
import { computed } from 'vue'
import type { AppKind, Outcome } from '../api'
import { formatInt, formatPercent, relativeTime } from '../format'

/** İsteklerin sonucu: durum kodu dağılımı (görevlerde başarılı/başarısız) ve hata türleri. */
const props = defineProps<{ data: Outcome | null; app: AppKind }>()

function statusMeta(status: string): { label: string; color: string } {
  if (props.app === 'scheduler') {
    if (status === 'succeeded') return { label: 'Başarılı', color: 'var(--status-good)' }
    if (status === 'failed') return { label: 'Başarısız', color: 'var(--status-critical)' }
    return { label: status || 'Bilinmiyor', color: 'var(--border-strong)' }
  }
  const color = { '2': 'var(--status-good)', '3': 'var(--series-1)', '4': 'var(--status-warning)', '5': 'var(--status-critical)' }[status[0]]
  return { label: status || 'Kodsuz', color: color ?? 'var(--border-strong)' }
}

const statuses = computed(() => {
  const d = props.data
  if (!d || !d.count) return []
  return d.statuses.map(s => ({ ...s, ...statusMeta(s.status), share: s.count / d.count }))
})

const errorTotal = computed(() => props.data?.errorTypes.reduce((sum, e) => sum + e.count, 0) ?? 0)

// "System.Net.Http.HttpRequestException" → ad "HttpRequestException", altında ad alanı
function splitType(type: string) {
  const i = type.lastIndexOf('.')
  return /^[\w.]+$/.test(type) && i > 0 ? { name: type.slice(i + 1), ns: type.slice(0, i) } : { name: type, ns: '' }
}
</script>

<template>
  <div v-if="!data" class="empty">Yükleniyor…</div>
  <div v-else-if="!data.count" class="empty">Bu aralıkta veri yok</div>
  <template v-else>
    <div class="statuses">
      <div class="bar" role="img" :aria-label="statuses.map(s => `${s.label} ${formatPercent(s.share)}`).join(', ')">
        <i v-for="s in statuses" :key="s.status" :style="{ width: `${s.share * 100}%`, background: s.color }" :title="`${s.label}: ${formatInt(s.count)}`" />
      </div>
      <div class="legend">
        <span v-for="s in statuses" :key="s.status">
          <i :style="{ background: s.color }" /><b class="mono">{{ s.label }}</b> {{ formatInt(s.count) }}
          <span class="muted">{{ formatPercent(s.share) }}</span>
        </span>
      </div>
    </div>

    <div class="table-wrap">
      <table v-if="data.errorTypes.length" class="data">
        <thead>
          <tr>
            <th>Hata türü</th>
            <th class="num">Sayı</th>
            <th>En çok</th>
            <th>Son örnek</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in data.errorTypes" :key="e.type" class="clickable" @click="$router.push(`/traces/${e.lastTraceId}`)">
            <td class="type-cell">
              <div class="err-name" :title="e.type">⚠ {{ splitType(e.type).name }}</div>
              <div v-if="splitType(e.type).ns" class="muted tiny">{{ splitType(e.type).ns }}</div>
              <div v-if="e.exampleMessage" class="muted tiny msg" :title="e.exampleMessage">{{ e.exampleMessage }}</div>
            </td>
            <td class="num">
              <b>{{ formatInt(e.count) }}</b>
              <div class="muted tiny">{{ formatPercent(e.count / (errorTotal || 1)) }}</div>
            </td>
            <td class="mono op" :title="e.topOperation">{{ e.topOperation }}</td>
            <td class="nowrap">
              <RouterLink :to="`/traces/${e.lastTraceId}`" @click.stop>{{ relativeTime(e.lastSeen) }} →</RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">Bu aralıkta hatalı {{ app === 'service' ? 'istek' : 'çalışma' }} yok</div>
    </div>
  </template>
</template>

<style scoped>
.statuses { padding: 0 16px 12px; }
.bar { display: flex; height: 14px; border-radius: 4px; overflow: hidden; gap: 2px; }
.bar i { display: block; height: 100%; min-width: 3px; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 16px; margin-top: 8px; font-size: 12.5px; color: var(--text-secondary); }
.legend > span { display: inline-flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums; }
.legend i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.legend b { color: var(--text-primary); }
.type-cell { min-width: 180px; }
.err-name { color: var(--status-critical); font-weight: 500; white-space: nowrap; }
.tiny { font-size: 11.5px; }
.msg { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.op { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nowrap { white-space: nowrap; }
</style>
