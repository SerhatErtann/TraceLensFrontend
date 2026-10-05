<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, thresholdKey, type AppKind, type LiveRow, type LiveStats, type RequestRow, type ThresholdList } from '../api'
import { formatInt, formatMs, formatPercent } from '../format'
import KpiTile from '../components/KpiTile.vue'
import RequestsTable from '../components/RequestsTable.vue'

/**
 * Canlı: şu an gelen istekler ve görev çalışmaları. 2 sn'de bir sadece yeniler istenir (imleç), en yeni üste eklenir.
 * Veri servislerden toplu geldiği için birkaç saniye gecikmeli.
 */
const route = useRoute()
const router = useRouter()

const POLL_MS = 2000
const MAX_ROWS = 100
const FRESH_MS = 2500

// Filtreler URL'de: link paylaşılınca aynı akış açılır
const app = computed<AppKind | undefined>(() =>
  route.query.app === 'service' || route.query.app === 'scheduler' ? route.query.app : undefined)
const service = computed(() => (route.query.service as string) || undefined)
const onlySlow = ref(route.query.only === 'slow')
const onlyErrors = ref(route.query.only === 'errors')

function setQuery(patch: Record<string, string | undefined>) {
  const query: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...route.query, ...patch })) if (v) query[k] = String(v)
  router.replace({ query })
}

const services = ref<string[]>([])
const thresholds = ref<ThresholdList | null>(null)
const rows = ref<LiveRow[]>([])
const buffer = ref<LiveRow[]>([]) // duraklatılmışken gelenler
const freshIds = ref(new Set<string>())
const stats = ref<LiveStats | null>(null)
const paused = ref(false)
const error = ref<string | null>(null)
const lastUpdated = ref<Date | null>(null)

let cursor: string | null = null
let seen = new Set<string>()
let inFlight = false
let generation = 0 // filtre değişince eski yanıtlar yok sayılır

const byNewest = (a: RequestRow, b: RequestRow) => b.timestamp.localeCompare(a.timestamp)

function thresholdFor(row: RequestRow) {
  const t = thresholds.value
  const override = t?.overrides.find(o => thresholdKey(o.service, o.operation) === thresholdKey(row.service, row.operation))
  return override?.thresholdMs ?? t?.defaultMs ?? 200
}

function markFresh(ids: string[]) {
  if (!ids.length) return
  freshIds.value = new Set([...freshIds.value, ...ids])
  window.setTimeout(() => {
    const next = new Set(freshIds.value)
    ids.forEach(id => next.delete(id))
    freshIds.value = next
  }, FRESH_MS)
}

function showRows(incoming: LiveRow[], flash: boolean) {
  rows.value = [...incoming, ...rows.value].sort(byNewest).slice(0, MAX_ROWS)
  if (flash) markFresh(incoming.map(r => r.spanId))
}

async function poll() {
  if (inFlight || document.visibilityState === 'hidden') return
  inFlight = true
  const gen = generation
  const first = cursor === null
  try {
    const res = await api.live({ since: cursor, app: app.value, service: service.value, onlySlow: onlySlow.value, onlyErrors: onlyErrors.value })
    if (gen !== generation) return
    const incoming = res.items.filter(r => !seen.has(r.spanId))
    incoming.forEach(r => seen.add(r.spanId))
    cursor = res.cursor ?? cursor
    stats.value = res.stats
    if (paused.value) buffer.value = [...incoming, ...buffer.value].sort(byNewest).slice(0, MAX_ROWS)
    else showRows(incoming, !first)
    // Görülenler kümesi büyümesin: sadece ekrandakiler ve geri bakış penceresindekiler yeter
    if (seen.size > 2000) seen = new Set([...rows.value, ...buffer.value].map(r => r.spanId))
    error.value = null
    lastUpdated.value = new Date()
  } catch (e) {
    if (gen === generation) error.value = `Canlı veriler alınamadı: ${(e as Error).message}`
  } finally {
    inFlight = false
  }
}

function reset() {
  generation++
  cursor = null
  seen = new Set()
  rows.value = []
  buffer.value = []
  freshIds.value = new Set()
  inFlight = false
  poll()
}

function togglePause() {
  if (paused.value) {
    const waiting = buffer.value
    buffer.value = []
    paused.value = false
    showRows(waiting, true)
  } else {
    paused.value = true
  }
}

