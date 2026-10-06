<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api, type Settings, type ThresholdList, type ThresholdOverride } from '../api'
import { formatDateTime, formatMs } from '../format'
import StatusBadge from '../components/StatusBadge.vue'
import ThresholdCell from '../components/ThresholdCell.vue'
import UsersSettings from '../components/UsersSettings.vue'

const thresholds = ref<ThresholdList | null>(null)
const settings = ref<Settings | null>(null)
const error = ref<string | null>(null)

const defaultValue = ref<number | null>(null)
const savingDefault = ref(false)
const defaultResult = ref<{ ok: boolean; text: string } | null>(null)

async function load() {
  try {
    const [thr, set] = await Promise.all([api.thresholds(), api.settings()])
    thresholds.value = thr
    settings.value = set
    defaultValue.value = thr.defaultMs
    error.value = null
  } catch (e) {
    error.value = `Ayarlar alınamadı: ${(e as Error).message}`
  }
}

async function saveDefault() {
  if (defaultValue.value === null || Number.isNaN(defaultValue.value)) return
  savingDefault.value = true
  defaultResult.value = null
  try {
    thresholds.value = await api.setDefaultThreshold(defaultValue.value)
    defaultResult.value = { ok: true, text: 'Kaydedildi' }
  } catch (e) {
    defaultResult.value = { ok: false, text: (e as Error).message }
  } finally {
    savingDefault.value = false
  }
}

async function remove(o: ThresholdOverride) {
  try {
    thresholds.value = await api.deleteThreshold(o.service, o.operation)
  } catch (e) {
    error.value = (e as Error).message
  }
}

onMounted(load)
</script>

<template>
  <header class="page-header">
    <h1>Ayarlar</h1>
    <p class="muted sub">Eşikler kaydedildiği anda geçerli olur: grafikler, "eşiği aşan" sayıları ve alarmlar yeni değere göre hesaplanır. En altta kullanıcılar ve şifre değiştirme.</p>
  </header>

  <div v-if="error" class="error-box">{{ error }}</div>

  <section v-if="thresholds" class="card">
    <div class="card-header"><h2>Varsayılan eşik</h2></div>
    <form class="default-form" @submit.prevent="saveDefault">
      <p class="secondary">Özel eşiği olmayan tüm endpoint ve görevler için "yavaş" sınırı.</p>
      <div class="row">
        <input v-model.number="defaultValue" type="number" min="1" max="600000" step="any" aria-label="Varsayılan eşik (ms)" />
        <span class="muted">ms</span>
        <button class="btn primary" type="submit" :disabled="savingDefault || defaultValue === thresholds.defaultMs">
          {{ savingDefault ? 'Kaydediliyor…' : 'Kaydet' }}
        </button>
        <StatusBadge v-if="defaultResult" :kind="defaultResult.ok ? 'ok' : 'error'" :label="defaultResult.text" />
      </div>
    </form>
  </section>

  <section v-if="thresholds" class="card section">
    <div class="card-header">
      <h2>Özel eşikler <span class="muted count">{{ thresholds.overrides.length }}</span></h2>
      <span class="muted small">Yeni özel eşik eklemek için Servisler veya Görevler sayfasındaki tabloda ✎'ye tıklayın</span>
    </div>
    <div v-if="thresholds.overrides.length" class="table-wrap">
      <table class="data">
        <thead>
          <tr><th>Servis</th><th>Operasyon</th><th class="num">Eşik</th><th>Son değişiklik</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="o in thresholds.overrides" :key="o.service + '|' + o.operation">
            <td class="secondary">{{ o.service }}</td>
            <td class="mono">{{ o.operation }}</td>
            <td class="num">
              <ThresholdCell :service="o.service" :operation="o.operation" :threshold-ms="o.thresholdMs"
                             :is-custom="true" :default-ms="thresholds.defaultMs" @changed="load" />
            </td>
            <td class="secondary nowrap">{{ formatDateTime(o.updatedAt) }}</td>
            <td class="num">
              <button class="btn small" :title="`Varsayılan eşiğe (${formatMs(thresholds.defaultMs)}) döner`" @click="remove(o)">
                Kaldır
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else class="empty">Özel eşik yok; tüm operasyonlar varsayılan eşiği ({{ formatMs(thresholds.defaultMs) }}) kullanıyor.</div>
  </section>

  <section v-if="settings" class="card section">
    <div class="card-header"><h2>Alarm ve bildirim</h2></div>
    <dl class="facts">
      <div><dt>Kontrol</dt><dd>Her dakika, son {{ settings.alertWindowMinutes }} dakika</dd></div>
      <div><dt>Ölçüt</dt><dd>{{ settings.alertMetric === 'p95' ? 'p95 süre' : 'Ortalama süre' }}</dd></div>
      <div><dt>Bildirim</dt><dd>{{ settings.notificationsConfigured ? settings.notificationFormat : 'Kapalı' }}</dd></div>
    </dl>
    <p class="muted note">Bu değerler TraceLensService'in <code>Config/appsettings.json</code> dosyasındaki "Alerts" ve "Notifications" bölümlerinden gelir.</p>
  </section>

  <UsersSettings />
</template>

<style scoped>
.page-header { margin-bottom: 16px; }
.sub { margin: 4px 0 0; max-width: 760px; }
.section { margin-top: 16px; }
.count { font-weight: 400; font-size: 13px; margin-left: 6px; }
.small { font-size: 12px; }
.nowrap { white-space: nowrap; }
.default-form { padding: 0 16px 16px; }
.default-form p { margin: 0 0 10px; }
.row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.row input { width: 110px; text-align: right; }
.btn.small { padding: 2px 10px; font-size: 12px; }
.facts { display: flex; flex-wrap: wrap; gap: 8px 32px; margin: 0; padding: 0 16px 8px; }
.facts dt { font-size: 11.5px; color: var(--text-muted); }
.facts dd { margin: 2px 0 0; }
.note { padding: 0 16px 14px; margin: 0; font-size: 12.5px; }
.note code { font-family: var(--mono); font-size: 12px; }
</style>
