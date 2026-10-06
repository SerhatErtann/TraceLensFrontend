<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api, type Alert, type AlertFilters, type AlertList, type AppKind, type Settings } from '../api'
import { formatDateTime, formatInt, formatMs, formatPercent, relativeTime } from '../format'
import { formatMinutes, type Insight } from '../insights'
import StatusBadge from '../components/StatusBadge.vue'
import InsightList from '../components/InsightList.vue'

const route = useRoute()
const router = useRouter()

const data = ref<AlertList | null>(null)
const settings = ref<Settings | null>(null)
const error = ref<string | null>(null)
const testState = ref<{ sending: boolean; result: string | null; ok: boolean }>({ sending: false, result: null, ok: false })
let timer: number | undefined

// Filtreler adres çubuğunda: link paylaşılınca aynı liste açılır
const q = computed(() => route.query as Record<string, string | undefined>)
const isCustom = computed(() => q.value.period === 'custom' && !!q.value.from && !!q.value.to)
const filters = computed<AlertFilters>(() => ({
  ...(isCustom.value ? { from: q.value.from, to: q.value.to } : { days: Number(q.value.period) || 7 }),
  app: q.value.app === 'service' || q.value.app === 'scheduler' ? q.value.app as AppKind : undefined,
  service: q.value.service || undefined,
  operation: q.value.operation || undefined,
  kind: q.value.kind === 'slow' || q.value.kind === 'error' ? q.value.kind : undefined,
  minPeakMs: q.value.minPeakMs ? Number(q.value.minPeakMs) : undefined,
  status: q.value.status || undefined
}))
const hasFilters = computed(() => ['app', 'service', 'operation', 'kind', 'minPeakMs', 'status'].some(k => q.value[k]))

const PERIODS = [
  { value: '1', label: '24 saat' },
  { value: '7', label: '7 gün' },
  { value: '30', label: '30 gün' },
  { value: '90', label: '90 gün' },
  { value: 'custom', label: 'Özel aralık' }
]
const KINDS = [{ value: '', label: 'Tümü' }, { value: 'slow', label: 'Yavaşlık' }, { value: 'error', label: 'Hata' }]
const APPS = [{ value: '', label: 'Tümü' }, { value: 'service', label: 'Servis' }, { value: 'scheduler', label: 'Görev' }]
const PEAKS = [
  { value: '', label: 'Hepsi' },
  { value: '200', label: '≥ 200 ms' },
  { value: '500', label: '≥ 500 ms' },
  { value: '1000', label: '≥ 1 s' },
  { value: '2000', label: '≥ 2 s' }
]
const period = computed(() => (isCustom.value ? 'custom' : q.value.period || '7'))
// Hata kodu çipleri: sınıflar + bu aralıktaki alarmlarda görülen kodlar
const statusChips = computed(() => [
  { value: '', label: 'Hepsi' },
  { value: '5xx', label: '5xx' },
  { value: '4xx', label: '4xx' },
  ...(data.value?.statuses ?? []).map(s => ({ value: s, label: s }))
])

// Uygulanan filtreler, tek tek kaldırılabilir haplar olarak
const activeFilters = computed(() => {
  const list: { key: string; label: string }[] = []
  if (q.value.kind) list.push({ key: 'kind', label: q.value.kind === 'error' ? 'Hata alarmları' : 'Yavaşlık alarmları' })
  if (q.value.app) list.push({ key: 'app', label: q.value.app === 'service' ? 'Sadece servisler' : 'Sadece görevler' })
  if (q.value.service) list.push({ key: 'service', label: q.value.service })
  if (q.value.minPeakMs) list.push({ key: 'minPeakMs', label: `En yüksek ≥ ${formatMs(Number(q.value.minPeakMs))}` })
  if (q.value.status) list.push({ key: 'status', label: `Hata kodu ${q.value.status}` })
  if (q.value.operation) list.push({ key: 'operation', label: `"${q.value.operation}"` })
  return list
})

