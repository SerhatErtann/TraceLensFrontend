<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, type Overview, type ServiceCard } from '../api'
import { formatInt, formatMs, formatPercent } from '../format'
import { RANGES, rangeLabel } from '../ranges'
import KpiTile from '../components/KpiTile.vue'
import TrendSpark from '../components/TrendSpark.vue'

const route = useRoute()
const router = useRouter()

const range = computed(() => (route.query.range as string) || '1h')
const data = ref<Overview | null>(null)
const error = ref<string | null>(null)
const loading = ref(false)
const lastLoaded = ref<Date | null>(null)

const services = computed(() => data.value?.services.filter(s => s.app === 'Service') ?? [])
const schedulers = computed(() => data.value?.services.filter(s => s.app === 'Scheduler') ?? [])

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
      <p class="muted sub">Tüm servisler ve scheduler'lar. Bir karta tıklayınca o servisin endpoint'leri ve istekleri açılır.</p>
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
      <KpiTile label="Servis" :value="`${data.totals.serviceCount} + ${data.totals.schedulerCount}`" sub="servis + scheduler"
               hint="Servisleri gör" @go="scrollTo('servisler')" />
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

    <section v-for="group in [{ id: 'servisler', title: 'Servisler', list: services }, { id: 'schedulerlar', title: `Scheduler'lar`, list: schedulers }]"
             :id="group.id" :key="group.id" class="card section">
      <div class="card-head">
        <h2>{{ group.title }} <span class="muted count">{{ group.list.length }}</span></h2>
        <span class="muted small">Önce sorunlu olanlar</span>
      </div>
      <div v-if="group.list.length" class="grid">
        <button v-for="s in group.list" :key="s.service" class="svc" type="button" @click="openService(s)"
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
          <span class="foot">
            {{ formatInt(s.count) }} {{ s.app === 'Service' ? 'istek' : 'çalışma' }} ·
            <span v-if="s.slowOperationCount" class="over">{{ s.slowOperationCount }} eşiği aşan</span>
            <span v-else>eşik aşımı yok</span>
          </span>
        </button>
      </div>
      <div v-else class="empty">Bu aralıkta veri yok</div>
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
