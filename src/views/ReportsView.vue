<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, type Report, type ReportOperation, type ReportPeriod, type TimeBucket } from '../api'
import { compare, formatInt, formatMs, formatPercent, type Delta } from '../format'
import { shiftBuckets } from '../ranges'
import { changedOperations, formatMinutes, reportInsights } from '../insights'
import KpiTile from '../components/KpiTile.vue'
import LatencyChart from '../components/LatencyChart.vue'
import InsightList from '../components/InsightList.vue'

/**
 * Raporlar: seçilen dönemin özeti ve hemen önceki eşit dönemle karşılaştırma. Günlük özet tablosundan gelir
 * (90 gün saklanır); tek günlük raporda saat saat grafik ham veriden çizilir (son 7 gün).
 */
const route = useRoute()
const router = useRouter()

const PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: 'today', label: 'Bugün' },
  { value: 'yesterday', label: 'Dün' },
  { value: '7d', label: 'Son 7 gün' },
  { value: '30d', label: 'Son 30 gün' }
]
const DAY_MS = 86_400_000

const period = computed<ReportPeriod>(() => {
  const p = route.query.period as ReportPeriod
  return p === 'custom' && route.query.from && route.query.to ? 'custom' : PERIODS.some(x => x.value === p) ? p : '7d'
})

const report = ref<Report | null>(null)
const hourly = ref<TimeBucket[]>([])
const previousHourly = ref<TimeBucket[]>([])
const defaultThresholdMs = ref(200)
const error = ref<string | null>(null)
const loading = ref(false)

// "2026-10-05" → "05.10.2026" / kısa "05.10"
const day = (s: string, short = false) => {
  const [y, m, d] = s.split('-')
  return short ? `${d}.${m}` : `${d}.${m}.${y}`
}
const dayCount = computed(() => (report.value ? Math.round((Date.parse(report.value.to) - Date.parse(report.value.from)) / DAY_MS) + 1 : 1))
const oneDay = computed(() => dayCount.value === 1)

// Başlıkta ve cümlelerde dönemin adı
const periodText = computed(() => {
  const r = report.value
  if (!r) return ''
  if (r.period === 'today') return 'Bugün (şu ana kadar)'
  if (r.period === 'yesterday') return `Dün (${day(r.from)})`
  const name = r.period === '7d' ? 'Son 7 gün' : r.period === '30d' ? 'Son 30 gün' : ''
  return `${name ? `${name} ` : ''}${name ? '(' : ''}${day(r.from, true)} – ${day(r.to, true)}${r.includesToday ? ', bugün dahil' : ''}${name ? ')' : ''}`
})
const previousText = computed(() => {
  const r = report.value
  if (!r) return ''
  return r.from === r.to ? day(r.previousFrom) : `${day(r.previousFrom, true)} – ${day(r.previousTo, true)}`
})
const hasPrevious = computed(() => (report.value?.previousTotals.requestCount ?? 0) > 0)

const insights = computed(() => (report.value ? reportInsights(report.value, periodText.value) : []))

// Kutularda önceki döneme göre değişim; bugün sürüyorsa istek sayısı karşılaştırılmaz
const deltas = computed(() => {
  const r = report.value
  if (!r || !hasPrevious.value) return {} as Record<string, Delta | null>
  const t = r.totals
  const p = r.previousTotals
  return {
    count: r.includesToday ? { text: 'bugün henüz bitmedi', tone: 'neutral' as const } : compare(t.requestCount, p.requestCount, formatInt(p.requestCount), null),
    avg: compare(t.avgMs, p.avgMs, formatMs(p.avgMs), true),
    p95: compare(t.p95Ms, p.p95Ms, formatMs(p.p95Ms), true),
    slow: compare(t.slowRate, p.slowRate, `oran ${formatPercent(p.slowRate)}`, true),
    errors: compare(t.errorRate, p.errorRate, `oran ${formatPercent(p.errorRate)}`, true)
  } as Record<string, Delta | null>
})