// Özet kutuları: sayılar son 60 sn; eşiği aşan / hatalı kutusu listeyi o filtreye çevirir
const listPath = computed(() => (app.value === 'scheduler' ? '/schedulers' : '/services'))
const errorRatio = computed(() => (stats.value?.count ? stats.value.errorCount / stats.value.count : 0))
const slowRatio = computed(() => (stats.value?.count ? stats.value.slowCount / stats.value.count : 0))

function toggleOnly(kind: 'slow' | 'errors') {
  const on = kind === 'slow' ? !onlySlow.value : !onlyErrors.value
  onlySlow.value = kind === 'slow' ? on : false
  onlyErrors.value = kind === 'errors' ? on : false
}

// Son 60 saniye çubukları
const BARS_H = 70
const maxPerSecond = computed(() => Math.max(1, ...(stats.value?.seconds.map(s => s.count) ?? [])))
const barH = (n: number) => (n / maxPerSecond.value) * BARS_H

watch([app, service, onlySlow, onlyErrors], () => {
  setQuery({ only: onlySlow.value ? 'slow' : onlyErrors.value ? 'errors' : undefined })
  reset()
})

let timer: number | undefined
const onVisible = () => { if (document.visibilityState === 'visible') poll() }
onMounted(async () => {
  poll()
  timer = window.setInterval(poll, POLL_MS)
  document.addEventListener('visibilitychange', onVisible)
  try {
    const [svc, sch, thr] = await Promise.all([api.services('service'), api.services('scheduler'), api.thresholds()])
    services.value = [...new Set([...svc, ...sch])].sort()
    thresholds.value = thr
  } catch {
    // Filtre listesi ve eşikler olmadan da akış çalışır (varsayılan eşik 200 ms)
  }
})
onUnmounted(() => {
  window.clearInterval(timer)
  document.removeEventListener('visibilitychange', onVisible)
})
</script>