function setQuery(patch: Record<string, string | number | undefined>) {
  const query: Record<string, string> = {}
  for (const [k, v] of Object.entries({ ...route.query, ...patch })) if (v !== undefined && v !== null && v !== '') query[k] = String(v)
  router.replace({ query })
}
const clearFilters = () => setQuery({ app: undefined, service: undefined, operation: undefined, kind: undefined, minPeakMs: undefined, status: undefined })

// Özel aralık: <input type="datetime-local"> yerel saat ister
const toLocalInput = (iso: string) => {
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
const customFrom = ref('')
const customTo = ref('')
function onPeriod(value: string) {
  if (value !== 'custom') return setQuery({ period: value, from: undefined, to: undefined })
  const to = new Date()
  customTo.value = toLocalInput(to.toISOString())
  customFrom.value = toLocalInput(new Date(to.getTime() - 86_400_000).toISOString())
  setQuery({ period: 'custom', from: new Date(customFrom.value).toISOString(), to: to.toISOString() })
}
function applyCustom() {
  if (!customFrom.value || !customTo.value || customTo.value <= customFrom.value) return
  setQuery({ period: 'custom', from: new Date(customFrom.value).toISOString(), to: new Date(customTo.value).toISOString() })
}

// Operasyon araması yazarken her harfte istek atmasın
let searchTimer: number | undefined
function onSearch(value: string) {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => setQuery({ operation: value || undefined }), 350)
}

async function load() {
  try {
    data.value = await api.alerts(filters.value)
    error.value = null
  } catch (e) {
    error.value = `Alarmlar alınamadı: ${(e as Error).message}`
  }
}

async function sendTest() {
  testState.value = { sending: true, result: null, ok: false }
  try {
    testState.value = { sending: false, ok: true, result: await api.testNotification() }
  } catch (e) {
    testState.value = { sending: false, ok: false, result: (e as Error).message }
  }
}

// Alarm satırından ilgili sayfaya: alarmın açık olduğu zaman aralığı seçili, hata alarmında sadece hatalılar
function linkFor(a: Alert) {
  const end = a.resolvedAt ? new Date(a.resolvedAt).getTime() : Date.now()
  const from = new Date(new Date(a.firedAt).getTime() - 10 * 60_000).toISOString()
  return {
    path: a.app === 'Service' ? '/services' : '/schedulers',
    query: { range: 'custom', from, to: new Date(end).toISOString(), service: a.service, operation: a.operation, ...(a.kind === 'error' ? { only: 'errors' } : {}) },
    hash: '#istekler'
  }
}

const appLabel = (app: Alert['app']) => (app === 'Service' ? 'Servis' : 'Görev')
const kindBadge = (a: Alert) => (a.kind === 'error' ? { kind: 'error' as const, label: 'Hata' } : { kind: 'slow' as const, label: 'Yavaşlık' })
const metricLabel = (a: Alert) => (a.metric === 'p95' ? 'p95' : 'ort')

const formatDuration = (minutes: number) =>
  minutes < 1 ? '<1 dk' : minutes < 60 ? `${Math.round(minutes)} dk` : `${(minutes / 60).toFixed(1)} sa`

const formatLabel: Record<string, string> = { teams: 'Microsoft Teams', slack: 'Slack', generic: 'JSON webhook' }

const periodText = computed(() => {
  if (isCustom.value) return `${formatDateTime(q.value.from!).slice(0, -3)} – ${formatDateTime(q.value.to!).slice(0, -3)}`
  const days = Number(q.value.period) || 7
  return days === 1 ? 'Son 24 saat' : `Son ${days} gün`
})