// Grafik: tek günse saat saat (ham veri), değilse gün gün (özet tablo); önceki dönem kesikli
const chartBuckets = computed(() => (oneDay.value ? hourly.value : report.value?.daily ?? []))
const chartPrevious = computed(() =>
  oneDay.value ? shiftBuckets(previousHourly.value, DAY_MS) : shiftBuckets(report.value?.previousDaily ?? [], dayCount.value * DAY_MS))

const changed = computed(() => changedOperations(report.value?.operations ?? []))
const topErrors = computed(() => [...(report.value?.operations ?? [])].filter(o => o.errorCount > 0).sort((a, b) => b.errorCount - a.errorCount).slice(0, 5))
const slowest = computed(() => [...(report.value?.operations ?? [])].sort((a, b) => b.avgMs - a.avgMs).slice(0, 10))
const allOps = computed(() => [...(report.value?.operations ?? [])].sort((a, b) => b.count - a.count))
const thresholdShare = (o: ReportOperation) => Math.min(100, (o.avgMs / o.thresholdMs) * 100)
const pctChange = (now: number, prev: number) => `%${Math.round(Math.abs((now - prev) / prev) * 100)}`
const opLink = (o: ReportOperation) => ({ path: `/${o.app === 'Service' ? 'services' : 'schedulers'}/${encodeURIComponent(o.service)}` })

async function load() {
  loading.value = true
  try {
    const q = route.query
    const r = await api.report(period.value, period.value === 'custom' ? q.from as string : undefined, period.value === 'custom' ? q.to as string : undefined)
    report.value = r
    hourly.value = []
    previousHourly.value = []
    // Tek günlük raporda saat saat grafik: ham veriden (son 7 gün); önceki gün aynı saat aralığı
    if (r.from === r.to && Date.now() - Date.parse(r.fromUtc) < 7 * DAY_MS) {
      const end = Math.min(Date.parse(r.toUtc), Date.now())
      const length = end - Date.parse(r.fromUtc)
      const [cur, prev] = await Promise.all([
        api.overview({ range: 'custom', from: r.fromUtc, to: new Date(end).toISOString() }),
        api.overview({ range: 'custom', from: r.previousFromUtc, to: new Date(Date.parse(r.previousFromUtc) + length).toISOString() })
      ])
      hourly.value = cur.timeline
      previousHourly.value = prev.timeline
      defaultThresholdMs.value = cur.timelineThresholdMs
    }
    error.value = null
  } catch (e) {
    error.value = `Rapor alınamadı: ${(e as Error).message}`
  } finally {
    loading.value = false
  }
}

const setPeriod = (p: ReportPeriod) => router.replace({ query: { period: p } })

// Özel dönem: gün seçimi
const customOpen = ref(false)
const customFrom = ref('')
const customTo = ref('')
const todayIso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
function openCustom() {
  customFrom.value = (route.query.from as string) || report.value?.from || todayIso()
  customTo.value = (route.query.to as string) || report.value?.to || todayIso()
  customOpen.value = true
}
function applyCustom() {
  if (!customFrom.value || !customTo.value || customTo.value < customFrom.value) return
  router.replace({ query: { period: 'custom', from: customFrom.value, to: customTo.value } })
  customOpen.value = false
}

// Tarayıcının yazdır penceresi: "PDF olarak kaydet" ile PDF alınır (menü ve butonlar yazdırılmaz)
const printPage = () => window.print()

function scrollTo(id: string) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}

