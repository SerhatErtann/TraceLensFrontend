<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, type Issue } from '../api'
import { formatInt, formatMs, formatPercent, relativeTime } from '../format'
import { useTimeRange } from '../timeRange'
import RangePicker from '../components/RangePicker.vue'

type Filter = 'all' | 'alarm' | 'slow' | 'error'

const route = useRoute()
const router = useRouter()

// Zaman aralığı: hazır aralık ya da özel tarih/saat (RangePicker)
const time = useTimeRange()
const filter = computed<Filter>(() => (['alarm', 'slow', 'error'].includes(route.query.filter as string) ? route.query.filter : 'all') as Filter)
const service = computed(() => (route.query.service as string) || undefined)

const issues = ref<Issue[]>([])
const error = ref<string | null>(null)
const loading = ref(false)
const opening = ref<string | null>(null)

const counts = computed(() => ({
  all: issues.value.length,
  alarm: issues.value.filter(i => i.alarmActive).length,
  slow: issues.value.filter(i => i.isSlow).length,
  error: issues.value.filter(i => i.hasErrors).length
}))
const visible = computed(() => issues.value.filter(i =>
  filter.value === 'all' ? true : filter.value === 'alarm' ? i.alarmActive : filter.value === 'slow' ? i.isSlow : i.hasErrors))

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Tümü' },
  { value: 'alarm', label: 'Alarm açık' },
  { value: 'slow', label: 'Yavaş' },
  { value: 'error', label: 'Hatalı' }
]

async function load() {
  loading.value = true
  try {
    issues.value = await api.issues(time.win.value, service.value)
    error.value = null
  } catch (e) {
    error.value = `Sorunlar alınamadı: ${(e as Error).message}`
  } finally {
    loading.value = false
  }
}

const setQuery = (patch: Record<string, string | undefined>) => {
  const query: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...route.query, ...patch })) if (v) query[k] = String(v)
  router.replace({ query })
}