// "Kısaca": seçilen aralıkta ve filtrede kaç alarm, hangi tür, en çok hangi operasyon
const insights = computed<Insight[]>(() => {
  const d = data.value
  if (!d) return []
  const all = [...d.active, ...d.history]
  if (!all.length) return [{ tone: 'ok', text: `${periodText.value} içinde${hasFilters.value ? ' bu filtrelere uyan' : ''} alarm yok.` }]
  const errors = all.filter(a => a.kind === 'error').length
  const list: Insight[] = [{
    tone: d.active.length ? 'error' : 'info',
    text: `${periodText.value}: ${all.length} alarm (yavaşlık: ${all.length - errors}, hata: ${errors}); şu an açık: ${d.active.length}. ` +
      `Toplam açık kalma süresi ${formatMinutes(all.reduce((s, a) => s + a.durationMinutes, 0))}.`
  }]
  const byOp = new Map<string, { a: Alert; n: number }>()
  for (const a of all) {
    const k = `${a.service}|${a.operation}`
    byOp.set(k, { a, n: (byOp.get(k)?.n ?? 0) + 1 })
  }
  const top = [...byOp.values()].sort((x, y) => y.n - x.n)[0]
  if (top && top.n > 1) list.push({ tone: 'slow', text: `En sık alarm veren: ${top.a.operation} (${top.a.service}) — ${top.n} kez. Tekrar eden alarm kalıcı bir soruna işaret eder.` })
  const longest = [...all].sort((x, y) => y.durationMinutes - x.durationMinutes)[0]
  list.push({ tone: 'info', text: `En uzun süren: ${longest.operation} (${longest.service}) — ${formatDuration(longest.durationMinutes)}, ${longest.kind === 'error' ? `en yüksek hata oranı ${formatPercent(longest.peakErrorRate)}` : `en yüksek ${formatMs(longest.peakValueMs)}`}.` })
  return list
})

watch(filters, load, { deep: true })
watch(isCustom, c => {
  if (c) {
    customFrom.value = toLocalInput(q.value.from!)
    customTo.value = toLocalInput(q.value.to!)
  }
}, { immediate: true })
onMounted(async () => {
  settings.value = await api.settings().catch(() => null)
  load()
  timer = window.setInterval(load, 15_000)
})
onUnmounted(() => window.clearInterval(timer))
</script>

