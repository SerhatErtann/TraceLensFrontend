<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, spanGroupKey, thresholdKey, type Anatomy, type AppKind, type Histogram, type Instance, type OperationSummary,
  type Outcome, type RequestRow, type ServiceBreakdown, type SpanCategory, type SpanGroup, type ThresholdList, type TimeBucket } from '../api'
import { formatInt, formatPercent } from '../format'
import { shiftBuckets } from '../ranges'
import { useTimeRange } from '../timeRange'
import { breakdownInsights, listInsights } from '../insights'
import RangePicker from '../components/RangePicker.vue'
import InsightList from '../components/InsightList.vue'
import StatTiles, { type TileAction } from '../components/StatTiles.vue'
import StatusBadge from '../components/StatusBadge.vue'
import LatencyChart from '../components/LatencyChart.vue'
import TimeSplitBar from '../components/TimeSplitBar.vue'
import DurationHistogram from '../components/DurationHistogram.vue'
import OutcomeBreakdown from '../components/OutcomeBreakdown.vue'
import InstancesTable from '../components/InstancesTable.vue'
import RequestAnatomy from '../components/RequestAnatomy.vue'
import OperationsTable from '../components/OperationsTable.vue'
import SpanGroupsTable from '../components/SpanGroupsTable.vue'
import RequestsTable from '../components/RequestsTable.vue'

/** Servis Detayı: bir servisin (veya görev uygulamasının) içi — süre nereye gidiyor, hangi endpoint/metod/sorgu/çağrı yavaş. */
const props = defineProps<{ app: AppKind; service: string }>()
const route = useRoute()
const router = useRouter()

const SAMPLE_LIMIT = 10
type Tab = 'ops' | SpanCategory

// Zaman aralığı: hazır aralık ya da özel tarih/saat (RangePicker)
const time = useTimeRange()
const tab = computed<Tab>(() => (['method', 'db', 'call'].includes(route.query.tab as string) ? route.query.tab as Tab : 'ops'))
const isService = computed(() => props.app === 'service')
const listPath = computed(() => (isService.value ? '/services' : '/schedulers'))

const operations = ref<OperationSummary[]>([])
const totals = ref<OperationSummary | null>(null)
const previousTotals = ref<OperationSummary | null>(null)
const buckets = ref<TimeBucket[]>([])
const previousBuckets = ref<TimeBucket[]>([])
const breakdown = ref<ServiceBreakdown | null>(null)
const histogram = ref<Histogram | null>(null)
const outcomes = ref<Outcome | null>(null)
const instances = ref<Instance[] | null>(null)
const anatomy = ref<Anatomy | null>(null)
const thresholds = ref<ThresholdList | null>(null)
const error = ref<string | null>(null)
const loading = ref(false)
const lastLoaded = ref<Date | null>(null)

// Seçili satır: endpoint/görev (operasyon adı) ya da span grubu; altta en yavaş örnekleri listelenir
const selectedOperation = ref<OperationSummary | null>(null)
const selectedGroup = ref<SpanGroup | null>(null)
const samples = ref<RequestRow[] | null>(null)
const samplesError = ref<string | null>(null)

const defaultThresholdMs = computed(() => thresholds.value?.defaultMs ?? 200)
const customThresholds = computed(() =>
  new Set((thresholds.value?.overrides ?? []).map(o => thresholdKey(o.service, o.operation))))
// Servisler/Görevler sayfasındaki gibi: operasyonların en düşük eşiği
const thresholdMs = computed(() =>
  operations.value.length ? Math.min(...operations.value.map(o => o.thresholdMs)) : defaultThresholdMs.value)

// "Kısaca" kutusu: Servisler sayfasındaki cümleler + süre nereye gidiyor, N+1 şüphesi
const insights = computed(() => [
  ...listInsights({
    label: time.phrase.value,
    noun: isService.value ? 'istek' : 'çalışma',
    opNoun: isService.value ? 'endpoint' : 'görev',
    totals: totals.value,
    previous: previousTotals.value,
    operations: operations.value,
    outcome: outcomes.value,
    histogram: histogram.value,
    thresholdMs: thresholdMs.value,
    opLink: o => ({ path: listPath.value, query: { ...time.query.value, service: o.service, operation: o.operation }, hash: '#grafik' })
  }),
  ...breakdownInsights(breakdown.value)
])

