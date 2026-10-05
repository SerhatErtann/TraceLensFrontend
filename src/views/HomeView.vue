<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, type Overview, type RankedOperation, type ServiceCard } from '../api'
import { formatDateTime, formatInt, formatMs, formatPercent } from '../format'
import { RANGES, rangeLabel } from '../ranges'
import KpiTile from '../components/KpiTile.vue'
import LatencyChart from '../components/LatencyChart.vue'
import TrendSpark from '../components/TrendSpark.vue'

const route = useRoute()
const router = useRouter()

const range = computed(() => (route.query.range as string) || '1h')
const data = ref<Overview | null>(null)
const error = ref<string | null>(null)
const loading = ref(false)
const lastLoaded = ref<Date | null>(null)

// Her bölümde en fazla bu kadar kart; tamamı için "Tümünü gör" ilgili sayfaya götürür (liste zaten önce sorunlular sıralı)
const CARD_LIMIT = 5

// İstek listesindeki gibi iki onay kutusu; ikisi birden işaretliyse ikisini de sağlayanlar kalır.
// "Eşiği aşan": en az bir endpoint/görevi eşiğini aşıyor; "Hatalı": hata oranı %5 ve üstü
type CardFilter = { onlySlow: boolean; onlyErrors: boolean }
const isSlowCard = (s: ServiceCard) => s.slowOperationCount > 0
const isErrorCard = (s: ServiceCard) => s.status === 'error'
const matches = (s: ServiceCard, f: CardFilter) => (!f.onlySlow || isSlowCard(s)) && (!f.onlyErrors || isErrorCard(s))

const cardFilter = ref<Record<string, CardFilter>>({
  servisler: { onlySlow: false, onlyErrors: false },
  gorevler: { onlySlow: false, onlyErrors: false }
})

const groups = computed(() => {
  const all = data.value?.services ?? []
  return [
    { id: 'servisler', title: 'Servisler', path: '/services', noun: 'servis', items: all.filter(s => s.app === 'Service') },
    { id: 'gorevler', title: 'Görevler', path: '/schedulers', noun: 'görev uygulaması', items: all.filter(s => s.app === 'Scheduler') }
  ].map(g => {
    const filter = cardFilter.value[g.id]
    const filtered = g.items.filter(s => matches(s, filter))
    return {
      ...g,
      filter,
      total: g.items.length,
      slowCount: g.items.filter(isSlowCard).length,
      errorCount: g.items.filter(isErrorCard).length,
      shown: filtered.slice(0, CARD_LIMIT),
      hidden: Math.max(0, filtered.length - CARD_LIMIT)
    }
  })
})

function emptyText(noun: string, f: CardFilter) {
  if (f.onlySlow && f.onlyErrors) return `Hem eşiği aşan hem hatalı ${noun} yok`
  if (f.onlySlow) return `Eşiği aşan ${noun} yok`
  if (f.onlyErrors) return `Hatalı ${noun} yok`
  return 'Bu aralıkta veri yok'
}

const statusLabel: Record<ServiceCard['status'], string> = { ok: 'Normal', slow: 'Yavaş', error: 'Hatalı' }

async function load() {
  loading.value = true
  try {
    data.value = await api.overview(range.value)
    error.value = null
    lastLoaded.value = new Date()
  } catch (e) {
    error.value = `Veriler alınamadı: ${(e as Error).message}`
  } finally {
    loading.value = false
  }
}

const setRange = (r: string) => router.replace({ query: { ...route.query, range: r } })

function openService(s: ServiceCard) {
  router.push({ path: s.app === 'Service' ? '/services' : '/schedulers', query: { range: range.value, service: s.service } })
}

// Listedeki bir endpoint/job'a tıklanınca o operasyona filtrelenmiş sayfa açılır
function openOperation(o: RankedOperation) {
  router.push({
    path: o.app === 'Service' ? '/services' : '/schedulers',
    query: { range: range.value, service: o.service, operation: o.operation }
  })
}

// "En yavaş" listesindeki çubuk: ortalamanın eşiğe oranı (eşiği aşınca kırmızı)
const thresholdShare = (o: RankedOperation) => Math.min(100, (o.avgMs / o.thresholdMs) * 100)