<template>
  <header class="page-header">
    <div>
      <h1>Alarmlar</h1>
      <p v-if="settings" class="muted sub">
        Her dakika son {{ settings.alertWindowMinutes }} dakika kontrol edilir. İki tür alarm var:
        <b>yavaşlık</b> ({{ settings.alertMetric === 'p95' ? 'p95' : 'ortalama' }} süre eşiği aşarsa; varsayılan eşik {{ formatMs(settings.defaultThresholdMs) }})
        ve <b>hata</b> (hata oranı %5'i geçerse; en sık durum kodu kaydedilir). Düzelince kendiliğinden kapanır.
      </p>
    </div>
    <div v-if="settings" class="notify">
      <template v-if="settings.notificationsConfigured">
        <span class="secondary">Bildirim: {{ formatLabel[settings.notificationFormat] ?? settings.notificationFormat }}</span>
        <button class="btn" :disabled="testState.sending" @click="sendTest">
          {{ testState.sending ? 'Gönderiliyor…' : 'Test bildirimi gönder' }}
        </button>
        <StatusBadge v-if="testState.result" :kind="testState.ok ? 'ok' : 'error'" :label="testState.result" />
      </template>
      <span v-else class="muted">
        Bildirim kapalı. Açmak için TraceLensService'te <code>Notifications:WebhookUrl</code> ayarlayın.
      </span>
    </div>
  </header>

  <section class="card filter-card" aria-label="Filtreler">
    <div class="filter-row">
      <div class="segmented" role="group" aria-label="Dönem">
        <button v-for="p in PERIODS" :key="p.value" type="button" :aria-pressed="period === p.value" @click="onPeriod(p.value)">{{ p.label }}</button>
      </div>
      <form v-if="isCustom" class="custom" @submit.prevent="applyCustom">
        <input v-model="customFrom" type="datetime-local" aria-label="Başlangıç" />
        <span class="muted">–</span>
        <input v-model="customTo" type="datetime-local" aria-label="Bitiş" />
        <button class="btn primary" type="submit">Uygula</button>
      </form>
      <label class="search-field grow">
        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>
        <input type="search" placeholder="Operasyon ara, ör. /orders" :value="q.operation" aria-label="Operasyon ara"
               @input="onSearch(($event.target as HTMLInputElement).value)" />
      </label>
    </div>

    <div class="filter-groups">
      <div class="filter-group">
        <span class="filter-label">Alarm türü</span>
        <div class="segmented" role="group" aria-label="Alarm türü">
          <button v-for="k in KINDS" :key="k.value" type="button" :aria-pressed="(q.kind ?? '') === k.value"
                  @click="setQuery({ kind: k.value || undefined })">{{ k.label }}</button>
        </div>
      </div>
      <div class="filter-group">
        <span class="filter-label">Kaynak</span>
        <div class="segmented" role="group" aria-label="Servis ya da görev">
          <button v-for="a in APPS" :key="a.value" type="button" :aria-pressed="(q.app ?? '') === a.value"
                  @click="setQuery({ app: a.value || undefined })">{{ a.label }}</button>
        </div>
      </div>
      <div class="filter-group">
        <span class="filter-label">Uygulama</span>
        <select :value="q.service ?? ''" aria-label="Uygulama" @change="setQuery({ service: ($event.target as HTMLSelectElement).value || undefined })">
          <option value="">Tümü</option>
          <option v-for="s in data?.services ?? []" :key="s" :value="s">{{ s }}</option>
        </select>
      </div>
    </div>

    <div class="filter-groups">
      <div class="filter-group">
        <span class="filter-label">En yüksek süre</span>
        <div class="chips">
          <button v-for="m in PEAKS" :key="m.value" type="button" class="chip" :aria-pressed="(q.minPeakMs ?? '') === m.value"
                  @click="setQuery({ minPeakMs: m.value || undefined })">{{ m.label }}</button>
          <input class="chip-input" type="number" min="0" step="any" placeholder="≥ özel ms" aria-label="En yüksek süre en az (ms)"
                 :value="PEAKS.some(m => m.value === q.minPeakMs) ? '' : q.minPeakMs"
                 @change="setQuery({ minPeakMs: ($event.target as HTMLInputElement).value || undefined })" />
        </div>
      </div>
      <div class="filter-group">
        <span class="filter-label">Hata kodu</span>
        <div class="chips">
          <button v-for="s in statusChips" :key="s.value" type="button" class="chip" :aria-pressed="(q.status ?? '') === s.value"
                  @click="setQuery({ status: s.value || undefined })">{{ s.label }}</button>
        </div>
      </div>
    </div>

    <div v-if="activeFilters.length" class="filter-applied">
      <span class="muted">Uygulanan:</span>
      <span v-for="f in activeFilters" :key="f.key" class="pill">
        {{ f.label }}
        <button type="button" :aria-label="`${f.label} filtresini kaldır`" @click="setQuery({ [f.key]: undefined })">✕</button>
      </span>
      <button type="button" class="btn-link" @click="clearFilters">Tümünü temizle</button>
    </div>
  </section>

  <div v-if="error" class="error-box">{{ error }}</div>

  <InsightList :items="insights" />

  <section class="card">
    <div class="card-header">
      <h2>Aktif <span class="muted count">{{ data?.active.length ?? 0 }}</span></h2>
      <span class="muted small">satıra tıklayınca alarmın açık olduğu aralıktaki istekler açılır</span>
    </div>
    <div v-if="data?.active.length" class="table-wrap">
    <table class="data">
      <thead>
        <tr>
          <th>Alarm</th><th>Tür</th><th>Uygulama</th><th>Operasyon</th>
          <th class="num">Şu an</th><th class="num">En yüksek</th><th class="num">Eşik / sınır</th>
          <th class="num">İstek</th><th>Başlangıç</th><th class="num">Süredir</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="a in data.active" :key="a.id" class="clickable" @click="$router.push(linkFor(a))">
          <td><StatusBadge v-bind="kindBadge(a)" /></td>
          <td class="secondary">{{ appLabel(a.app) }}</td>
          <td class="secondary">{{ a.service }}</td>
          <td class="mono">{{ a.operation }}</td>
          <template v-if="a.kind === 'error'">
            <td class="num over">hata {{ formatPercent(a.errorRate) }}<span v-if="a.topStatus" class="code">{{ a.topStatus }}</span></td>
            <td class="num">{{ formatPercent(a.peakErrorRate) }}</td>
            <td class="num muted">%5</td>
          </template>
          <template v-else>
            <td class="num over">{{ metricLabel(a) }} {{ formatMs(a.valueMs) }}</td>
            <td class="num">{{ formatMs(a.peakValueMs) }}</td>
            <td class="num muted">{{ formatMs(a.thresholdMs) }}</td>
          </template>
          <td class="num">{{ formatInt(a.requestCount) }}<span v-if="a.kind === 'error'" class="muted pct">{{ formatInt(a.errorCount) }} hatalı</span></td>
          <td class="secondary nowrap" :title="formatDateTime(a.firedAt)">{{ relativeTime(a.firedAt) }}</td>
          <td class="num">{{ formatDuration(a.durationMinutes) }}</td>
        </tr>
      </tbody>
    </table>
    </div>
    <div v-else class="empty">
      <StatusBadge kind="ok" :label="hasFilters ? 'Bu filtrelere uyan açık alarm yok' : 'Şu an açık alarm yok'" />
    </div>
  </section>

  <section class="card section">
    <div class="card-header">
      <h2>Kapanan alarmlar <span class="muted count">{{ data?.history.length ?? 0 }}</span></h2>
      <span class="muted small">{{ periodText }}</span>
    </div>
    <div v-if="data?.history.length" class="table-wrap">
    <table class="data">
      <thead>
        <tr>
          <th>Alarm</th><th>Tür</th><th>Uygulama</th><th>Operasyon</th><th class="num">En yüksek</th><th class="num">Eşik / sınır</th>
          <th>Açıldı</th><th>Kapandı</th><th class="num">Süre</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="a in data.history" :key="a.id" class="clickable" @click="$router.push(linkFor(a))">
          <td><StatusBadge v-bind="kindBadge(a)" /></td>
          <td class="secondary">{{ appLabel(a.app) }}</td>
          <td class="secondary">{{ a.service }}</td>
          <td class="mono">{{ a.operation }}</td>
          <td v-if="a.kind === 'error'" class="num">hata {{ formatPercent(a.peakErrorRate) }}<span v-if="a.topStatus" class="code">{{ a.topStatus }}</span></td>
          <td v-else class="num">{{ metricLabel(a) }} {{ formatMs(a.peakValueMs) }}</td>
          <td class="num muted">{{ a.kind === 'error' ? '%5' : formatMs(a.thresholdMs) }}</td>
          <td class="secondary nowrap">{{ formatDateTime(a.firedAt) }}</td>
          <td class="secondary nowrap">{{ a.resolvedAt ? formatDateTime(a.resolvedAt) : '-' }}</td>
          <td class="num">{{ formatDuration(a.durationMinutes) }}</td>
        </tr>
      </tbody>
    </table>
    </div>
    <div v-else class="empty">{{ hasFilters ? 'Bu filtrelere uyan kapanmış alarm yok' : 'Bu aralıkta kapanan alarm yok' }}</div>
  </section>
</template>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.sub { margin: 4px 0 0; max-width: 720px; }
.notify { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 13px; }
.notify code { font-family: var(--mono); font-size: 12px; }
.grow { flex: 1; min-width: 220px; }
.custom { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.section { margin-top: 16px; }
.small { font-size: 12px; }
.count { font-weight: 400; font-size: 13px; margin-left: 6px; }
.over { color: var(--status-critical); font-weight: 600; }
.code { margin-left: 6px; padding: 0 6px; border-radius: 8px; background: var(--status-critical-soft); color: var(--text-primary); font-size: 11.5px; font-weight: 600; }
.pct { font-size: 11px; margin-left: 4px; }
.nowrap { white-space: nowrap; }
</style>