// Genel Bakış kartı ve Sorunlar ile aynı kural (en az 3 istekli operasyonlar): hata oranı %5 ve üstü olan varsa
// Hatalı, ortalaması eşiğini aşan varsa Yavaş
const ISSUE_MIN_COUNT = 3
const status = computed(() => {
  const ops = operations.value.filter(o => o.count >= ISSUE_MIN_COUNT)
  if (ops.some(o => o.errorRate >= 0.05) || (totals.value?.errorRate ?? 0) >= 0.05) return { kind: 'error' as const, label: 'Hatalı' }
  if (ops.some(o => o.isAvgOverThreshold)) return { kind: 'slow' as const, label: 'Yavaş' }
  return { kind: 'ok' as const, label: 'Normal' }
})

const hasSplit = computed(() => (breakdown.value?.timeSplit ?? []).some(p => p.share > 0))

// Sürenin büyük kısmı tek bir çağrı/sorguda geçiyorsa bir cümleyle söylenir (tıklayınca o satır açılır)
const dominant = computed(() => {
  const candidates = [...(breakdown.value?.calls ?? []), ...(breakdown.value?.database ?? [])]
  const top = candidates.sort((a, b) => b.share - a.share)[0]
  return top && top.share >= 0.3 ? top : null
})

const tabs = computed(() => [
  { id: 'ops' as const, label: isService.value ? "Endpoint'ler" : 'Görevler', count: operations.value.length },
  { id: 'method' as const, label: 'Metodlar', count: breakdown.value?.methods.length ?? 0 },
  { id: 'db' as const, label: 'DB sorguları', count: breakdown.value?.database.length ?? 0 },
  { id: 'call' as const, label: 'Dış çağrılar', count: breakdown.value?.calls.length ?? 0 }
])
const groupRows = computed(() => {
  const b = breakdown.value
  if (!b) return []
  return tab.value === 'method' ? b.methods : tab.value === 'db' ? b.database : tab.value === 'call' ? b.calls : []
})

const samplesTitle = computed(() => selectedOperation.value?.operation ?? selectedGroup.value?.name ?? '')
const samplesThreshold = computed(() => selectedOperation.value?.thresholdMs ?? selectedGroup.value?.thresholdMs ?? thresholdMs.value)

async function load() {
  loading.value = true
  const f = { ...time.win.value, service: props.service }
  const previous = { ...f, ...time.previous() }
  try {
    const [ops, tot, ts, bd, thr, prevTot, prevTs, hist, out, inst] = await Promise.all([
      api.summary(props.app, f),
      api.totals(props.app, f),
      api.timeseries(props.app, f),
      api.breakdown(props.app, props.service, time.win.value),
      api.thresholds(),
      api.totals(props.app, previous),
      api.timeseries(props.app, previous),
      api.histogram(props.app, f),
      api.outcomes(props.app, f),
      api.instances(props.app, f)
    ])
    operations.value = ops
    totals.value = tot
    buckets.value = ts
    breakdown.value = bd
    thresholds.value = thr
    previousTotals.value = prevTot
    previousBuckets.value = shiftBuckets(prevTs, time.durationMs.value)
    histogram.value = hist
    outcomes.value = out
    instances.value = inst
    error.value = null
    lastLoaded.value = new Date()
  } catch (e) {
    error.value = `Veriler alınamadı: ${(e as Error).message}`
  } finally {
    loading.value = false
  }
}

async function loadSamples() {
  samplesError.value = null
  try {
    if (selectedOperation.value) {
      const operation = selectedOperation.value.operation
      const f = { ...time.win.value, service: props.service, operation }
      anatomy.value = null
      const [page, anat] = await Promise.all([
        api.requests(props.app, f, 'duration', SAMPLE_LIMIT, 0),
        api.anatomy(props.app, props.service, operation, time.win.value)
      ])
      samples.value = page.items
      anatomy.value = anat
    } else if (selectedGroup.value) {
      samples.value = await api.spanSamples(props.app, props.service, selectedGroup.value, time.win.value)
    }
  } catch (e) {
    samplesError.value = `Örnekler alınamadı: ${(e as Error).message}`
  }
}

function clearSelection() {
  selectedOperation.value = null
  selectedGroup.value = null
  samples.value = null
  anatomy.value = null
}

// Grafikte bir noktaya tıklanınca o aralığın istekleri Servisler/Görevler sayfasında bu servise filtreli listelenir
function onChartSelect(w: { from: string; to: string }) {
  router.push({ path: listPath.value, query: { ...time.query.value, service: props.service, windowFrom: w.from, windowTo: w.to }, hash: '#istekler' })
}

async function showSamples() {
  samples.value = null
  await loadSamples()
  await nextTick()
  document.getElementById(selectedOperation.value ? 'anatomi' : 'ornekler')?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'nearest' })
}

function selectOperation(row: OperationSummary) {
  const same = selectedOperation.value?.operation === row.operation
  clearSelection()
  if (!same) {
    selectedOperation.value = row
    showSamples()
  }
}

