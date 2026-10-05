<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { api, type Alert, type Settings } from '../api'
import { formatDateTime, formatInt, formatMs, relativeTime } from '../format'
import StatusBadge from '../components/StatusBadge.vue'

const active = ref<Alert[]>([])
const history = ref<Alert[]>([])
const settings = ref<Settings | null>(null)
const error = ref<string | null>(null)
const days = ref(7)
const testState = ref<{ sending: boolean; result: string | null; ok: boolean }>({ sending: false, result: null, ok: false })
let timer: number | undefined

async function load() {
  try {
    const data = await api.alerts(days.value)
    active.value = data.active
    history.value = data.history
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

// Alarm satırından ilgili sayfaya, operasyon filtresi uygulanmış ve son 15 dakika seçili olarak gidilir.
const linkFor = (a: Alert) => ({
  path: a.app === 'Service' ? '/services' : '/schedulers',
  query: { range: '15m', service: a.service, operation: a.operation }
})

const appLabel = (app: Alert['app']) => (app === 'Service' ? 'Servis' : 'Görev')

const formatDuration = (minutes: number) =>
  minutes < 1 ? '<1 dk' : minutes < 60 ? `${Math.round(minutes)} dk` : `${(minutes / 60).toFixed(1)} sa`

const formatLabel: Record<string, string> = { teams: 'Microsoft Teams', slack: 'Slack', generic: 'JSON webhook' }

watch(days, load)
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
        Her dakika son {{ settings.alertWindowMinutes }} dakika kontrol edilir.
        {{ settings.alertMetric === 'p95' ? 'p95' : 'Ortalama' }} süre eşiği
        (varsayılan {{ formatMs(settings.defaultThresholdMs) }}) aşarsa alarm açılır, düzelince kapanır.
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

  <div v-if="error" class="error-box">{{ error }}</div>

  <section class="card">
    <div class="card-header"><h2>Aktif <span class="muted count">{{ active.length }}</span></h2></div>
    <div v-if="active.length" class="table-wrap">
    <table class="data">
      <thead>
        <tr>
          <th>Durum</th><th>Tür</th><th>Servis</th><th>Operasyon</th>
          <th class="num">Şu an</th><th class="num">En yüksek</th><th class="num">Eşik</th>
          <th class="num">İstek</th><th class="num">Eşiği aşan</th><th>Başlangıç</th><th class="num">Süredir</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="a in active" :key="a.id" class="clickable" @click="$router.push(linkFor(a))">
          <td><StatusBadge kind="slow" label="Eşik aşıldı" /></td>
          <td class="secondary">{{ appLabel(a.app) }}</td>
          <td class="secondary">{{ a.service }}</td>
          <td class="mono">{{ a.operation }}</td>
          <td class="num over">{{ a.metric }} {{ formatMs(a.valueMs) }}</td>
          <td class="num">{{ formatMs(a.peakValueMs) }}</td>
          <td class="num muted">{{ formatMs(a.thresholdMs) }}</td>
          <td class="num">{{ formatInt(a.requestCount) }}</td>
          <td class="num">{{ formatInt(a.slowCount) }}</td>
          <td class="secondary nowrap" :title="formatDateTime(a.firedAt)">{{ relativeTime(a.firedAt) }}</td>
          <td class="num">{{ formatDuration(a.durationMinutes) }}</td>
        </tr>
      </tbody>
    </table>
    </div>
    <div v-else class="empty">
      <StatusBadge kind="ok" label="Şu an eşiği aşan operasyon yok" />
    </div>
  </section>

  <section class="card section">
    <div class="card-header">
      <h2>Kapanan alarmlar <span class="muted count">{{ history.length }}</span></h2>
      <select v-model.number="days" aria-label="Geçmiş aralığı">
        <option :value="1">Son 24 saat</option>
        <option :value="7">Son 7 gün</option>
        <option :value="30">Son 30 gün</option>
        <option :value="90">Son 90 gün</option>
      </select>
    </div>
    <div v-if="history.length" class="table-wrap">
    <table class="data">
      <thead>
        <tr>
          <th>Tür</th><th>Servis</th><th>Operasyon</th><th class="num">En yüksek</th><th class="num">Eşik</th>
          <th>Açıldı</th><th>Kapandı</th><th class="num">Süre</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="a in history" :key="a.id" class="clickable" @click="$router.push(linkFor(a))">
          <td class="secondary">{{ appLabel(a.app) }}</td>
          <td class="secondary">{{ a.service }}</td>
          <td class="mono">{{ a.operation }}</td>
          <td class="num">{{ a.metric }} {{ formatMs(a.peakValueMs) }}</td>
          <td class="num muted">{{ formatMs(a.thresholdMs) }}</td>
          <td class="secondary nowrap">{{ formatDateTime(a.firedAt) }}</td>
          <td class="secondary nowrap">{{ a.resolvedAt ? formatDateTime(a.resolvedAt) : '-' }}</td>
          <td class="num">{{ formatDuration(a.durationMinutes) }}</td>
        </tr>
      </tbody>
    </table>
    </div>
    <div v-else class="empty">Bu aralıkta kapanan alarm yok</div>
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
.sub { margin: 4px 0 0; max-width: 680px; }
.notify { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 13px; }
.notify code { font-family: var(--mono); font-size: 12px; }
.section { margin-top: 16px; }
.count { font-weight: 400; font-size: 13px; margin-left: 6px; }
.over { color: var(--status-critical); font-weight: 600; }
.nowrap { white-space: nowrap; }
</style>
