<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, thresholdKey, type AppKind, type Filters, type OperationSummary, type PagedResult, type RequestRow,
  type ThresholdList, type TimeBucket } from '../api'
import { formatInt } from '../format'
import StatTiles, { type TileAction } from '../components/StatTiles.vue'
import LatencyChart from '../components/LatencyChart.vue'
import OperationsTable from '../components/OperationsTable.vue'
import RequestsTable from '../components/RequestsTable.vue'

const props = defineProps<{ app: AppKind }>()
const route = useRoute()
const router = useRouter()

const RANGES = [
  { value: '15m', label: '15 dk' },
  { value: '1h', label: '1 sa' },
  { value: '6h', label: '6 sa' },
  { value: '24h', label: '24 sa' },
  { value: '7d', label: '7 gün' }
]
const PAGE_SIZE = 25

// Filtreler URL'de tutulur: link paylaşılınca aynı görünüm açılır.
const filters = computed<Filters>(() => ({
  range: (route.query.range as string) || '1h',
  service: (route.query.service as string) || undefined,
  operation: (route.query.operation as string) || undefined,
  minDurationMs: route.query.minDurationMs ? Number(route.query.minDurationMs) : undefined
}))

function setFilter(patch: Partial<Record<keyof Filters, string | number | undefined>>) {
  const query: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...route.query, ...patch })) {
    if (v !== undefined && v !== null && v !== '') query[k] = String(v)
  }
  router.replace({ query })
}

const thresholds = ref<ThresholdList | null>(null)
const services = ref<string[]>([])
const operations = ref<OperationSummary[]>([])
const totals = ref<OperationSummary | null>(null)
const buckets = ref<TimeBucket[]>([])
const requests = ref<PagedResult<RequestRow> | null>(null)
const error = ref<string | null>(null)
const loading = ref(false)
const lastLoaded = ref<Date | null>(null)

// İstek listesi seçenekleri; Genel Bakış'tan ?only=slow|errors&sort=time ile hazır seçili gelinebilir
const sort = ref<'time' | 'duration'>(route.query.sort === 'time' ? 'time' : 'duration')
const offset = ref(0)
const onlySlow = ref(route.query.only === 'slow')
const onlyErrors = ref(route.query.only === 'errors')
const autoRefresh = ref(true)

function scrollToSection(id: string) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}

// Üstteki kutular: grafiğe iner ya da istek listesini ilgili filtre/sırayla açar
function onTile(action: TileAction) {
  if (action === 'chart') return scrollToSection('grafik')
  onlySlow.value = action === 'slow'
  onlyErrors.value = action === 'errors'
  sort.value = action === 'requests' ? 'time' : 'duration'
  scrollToSection('istekler')
}

const title = computed(() => (props.app === 'service' ? 'Services' : 'Schedulers'))
const subtitle = computed(() =>
  props.app === 'service'
    ? 'Gelen HTTP istekleri: süre, eşik aşımı ve hata dağılımı'
    : 'Job çalıştırmaları: süre, eşik aşımı ve başarısız çalışmalar'
)

const operationOptions = computed(() =>
  [...new Set(operations.value.filter(o => !filters.value.service || o.service === filters.value.service)
    .map(o => o.operation))].sort()
)

const defaultThresholdMs = computed(() => thresholds.value?.defaultMs ?? 200)
const customThresholds = computed(() =>
  new Set((thresholds.value?.overrides ?? []).map(o => thresholdKey(o.service, o.operation))))

const thresholdMs = computed(() => {
  const selected = operations.value.find(o =>
    o.operation === filters.value.operation && (!filters.value.service || o.service === filters.value.service))
  return selected?.thresholdMs ?? defaultThresholdMs.value
})

function thresholdFor(row: RequestRow) {
  return operations.value.find(o => o.service === row.service && o.operation === row.operation)?.thresholdMs
    ?? defaultThresholdMs.value
}

async function loadAll() {
  loading.value = true
  error.value = null
  const f = filters.value
  try {
    // Tablo seçili operasyondan bağımsız tüm operasyonları gösterir; geri kalanlar filtreye uyar.
    const [svc, ops, tot, ts, thr] = await Promise.all([
      api.services(props.app),
      api.summary(props.app, { ...f, operation: undefined }),
      api.totals(props.app, f),
      api.timeseries(props.app, f),
      api.thresholds()
    ])
    thresholds.value = thr
    services.value = svc
    operations.value = ops
    totals.value = tot
    buckets.value = ts
    await loadRequests()
    lastLoaded.value = new Date()
  } catch (e) {
    error.value = `Veriler alınamadı: ${(e as Error).message}. TraceLensService (http://localhost:5100) çalışıyor mu?`
  } finally {
    loading.value = false
  }
}

async function loadRequests() {
  requests.value = await api.requests(
    props.app,
    { ...filters.value, onlySlow: onlySlow.value, onlyErrors: onlyErrors.value },
    sort.value, PAGE_SIZE, offset.value)
}

function selectOperation(row: OperationSummary) {
  const same = filters.value.operation === row.operation && filters.value.service === row.service
  offset.value = 0
  setFilter(same ? { operation: undefined } : { operation: row.operation, service: row.service })
}

watch(() => [props.app, route.query], () => { offset.value = 0; loadAll() }, { deep: true })
watch([sort, onlySlow, onlyErrors], () => { offset.value = 0; loadRequests() })
watch(offset, loadRequests)