function selectGroup(row: SpanGroup) {
  const same = selectedGroup.value && spanGroupKey(selectedGroup.value) === spanGroupKey(row)
  clearSelection()
  if (!same) {
    selectedGroup.value = row
    showSamples()
  }
}

function setTab(id: Tab) {
  clearSelection()
  router.replace({ query: { ...route.query, tab: id === 'ops' ? undefined : id } })
}

async function openDominant() {
  const group = dominant.value
  if (!group) return
  setTab(group.category)
  await nextTick()
  selectGroup(group)
}

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Üstteki kutular: grafik bu sayfada; istek listeleri Servisler/Görevler sayfasında bu servise filtreli açılır
function onTile(action: TileAction) {
  if (action === 'chart') {
    document.getElementById('grafik')?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' })
    return
  }
  const query: Record<string, string> = { ...time.query.value, service: props.service }
  if (action === 'requests') query.sort = 'time'
  if (action === 'slow' || action === 'errors') query.only = action
  router.push({ path: listPath.value, query, hash: '#istekler' })
}

// Sekme değişimi (?tab=) yeniden yüklemesin diye sadece aralık izlenir
watch(() => [props.app, props.service, JSON.stringify(time.win.value)], () => {
  load()
  if (selectedOperation.value || selectedGroup.value) loadSamples()
})

let timer: number | undefined
onMounted(() => {
  load()
  timer = window.setInterval(() => { if (!loading.value) load() }, 30_000)
})
onUnmounted(() => window.clearInterval(timer))
</script>

