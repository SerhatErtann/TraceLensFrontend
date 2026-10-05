<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { api, type TraceDetail, type TraceHint } from '../api'
import { formatDateTime, formatMs } from '../format'
import StatusBadge from '../components/StatusBadge.vue'
import Waterfall from '../components/Waterfall.vue'

const props = defineProps<{ traceId: string }>()

const trace = ref<TraceDetail | null>(null)
const error = ref<string | null>(null)
const selectedId = ref<string | null>(null)
const copied = ref(false)

watch(() => props.traceId, async id => {
  trace.value = null
  error.value = null
  try {
    trace.value = await api.trace(id)
    selectedId.value = trace.value.hints.find(h => h.spanId)?.spanId ?? trace.value.spans[0]?.spanId ?? null
  } catch (e) {
    // Backend "bulunamadı" gibi iş hatalarını anlaşılır mesajla döner; olduğu gibi gösterilir.
    error.value = (e as Error).message
  }
}, { immediate: true })

// Renk servise bağlıdır, sıraya değil: servisler trace'teki ilk görünme sırasıyla sabit slot alır.
const SLOTS = 8
const colorOf = (service: string) => {
  const index = trace.value?.services.indexOf(service) ?? 0
  return `var(--series-${(index % SLOTS) + 1})`
}

const root = computed(() => trace.value?.spans[0] ?? null)
const selected = computed(() => trace.value?.spans.find(s => s.spanId === selectedId.value) ?? null)
const sortedAttributes = computed(() =>
  selected.value ? Object.entries(selected.value.attributes).sort(([a], [b]) => a.localeCompare(b)) : [])

const hintKind = (h: TraceHint) => (h.severity === 'error' ? 'error' : h.severity === 'warning' ? 'slow' : 'info')
const hintLabel: Record<TraceHint['type'], string> = {
  'slow-span': 'Yavaş adım',
  'n-plus-one': 'N+1 şüphesi',
  'large-payload': 'Büyük yanıt',
  error: 'Hata'
}

async function focusSpan(spanId: string | null) {
  if (!spanId) return
  selectedId.value = spanId
  await nextTick()
  document.getElementById(`span-${spanId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

async function copyId() {
  await navigator.clipboard.writeText(props.traceId)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <a class="back" href="#" @click.prevent="$router.back()">← Geri</a>

  <div v-if="error" class="error-box">{{ error }}</div>
  <div v-else-if="!trace" class="empty">Yükleniyor…</div>

  <template v-else>
    <header class="trace-header">
      <div>
        <h1 class="mono title">{{ root?.name }}</h1>
        <div class="meta secondary">
          <span>{{ formatDateTime(trace.startTime) }}</span>
          <span>Toplam <b>{{ formatMs(trace.durationMs) }}</b></span>
          <span>{{ trace.spanCount }} span</span>
          <span class="mono">{{ trace.traceId }}</span>
          <button class="btn small" @click="copyId">{{ copied ? 'Kopyalandı' : 'Kopyala' }}</button>
        </div>
      </div>
      <div class="services">
        <span v-for="s in trace.services" :key="s" class="svc">
          <span class="dot" :style="{ background: colorOf(s) }" />{{ s }}
        </span>
      </div>
    </header>

    <section v-if="trace.hints.length" class="card hints">
      <div class="card-header"><h2>Nereye bakmalı?</h2></div>
      <ul>
        <li v-for="(h, i) in trace.hints" :key="i" :class="{ clickable: h.spanId }" @click="focusSpan(h.spanId)">
          <StatusBadge :kind="hintKind(h)" :label="hintLabel[h.type]" />
          <span>{{ h.message }}</span>
        </li>
      </ul>
    </section>

    <section class="card section">
      <Waterfall :spans="trace.spans" :total-ms="trace.durationMs" :color-of="colorOf" :selected-id="selectedId"
                 @select="id => (selectedId = id)" />
    </section>

    <section v-if="selected" class="card section details">
      <div class="card-header">
        <h2 class="mono">{{ selected.name }}</h2>
        <StatusBadge v-if="selected.status === 'Error'" kind="error" :label="selected.statusMessage ?? 'Hata'" />
      </div>
      <div class="facts">
        <div><span class="muted">Servis</span><span class="svc"><span class="dot" :style="{ background: colorOf(selected.service) }" />{{ selected.service }}</span></div>
        <div><span class="muted">Tür</span>{{ selected.kind }}</div>
        <div><span class="muted">Süre</span><b>{{ formatMs(selected.durationMs) }}</b></div>
        <div><span class="muted">Kendi süresi</span>{{ formatMs(selected.selfMs) }}</div>
        <div><span class="muted">Başlangıç</span>+{{ formatMs(selected.startOffsetMs) }}</div>
      </div>

      <template v-for="ev in selected.events" :key="ev.timestamp + ev.name">
        <div v-if="ev.name === 'exception'" class="exception">
          <div class="exc-title">{{ ev.attributes['exception.type'] }}: {{ ev.attributes['exception.message'] }}</div>
          <pre v-if="ev.attributes['exception.stacktrace']" class="mono">{{ ev.attributes['exception.stacktrace'] }}</pre>
        </div>
      </template>

      <table class="data attrs">
        <thead><tr><th>Attribute</th><th>Değer</th></tr></thead>
        <tbody>
          <tr v-for="[k, v] in sortedAttributes" :key="k">
            <td class="mono secondary key">{{ k }}</td>
            <td class="mono value">{{ v }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </template>
</template>

<style scoped>
.back { display: inline-block; margin-bottom: 12px; font-size: 13px; }
.trace-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.title { font-size: 19px; }
.meta { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-top: 6px; font-size: 13px; }
.btn.small { padding: 1px 8px; font-size: 12px; }
.services { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; font-size: 13px; }
.svc { display: inline-flex; align-items: center; gap: 6px; }
.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.hints ul { list-style: none; margin: 0; padding: 0 8px 8px; }
.hints li {
  display: flex;
  gap: 12px;
  align-items: baseline;
  padding: 7px 8px;
  border-radius: 6px;
}
.hints li.clickable { cursor: pointer; }
.hints li.clickable:hover { background: var(--surface-2); }
.section { margin-top: 16px; }
.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 28px;
  padding: 0 16px 14px;
}
.facts > div { display: flex; flex-direction: column; gap: 2px; }
.facts .muted { font-size: 11.5px; }
.exception {
  margin: 0 16px 14px;
  border: 1px solid var(--status-critical);
  background: var(--status-critical-soft);
  border-radius: 6px;
  padding: 10px 12px;
}
.exc-title { font-weight: 600; margin-bottom: 6px; }
.exception pre { margin: 0; white-space: pre-wrap; font-size: 11.5px; max-height: 260px; overflow: auto; }
.attrs .key { width: 32%; }
.attrs .value { white-space: pre-wrap; word-break: break-all; }
</style>