// Services sayfasının istek listesine, istenen sıralama/filtreyle ve doğrudan listeye inerek gider
function openRequests(options: { sort?: 'time'; only?: 'slow' | 'errors' }) {
  router.push({ path: '/services', query: { range: range.value, ...options }, hash: '#istekler' })
}

function scrollTo(id: string) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}

watch(range, load)
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
      <h1>Genel Bakış</h1>
      <p class="muted sub">Tüm servisler ve zamanlanmış görevler. Bir karta tıklayınca o uygulamanın endpoint'leri ve istekleri açılır.</p>
    </div>
    <div class="head-right">
      <div class="segmented" role="group" aria-label="Zaman aralığı">
        <button v-for="r in RANGES" :key="r.value" :class="{ active: range === r.value }" @click="setRange(r.value)">{{ r.label }}</button>
      </div>
      <span v-if="lastLoaded" class="muted small">{{ lastLoaded.toLocaleTimeString('tr-TR') }}</span>
    </div>
  </header>

  <div v-if="error" class="error-box">{{ error }}</div>

  <template v-if="data">
    <div class="tiles">
      <KpiTile label="Uygulama" :value="formatInt(data.totals.serviceCount + data.totals.schedulerCount)"
               :sub="`${data.totals.serviceCount} servis · ${data.totals.schedulerCount} görev`"
               hint="Uygulamaları gör" @go="scrollTo('servisler')" />
      <KpiTile label="Toplam istek" :value="formatInt(data.totals.requestCount)"
               :sub="`saniyede ort. ${data.totals.requestsPerSecond.toLocaleString('tr-TR')}`" hint="İstekleri listele"
               @go="openRequests({ sort: 'time' })" />
      <KpiTile label="Ortalama süre" :value="formatMs(data.totals.avgMs)" :sub="`p95 ${formatMs(data.totals.p95Ms)}`"
               hint="Süre grafiğini aç" @go="router.push({ path: '/services', query: { range }, hash: '#grafik' })" />
      <KpiTile label="Eşiği aşan" :value="formatInt(data.totals.slowCount)" :sub="`oran ${formatPercent(data.totals.slowRate)}`"
               hint="Eşiği aşanları listele" @go="openRequests({ only: 'slow' })" />
      <KpiTile label="Hatalı" :value="formatInt(data.totals.errorCount)" :sub="`oran ${formatPercent(data.totals.errorRate)}`"
               :bad="data.totals.errorRate >= 0.05" hint="Hatalıları listele" @go="openRequests({ only: 'errors' })" />
      <KpiTile label="Açık alarm" :value="formatInt(data.totals.activeAlertCount)"
               :sub="data.totals.activeAlertCount ? 'müdahale bekliyor' : 'her şey normal'"
               :bad="data.totals.activeAlertCount > 0" hint="Alarmları gör" @go="router.push('/alerts')" />
    </div>

    <section v-for="group in groups" :id="group.id" :key="group.id" class="card section">
      <div class="card-head">
        <h2>{{ group.title }} <span class="muted count">{{ group.total }}</span></h2>
        <div class="head-tools">
          <label class="check">
            <input v-model="cardFilter[group.id].onlySlow" type="checkbox" />
            Sadece eşiği aşanlar <span class="n">{{ group.slowCount }}</span>
          </label>
          <label class="check">
            <input v-model="cardFilter[group.id].onlyErrors" type="checkbox" />
            Sadece hatalılar <span class="n">{{ group.errorCount }}</span>
          </label>
          <RouterLink :to="{ path: group.path, query: { range } }" class="small more">
            Tümünü gör ({{ group.total }}) →
          </RouterLink>
        </div>
      </div>
      <div v-if="group.shown.length" class="grid">
        <button v-for="s in group.shown" :key="s.service" class="svc" type="button" @click="openService(s)"
                :aria-label="`${s.service}: ${statusLabel[s.status]}, detayına git`">
          <span class="stripe" :class="s.status" />
          <span class="top">
            <span class="name mono">{{ s.service }}</span>
            <span class="status" :class="s.status">{{ statusLabel[s.status] }}</span>
          </span>
          <TrendSpark :values="s.trend" :threshold-ms="s.thresholdMs" :from="data.from"
                      :bucket-seconds="data.trendBucketSeconds" :range-label="rangeLabel(range)" />
          <span class="stats">
            <span><b>{{ formatMs(s.avgMs) }}</b><small>ortalama</small></span>
            <span><b>{{ formatMs(s.p95Ms) }}</b><small>p95</small></span>
            <span><b :class="{ over: s.errorRate >= 0.05 }">{{ formatPercent(s.errorRate) }}</b><small>hata</small></span>
          </span>
          <span v-if="s.slowestOperation" class="slowest">
            <small>En yavaş</small>
            <span class="mono slowest-op" :title="s.slowestOperation">{{ s.slowestOperation }}</span>
            <b :class="{ over: (s.slowestOperationAvgMs ?? 0) > (s.slowestOperationThresholdMs ?? Infinity) }">
              {{ formatMs(s.slowestOperationAvgMs ?? 0) }}
            </b>
          </span>
          <span class="foot">
            {{ formatInt(s.count) }} {{ s.app === 'Service' ? 'istek' : 'çalışma' }} ·
            <span v-if="s.slowOperationCount" class="over">{{ s.slowOperationCount }} eşiği aşan</span>
            <span v-else>eşik aşımı yok</span>
          </span>
        </button>
      </div>
      <div v-else class="empty">{{ emptyText(group.noun, group.filter) }}</div>
      <RouterLink v-if="group.hidden" :to="{ path: group.path, query: { range } }" class="hidden-note small">
        +{{ group.hidden }} {{ group.noun }} daha · Tümünü gör →
      </RouterLink>
    </section>

    <!-- Tüm uygulamaların süre seyri -->
    <section id="sure" class="card section">
      <div class="card-head">
        <h2>Yanıt süresi · tüm uygulamalar</h2>
        <RouterLink :to="{ path: '/services', query: { range } }" class="small">Servis bazında incele →</RouterLink>
      </div>
      <LatencyChart :buckets="data.timeline" :threshold-ms="data.timelineThresholdMs" />
    </section>

    <div class="pair section">
      <section class="card">
        <div class="card-head">
          <h2>En yavaş endpoint ve görevler</h2>
          <span class="muted small">ortalama süre · çubuk: eşiğe oranı</span>
        </div>
        <table v-if="data.slowestOperations.length" class="data">
          <tbody>
            <tr v-for="o in data.slowestOperations" :key="o.app + o.service + o.operation" class="clickable" @click="openOperation(o)">
              <td class="op-cell">
                <div class="mono op" :title="o.operation">{{ o.operation }}</div>
                <div class="muted tiny">{{ o.service }}{{ o.app === 'Scheduler' ? ' · görev' : '' }} · {{ formatInt(o.count) }} {{ o.app === 'Service' ? 'istek' : 'çalışma' }}</div>
              </td>
              <td class="bar-cell">
                <div class="bar" :title="`Eşik ${formatMs(o.thresholdMs)}`">
                  <i :class="{ over: o.avgMs > o.thresholdMs }" :style="{ width: `${Math.max(thresholdShare(o), 2)}%` }" />
                </div>
                <div class="muted tiny">eşik {{ formatMs(o.thresholdMs) }}</div>
              </td>
              <td class="num" :class="{ over: o.avgMs > o.thresholdMs }">{{ formatMs(o.avgMs) }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty">Bu aralıkta veri yok</div>
      </section>

      <section class="card">
        <div class="card-head">
          <h2>En çok hata verenler</h2>
          <span class="muted small">hatalı istek sayısı</span>
        </div>
        <table v-if="data.mostErrors.length" class="data">
          <tbody>
            <tr v-for="o in data.mostErrors" :key="o.app + o.service + o.operation" class="clickable" @click="openOperation(o)">
              <td class="op-cell">
                <div class="mono op" :title="o.operation">{{ o.operation }}</div>
                <div class="muted tiny">{{ o.service }}{{ o.app === 'Scheduler' ? ' · görev' : '' }}</div>
              </td>
              <td class="num">
                <b>{{ formatInt(o.errorCount) }}</b>
                <div class="tiny" :class="o.errorRate >= 0.05 ? 'over' : 'muted'">oran {{ formatPercent(o.errorRate) }}</div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty">Bu aralıkta hata yok</div>
      </section>
    </div>

    <section class="card section">
      <div class="card-head">
        <h2>Son hatalar</h2>
        <RouterLink :to="{ path: '/services', query: { range, only: 'errors', sort: 'time' }, hash: '#istekler' }" class="small">
          Tüm hatalı istekler →
        </RouterLink>
      </div>
      <div v-if="data.recentErrors.length" class="table-wrap">
      <table class="data recent">
        <thead>
          <tr><th>Zaman</th><th>Uygulama</th><th>Operasyon</th><th>Hata</th><th class="num">Süre</th></tr>
        </thead>
        <tbody>
          <tr v-for="e in data.recentErrors" :key="e.traceId + e.timestamp" class="clickable" @click="router.push(`/traces/${e.traceId}`)">
            <td class="nowrap secondary">{{ formatDateTime(e.timestamp) }}</td>
            <td class="secondary">{{ e.service }}</td>
            <td class="mono op">{{ e.operation }}</td>
            <td><span class="err-text" :title="e.error">⚠ {{ e.error }}</span></td>
            <td class="num">{{ formatMs(e.durationMs) }}</td>
          </tr>
        </tbody>
      </table>
      </div>
      <div v-else class="empty">Bu aralıkta hatalı istek yok</div>
    </section>
  </template>
  <div v-else-if="!error" class="empty">Yükleniyor…</div>
</template>

<style scoped>
.page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
.sub { margin: 2px 0 0; }
.head-right { display: flex; align-items: center; gap: 10px; }
.small { font-size: 12px; }
.count { font-weight: 400; font-size: 13px; margin-left: 6px; }
.segmented { display: inline-flex; border: 1px solid var(--border-strong); border-radius: 6px; overflow: hidden; background: var(--surface-1); }
.segmented button { border: none; background: transparent; padding: 5px 12px; cursor: pointer; border-right: 1px solid var(--border); }
.segmented button:last-child { border-right: none; }
.segmented button.active { background: var(--accent); color: #fff; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
.section { margin-top: 16px; scroll-margin-top: 16px; }
.more { font-weight: 600; white-space: nowrap; }
.head-tools { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; justify-content: flex-end; }
/* İstek listesindeki "Sadece eşiği aşanlar / Sadece hatalılar" kutularıyla aynı görünüm */
.check { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; cursor: pointer; white-space: nowrap; }
.check .n { font-size: 11.5px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.hidden-note { display: block; padding: 0 16px 14px; }
.pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 16px; }
.pair > .card { min-width: 0; }
.tiny { font-size: 11.5px; }
.nowrap { white-space: nowrap; }
.op-cell { min-width: 0; max-width: 0; width: 60%; }
.op { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-cell { width: 30%; min-width: 90px; }
.bar { height: 8px; border-radius: 4px; background: var(--surface-2); overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: 4px; background: var(--accent); }
.bar i.over { background: var(--status-critical); }
.err-text { color: var(--status-critical); font-weight: 500; display: inline-block; max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom; }
.recent .op { max-width: 320px; }
.slowest { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 6px; align-items: baseline; font-size: 12px; padding-top: 6px; border-top: 1px solid var(--border); }
.slowest small { color: var(--text-muted); font-size: 11px; }
.slowest-op { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11.5px; }
.slowest b { font-variant-numeric: tabular-nums; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 12px; padding: 0 16px 16px; }
.svc {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 14px 12px 18px;
  text-align: left;
  font: inherit;
  color: inherit;
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
}
.svc:hover { border-color: var(--border-strong); background: var(--surface-2); }
.stripe { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; }
.stripe.ok { background: var(--status-good); }
.stripe.slow { background: var(--status-serious); }
.stripe.error { background: var(--status-critical); }
.top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.status::before { content: ''; width: 9px; height: 9px; border-radius: 50%; }
.status.ok::before { background: var(--status-good); }
.status.slow::before { background: var(--status-serious); }
.status.error::before { background: var(--status-critical); }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.stats > span { display: flex; flex-direction: column; }
.stats b { font-size: 15px; font-variant-numeric: tabular-nums; }
.stats small { font-size: 11px; color: var(--text-muted); }
.foot { font-size: 12px; color: var(--text-secondary); }
.over { color: var(--status-critical); font-weight: 600; }
</style>