<template>
  <header class="page-header">
    <div>
      <h1>Canlı</h1>
      <p class="muted sub">
        Şu an gelen istekler ve görev çalışmaları, en yeni üstte. Servisler veriyi toplu gönderdiği için birkaç saniye gecikmeli görünür.
      </p>
    </div>
    <div class="head-right">
      <span class="live-state" :class="{ paused }" role="status">
        <span class="pulse" aria-hidden="true" />
        {{ paused ? 'Duraklatıldı' : 'Canlı' }}
        <span v-if="lastUpdated" class="muted">· {{ lastUpdated.toLocaleTimeString('tr-TR') }}</span>
      </span>
      <button class="btn" type="button" @click="togglePause">
        {{ paused ? `Devam et${buffer.length ? ` (${buffer.length} yeni)` : ''}` : 'Duraklat' }}
      </button>
    </div>
  </header>

  <div class="filters">
    <select :value="app ?? ''" aria-label="Uygulama türü"
            @change="setQuery({ app: ($event.target as HTMLSelectElement).value || undefined, service: undefined })">
      <option value="">Servisler ve görevler</option>
      <option value="service">Sadece servisler</option>
      <option value="scheduler">Sadece görevler</option>
    </select>
    <select :value="service ?? ''" aria-label="Uygulama"
            @change="setQuery({ service: ($event.target as HTMLSelectElement).value || undefined })">
      <option value="">Tüm uygulamalar</option>
      <option v-for="s in services" :key="s" :value="s">{{ s }}</option>
    </select>
  </div>

  <div v-if="error" class="error-box">{{ error }}</div>

  <div v-if="stats" class="tiles">
    <KpiTile label="İstek / sn" :value="stats.requestsPerSecond.toLocaleString('tr-TR')"
             :sub="`son 1 dk: ${formatInt(stats.count)}`" hint="İstekleri listele"
             @go="router.push({ path: listPath, query: { range: '15m', sort: 'time', service }, hash: '#istekler' })" />
    <KpiTile label="Ortalama süre · son 1 dk" :value="formatMs(stats.avgMs)" :sub="`p95 ${formatMs(stats.p95Ms)}`"
             hint="Süre grafiğini aç" @go="router.push({ path: listPath, query: { range: '15m', service }, hash: '#grafik' })" />
    <KpiTile label="Eşiği aşan · son 1 dk" :value="formatInt(stats.slowCount)" :sub="`oran ${formatPercent(slowRatio)}`"
             :hint="onlySlow ? 'Tüm istekleri göster' : 'Sadece eşiği aşanları göster'" @go="toggleOnly('slow')" />
    <KpiTile label="Hatalı · son 1 dk" :value="formatInt(stats.errorCount)"
             :sub="stats.topErrorService ? `${stats.topErrorService}: ${formatInt(stats.topErrorServiceCount)}` : 'hata yok'"
             :bad="errorRatio >= 0.05" :hint="onlyErrors ? 'Tüm istekleri göster' : 'Sadece hatalıları göster'" @go="toggleOnly('errors')" />
  </div>

  <section v-if="stats" class="card section">
    <div class="card-header">
      <h2>Son {{ stats.windowSeconds }} saniye</h2>
      <span class="muted small">saniye başına istek · son {{ stats.lagSeconds }} sn henüz gelmediği için gösterilmez</span>
    </div>
    <div class="bars-wrap">
      <svg class="bars" :viewBox="`0 0 ${stats.seconds.length * 10} ${BARS_H}`" preserveAspectRatio="none" role="img"
           :aria-label="`Son ${stats.windowSeconds} saniyede ${formatInt(stats.count)} istek, ${formatInt(stats.errorCount)} hatalı`">
        <g v-for="(s, i) in stats.seconds" :key="s.time">
          <title>{{ new Date(s.time).toLocaleTimeString('tr-TR') }}: {{ s.count }} istek, {{ s.slowCount }} eşiği aşan, {{ s.errorCount }} hatalı</title>
          <rect class="bar" :x="i * 10 + 1" :y="BARS_H - barH(s.count)" width="8" :height="barH(s.count)" />
          <rect v-if="s.slowCount" class="bar slow" :x="i * 10 + 1" :y="BARS_H - barH(s.slowCount + s.errorCount)" width="8" :height="barH(s.slowCount)" />
          <rect v-if="s.errorCount" class="bar error" :x="i * 10 + 1" :y="BARS_H - barH(s.errorCount)" width="8" :height="barH(s.errorCount)" />
        </g>
      </svg>
      <div class="axis"><span>{{ stats.windowSeconds }} sn önce</span><span>en çok {{ formatInt(maxPerSecond) }}/sn</span><span>{{ stats.lagSeconds }} sn önce</span></div>
      <div class="legend">
        <span><i class="sw" />İstek</span>
        <span><i class="sw slow" />Eşiği aşan</span>
        <span><i class="sw error" />Hatalı</span>
      </div>
    </div>
  </section>

  <section class="card section">
    <div class="card-header">
      <h2>Gelen istekler <span class="muted count">{{ formatInt(rows.length) }}</span></h2>
      <div class="list-controls">
        <label><input v-model="onlySlow" type="checkbox" /> Sadece eşiği aşanlar</label>
        <label><input v-model="onlyErrors" type="checkbox" /> Sadece hatalılar</label>
      </div>
    </div>
    <p class="muted small hint">En yeni üstte, en fazla {{ MAX_ROWS }} satır · satıra tıklayınca trace açılır{{ paused ? ' · duraklatıldı, yeni gelenler bekliyor' : '' }}</p>
    <RequestsTable :rows="rows" app="service" service-label="Uygulama" :threshold-for="thresholdFor" :fresh-ids="freshIds" />
  </section>
</template>

<style scoped>
.page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
.sub { margin: 2px 0 0; max-width: 680px; }
.head-right { display: flex; align-items: center; gap: 12px; }
.small { font-size: 12px; }
.count { font-weight: 400; font-size: 13px; margin-left: 6px; }
.filters { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 16px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
.section { margin-top: 16px; scroll-margin-top: 16px; }
.hint { margin: 0; padding: 0 16px 8px; }

.live-state { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; }
.pulse { width: 10px; height: 10px; border-radius: 50%; background: var(--status-good); animation: pulse 1.4s infinite; }
.live-state.paused .pulse { background: var(--text-muted); animation: none; }
@keyframes pulse {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--status-good) 45%, transparent); }
  70% { box-shadow: 0 0 0 8px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}
@media (prefers-reduced-motion: reduce) { .pulse { animation: none; } }

.bars-wrap { padding: 0 16px 14px; }
.bars { display: block; width: 100%; height: 70px; }
.bar { fill: var(--accent); opacity: 0.3; }
.bar.slow { fill: var(--status-serious); opacity: 1; }
.bar.error { fill: var(--status-critical); opacity: 1; }
.axis { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); margin-top: 4px; font-variant-numeric: tabular-nums; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 6px; font-size: 12px; color: var(--text-secondary); }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.sw { width: 10px; height: 10px; border-radius: 2px; display: inline-block; background: var(--accent); opacity: 0.3; }
.sw.slow { background: var(--status-serious); opacity: 1; }
.sw.error { background: var(--status-critical); opacity: 1; }
</style>