function reason(i: Issue): string {
  const parts: string[] = []
  if (i.hasErrors) {
    parts.push(`Hata oranı ${formatPercent(i.errorRate)} (${formatInt(i.errorCount)} / ${formatInt(i.count)} ${i.app === 'Service' ? 'istek' : 'çalışma'})`)
    if (i.topError) parts.push(`en sık: "${i.topError}"`)
  }
  if (i.isSlow) {
    const over = Math.round((i.avgMs / i.thresholdMs - 1) * 100)
    parts.push(`ortalama ${formatMs(i.avgMs)}, eşik ${formatMs(i.thresholdMs)} (%${over} fazla), p95 ${formatMs(i.p95Ms)}`)
  }
  const text = parts.join(' · ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

const keyOf = (i: Issue) => `${i.app}|${i.service}|${i.operation}`

// Satıra tıklayınca sorunun en kötü örneği açılır: hatalıysa hatalı bir istek, yavaşsa en yavaş istek
async function openExample(i: Issue) {
  opening.value = keyOf(i)
  try {
    const app = i.app === 'Service' ? 'service' : 'scheduler'
    const page = await api.requests(app, { ...time.win.value, service: i.service, operation: i.operation, onlyErrors: i.kind === 'error' }, 'duration', 1, 0)
    const traceId = page.items[0]?.traceId
    if (traceId) router.push(`/traces/${traceId}`)
    else error.value = 'Bu sorun için örnek istek bulunamadı.'
  } catch (e) {
    error.value = `Örnek istek açılamadı: ${(e as Error).message}`
  } finally {
    opening.value = null
  }
}

const operationLink = (i: Issue) => ({
  path: i.app === 'Service' ? '/services' : '/schedulers',
  query: { ...time.query.value, service: i.service, operation: i.operation }
})

watch(() => [JSON.stringify(time.win.value), service.value], load)
let timer: number | undefined
onMounted(() => {
  load()
  timer = window.setInterval(() => { if (!loading.value) load() }, 30_000)
})
onUnmounted(() => window.clearInterval(timer))
</script>

<template>
  <header class="page-header">
    <div>
      <h1>Sorunlar</h1>
      <p class="muted sub">Sadece dikkat isteyenler: ortalaması eşiği aşanlar ve hata oranı %5'i geçenler, en kötüden başlayarak. Satıra tıklayınca en kötü örneği açılır.</p>
    </div>
  </header>

  <section class="card filter-card" aria-label="Filtreler">
    <div class="filter-row">
      <RangePicker />
      <div class="segmented" role="group" aria-label="Sorun türü">
        <button v-for="f in FILTERS" :key="f.value" type="button" :aria-pressed="filter === f.value"
                @click="setQuery({ filter: f.value === 'all' ? undefined : f.value })">
          {{ f.label }} <span class="n">{{ counts[f.value] }}</span>
        </button>
      </div>
      <span v-if="service" class="pill">Servis: {{ service }}
        <button type="button" :aria-label="`${service} filtresini kaldır`" @click="setQuery({ service: undefined })">✕</button>
      </span>
    </div>
  </section>

  <div v-if="error" class="error-box">{{ error }}</div>

  <section class="card list">
    <div v-for="i in visible" :key="keyOf(i)" class="issue" role="button" tabindex="0"
         :aria-busy="opening === keyOf(i)" @click="openExample(i)" @keydown.enter="openExample(i)">
      <span class="sev" :class="i.kind" />
      <div class="what">
        <div class="title">
          <span class="status" :class="i.kind">{{ i.kind === 'error' ? 'Hatalı' : 'Yavaş' }}</span>
          <span class="mono op">{{ i.operation }}</span>
          <span class="tag">{{ i.service }}</span>
          <span v-if="i.app === 'Scheduler'" class="tag">görev</span>
          <span v-if="i.alarmActive" class="tag alarm">Alarm açık</span>
        </div>
        <div class="why">{{ reason(i) }}</div>
      </div>
      <div class="right">
        <b>{{ i.kind === 'error' ? formatPercent(i.errorRate) : formatMs(i.avgMs) }}</b>
        <span>{{ i.kind === 'error' ? 'hata' : 'ortalama' }}</span>
        <span v-if="i.alarmSince">alarm {{ relativeTime(i.alarmSince) }}</span>
        <span v-else>son: {{ relativeTime(i.lastSeen) }}</span>
        <RouterLink :to="operationLink(i)" class="link" @click.stop>{{ i.app === 'Scheduler' ? 'Görev sayfası' : 'Endpoint sayfası' }}</RouterLink>
      </div>
    </div>
    <div v-if="!visible.length && !loading" class="empty">
      {{ issues.length ? 'Bu filtrede sorun yok' : 'Bu aralıkta eşiği aşan veya hata veren bir şey yok' }}
    </div>
  </section>
</template>

<style scoped>
.page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 14px; }
.sub { margin: 2px 0 0; max-width: 720px; }
/* Sayı rozeti segment düğmesinin içinde */
.n { display: inline-block; min-width: 18px; margin-left: 4px; padding: 0 5px; border-radius: 9px; background: var(--surface-2); font-size: 11px; font-weight: 600; text-align: center; }
.issue {
  display: grid;
  grid-template-columns: 4px minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  padding: 12px 16px 12px 0;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}
.issue:last-child { border-bottom: none; }
.issue:hover { background: var(--surface-2); }
.issue[aria-busy='true'] { opacity: 0.6; cursor: progress; }
.sev { align-self: stretch; border-radius: 0 3px 3px 0; }
.sev.error { background: var(--status-critical); }
.sev.slow { background: var(--status-serious); }
.what { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.title { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.op { word-break: break-all; }
.why { font-size: 13px; color: var(--text-secondary); }
.status { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.status::before { content: ''; width: 9px; height: 9px; border-radius: 50%; }
.status.error::before { background: var(--status-critical); }
.status.slow::before { background: var(--status-serious); }
.tag { font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 8px; background: var(--surface-2); color: var(--text-secondary); }
.tag.alarm { background: var(--status-critical-soft); color: var(--text-primary); }
.right { text-align: right; display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--text-muted); white-space: nowrap; }
.right b { font-size: 16px; color: var(--status-critical); font-variant-numeric: tabular-nums; }
.link { font-size: 12px; }
@media (max-width: 600px) {
  .issue { grid-template-columns: 4px minmax(0, 1fr); }
  .right { grid-column: 2; text-align: left; flex-direction: row; flex-wrap: wrap; gap: 8px; align-items: baseline; }
}
</style>