let timer: number | undefined
onMounted(async () => {
  await loadAll()
  // Genel Bakış'tan #grafik / #istekler ile gelindiyse veri yüklendikten sonra o bölüme kaydır
  if (route.hash) {
    await nextTick()
    document.querySelector(route.hash)?.scrollIntoView({ block: 'start' })
  }
  timer = window.setInterval(() => { if (autoRefresh.value && !loading.value) loadAll() }, 30_000)
})
onUnmounted(() => window.clearInterval(timer))
</script>

<template>
  <header class="page-header">
    <div>
      <h1>{{ title }}</h1>
      <p class="muted sub">{{ subtitle }}</p>
    </div>
    <label class="refresh muted">
      <input v-model="autoRefresh" type="checkbox" /> 30 sn'de bir yenile
      <span v-if="lastLoaded"> · {{ lastLoaded.toLocaleTimeString('tr-TR') }}</span>
    </label>
  </header>

  <div class="filters">
    <div class="segmented" role="group" aria-label="Zaman aralığı">
      <button v-for="r in RANGES" :key="r.value" :class="{ active: filters.range === r.value }"
              @click="setFilter({ range: r.value })">{{ r.label }}</button>
    </div>
    <select :value="filters.service ?? ''" aria-label="Servis"
            @change="setFilter({ service: ($event.target as HTMLSelectElement).value, operation: undefined })">
      <option value="">Tüm {{ app === 'service' ? 'servisler' : "scheduler'lar" }}</option>
      <option v-for="s in services" :key="s" :value="s">{{ s }}</option>
    </select>
    <select :value="filters.operation ?? ''" aria-label="Operasyon" class="op-select"
            @change="setFilter({ operation: ($event.target as HTMLSelectElement).value })">
      <option value="">Tüm {{ app === 'service' ? "endpoint'ler" : "job'lar" }}</option>
      <option v-for="o in operationOptions" :key="o" :value="o">{{ o }}</option>
    </select>
    <label class="min-dur">
      Min süre
      <input type="number" min="0" step="50" placeholder="ms" :value="filters.minDurationMs"
             @change="setFilter({ minDurationMs: ($event.target as HTMLInputElement).value || undefined })" />
      ms
    </label>
    <button v-if="filters.service || filters.operation || filters.minDurationMs" class="btn"
            @click="setFilter({ service: undefined, operation: undefined, minDurationMs: undefined })">
      Filtreleri temizle
    </button>
  </div>

  <div v-if="error" class="error-box">{{ error }}</div>

  <StatTiles :totals="totals" :threshold-ms="thresholdMs" :app="app" @go="onTile" />

  <section id="grafik" class="card section">
    <div class="card-header">
      <h2>Yanıt süresi</h2>
      <span class="muted small">{{ filters.operation ?? 'Tüm operasyonlar' }}</span>
    </div>
    <LatencyChart :buckets="buckets" :threshold-ms="thresholdMs" />
  </section>

  <section class="card section">
    <div class="card-header">
      <h2>{{ app === 'service' ? "Endpoint'ler" : "Job'lar" }}</h2>
      <span class="muted small">Satıra tıklayınca grafik ve istek listesi o operasyona göre filtrelenir · eşiği değiştirmek için ✎</span>
    </div>
    <OperationsTable :rows="operations" :selected="filters.operation" :app="app"
                     :custom-thresholds="customThresholds" :default-threshold-ms="defaultThresholdMs"
                     @select="selectOperation" @threshold-changed="loadAll" />
  </section>

  <section id="istekler" class="card section">
    <div class="card-header">
      <h2>{{ app === 'service' ? 'İstekler' : 'Çalışmalar' }}
        <span v-if="requests" class="muted count">{{ formatInt(requests.total) }}</span>
      </h2>
      <div class="req-controls">
        <label><input v-model="onlySlow" type="checkbox" /> Sadece eşiği aşanlar</label>
        <label><input v-model="onlyErrors" type="checkbox" /> Sadece hatalılar</label>
        <select v-model="sort" aria-label="Sıralama">
          <option value="duration">En yavaş önce</option>
          <option value="time">En yeni önce</option>
        </select>
      </div>
    </div>
    <RequestsTable :rows="requests?.items ?? []" :app="app" :threshold-for="thresholdFor" />
    <div v-if="requests && requests.total > PAGE_SIZE" class="pager">
      <button class="btn" :disabled="offset === 0" @click="offset = Math.max(0, offset - PAGE_SIZE)">← Önceki</button>
      <span class="muted">{{ offset + 1 }}–{{ Math.min(offset + PAGE_SIZE, requests.total) }} / {{ formatInt(requests.total) }}</span>
      <button class="btn" :disabled="offset + PAGE_SIZE >= requests.total" @click="offset += PAGE_SIZE">Sonraki →</button>
    </div>
  </section>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}
.sub { margin: 2px 0 0; }
.refresh { font-size: 12px; display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.segmented {
  display: inline-flex;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  overflow: hidden;
  background: var(--surface-1);
}
.segmented button {
  border: none;
  background: transparent;
  padding: 5px 12px;
  cursor: pointer;
  border-right: 1px solid var(--border);
}
.segmented button:last-child { border-right: none; }
.segmented button.active { background: var(--accent); color: #fff; }
.op-select { max-width: 320px; }
.min-dur { display: flex; align-items: center; gap: 6px; color: var(--text-secondary); }
.min-dur input { width: 80px; }
.section { margin-top: 16px; }
.small { font-size: 12px; }
.count { font-weight: 400; font-size: 13px; margin-left: 6px; }
.req-controls { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; font-size: 13px; }
.req-controls label { display: flex; align-items: center; gap: 5px; }
.pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 10px 16px;
  border-top: 1px solid var(--border);
}
</style>