// Excel'de açılır: Türkçe Excel için ; ayraç ve BOM
function downloadCsv() {
  const r = report.value
  if (!r) return
  const header = ['Tür', 'Uygulama', 'Operasyon', 'İstek', 'Ortalama (ms)', 'Önceki ortalama (ms)', 'p95 (ms)', 'Eşik (ms)', 'Eşiği aşan (yaklaşık)', 'Hata', 'Hata oranı (%)']
  const num = (v: number | null) => (v === null ? '' : String(Math.round(v * 100) / 100).replace('.', ','))
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`
  const rows = allOps.value.map(o => [
    o.app === 'Service' ? 'Servis' : 'Görev', cell(o.service), cell(o.operation), o.count, num(o.avgMs), num(o.previousAvgMs),
    num(o.p95Ms), num(o.thresholdMs), o.slowCount, o.errorCount, num(o.errorRate * 100)
  ].join(';'))
  const blob = new Blob(['﻿' + [header.join(';'), ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `tracelens-rapor-${r.from}_${r.to}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

watch(() => route.query, load, { deep: true })
onMounted(async () => {
  load()
  try { defaultThresholdMs.value = (await api.thresholds()).defaultMs } catch { /* varsayılan 200 ms */ }
})
</script>

<template>
  <header class="page-header">
    <div>
      <h1>Raporlar</h1>
      <p class="muted sub">
        Seçilen dönemin özeti ve hemen önceki eşit uzunluktaki dönemle karşılaştırma. Günler Türkiye saatine göre;
        rapor özetleri 90 gün saklanır.
      </p>
    </div>
    <div class="head-right no-print">
      <div class="period-picker">
        <div class="segmented" role="group" aria-label="Rapor dönemi">
          <button v-for="p in PERIODS" :key="p.value" type="button" :class="{ active: period === p.value }" @click="setPeriod(p.value)">{{ p.label }}</button>
          <button type="button" :class="{ active: period === 'custom' }" :aria-expanded="customOpen" @click="customOpen ? (customOpen = false) : openCustom()">
            {{ period === 'custom' && report ? `${day(report.from, true)} – ${day(report.to, true)}` : 'Özel' }}
          </button>
        </div>
        <form v-if="customOpen" class="card panel" @submit.prevent="applyCustom">
          <label>İlk gün <input v-model="customFrom" type="date" :min="report?.dataSince ?? undefined" :max="todayIso()" required /></label>
          <label>Son gün <input v-model="customTo" type="date" :min="customFrom" :max="todayIso()" required /></label>
          <div class="actions">
            <button class="btn primary" type="submit">Uygula</button>
            <button class="btn" type="button" @click="customOpen = false">Vazgeç</button>
          </div>
          <p class="muted note">En fazla 90 gün. Önceki dönem, seçtiğiniz gün sayısı kadar hemen öncesi olur.</p>
        </form>
      </div>
      <button class="btn" type="button" :disabled="!report" @click="downloadCsv">CSV indir</button>
      <button class="btn" type="button" @click="printPage">Yazdır / PDF</button>
    </div>
  </header>

  <div v-if="error" class="error-box">{{ error }}</div>
  <div v-if="!report" class="empty">{{ loading ? 'Yükleniyor…' : '' }}</div>

  <template v-else>
    <p class="period-line">
      <b>{{ periodText }}</b>
      <span class="muted"> · karşılaştırılan dönem: {{ previousText }}{{ hasPrevious ? '' : ' (veri yok)' }}</span>
    </p>
    <p v-if="!hasPrevious && report.dataSince" class="note-box">
      Önceki dönemde veri yok, bu yüzden karşılaştırma yapılamıyor. Rapor özetleri şu tarihten beri tutuluyor: {{ day(report.dataSince) }}.
    </p>

    <InsightList :items="insights" />

    <template v-if="report.totals.requestCount">
      <div class="tiles">
        <KpiTile label="Toplam istek ve çalışma" :value="formatInt(report.totals.requestCount)"
                 :sub="`${report.totals.dayCount} gün veri`" :delta="deltas.count" hint="Gün gün grafiğe in" @go="scrollTo('grafik')" />
        <KpiTile label="Ortalama süre" :value="formatMs(report.totals.avgMs)" :sub="`yarısı ${formatMs(report.totals.p50Ms)} içinde bitiyor`"
                 :delta="deltas.avg" hint="Yavaşlayanlara in" @go="scrollTo('degisenler')" />
        <KpiTile label="p95 · en yavaş %5" :value="formatMs(report.totals.p95Ms)" sub="en yavaş yüzde beşin başladığı süre"
                 :delta="deltas.p95" hint="En yavaşlara in" @go="scrollTo('en-yavaslar')" />
        <KpiTile label="Eşiği aşan (yaklaşık)" :value="formatInt(report.totals.slowCount)" :sub="`oran ${formatPercent(report.totals.slowRate)}`"
                 :delta="deltas.slow" hint="Tüm listeye in" @go="scrollTo('tumu')" />
        <KpiTile label="Hatalı" :value="formatInt(report.totals.errorCount)" :sub="`oran ${formatPercent(report.totals.errorRate)}`"
                 :bad="report.totals.errorRate >= 0.05" :delta="deltas.errors" hint="Hata verenlere in" @go="scrollTo('hatalar')" />
        <KpiTile label="Alarm" :value="formatInt(report.alerts.count)"
                 :sub="report.alerts.count ? `toplam ${formatMinutes(report.alerts.totalMinutes)} açık kaldı` : 'hiç alarm açılmadı'"
                 :bad="report.alerts.count > 0" hint="Alarmlara in" @go="scrollTo('alarmlar')" />
      </div>

      <section id="grafik" class="card section">
        <div class="card-header">
          <h2>{{ oneDay ? 'Saat saat' : 'Gün gün' }}</h2>
          <span class="muted small">kesikli çizgi: önceki dönem ({{ previousText }})</span>
        </div>
        <LatencyChart :buckets="chartBuckets" :threshold-ms="defaultThresholdMs" :previous="chartPrevious" />
      </section>

      <div id="degisenler" class="pair section">
        <section class="card">
          <div class="card-header">
            <h2>Yavaşlayanlar</h2>
            <span class="muted small">ortalaması en az %10 artanlar</span>
          </div>
          <div v-if="changed.slower.length" class="table-wrap"><table class="data">
            <thead><tr><th>Operasyon</th><th class="num">Önce</th><th class="num">Şimdi</th><th class="num">Değişim</th></tr></thead>
            <tbody>
              <tr v-for="o in changed.slower.slice(0, 8)" :key="o.app + o.service + o.operation" class="clickable" @click="router.push(opLink(o))">
                <td><div class="mono op">{{ o.operation }}</div><div class="muted tiny">{{ o.service }}</div></td>
                <td class="num muted">{{ formatMs(o.previousAvgMs!) }}</td>
                <td class="num">{{ formatMs(o.avgMs) }}</td>
                <td class="num up">▲ {{ pctChange(o.avgMs, o.previousAvgMs!) }}</td>
              </tr>
            </tbody>
          </table></div>
          <div v-else class="empty">{{ hasPrevious ? 'Belirgin yavaşlayan yok' : 'Önceki dönemde veri yok' }}</div>
        </section>
        <section class="card">
          <div class="card-header">
            <h2>Hızlananlar</h2>
            <span class="muted small">ortalaması en az %10 düşenler</span>
          </div>
          <div v-if="changed.faster.length" class="table-wrap"><table class="data">
            <thead><tr><th>Operasyon</th><th class="num">Önce</th><th class="num">Şimdi</th><th class="num">Değişim</th></tr></thead>
            <tbody>
              <tr v-for="o in changed.faster.slice(0, 8)" :key="o.app + o.service + o.operation" class="clickable" @click="router.push(opLink(o))">
                <td><div class="mono op">{{ o.operation }}</div><div class="muted tiny">{{ o.service }}</div></td>
                <td class="num muted">{{ formatMs(o.previousAvgMs!) }}</td>
                <td class="num">{{ formatMs(o.avgMs) }}</td>
                <td class="num down">▼ {{ pctChange(o.avgMs, o.previousAvgMs!) }}</td>
              </tr>
            </tbody>
          </table></div>
          <div v-else class="empty">{{ hasPrevious ? 'Belirgin hızlanan yok' : 'Önceki dönemde veri yok' }}</div>
        </section>
      </div>

      <div class="pair section">
        <section id="hatalar" class="card">
          <div class="card-header">
            <h2>En çok hata verenler</h2>
            <span class="muted small">hatalı istek sayısı</span>
          </div>
          <div v-if="topErrors.length" class="table-wrap"><table class="data">
            <thead><tr><th>Operasyon</th><th class="num">Hata</th><th class="num">Oran</th><th class="num">Önceki oran</th></tr></thead>
            <tbody>
              <tr v-for="o in topErrors" :key="o.app + o.service + o.operation" class="clickable" @click="router.push(opLink(o))">
                <td><div class="mono op">{{ o.operation }}</div><div class="muted tiny">{{ o.service }}</div></td>
                <td class="num"><b>{{ formatInt(o.errorCount) }}</b></td>
                <td class="num" :class="{ over: o.errorRate >= 0.05 }">{{ formatPercent(o.errorRate) }}</td>
                <td class="num muted">{{ o.previousErrorRate === null ? '—' : formatPercent(o.previousErrorRate) }}</td>
              </tr>
            </tbody>
          </table></div>
          <div v-else class="empty">Bu dönemde hata yok</div>
        </section>
        <section id="en-yavaslar" class="card">
          <div class="card-header">
            <h2>En yavaş 10</h2>
            <span class="muted small">ortalama süre · çubuk: eşiğe oranı</span>
          </div>
          <table class="data">
            <tbody>
              <tr v-for="o in slowest" :key="o.app + o.service + o.operation" class="clickable" @click="router.push(opLink(o))">
                <td class="op-cell">
                  <div class="mono op" :title="o.operation">{{ o.operation }}</div>
                  <div class="muted tiny">{{ o.service }}{{ o.app === 'Scheduler' ? ' · görev' : '' }} · {{ formatInt(o.count) }} {{ o.app === 'Service' ? 'istek' : 'çalışma' }}</div>
                </td>
                <td class="bar-cell">
                  <div class="bar" :title="`Eşik ${formatMs(o.thresholdMs)}`"><i :class="{ over: o.avgMs > o.thresholdMs }" :style="{ width: `${Math.max(thresholdShare(o), 2)}%` }" /></div>
                  <div class="muted tiny">eşik {{ formatMs(o.thresholdMs) }}</div>
                </td>
                <td class="num" :class="{ over: o.avgMs > o.thresholdMs }">{{ formatMs(o.avgMs) }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      <section id="alarmlar" class="card section">
        <div class="card-header">
          <h2>Alarmlar <span class="muted count">{{ report.alerts.count }}</span></h2>
          <span class="muted small">bu dönemde açık kalan alarmlar, en uzundan</span>
        </div>
        <div v-if="report.alerts.longest.length" class="table-wrap">
          <table class="data">
            <thead><tr><th>Operasyon</th><th class="num">En yüksek</th><th class="num">Eşik</th><th class="num">Açık kaldığı süre</th></tr></thead>
            <tbody>
              <tr v-for="a in report.alerts.longest" :key="a.firedAt + a.operation">
                <td><div class="mono op">{{ a.operation }}</div><div class="muted tiny">{{ a.service }}{{ a.resolvedAt ? '' : ' · hâlâ açık' }}</div></td>
                <td class="num over">{{ formatMs(a.peakValueMs) }}</td>
                <td class="num muted">{{ formatMs(a.thresholdMs) }}</td>
                <td class="num">{{ formatMinutes(a.minutes) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="empty">Bu dönemde hiç alarm açılmadı</div>
      </section>

      <section id="tumu" class="card section">
        <div class="card-header">
          <h2>Tüm endpoint ve görevler <span class="muted count">{{ allOps.length }}</span></h2>
          <span class="muted small">istek sayısına göre · "Eşiği aşan" günlük özetten yaklaşık hesaplanır</span>
        </div>
        <div class="table-wrap">
          <table class="data">
            <thead>
              <tr>
                <th>Operasyon</th>
                <th class="num">İstek</th>
                <th class="num">Ortalama</th>
                <th class="num">Önceki</th>
                <th class="num" title="İsteklerin yüzde 95 i bu süreden kısa">p95</th>
                <th class="num">Eşik</th>
                <th class="num">Eşiği aşan</th>
                <th class="num">Hata</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="o in allOps" :key="o.app + o.service + o.operation" class="clickable" @click="router.push(opLink(o))">
                <td><div class="mono op">{{ o.operation }}</div><div class="muted tiny">{{ o.service }}{{ o.app === 'Scheduler' ? ' · görev' : '' }}</div></td>
                <td class="num">{{ formatInt(o.count) }}</td>
                <td class="num" :class="{ over: o.avgMs > o.thresholdMs }">{{ formatMs(o.avgMs) }}</td>
                <td class="num muted">{{ o.previousAvgMs === null ? '—' : formatMs(o.previousAvgMs) }}</td>
                <td class="num">{{ formatMs(o.p95Ms) }}</td>
                <td class="num muted">{{ formatMs(o.thresholdMs) }}</td>
                <td class="num">{{ formatInt(o.slowCount) }} <span class="muted pct">{{ formatPercent(o.count ? o.slowCount / o.count : 0) }}</span></td>
                <td class="num">{{ formatInt(o.errorCount) }} <span class="muted pct">{{ formatPercent(o.errorRate) }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </template>
</template>

<style scoped>
.page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
.sub { margin: 2px 0 0; max-width: 640px; }
.head-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.small { font-size: 12px; }
.tiny { font-size: 11.5px; }
.count { font-weight: 400; font-size: 13px; margin-left: 6px; }
.pct { font-size: 11px; margin-left: 4px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
.section { margin-top: 16px; scroll-margin-top: 16px; }
.over { color: var(--status-critical); font-weight: 600; }
.up { color: var(--status-critical); font-weight: 600; }
.down { color: var(--status-good); font-weight: 600; }
.op { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 380px; }
.op-cell { min-width: 0; max-width: 0; width: 60%; }
.bar-cell { width: 30%; min-width: 90px; }
.bar { height: 8px; border-radius: 4px; background: var(--surface-2); overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: 4px; background: var(--accent); }
.bar i.over { background: var(--status-critical); }
.period-line { margin: 0 0 12px; font-size: 14px; }
.note-box { margin: 0 0 12px; padding: 8px 12px; border-radius: 6px; background: var(--status-warning-soft); font-size: 13px; }

.period-picker { position: relative; }
.segmented { display: inline-flex; flex-wrap: wrap; border: 1px solid var(--border-strong); border-radius: 6px; overflow: hidden; background: var(--surface-1); }
.segmented button { border: none; background: transparent; padding: 5px 12px; cursor: pointer; border-right: 1px solid var(--border); white-space: nowrap; }
.segmented button:last-child { border-right: none; }
.segmented button.active { background: var(--accent); color: #fff; }
.panel {
  position: absolute;
  z-index: 20;
  top: calc(100% + 6px);
  right: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  width: 280px;
  max-width: calc(100vw - 32px);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.14);
}
.panel label { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--text-secondary); }
.panel input { font: inherit; color: inherit; background: var(--surface-1); border: 1px solid var(--border-strong); border-radius: 6px; padding: 5px 8px; }
.actions { display: flex; gap: 8px; }
.btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.note { margin: 0; font-size: 11.5px; }
@media (max-width: 760px) { .panel { left: 0; right: auto; } }
</style>