<template>
  <RouterLink :to="{ path: listPath, query: time.query.value }" class="crumb">← {{ isService ? 'Servisler' : 'Görevler' }}</RouterLink>
  <header class="page-header">
    <div>
      <h1 class="mono title">{{ service }}</h1>
      <p class="muted sub">
        {{ isService ? 'Servis' : 'Görev uygulaması' }} · {{ time.isCustom.value ? time.label.value : `son ${time.label.value}` }}
        <template v-if="totals"> · {{ formatInt(totals.count) }} {{ isService ? 'istek' : 'çalışma' }} · <StatusBadge v-bind="status" /></template>
      </p>
    </div>
    <div class="head-right">
      <RangePicker />
      <span v-if="lastLoaded" class="muted small">{{ lastLoaded.toLocaleTimeString('tr-TR') }}</span>
    </div>
  </header>

  <div v-if="error" class="error-box">{{ error }}</div>

  <InsightList :items="insights" />

  <StatTiles :totals="totals" :threshold-ms="thresholdMs" :app="app" :previous="previousTotals" @go="onTile" />

  <section class="card section">
    <div class="card-header">
      <h2>Süre nereye gidiyor?</h2>
      <span class="muted small">{{ isService ? 'Bu servise gelen isteklerin' : 'Görev çalışmalarının' }} toplam süresinin dağılımı</span>
    </div>
    <div v-if="breakdown && hasSplit" class="split">
      <TimeSplitBar :parts="breakdown.timeSplit" />
      <button v-if="dominant" type="button" class="insight" @click="openDominant">
        En büyük pay ({{ formatPercent(dominant.share) }}):
        <span class="mono">{{ dominant.target ? `${dominant.target} · ` : '' }}{{ dominant.name }}</span>
        {{ dominant.category === 'db' ? 'sorgusu' : 'çağrısı' }} · en yavaş örnekleri gör →
      </button>
    </div>
    <div v-else class="empty">Bu aralıkta veri yok</div>
  </section>

  <section id="grafik" class="card section">
    <div class="card-header">
      <h2>Yanıt süresi</h2>
      <span class="muted small">{{ isService ? "Tüm endpoint'ler" : 'Tüm görevler' }} · kesikli çizgi: önceki dönem</span>
    </div>
    <LatencyChart :buckets="buckets" :threshold-ms="thresholdMs" :previous="previousBuckets" drillable @select="onChartSelect" />
  </section>

  <div class="pair section">
    <section class="card">
      <div class="card-header">
        <h2>Süre dağılımı</h2>
        <span class="muted small">kaç {{ isService ? 'istek' : 'çalışma' }} hangi sürede</span>
      </div>
      <DurationHistogram :data="histogram" :threshold-ms="thresholdMs" />
    </section>
    <section class="card">
      <div class="card-header">
        <h2>Sonuçlar</h2>
        <span class="muted small">{{ isService ? 'durum kodları ve hata türleri' : 'başarılı / başarısız ve hata türleri' }}</span>
      </div>
      <OutcomeBreakdown :data="outcomes" :app="app" />
    </section>
  </div>

  <section id="detay" class="card section">
    <div class="tabs" role="tablist" aria-label="Servis içi dağılım">
      <button v-for="t in tabs" :key="t.id" class="tab" role="tab" :aria-selected="tab === t.id" @click="setTab(t.id)">
        {{ t.label }}<span class="n">{{ t.count }}</span>
      </button>
    </div>
    <p class="muted small hint">
      Satıra tıklayınca {{ tab === 'ops' ? `isteğin anatomisi ve ` : '' }}en yavaş {{ SAMPLE_LIMIT }} örneği aşağıda listelenir
      <template v-if="tab === 'ops'"> · eşiği değiştirmek için ✎</template>
      <template v-else> · "Toplam sürenin payı": bu satırın, isteklerin toplam süresi içindeki yeri</template>
    </p>
    <OperationsTable v-if="tab === 'ops'" :rows="operations" :selected="selectedOperation?.operation" :app="app"
                     :custom-thresholds="customThresholds" :default-threshold-ms="defaultThresholdMs"
                     @select="selectOperation" @threshold-changed="load" />
    <SpanGroupsTable v-else :rows="groupRows" :category="tab"
                     :selected="selectedGroup ? spanGroupKey(selectedGroup) : undefined" @select="selectGroup" />
  </section>

  <section v-if="selectedOperation" id="anatomi" class="card section">
    <div class="card-header">
      <h2>{{ isService ? 'İsteğin' : 'Çalışmanın' }} anatomisi <span class="muted count mono">{{ selectedOperation.operation }}</span></h2>
      <span class="muted small">ortalama bir {{ isService ? 'istek' : 'çalışma' }} hangi adımlardan oluşuyor</span>
    </div>
    <RequestAnatomy :data="anatomy" :app="app" />
  </section>

  <section v-if="selectedOperation || selectedGroup" id="ornekler" class="card section">
    <div class="card-header">
      <h2>En yavaş {{ SAMPLE_LIMIT }} {{ selectedOperation ? (isService ? 'istek' : 'çalışma') : 'çağrı' }}
        <span class="muted count mono">{{ samplesTitle }}</span>
      </h2>
      <RouterLink v-if="selectedOperation" class="small"
                  :to="{ path: listPath, query: { ...time.query.value, service, operation: selectedOperation.operation }, hash: '#istekler' }">
        Tümünü listele →
      </RouterLink>
      <span v-else class="muted small">Operasyon: çağrının yapıldığı {{ isService ? 'istek' : 'görev' }} · satıra tıklayınca trace açılır</span>
    </div>
    <div v-if="samplesError" class="error-box">{{ samplesError }}</div>
    <RequestsTable v-else-if="samples" :rows="samples" :app="app" :threshold-for="() => samplesThreshold" />
    <div v-else class="empty">Yükleniyor…</div>
  </section>

  <section class="card section">
    <div class="card-header">
      <h2>Instance'lar <span v-if="instances" class="muted count">{{ instances.length }}</span></h2>
      <span class="muted small">servisin çalışan kopyaları; biri diğerlerinden yavaşsa işaretlenir</span>
    </div>
    <InstancesTable v-if="instances" :rows="instances" :threshold-ms="thresholdMs" />
    <div v-else class="empty">Yükleniyor…</div>
  </section>
</template>

<style scoped>
.page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
.sub { margin: 2px 0 0; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.head-right { display: flex; align-items: center; gap: 10px; }
.small { font-size: 12px; }
.count { font-weight: 400; font-size: 13px; margin-left: 6px; }
.section { margin-top: 16px; scroll-margin-top: 16px; }

.crumb { display: inline-block; font-size: 13px; margin-bottom: 8px; }
.title { font-size: 20px; font-weight: 600; overflow-wrap: anywhere; }

.split { padding: 4px 16px 16px; }
.insight { display: block; margin-top: 12px; padding: 0; border: none; background: none; color: var(--accent); cursor: pointer; text-align: left; font-size: 13px; }
.insight:hover { text-decoration: underline; }

/* Sekmeler */
.tabs { display: flex; gap: 4px; padding: 0 16px; border-bottom: 1px solid var(--border); overflow-x: auto; }
.tab { border: none; background: none; padding: 12px 12px 10px; cursor: pointer; color: var(--text-secondary); border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; font-weight: 500; }
.tab:hover { color: var(--text-primary); }
.tab[aria-selected="true"] { color: var(--text-primary); border-bottom-color: var(--accent); }
.tab .n { font-size: 11px; color: var(--text-muted); margin-left: 5px; }
.hint { margin: 0; padding: 10px 16px 4px; }
</style>
